/**
 * Real-Time CertStream Listener
 * 
 * This module provides a real-time listener for Certificate Transparency (CT) logs
 * via CertStream, acting as the "Web3 equivalent" of a Solana logsSubscribe.
 * 
 * Every new HTTPS website (or significant certificate change) triggers a new certificate
 * issuance, which is immediately published to CT logs and streamed via CertStream.
 * 
 * This is the closest equivalent to listening for blockchain events:
 * - Solana: logsSubscribe -> listens for VM state changes (transactions)
 * - Web:    CertStream   -> listens for infrastructure state changes (certificates)
 */

const WebSocket = require('ws');
const dns = require('dns').promises;
const fs = require('fs');
const https = require('https');

class CertStreamRealTimeListener {
    constructor(config = {}) {
        this.knownCabalIPs = config.knownCabalIPs || ['159.198.65.253', '159.65.7.68'];
        this.knownCabalDomains = new Set(config.knownCabalDomains || []);
        this.domainPatterns = config.domainPatterns || [
            /\.fun$/,
            /\.xyz$/,
            /\.site$/,
            /\.online$/,
            /the(white|black|red|golden|silver|prime|small|big|giant|tiny)(cat|dog|whale|trout|penguin|bear|fox|eagle|panda|bull|cow)/i
        ];
        this.certificateIssuers = config.certificateIssuers || ['Let\'s Encrypt', 'Namecheap', 'Sectigo'];
        
        // Targeted Listener: Load watchlist (IPs, subnets, fingerprints)
        this.watchlist = config.watchlist || null;
        
        // Deep DNA Profile for enhanced matching
        this.profile = config.profile || null;
        
        this.ws = null;
        this.isConnected = false;
        this.messageCount = 0;
        this.detectedCount = 0;
        this.listeners = [];
    }

    /**
     * Set watchlist from Research Mode
     */
    setWatchlist(watchlist) {
        this.watchlist = watchlist;
        if (watchlist) {
            console.log(`[CertStream] Watchlist loaded: ${watchlist.ips.length} IPs, ${watchlist.subnets.length} subnets`);
        }
    }

    /**
     * Set profile from Research Mode (Deep DNA)
     */
    setProfile(profile) {
        this.profile = profile;
        if (profile) {
            console.log(`[CertStream] Profile loaded: ${profile.deep_dna.ssl_issuers.length} SSL issuers, ${profile.deep_dna.css_variables.length} CSS vars, ${profile.deep_dna.script_hashes.length} script hashes`);
        }
    }

    /**
     * Check if IP is in watchlist (direct match or subnet match)
     */
    isIPWatched(ip) {
        if (!this.watchlist) return false;
        
        // Direct IP match
        if (this.watchlist.ips && this.watchlist.ips.includes(ip)) return true;

        // Subnet match (e.g., 159.198.65.1 matches 159.198.65.0/24)
        if (this.watchlist.subnets) {
            const parts = ip.split('.');
            if (parts.length === 4) {
                const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
                if (this.watchlist.subnets.includes(subnet)) return true;
            }
        }

        return false;
    }

    /**
     * Perform Deep DNA matching against profile
     * Used to catch cabals even if they rotate IPs (VPN)
     */
    async performDeepDNAMatch(domain, certData) {
        if (!this.profile || !this.profile.deep_dna) {
            return null;
        }

        try {
            // Check SSL Issuer
            const issuer = certData?.leaf_cert?.issuer?.O || null;
            if (issuer && this.profile.deep_dna.ssl_issuers.includes(issuer)) {
                return {
                    type: 'SSL_ISSUER_MATCH',
                    confidence: 'MEDIUM',
                    details: `SSL Issuer matches known cabal: ${issuer}`
                };
            }

            // If domain matches heuristic pattern, trigger light scrape to check CSS/scripts
            const matchesPattern = this.domainPatterns.some(pattern => pattern.test(domain));
            if (matchesPattern) {
                // This would normally trigger a light Playwright scrape
                // For now, return pattern match info
                return {
                    type: 'PATTERN_MATCH',
                    confidence: 'MEDIUM',
                    details: `Domain matches cabal heuristic pattern: ${domain}`
                };
            }

            return null;
        } catch (error) {
            console.error('[CertStream] Deep DNA matching error:', error.message);
            return null;
        }
    }

