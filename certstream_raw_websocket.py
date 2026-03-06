#!/usr/bin/env python3
"""
Raw WebSocket client for CertStream - Direct connection without certstream library

This bypasses potential issues with the certstream package and connects directly
to the live firehose at wss://certstream.calidog.io/full
"""

import json
import sqlite3
import signal
import sys
import time
from pathlib import Path
from websocket import WebSocketApp, WebSocketException

# Configuration
DB_PATH = Path(__file__).parent / "data" / "certstream.db"
CONFIG_PATH = Path(__file__).parent / "certstream_monitor_config.json"
EVENT_PREFIX = "__CERT_EVENT__"
CERTSTREAM_URL = "ws://127.0.0.1:8080/"

# Ensure data directory exists
DB_PATH.parent.mkdir(exist_ok=True)

# Global state
running = True
db_connection = None
monitored_patterns = []
excluded_patterns = []
ws = None
message_count = 0


def load_config():
    """Load monitoring configuration."""
    global monitored_patterns, excluded_patterns
    
    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                monitored_patterns = config.get('patterns', [
                    '.fun', '.xyz', '.club', '.online', '.download'
                ])
                excluded_patterns = config.get('excluded_patterns', [
                    'cloudflare.com', 'google', 'amazon.com'
                ])
                print(f"[RAW-WS] Loaded {len(monitored_patterns)} patterns to monitor", flush=True)
                print(f"[RAW-WS] Loaded {len(excluded_patterns)} excluded patterns", flush=True)
    except Exception as error:
        print(f"[RAW-WS] Error loading config: {error}", flush=True)
        monitored_patterns = ['.fun', '.xyz', '.club', '.online', '.download']
        excluded_patterns = ['cloudflare.com', 'google', 'amazon.com']


def init_database():
    """Initialize SQLite database."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cert_index INTEGER UNIQUE,
            domains TEXT,
            serialnumber TEXT,
            issuer TEXT,
            seen_timestamp REAL,
            stored_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            matched_pattern TEXT,
            processed INTEGER DEFAULT 0
        )
    ''')
    
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_processed ON certificates(processed)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_seen ON certificates(seen_timestamp DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_cert_index ON certificates(cert_index DESC)')
    
    conn.commit()
    return conn


def should_monitor_domain(domains_list):
    """Check if domain list should be monitored based on patterns."""
    if not domains_list:
        return False, None
    
    for domain in domains_list:
        domain_lower = domain.lower()
        for excluded in excluded_patterns:
            if excluded.lower() in domain_lower:
                return False, None
    
    for domain in domains_list:
        domain_lower = domain.lower()
        for pattern in monitored_patterns:
            if pattern.lower() in domain_lower:
                return True, pattern
    
    return False, None


def store_certificate(cert_data):
    """Store certificate in database."""
    global db_connection

    try:
        domains = cert_data.get('data', {}).get('leaf_cert', {}).get('all_domains', [])
        
        should_monitor, matched_pattern = should_monitor_domain(domains)
        cert_index = int(cert_data.get('data', {}).get('cert_index', 0))
        serial_number = cert_data.get('data', {}).get('leaf_cert', {}).get('serial_number', '')
        issuer = cert_data.get('data', {}).get('leaf_cert', {}).get('issuer', {}).get('CN', '')
        seen_timestamp = float(cert_data.get('data', {}).get('seen', time.time()))
        
        cursor = db_connection.cursor()
        
        try:
            cursor.execute('''
                INSERT INTO certificates (
                    cert_index, domains, serialnumber, issuer,
                    seen_timestamp, matched_pattern, processed
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                cert_index,
                json.dumps(domains),
                serial_number,
                issuer,
                seen_timestamp,
                matched_pattern if should_monitor else None,
                0
            ))
            db_connection.commit()
            
            if should_monitor:
                first_domain = domains[0] if domains else 'unknown'
                print(
                    f"[RAW-WS] ✅ MATCH #{cert_index}: {first_domain} (Pattern: {matched_pattern})",
                    flush=True
                )
            
            return True
        except sqlite3.IntegrityError:
            return False
        
    except Exception as error:
        print(f"[RAW-WS] Error storing certificate: {error}", flush=True)
        return False


def relay_event(cert_message):
    """Relay certificate message to Node.js immediately."""
    print(EVENT_PREFIX + json.dumps(cert_message, separators=(',', ':')), flush=True)


def on_message(ws, message):
    """Handle incoming WebSocket message."""
    global message_count
    
    try:
        data = json.loads(message)
        
        if data.get('message_type') == 'heartbeat':
            return
        
        if data.get('message_type') == 'certificate_update':
            message_count += 1
            
            # Log progress every 100 messages
            if message_count % 100 == 0:
                print(f"[RAW-WS] ✓ Received {message_count} live websocket messages", flush=True)
            
            # Store in database
            store_certificate(data)
            
            # Relay to Node.js immediately
            relay_event(data)
            
    except Exception as error:
        print(f"[RAW-WS] Error processing message: {error}", flush=True)


def on_error(ws, error):
    """Handle WebSocket error."""
    print(f"[RAW-WS] WebSocket error: {error}", flush=True)


def on_close(ws, close_status_code, close_msg):
    """Handle WebSocket close."""
    print(f"[RAW-WS] WebSocket closed: {close_status_code} - {close_msg}", flush=True)


def on_open(ws):
    """Handle WebSocket open."""
    print(f"[RAW-WS] ✅ Connected to live firehose: {CERTSTREAM_URL}", flush=True)
    print(f"[RAW-WS] Waiting for certificate events...", flush=True)


def signal_handler(_sig, _frame):
    """Handle shutdown signals."""
    global running, ws
    print("\n[RAW-WS] Shutdown signal received, closing...", flush=True)
    running = False
    if ws:
        ws.close()


def run_raw_websocket():
    """Connect to CertStream via raw WebSocket and listen for events."""
    global ws, message_count
    
    print(f"[RAW-WS] Starting RAW WebSocket client...", flush=True)
    print(f"[RAW-WS] Endpoint: {CERTSTREAM_URL}", flush=True)
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        ws = WebSocketApp(
            CERTSTREAM_URL,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            header={
                'User-Agent': 'CabalDetectionBot/1.0'
            }
        )
        
        # Run with ping interval to keep connection alive
        ws.run_forever(ping_interval=30, ping_timeout=10)
        
    except Exception as error:
        print(f"[RAW-WS] Fatal error: {error}", flush=True)
        sys.exit(1)
    finally:
        print(f"[RAW-WS] Stopped (processed {message_count} live websocket messages)", flush=True)


def run_monitor():
    """Main monitor loop."""
    global db_connection
    
    print('[RAW-WS] Initializing monitor...', flush=True)
    
    # Initialize database
    db_connection = init_database()
    
    # Load configuration
    load_config()
    
    try:
        run_raw_websocket()
    finally:
        if db_connection:
            db_connection.close()
        print('[RAW-WS] Monitor stopped', flush=True)


if __name__ == '__main__':
    run_monitor()
