/**
 * Python CertStream Bridge
 * 
 * Reads certificates from SQLite database populated by Python monitor
 * Triggers the same certificate processing as the old WebSocket listener
 * Provides a bridge between Python CertStream monitor and Node.js bot
 */

const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

class PythonCertStreamBridge {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(__dirname, 'data', 'certstream.db');
        this.pollInterval = options.pollInterval || 5000; // Check database every 5 seconds
        this.onCertificate = options.onCertificate || (() => {});
        this.isPolling = false;
        this.db = null;
        this.lastProcessedCertIndex = -1;
        
        // Load last processed cert index from state file
        this.loadProcessedState();
    }

    /**
     * Load last processed certificate index from state file
     */
    loadProcessedState() {
        try {
            const stateFile = path.join(path.dirname(this.dbPath), '.bridge_state.json');
            if (fs.existsSync(stateFile)) {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                this.lastProcessedCertIndex = state.lastCertIndex || -1;
                console.log(`[SQLite Bridge] Loaded state: lastCertIndex = ${this.lastProcessedCertIndex}`);
            }
        } catch (error) {
            console.error('[SQLite Bridge] Error loading state:', error.message);
        }
    }

    /**
     * Save processed state to file
     */
    saveProcessedState() {
        try {
            const stateFile = path.join(path.dirname(this.dbPath), '.bridge_state.json');
            fs.writeFileSync(stateFile, JSON.stringify({
                lastCertIndex: this.lastProcessedCertIndex,
                lastUpdate: new Date().toISOString()
            }), 'utf8');
        } catch (error) {
            console.error('[SQLite Bridge] Error saving state:', error.message);
        }
    }

    /**
     * Initialize SQLite connection
     */
    connect() {
        return new Promise((resolve, reject) => {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('[SQLite Bridge] Failed to connect to database:', err.message);
                    reject(err);
                } else {
                    console.log(`[SQLite Bridge] Connected to database: ${this.dbPath}`);
                    this.db.configure('busyTimeout', 5000);
                    resolve();
                }
            });
        });
    }

    /**
     * Start polling the database for new certificates
     */
    startPolling() {
        if (this.isPolling) {
            console.log('[SQLite Bridge] Already polling');
            return;
        }

        if (!this.db) {
            console.error('[SQLite Bridge] Database not connected. Call connect() first.');
            return;
        }

        this.isPolling = true;
        console.log(`[SQLite Bridge] Starting polling every ${this.pollInterval}ms`);
        console.log(`[SQLite Bridge] Will monitor certificates with cert_index > ${this.lastProcessedCertIndex}`);

        const poll = async () => {
            try {
                const certs = await this.getUnprocessedCertificates();
                
                for (const cert of certs) {
                    try {
                        // Parse the domains JSON
                        const domains = JSON.parse(cert.domains);
                        
                        // Build certificate message
                        const message = {
                            message_type: 'certificate_update',
                            data: {
                                cert_index: cert.cert_index,
                                leaf_cert: {
                                    all_domains: domains,
                                    serial_number: cert.serialnumber,
                                    issuer: { CN: cert.issuer }
                                },
                                seen: cert.seen_timestamp
                            }
                        };

                        // Call the certificate handler
                        await this.onCertificate(message);

                        // Mark as processed
                        await this.markCertificateProcessed(cert.cert_index);
                        this.lastProcessedCertIndex = cert.cert_index;
                        this.saveProcessedState();

                        // Log if it matched a pattern
                        if (cert.matched_pattern) {
                            console.log(`[SQLite Bridge] 📜 Cert #${cert.cert_index}: ${domains[0]} (Pattern: ${cert.matched_pattern})`);
                        }

                    } catch (error) {
                        console.error('[SQLite Bridge] Error processing certificate:', error.message);
                    }
                }

                // Schedule next poll
                if (this.isPolling) {
                    setTimeout(poll, this.pollInterval);
                }

            } catch (error) {
                console.error('[SQLite Bridge] Poll error:', error.message);
                // Continue polling even on error
                if (this.isPolling) {
                    setTimeout(poll, this.pollInterval);
                }
            }
        };

        // Start polling
        poll();
    }

    /**
     * Get unprocessed certificates from database
     */
    getUnprocessedCertificates() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT * FROM certificates 
                WHERE cert_index > ? AND processed = 0
                ORDER BY cert_index ASC
                LIMIT 100
            `;

            this.db.all(query, [this.lastProcessedCertIndex], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Mark certificate as processed
     */
    markCertificateProcessed(certIndex) {
        return new Promise((resolve, reject) => {
            const query = `UPDATE certificates SET processed = 1 WHERE cert_index = ?`;
            this.db.run(query, [certIndex], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Stop polling
     */
    stopPolling() {
        console.log('[SQLite Bridge] Stopping polling');
        this.isPolling = false;
        this.saveProcessedState();
    }

    /**
     * Disconnect from database
     */
    disconnect() {
        return new Promise((resolve) => {
            this.stopPolling();
            
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('[SQLite Bridge] Error closing database:', err.message);
                    } else {
                        console.log('[SQLite Bridge] Disconnected from database');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Get database statistics
     */
    getStats() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN processed = 0 THEN 1 ELSE 0 END) as unprocessed,
                    SUM(CASE WHEN matched_pattern IS NOT NULL THEN 1 ELSE 0 END) as matched
                FROM certificates
            `;

            this.db.get(query, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get recent matched certificates
     */
    getRecentMatches(limit = 10) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT cert_index, domains, matched_pattern, stored_at 
                FROM certificates 
                WHERE matched_pattern IS NOT NULL
                ORDER BY stored_at DESC
                LIMIT ?
            `;

            this.db.all(query, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
}

module.exports = PythonCertStreamBridge;
