#!/usr/bin/env python3
"""
Live CertStream monitor.

- Connects to CertStream websocket via Python certstream package
- Stores certificates in SQLite for persistence
- Relays each certificate event to Node.js immediately over stdout
"""

import json
import sqlite3
import signal
import sys
import time
from pathlib import Path

# Configuration
DB_PATH = Path(__file__).parent / "data" / "certstream.db"
CONFIG_PATH = Path(__file__).parent / "certstream_monitor_config.json"
EVENT_PREFIX = "__CERT_EVENT__"

# Ensure data directory exists
DB_PATH.parent.mkdir(exist_ok=True)

# Global state
running = True
db_connection = None
monitored_patterns = []
excluded_patterns = []


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
                print(f"[CertStreamMonitor] Loaded {len(monitored_patterns)} patterns to monitor", flush=True)
                print(f"[CertStreamMonitor] Loaded {len(excluded_patterns)} excluded patterns", flush=True)
    except Exception as error:
        print(f"[CertStreamMonitor] Error loading config: {error}", flush=True)
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
                    f"[CertStreamMonitor] ✅ Stored cert #{cert_index}: "
                    f"{first_domain} (Pattern: {matched_pattern})",
                    flush=True
                )
            
            return True
        except sqlite3.IntegrityError:
            return False
        
    except Exception as error:
        print(f"[CertStreamMonitor] Error storing certificate: {error}", flush=True)
        return False


def relay_event(cert_message):
    """Relay certificate message to Node immediately."""
    print(EVENT_PREFIX + json.dumps(cert_message, separators=(',', ':')), flush=True)


def callback(message, _context):
    """CertStream callback function."""
    try:
        if message.get('message_type') == 'heartbeat':
            return
        
        if message.get('message_type') == 'certificate_update':
            store_certificate(message)
            relay_event(message)
    except Exception as error:
        print(f"[CertStreamMonitor] Callback error: {error}", flush=True)


def signal_handler(_sig, _frame):
    """Handle shutdown signals."""
    global running
    print("\n[CertStreamMonitor] Shutdown signal received, closing...", flush=True)
    running = False


def run_live_monitor():
    """Live monitor via certstream websocket package."""
    global running
    
    print('[CertStreamMonitor] Starting in LIVE mode (certstream websocket)', flush=True)
    
    try:
        import certstream
    except ImportError:
        print('[CertStreamMonitor] ERROR: certstream package is not installed. Live mode cannot start.', flush=True)
        sys.exit(2)
    
    message_count = 0
    
    try:
        def counting_callback(message, context):
            nonlocal message_count
            if not running:
                raise KeyboardInterrupt
            message_count += 1
            if message_count % 100 == 0:
                print(f"[CertStreamMonitor] Received {message_count} websocket messages", flush=True)
            callback(message, context)
        
        certstream.listen_for_events(counting_callback, url='wss://certstream.calidog.io')
    except KeyboardInterrupt:
        print('[CertStreamMonitor] Interrupted', flush=True)
    except Exception as error:
        print(f'[CertStreamMonitor] Live monitor error: {error}', flush=True)
        sys.exit(3)
    finally:
        print(f'[CertStreamMonitor] Live mode stopped (processed {message_count} websocket messages)', flush=True)


def run_monitor():
    """Main monitor loop."""
    global db_connection
    
    print('[CertStreamMonitor] Starting monitor...', flush=True)
    print(f'[CertStreamMonitor] Database: {DB_PATH}', flush=True)
    
    db_connection = init_database()
    
    load_config()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print('[CertStreamMonitor] Mode selected: live', flush=True)
    
    try:
        run_live_monitor()
    finally:
        if db_connection:
            db_connection.close()
        print('[CertStreamMonitor] Monitor stopped', flush=True)



if __name__ == '__main__':
    run_monitor()