    /**
     * Connect to CertStream WebSocket
     * CertStream URL: wss://certstream.calidog.io/full
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                const wsUrl = 'wss://certstream.calidog.io/full';
                console.log(`[CertStream] Connecting to ${wsUrl}...`);
                
                // Proper options for ws library
                const agent = new https.Agent({
                    rejectUnauthorized: false,  // Allow self-signed certs
                    keepAlive: true,
                    keepAliveMsecs: 30000
                });
                
                const wsOptions = {
                    agent: agent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; CabalDetector/1.0)'
                    },
                    handshakeTimeout: 15000
                };
                
                this.ws = new WebSocket(wsUrl, wsOptions);

                const openTimer = setTimeout(() => {
                    if (!this.isConnected) {
                        console.error('[CertStream] Connection timeout - server not responding');
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 20000);

                this.ws.on('open', () => {
                    clearTimeout(openTimer);
                    console.log('[CertStream] ✅ Connected to CertStream! Listening for new certificates...');
                    this.isConnected = true;
                    resolve();
                });

                this.ws.on('message', async (data) => {
                    await this.handleCertificateMessage(data);
                });

                this.ws.on('error', (error) => {
                    clearTimeout(openTimer);
                    console.error('[CertStream] WebSocket error details:');
                    console.error(`  Code: ${error.code}`);
                    console.error(`  Message: ${error.message}`);
                    console.error(`  Stack: ${error.stack}`);
                    this.isConnected = false;
                    // Don't reject immediately - let close handler take over
                });

                this.ws.on('close', (code, reason) => {
                    clearTimeout(openTimer);
                    console.log(`[CertStream] Connection closed (code: ${code}, reason: ${reason}). Bot will keep listening...`);
                    this.isConnected = false;
                    if (!this.isConnected) {
                        // Reject only on first attempt failure
                        setTimeout(() => reject(new Error(`CertStream connection closed: code ${code}`)), 100);
                    }
                });
            } catch (error) {
                console.error('[CertStream] Connection error:', error);
                reject(error);
            }
        });
    }

    /**
     * Handle incoming certificate messages from CertStream
     * Each message contains certificate data from CT logs
     */
    async handleCertificateMessage(data) {
        try {
            const message = JSON.parse(data);
            this.messageCount++;

            // CertStream message structure:
            // {
            //   "message_type": "certificate_update",
            //   "data": {
            //     "leaf_cert": { "subject": { "CN": "example.com" }, ... },
            //     "chain": [ ... ]
            //   }
            // }

            if (message.message_type === 'certificate_update') {
                const certData = message.data;
                if (certData && certData.leaf_cert) {
                    const domains = this.extractDomainsFromCert(certData.leaf_cert);
                    await this.processDomains(domains, certData);
                }
            }

            // Log progress every 1000 messages
            if (this.messageCount % 1000 === 0) {
                console.log(`[CertStream] Processed ${this.messageCount} certificates, detected ${this.detectedCount} potential cabal domains`);
            }
        } catch (error) {
            console.error('[CertStream] Error processing message:', error.message);
        }
    }

    /**
     * Extract domain names from certificate data
     */
    extractDomainsFromCert(leafCert) {
        const domains = new Set();

        // Extract from CN (Common Name)
        if (leafCert.subject && leafCert.subject.CN) {
            domains.add(leafCert.subject.CN);
        }

        // Extract from SAN (Subject Alternative Names)
        if (leafCert.extensions && leafCert.extensions.subjectAltName) {
            const sanList = leafCert.extensions.subjectAltName;
            sanList.forEach(san => {
                if (typeof san === 'string') {
                    domains.add(san);
                }
            });
        }

        // Extract from all_domains if available
        if (leafCert.all_domains) {
            leafCert.all_domains.forEach(domain => domains.add(domain));
        }

        return Array.from(domains);
    }

