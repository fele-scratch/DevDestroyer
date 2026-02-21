# DevDestroyer Bot - Quick VM Setup Reference

## Copy-Paste Startup Script for Google Cloud Console

**Location in Console:** Compute Engine → Create Instance → "Automation" tab → "Startup script"

```bash
#!/bin/bash
set -e
apt-get update && apt-get upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
mkdir -p /opt/devdestroyer && cd /opt/devdestroyer
git clone https://github.com/fele-scratch/DevDestroyer.git . 2>/dev/null || git pull origin main
npm install --production
cat > /opt/devdestroyer/.env << 'ENVEOF'
TELEGRAM_BOT_TOKEN=PLACEHOLDER_SET_ME
TELEGRAM_CHAT_ID=PLACEHOLDER_SET_ME
IPINFO_API_KEY=optional
ENVEOF
cat > /etc/systemd/system/devdestroyer.service << 'SVCEOF'
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
MemoryLimit=512M
CPUQuota=50%
StandardOutput=journal
StandardError=journal
SyslogIdentifier=devdestroyer
[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable devdestroyer.service
npm install -g pm2
echo "✅ Ready - configure .env then: systemctl start devdestroyer"
```

---

## Recommended Instance Settings

```
Machine Type:      e2-micro (or e2-small if budget allows)
OS:                Debian GNU/Linux 12 (bookworm)
Storage:           10 GB (standard persistent disk)
Network:           Default VPC
Firewall:          Allow outbound HTTPS (automatic on GCP)
Startup Script:    [Use script above]
```

---

## Post-Deployment (Manual SSH Steps)

```bash
# 1. SSH into instance
gcloud compute ssh INSTANCE_NAME --zone=YOUR_ZONE

# 2. Get Telegram credentials:
#    - Bot Token: https://t.me/botfather (send /newbot)
#    - Chat ID: @userinfobot on Telegram (send /start)

# 3. Configure bot
nano /opt/devdestroyer/.env

# Replace:
#   TELEGRAM_BOT_TOKEN=actual_token_from_botfather
#   TELEGRAM_CHAT_ID=actual_chatid_from_userinfobot

# 4. Start bot
systemctl start devdestroyer

# 5. Monitor
journalctl -u devdestroyer -f
```

---

## What This Accomplishes

✅ Installs Node.js 20 (LTS, lightweight)  
✅ Clones DevDestroyer repo from GitHub  
✅ Installs all dependencies (axios, cheerio, playwright, ws)  
✅ Creates systemd service for auto-restart  
✅ Enables Phase 3 (CertStream real-time listener)  
✅ Sets memory limit (512MB - cost efficient)  
✅ Starts listening for cabal certificates in real-time  

---

## Cost for This Setup

- **e2-micro**: FREE (free tier)
- **10GB disk**: ~$0.40/month
- **Outbound traffic**: ~$0.10/month
- **Total**: ~$0.50/month (FREE if on eligible free tier account)

---

## Key Features Ready

| Phase | Status | What It Does |
|-------|--------|-------------|
| 1: Research | ✅ Works | Extracts DNA from cabal sites |
| 2: DNA Lock | ✅ Works | Creates profiles & watchlists |
| 3: Listener | ✅ NEW! | Real-time cert monitoring (CertStream) |

---

## Troubleshooting Quick Fixes

**Bot won't start?**
```bash
systemctl status devdestroyer
journalctl -u devdestroyer -n 50
# Check if .env is configured (not placeholder values)
```

**Want to view logs live?**
```bash
journalctl -u devdestroyer -f
```

**Need to restart bot?**
```bash
systemctl restart devdestroyer
systemctl status devdestroyer
```

**Want to expand cabal DNA profile later?**
```bash
nano /opt/devdestroyer/seed_urls.txt
# Add more URLs, then:
node /opt/devdestroyer/bot.js  # Runs research phase once
```

---

## Support Files in Repository

- `gcloud-startup.sh` - Full startup script (this file)
- `DEPLOYMENT-GUIDE.md` - Detailed deployment guide
- `README.md` - Bot architecture documentation
- `.env.sample` - Environment variable template

---

**Ready to Deploy:** YES ✅  
**Setup Time:** 3-5 minutes  
**Maintenance Required:** Just monitor logs, update seed URLs occasionally
