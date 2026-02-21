#!/bin/bash

# DevDestroyer Bot - Google Cloud VM Startup Script
# Cost-Effective Phase 3 (Real-Time Listener) Deployment
# This script runs automatically when the VM instance starts

set -e

echo "📦 DevDestroyer Bot - VM Initialization Starting..."
echo "=================================================="

# Update system packages
echo "🔄 Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js 20 LTS (lightweight, production-ready)
echo "⚙️  Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify installations
echo "✅ Node.js version: $(node --version)"
echo "✅ NPM version: $(npm --version)"

# Create app directory
APP_DIR="/opt/devdestroyer"
mkdir -p $APP_DIR
cd $APP_DIR

# Clone repository
echo "📥 Cloning DevDestroyer repository..."
if [ -d ".git" ]; then
    echo "  Repository already exists, pulling latest..."
    git pull origin main
else
    echo "  Cloning fresh repository..."
    git clone https://github.com/fele-scratch/DevDestroyer.git . || \
    git clone https://github.com/fele-scratch/DevDestroyer.git .
fi

# Install NPM dependencies
echo "📚 Installing npm dependencies..."
npm install --production

# Create environment file (template)
if [ ! -f "$APP_DIR/.env" ]; then
    echo "⚙️  Creating .env template (MUST be configured before starting bot)..."
    cat > "$APP_DIR/.env" << 'EOF'
# Telegram Configuration (REQUIRED)
# Get from https://t.me/botfather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# IPinfo Configuration (OPTIONAL but recommended)
# Register free account at https://ipinfo.io
IPINFO_API_KEY=your_ipinfo_api_key_here

# Censys Configuration (OPTIONAL)
# Register at https://censys.io for certificate data
CENSYS_API_ID=your_censys_api_id_here
CENSYS_API_SECRET=your_censys_api_secret_here

# Remote Browser Endpoint (OPTIONAL - for Layer 2 extraction)
# Example: ws://localhost:3000
# BROWSER_ENDPOINT=

# Alert Webhook (OPTIONAL - for custom integrations)
# ALERT_WEBHOOK_URL=
EOF
    echo "⚠️  IMPORTANT: Edit .env with your credentials before starting the bot!"
fi

# Create systemd service for auto-restart and persistent running
echo "🔧 Creating systemd service for auto-restart..."
cat > /etc/systemd/system/devdestroyer.service << 'EOF'
[Unit]
Description=DevDestroyer Bot - Real-Time Cabal Detection
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/devdestroyer
ExecStart=/usr/bin/node /opt/devdestroyer/bot.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=devdestroyer

# Resource limits (cost-effective)
MemoryLimit=512M
CPUQuota=50%

[Install]
WantedBy=multi-user.target
EOF

# Enable the service (but don't start yet - wait for .env config)
systemctl daemon-reload
systemctl enable devdestroyer.service

# Create a startup checker
echo "📝 Creating startup checker script..."
cat > /opt/devdestroyer/check-env.sh << 'EOF'
#!/bin/bash
if grep -q "your_telegram_bot_token_here" /opt/devdestroyer/.env; then
    echo "❌ ERROR: .env file not configured!"
    echo "Please edit /opt/devdestroyer/.env with your Telegram credentials"
    echo "Then run: systemctl start devdestroyer"
    exit 1
fi
echo "✅ .env looks configured. Starting bot..."
systemctl start devdestroyer
systemctl status devdestroyer
EOF
chmod +x /opt/devdestroyer/check-env.sh

# Install PM2 globally for advanced process management (optional)
echo "📦 Installing PM2 for process management..."
npm install -g pm2

# Create seed URLs file if missing
if [ ! -f "$APP_DIR/seed_urls.txt" ]; then
    echo "📄 Creating seed_urls.txt template..."
    cat > "$APP_DIR/seed_urls.txt" << 'EOF'
# Add known cabal sites here (one URL per line)
# Example:
# https://campbellcats.fun/
# https://theblackdog.site/
EOF
fi

# System information
echo ""
echo "=================================================="
echo "✅ SETUP COMPLETE"
echo "=================================================="
echo ""
echo "📍 Installation Location: $APP_DIR"
echo "📁 Configuration File: $APP_DIR/.env"
echo "📋 Seed URLs File: $APP_DIR/seed_urls.txt"
echo ""
echo "🔐 NEXT STEPS (REQUIRED BEFORE BOT STARTS):"
echo "=================================================="
echo "1. SSH into your VM:"
echo "   gcloud compute ssh instance-20260221-144606 --zone=us-central1-a"
echo ""
echo "2. Edit the environment file:"
echo "   nano /opt/devdestroyer/.env"
echo ""
echo "3. Add your Telegram credentials:"
echo "   - Get Bot Token from https://t.me/botfather"
echo "   - Get Chat ID from @userinfobot on Telegram"
echo ""
echo "4. (Optional) Add seed URLs:"
echo "   nano /opt/devdestroyer/seed_urls.txt"
echo ""
echo "5. Start the bot:"
echo "   systemctl start devdestroyer"
echo ""
echo "6. Monitor logs in real-time:"
echo "   journalctl -u devdestroyer -f"
echo ""
echo "📊 SYSTEM INFO:"
echo "=================================================="
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "Disk Usage: $(df -h / | tail -1 | awk '{print $5}')"
echo "Memory Available: $(free -h | grep Mem | awk '{print $7}')"
echo ""
echo "🚀 Architecture Ready:"
echo "  ✅ Phase 1: Research Mode (DNA Extraction)"
echo "  ✅ Phase 2: DNA Lock (Profile Creation)"
echo "  ✅ Phase 3: Real-Time Listener (CertStream) ← NOW WORKS!"
echo ""
echo "💰 COST-EFFECTIVE SPECS:"
echo "  - Free tier eligible: Yes (if <730 hrs/month)"
echo "  - Memory limit: 512MB (resource efficient)"
echo "  - CPU quota: 50% (shared core adequ for listener)"
echo "  - Storage: 10GB (plenty headroom)"
echo "=================================================="