    /**
     * Process domains extracted from certificate
     * TARGETED LISTENER: Check if IP is in watchlist OR domain matches heuristic patterns
     * ENHANCED: Use Deep DNA matching for VPN-resistant detection
     */
    async processDomains(domains, certData) {
        for (const domain of domains) {
            // Skip wildcard domains and common non-scam patterns
            if (domain.startsWith('*.') || domain === '') continue;

            // Check if domain matches heuristic patterns (pattern match)
            const matchesPattern = this.domainPatterns.some(pattern => pattern.test(domain));
            
            // Attempt to resolve domain to IP and check against watchlist (IP match)
            let resolvedIP = null;
            try {
                const addresses = await dns.resolve4(domain);
                resolvedIP = addresses[0];
            } catch (error) {
                // Domain resolution failed - skip
            }

            const isWatchedIP = resolvedIP ? this.isIPWatched(resolvedIP) : false;

            // TARGETED LISTENER: Check for IP match or Deep DNA match
            if (isWatchedIP) {
                console.log(`\n🎯 [ALERT] IP MATCH: ${domain} resolves to watched IP ${resolvedIP}`);
                const alert = {
                    timestamp: new Date().toISOString(),
                    domain,
                    ip: resolvedIP,
                    issuer: certData.leaf_cert && certData.leaf_cert.issuer ? certData.leaf_cert.issuer.O : 'Unknown',
                    notBefore: certData.leaf_cert ? certData.leaf_cert.not_before : null,
                    notAfter: certData.leaf_cert ? certData.leaf_cert.not_after : null,
                    matchType: 'IP_MATCH',
                    confidence: 'CRITICAL'
                };
                this.detectedCount++;
                this.knownCabalDomains.add(domain);
                this.emit('cabal_detected', alert);
                this.saveAlert(alert);
            } else if (matchesPattern && !this.knownCabalDomains.has(domain)) {
                // Pattern match - check Deep DNA markers
                const deepMatch = await this.performDeepDNAMatch(domain, certData);
                
                if (deepMatch) {
                    console.log(`\n🎯 [ALERT] DEEP DNA MATCH: ${domain}`);
                    console.log(`    Type: ${deepMatch.type}, Confidence: ${deepMatch.confidence}`);
                    
                    const alert = {
                        timestamp: new Date().toISOString(),
                        domain,
                        ip: resolvedIP,
                        issuer: certData.leaf_cert && certData.leaf_cert.issuer ? certData.leaf_cert.issuer.O : 'Unknown',
                        notBefore: certData.leaf_cert ? certData.leaf_cert.not_before : null,
                        notAfter: certData.leaf_cert ? certData.leaf_cert.not_after : null,
                        matchType: deepMatch.type,
                        confidence: deepMatch.confidence,
                        deepDNADetails: deepMatch.details
                    };
                    this.detectedCount++;
                    this.knownCabalDomains.add(domain);
                    this.emit('cabal_detected', alert);
                    this.saveAlert(alert);
                } else if (matchesPattern) {
                    // Pattern match without Deep DNA confirmation - mark for review
                    console.log(`\n🎯 [ALERT] PATTERN MATCH (PENDING VERIFICATION): ${domain}`);
                    
                    const alert = {
                        timestamp: new Date().toISOString(),
                        domain,
                        ip: resolvedIP,
                        issuer: certData.leaf_cert && certData.leaf_cert.issuer ? certData.leaf_cert.issuer.O : 'Unknown',
                        notBefore: certData.leaf_cert ? certData.leaf_cert.not_before : null,
                        notAfter: certData.leaf_cert ? certData.leaf_cert.not_after : null,
                        matchType: 'PATTERN_MATCH',
                        confidence: 'MEDIUM',
                        status: 'PENDING_MANUAL_REVIEW'
                    };
                    this.detectedCount++;
                    this.knownCabalDomains.add(domain);
                    this.emit('cabal_detected', alert);
                    this.saveAlert(alert);
                }
            }
        }
    }

    /**
     * Register event listener for cabal detection alerts
     */
    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    /**
     * Emit events to registered listeners
     */
    emit(event, data) {
        this.listeners
            .filter(listener => listener.event === event)
            .forEach(listener => listener.callback(data));
    }

    /**
     * Save alert to file for persistence
     */
    saveAlert(alert) {
        const filename = 'cabal_detections_realtime.json';
        let alerts = [];

        if (fs.existsSync(filename)) {
            try {
                const content = fs.readFileSync(filename, 'utf-8');
                alerts = JSON.parse(content);
            } catch (error) {
                console.error('Error reading alerts file:', error.message);
            }
        }

        alerts.push(alert);
        fs.writeFileSync(filename, JSON.stringify(alerts, null, 2));
    }

