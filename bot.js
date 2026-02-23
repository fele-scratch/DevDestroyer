require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const PythonCertStreamBridge = require('./python_certstream_bridge');
const CertStreamRealTimeListener = require('./realtime_certstream_listener');
const ResearchMode = require('./research_mode');
const CabalScraper = require('./cabal_scraper');
const axios = require('axios');

const WATCHLIST_FILE = path.resolve(process.cwd(), 'target_watchlist.json');
const SEED_URLS_FILE = path.resolve(process.cwd(), 'seed_urls.txt');
const DETECTION_LOG = path.resolve(process.cwd(), 'cabal_detections.jsonl');

/**
 * Targeted Listener Bot: Research Phase -> DNA Lock -> Real-Time Listener
 */
class TargetedListenerBot extends EventEmitter {
    constructor() {
        super();
        this.research = new ResearchMode(WATCHLIST_FILE);
        this.listener = new CertStreamRealTimeListener();
        this.bridge = null;
        this.pythonProcess = null;
        this.scraper = new CabalScraper();
        this.isRunning = false;
    }

    /**
     * Load seed URLs from file or create template
     */
    async loadOrPromptSeedURLs() {
        if (fs.existsSync(SEED_URLS_FILE)) {
            const urls = fs.readFileSync(SEED_URLS_FILE, 'utf-8')
                .split('\n')
                .map(u => u.trim())
                .filter(u => u.length > 0 && u.startsWith('http'));
            if (urls.length > 0) {
                console.log(`[BOT] Found ${urls.length} seed URL(s) in ${SEED_URLS_FILE}`);
                return urls;
            }
        }

        // Create template file if it doesn't exist
        if (!fs.existsSync(SEED_URLS_FILE)) {
            fs.writeFileSync(SEED_URLS_FILE, '# Add seed URLs here (one per line)\n# https://example1.fun\n# https://example2.xyz\n');
            console.log(`[BOT] Created ${SEED_URLS_FILE}. Add seed URLs and restart bot.`);
        }

        return [];
    }

    /**
     * Phase 1: Research Mode - Extract DNA from seed URLs
     */
    async runResearchPhase() {
        console.log('\n========================================');
        console.log('PHASE 1: RESEARCH MODE - DNA Extraction');
        console.log('========================================\n');

        const seedURLs = await this.loadOrPromptSeedURLs();
        if (seedURLs.length === 0) {
            console.log('[BOT] No seed URLs found. Add URLs to', SEED_URLS_FILE);
            return false;
        }

        try {
            await this.research.profileSeedURLs(seedURLs);
            console.log('[BOT] ✅ Research phase complete. DNA locked.');
            return true;
        } catch (error) {
            console.error('[BOT] Research phase failed:', error.message);
            return false;
        }
    }

    /**
     * Phase 2: DNA Lock - Watchlist is now immutable
     */
    runDNALockPhase() {
        console.log('\n==============================');
        console.log('PHASE 2: DNA LOCK - Locked');
        console.log('==============================\n');

        const watchlist = this.research.loadWatchlist();
        const profile = this.research.loadProfile();
        
        if (!watchlist || watchlist.ips.length === 0) {
            console.log('[BOT] ❌ No watchlist found. Run research phase first.');
            return false;
        }

        this.listener.setWatchlist(watchlist);
        this.listener.setProfile(profile);
        
        console.log('[BOT] ✅ Watchlist locked and passed to listener.');
        console.log(`    Monitoring ${watchlist.ips.length} IPs and ${watchlist.subnets.length} subnets\n`);
        
        if (profile && profile.deep_dna) {
            console.log('[BOT] ✅ Deep DNA Profile loaded.');
            console.log(`    CSS Variables: ${profile.deep_dna.css_variables.length}`);
            console.log(`    Script Hashes: ${profile.deep_dna.script_hashes.length}`);
            console.log(`    SSL Issuers: ${profile.deep_dna.ssl_issuers.length}\n`);
        }
        
        return true;
    }

