import requests
import time
import json
import sys
from datetime import datetime

# Configuration
URL = "https://certstream.calidog.io/example.json"
POLL_INTERVAL = 5  # seconds
EVENT_PREFIX = "__CERT_EVENT__"

def poll_certstream():
    print(f"[Poller] Starting polling every {POLL_INTERVAL} seconds...", file=sys.stderr)
    last_cert_index = None
    
    while True:
        try:
            response = requests.get(URL, timeout=10)
            if response.status_code == 200:
                data = response.json()
                cert_index = data.get('data', {}).get('cert_index')
                
                if cert_index != last_cert_index:
                    # New certificate found
                    print(EVENT_PREFIX + json.dumps(data, separators=(',', ':')), flush=True)
                    last_cert_index = cert_index
            else:
                print(f"[Poller] Error: Received status code {response.status_code}", file=sys.stderr)
        except Exception as e:
            print(f"[Poller] Error: {e}", file=sys.stderr)
            
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    poll_certstream()