    /**
     * Load known cabal domains from file
     */
    async loadKnownDomains(filename = 'cabal_domains_list.txt') {
        if (fs.existsSync(filename)) {
            const content = fs.readFileSync(filename, 'utf-8');
            const domains = content.split('\n').filter(d => d.trim());
            domains.forEach(domain => this.knownCabalDomains.add(domain));
            console.log(`[CertStream] Loaded ${domains.length} known cabal domains`);
        }
    }

    /**
     * Disconnect from CertStream
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.isConnected = false;
            console.log('[CertStream] Disconnected');
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            isConnected: this.isConnected,
            messagesProcessed: this.messageCount,
            cabalDomainsDetected: this.detectedCount,
            knownDomainsTracked: this.knownCabalDomains.size
        };
    }

    /**
     * Connect to CertStream WebSocket with ping/pong heartbeat
     * 
     * CRITICAL FIX: CertStream server closes connections without active heartbeat.
     * Must implement ping/pong to keep connection alive (code 1000 timeout issue).
     * 
     * Exponential backoff reconnection on failure.
     */
    connect(maxRetries = 5) {
        const WEBSOCKET_URL = 'wss://certstream.calidog.io/';
        let retryCount = 0;
        let retryDelay = 1000;
        let isAlive = true;
        let pingInterval = null;
        let stallCheckInterval = null;

        const attemptConnection = () => {
            console.log(`[CertStream] Connecting to ${WEBSOCKET_URL}...`);
            
            this.ws = new WebSocket(WEBSOCKET_URL);

            this.ws.on('open', () => {
                console.log('[CertStream] ✅ Connected to CertStream!');
                console.log('[CertStream] Enabling heartbeat...');
                this.isConnected = true;
                isAlive = true;
                retryCount = 0;
                retryDelay = 1000;

                // ===== CRITICAL: Send ping every 30 seconds =====
                // CertStream server closes idle connections with code 1000
                // Ping/pong keeps connection alive
                pingInterval = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.ping();
                        console.log('[CertStream] 📡 Sent ping to keep connection alive');
                    }
                }, 30000);

                // ===== CRITICAL: Detect stalled connections =====
                // If server doesn't pong within 40 seconds, terminate and reconnect
                stallCheckInterval = setInterval(() => {
                    if (!isAlive) {
                        console.log('[CertStream] ⚠️  Connection stalled (no pong). Terminating...');
                        if (this.ws) this.ws.terminate();
                    }
                    isAlive = false; // Reset flag, expect pong to set it true
                }, 40000);

                console.log('[CertStream] Waiting for certificate events...');
            });

            this.ws.on('message', (data) => {
                // Log first message to verify data is flowing
                if (this.messageCount === 0) {
                    console.log('[CertStream] ✅ First message received! Data is flowing.');
                }
                this.handleCertificateMessage(data).catch(error => {
                    console.error('[CertStream] Error handling message:', error.message);
                });
            });

            // ===== CRITICAL: Handle pong responses =====
            // When server responds to our ping
            this.ws.on('pong', () => {
                isAlive = true; // Connection is healthy
                console.log('[CertStream] 📡 Received pong - connection stable');
            });

            this.ws.on('error', (error) => {
                console.error('[CertStream] WebSocket error:', error.message);
                this.isConnected = false;
            });

            this.ws.on('close', (code, reason) => {
                console.log(`[CertStream] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
                this.isConnected = false;
                isAlive = false;

                // Clean up timers
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                if (stallCheckInterval) {
                    clearInterval(stallCheckInterval);
                    stallCheckInterval = null;
                }

                // Attempt to reconnect with exponential backoff
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`[CertStream] Reconnection attempt ${retryCount}/${maxRetries} in ${retryDelay}ms...`);
                    setTimeout(() => {
                        retryDelay = Math.min(retryDelay * 2, 30000);
                        attemptConnection();
                    }, retryDelay);
                } else {
                    console.log('[CertStream] ❌ Max reconnection attempts reached.');
                    console.log('[CertStream] Bot will continue running but monitoring is offline.');
                }
            });
        };

        // Start connection
        attemptConnection();
    }
}

module.exports = CertStreamRealTimeListener;