    /**
     * Phase 3: Real-Time Listener - Using Python Bridge with SQLite
     */
    async runRealTimeListener() {
        console.log('=========================================');
        console.log('PHASE 3: REAL-TIME LISTENER - Online');
        console.log('=========================================');
        console.log('[BOT] 🔍 Listening for certificate events...');
        console.log('[BOT] 🤐 Silent mode: Alerts only on watchlist/pattern match\n');

        try {
            // Start Python CertStream Monitor
            console.log('[BOT] 🐍 Starting Python CertStream Monitor...');
            this.startPythonMonitor();

            // Create bridge to SQLite database
            console.log('[BOT] 🌉 Initializing SQLite bridge...');
            this.bridge = new PythonCertStreamBridge({
                dbPath: path.join(__dirname, 'data', 'certstream.db'),
                pollInterval: 5000,
                onCertificate: (message) => this.processCertificateFromBridge(message)
            });

            // Connect to database
            await this.bridge.connect();
            console.log('[BOT] ✅ Connected to SQLite database');

            // Start polling SQLite for new certificates
            this.bridge.startPolling();
            this.isRunning = true;
            console.log('[BOT] ✅ Initiated CertStream bridge connection. Waiting for matches...');
            
        } catch (error) {
            console.error('[BOT] ⚠️  Bridge initialization failed:', error.message);
            console.log('[BOT] ℹ️  The listener will attempt to recover automatically.');
            this.isRunning = false;
        }

        return true;
    }

    /**
     * Start Python CertStream Monitor as subprocess
     */
    startPythonMonitor() {
        try {
            const scriptPath = path.join(__dirname, 'certstream_monitor.py');
            
            this.pythonProcess = spawn('python3', [scriptPath], {
                cwd: __dirname,
                stdio: ['inherit', 'pipe', 'pipe'],
                detached: false
            });

            this.pythonProcess.stdout.on('data', (data) => {
                process.stdout.write(data);
            });

            this.pythonProcess.stderr.on('data', (data) => {
                process.stderr.write(data);
            });

            this.pythonProcess.on('error', (err) => {
                console.error('[BOT] Python process error:', err.message);
            });

            this.pythonProcess.on('exit', (code, signal) => {
                console.log(`[BOT] Python process exited with code ${code}`);
                this.pythonProcess = null;
            });

            console.log('[BOT] 🐍 Python monitor started (PID: ' + this.pythonProcess.pid + ')');
        } catch (error) {
            console.error('[BOT] Failed to start Python monitor:', error.message);
        }
    }

    /**
     * Process certificate from SQLite bridge
     */
    async processCertificateFromBridge(message) {
        try {
            // Pass message through the listener's existing certificate handling logic
            await this.listener.handleCertificateMessage(JSON.stringify(message));
            
            // Listener will emit cabal_detected events as needed
        } catch (error) {
            console.error('[BOT] Error processing certificate:', error.message);
        }
    }

