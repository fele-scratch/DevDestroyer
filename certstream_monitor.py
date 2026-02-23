#!/usr/bin/env python3
"""
CertStream Monitor - Python wrapper for reliable certificate monitoring
Connects to CertStream WebSocket and stores certificates in SQLite database.
Can be queried by Node.js bot for real-time cabal detection.
"""

import sqlite3
import json
import sys
import time
import threading
import signal
from datetime import datetime
from pathlib import Path
import certstream

# Configuration
DB_PATH = Path(__file__).parent / "data" / "certstream.db"
CONFIG_PATH = Path(__file__).parent / "certstream_monitor_config.json"
PROCESS_LOCK_FILE = Path(__file__).parent / "data" / ".certstream_monitor.lock"

# Ensure data directory exists
DB_PATH.parent.mkdir(exist_ok=True)

# Global state
running = True
db_connection = None
monitored_patterns = []
excluded_patterns = []


def load_config():
    """Load monitoring configuration"""
    global monitored_patterns, excluded_patterns
    
    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, 'r') as f:
                config = json.load(f)
                monitored_patterns = config.get('patterns', [
                    '.fun', '.xyz', '.club', '.online', '.download'
                ])
                excluded_patterns = config.get('excluded_patterns', [
                    'cloudflare.com', 'google', 'amazon.com'
                ])
                print(f"[CertStreamMonitor] Loaded {len(monitored_patterns)} patterns to monitor")
                print(f"[CertStreamMonitor] Loaded {len(excluded_patterns)} excluded patterns")
        else:
            # Use defaults
            monitored_patterns = ['.fun', '.xyz', '.club', '.online', '.download']
            excluded_patterns = ['cloudflare.com', 'google', 'amazon.com']
            print("[CertStreamMonitor] Using default patterns")
    except Exception as e:
        print(f"[CertStreamMonitor] Error loading config: {e}")
        print("[CertStreamMonitor] Using default patterns")


def init_database():
    """Initialize SQLite database"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Create certificates table
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
    
    # Create index for faster queries
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_processed ON certificates(processed)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_seen ON certificates(seen_timestamp DESC)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_cert_index ON certificates(cert_index DESC)
    ''')
    
    conn.commit()
    return conn


def should_monitor_domain(domains_list):
    """Check if domain list should be monitored based on patterns"""
    if not domains_list:
        return False, None
    
    # Check excluded patterns first
    for domain in domains_list:
        domain_lower = domain.lower()
        for excluded in excluded_patterns:
            if excluded.lower() in domain_lower:
                return False, None
    
    # Check monitored patterns
    for domain in domains_list:
        domain_lower = domain.lower()
        for pattern in monitored_patterns:
            if pattern.lower() in domain_lower:
                return True, pattern
    
    return False, None


def store_certificate(cert_data):
    """Store certificate in database"""
    global db_connection
    
    try:
        domains = cert_data.get('data', {}).get('leaf_cert', {}).get('all_domains', [])
        
        # Check if we should monitor this domain
        should_monitor, matched_pattern = should_monitor_domain(domains)
        
        cert_index = cert_data.get('data', {}).get('cert_index', 0)
        serial_number = cert_data.get('data', {}).get('leaf_cert', {}).get('serial_number', '')
        issuer = cert_data.get('data', {}).get('leaf_cert', {}).get('issuer', {}).get('CN', '')
        seen_timestamp = cert_data.get('data', {}).get('seen', time.time())
        
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
                print(f"[CertStreamMonitor] ✅ Stored matching cert #{cert_index}: {domains[0] if domains else 'unknown'} (Pattern: {matched_pattern})")
            
            return True
        except sqlite3.IntegrityError:
            # Duplicate cert_index, ignore
            return False
        
    except Exception as e:
        print(f"[CertStreamMonitor] Error storing certificate: {e}")
        return False


def callback(message, context):
    """CertStream callback function"""
    global running
    
    try:
        if message['message_type'] == 'heartbeat':
            return
        
        if message['message_type'] == 'certificate_update':
            stored = store_certificate(message)
            if not stored and stored is not None:
                # Duplicate cert_index, silently ignore
                pass
    except Exception as e:
        print(f"[CertStreamMonitor] Callback error: {e}")


def signal_handler(sig, frame):
    """Handle shutdown signals"""
    global running
    print("\n[CertStreamMonitor] Shutdown signal received, closing...")
    running = False


def run_monitor():
    """Main monitor loop"""
    global db_connection, running
    
    print("[CertStreamMonitor] Starting CertStream monitor...")
    print(f"[CertStreamMonitor] Database: {DB_PATH}")
    
    # Initialize database
    db_connection = init_database()
    
    # Load configuration
    load_config()
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Connect to CertStream
    print("[CertStreamMonitor] Connecting to CertStream websocket...")
    message_count = 0
    try:
        def counting_callback(message, context):
            global message_count
            message_count += 1
            if message_count % 100 == 0:
                print(f"[CertStreamMonitor] Received {message_count} messages")
            callback(message, context)
        
        certstream.listen_for_events(counting_callback, url='wss://certstream.calidog.io')
    except KeyboardInterrupt:
        print("[CertStreamMonitor] Interrupted")
    except Exception as e:
        print(f"[CertStreamMonitor] Error: {e}")
    finally:
        if db_connection:
            db_connection.close()
        print(f"[CertStreamMonitor] Stopped (processed {message_count} messages)")



if __name__ == '__main__':
    run_monitor()