    /**
     * Handle a detected cabal match - triggered verification
     */
    async handleCabalDetection(alert) {
        console.log(`\n🎯 [TRIGGERED] Match detected: ${alert.domain}`);
        console.log(`   Match Type: ${alert.matchType}`);
        console.log(`   Confidence: ${alert.confidence || 'N/A'}`);

        if (alert.matchType === 'IP_MATCH') {
            console.log(`   Watched IP: ${alert.ip}`);
            console.log('   Action: Running deep verification scrape...');

            // Trigger scraper to verify against known fingerprints
            try {
                const url = alert.domain.startsWith('http') ? alert.domain : `https://${alert.domain}`;
                const newFingerprints = await this.scraper.fingerprintSite(url);

                // Try to match against known fingerprints
                const matchResult = await this.research.matchFingerprints(alert.domain);
                
                const detection = {
                    timestamp: new Date().toISOString(),
                    domain: alert.domain,
                    ip: alert.ip,
                    matchType: alert.matchType,
                    confidence: alert.confidence,
                    fingerprintMatch: matchResult,
                    newFingerprints: {
                        dom_hash: newFingerprints.dom_hash,
                        uses_wordpress: newFingerprints.uses_wp_uploads,
                        elementor_data_ids: newFingerprints.elementor_data_ids
                    }
                };

                // Log to JSONL file
                fs.appendFileSync(DETECTION_LOG, JSON.stringify(detection) + '\n');
                console.log(`   ✅ Verification complete. Logged to ${DETECTION_LOG}`);

                // Send alert to Telegram if configured
                await this.sendTelegramAlert(alert, matchResult);
            } catch (error) {
                console.error(`   ❌ Verification failed:`, error.message);
            }
        } else if (alert.matchType === 'PATTERN_MATCH') {
            console.log('   Action: Pattern match recorded (needs manual review)');
            const detection = {
                timestamp: new Date().toISOString(),
                domain: alert.domain,
                ip: alert.ip,
                matchType: 'PATTERN_MATCH',
                confidence: alert.confidence,
                status: 'PENDING_MANUAL_REVIEW'
            };
            fs.appendFileSync(DETECTION_LOG, JSON.stringify(detection) + '\n');
            await this.sendTelegramAlert(alert, null);
        }
    }

    /**
     * Send alert to Telegram
     */
    async sendTelegramAlert(alert, matchResult) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            console.log('   ℹ️  Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID)');
            return;
        }

        try {
            const message = `🎯 **Cabal Alert**\n\nDomain: ${alert.domain}\nIP: ${alert.ip || 'N/A'}\nMatch: ${alert.matchType}\nConfidence: ${alert.confidence}\n\n${matchResult ? `**Match Result:** ${matchResult.type}` : 'Pending verification'}`;
            const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}&parse_mode=Markdown`;
            
            const response = await axios.get(url);
            if (response.data.ok) {
                console.log('   📲 Telegram alert sent');
            }
        } catch (error) {
            console.error('   ❌ Failed to send Telegram alert:', error.message);
        }
    }

    /**
     * Main bot orchestration
     */
    async start() {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║  CABAL DETECTION BOT: Targeted Listener║');
        console.log('║       Research → DNA Lock → Listen    ║');
        console.log('╚════════════════════════════════════════╝\n');

        // Set up listener event handler
        this.listener.on('cabal_detected', (alert) => this.handleCabalDetection(alert));

        // Phase 1: Research
        const researchOk = await this.runResearchPhase();
        if (!researchOk) {
            console.log('[BOT] Exiting: Research phase incomplete');
            process.exit(0);
        }

        // Phase 2: DNA Lock
        const lockOk = this.runDNALockPhase();
        if (!lockOk) {
            console.log('[BOT] Exiting: DNA lock failed');
            process.exit(1);
        }

        // Phase 3: Real-Time Listener (Python bridge + SQLite)
        await this.runRealTimeListener();

        // Keep process alive even if listener failed (for testing)
        console.log('\n[BOT] Bot is running. Press Ctrl+C to stop.\n');
    }

    async stop() {
        this.isRunning = false;
        
        // Stop bridge polling
        if (this.bridge) {
            await this.bridge.disconnect();
        }

        // Stop listener (legacy)
        if (this.listener) {
            this.listener.disconnect();
        }

        // Stop Python monitor process
        if (this.pythonProcess) {
            console.log('[BOT] Terminating Python monitor...');
            this.pythonProcess.kill('SIGTERM');
            // Give it 3 seconds to shut down gracefully
            setTimeout(() => {
                if (this.pythonProcess) {
                    this.pythonProcess.kill('SIGKILL');
                }
            }, 3000);
        }

        console.log('[BOT] Stopped.');
    }
}

// Run if called directly
if (require.main === module) {
    const bot = new TargetedListenerBot();
    bot.start().catch(err => {
        console.error('[BOT] Fatal error:', err.message);
        process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[BOT] Shutting down...');
        await bot.stop();
        process.exit(0);
    });
}

module.exports = TargetedListenerBot;
