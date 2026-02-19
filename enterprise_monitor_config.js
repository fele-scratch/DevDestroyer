/**
 * Enterprise Monitor Configuration
 * 
 * This module provides configuration and integration methods for commercial
 * Certificate Transparency and Internet-wide scanning services:
 * - Censys (https://censys.io/)
 * - BinaryEdge (https://www.binaryedge.io/)
 * 
 * These services offer more robust, targeted, and real-time monitoring capabilities
 * compared to free services like CertStream.
 */

const axios = require('axios');
const fs = require('fs');

class EnterpriseMonitorConfig {
    constructor() {
        this.censysConfig = {
            baseUrl: 'https://censys.io/api/v2',
            uid: process.env.CENSYS_UID || null,
            secret: process.env.CENSYS_SECRET || null,
            enabled: false
        };

        this.binaryedgeConfig = {
            baseUrl: 'https://api.binaryedge.io/v2',
            apiKey: process.env.BINARYEDGE_API_KEY || null,
            enabled: false
        };

        this.validateConfigs();
    }

    /**
     * Validate that API credentials are properly configured
     */
    validateConfigs() {
        if (this.censysConfig.uid && this.censysConfig.secret) {
            this.censysConfig.enabled = true;
            console.log('[Enterprise] Censys API credentials found - enabled');
        } else {
            console.log('[Enterprise] Censys API credentials not found - set CENSYS_UID and CENSYS_SECRET');
        }

        if (this.binaryedgeConfig.apiKey) {
            this.binaryedgeConfig.enabled = true;
            console.log('[Enterprise] BinaryEdge API key found - enabled');
        } else {
            console.log('[Enterprise] BinaryEdge API key not found - set BINARYEDGE_API_KEY');
        }
    }

    /**
     * ============================================================================
     * CENSYS API METHODS
     * ============================================================================
     * 
     * Censys provides:
     * 1. Certificate Search: Query CT logs for certificates matching criteria
     * 2. IP Address Search: Find all domains/services on an IP
     * 3. Domain Search: Find all IPs hosting a domain
     * 4. Streaming: Real-time certificate stream (paid tier)
     */

    /**
     * Censys: Search for certificates issued to domains on a specific IP
     * 
     * @param {string} ip - IP address to search for
     * @returns {Promise<Array>} - Array of certificates found
     * 
     * Example Query: "ip:159.198.65.253"
     */
    async censysSearchCertificatesByIP(ip) {
        if (!this.censysConfig.enabled) {
            console.log('[Censys] API not configured. Set CENSYS_UID and CENSYS_SECRET');
            return [];
        }

        try {
            console.log(`[Censys] Searching for certificates on IP: ${ip}`);
            
            const query = `ip:${ip}`;
            const response = await axios.get(
                `${this.censysConfig.baseUrl}/certificates/search`,
                {
                    params: { q: query },
                    auth: {
                        username: this.censysConfig.uid,
                        password: this.censysConfig.secret
                    }
                }
            );

            const results = response.data.results || [];
            console.log(`[Censys] Found ${results.length} certificates for IP ${ip}`);
            return results;
        } catch (error) {
            console.error('[Censys] Error searching certificates:', error.message);
            return [];
        }
    }

    /**
     * Censys: Search for certificates matching a domain pattern
     * 
     * @param {string} domainPattern - Domain pattern to search (e.g., "*.fun")
     * @returns {Promise<Array>} - Array of certificates found
     */
    async censysSearchCertificatesByDomain(domainPattern) {
        if (!this.censysConfig.enabled) {
            console.log('[Censys] API not configured');
            return [];
        }

        try {
            console.log(`[Censys] Searching for certificates matching: ${domainPattern}`);
            
            const query = `parsed.names:${domainPattern}`;
            const response = await axios.get(
                `${this.censysConfig.baseUrl}/certificates/search`,
                {
                    params: { q: query },
                    auth: {
                        username: this.censysConfig.uid,
                        password: this.censysConfig.secret
                    }
                }
            );

            const results = response.data.results || [];
            console.log(`[Censys] Found ${results.length} certificates matching ${domainPattern}`);
            return results;
        } catch (error) {
            console.error('[Censys] Error searching certificates:', error.message);
            return [];
        }
    }

    /**
     * Censys: Get detailed information about a specific certificate
     * 
     * @param {string} fingerprint - Certificate fingerprint (SHA-256)
     * @returns {Promise<Object>} - Certificate details
     */
    async censysGetCertificateDetails(fingerprint) {
        if (!this.censysConfig.enabled) {
            console.log('[Censys] API not configured');
            return null;
        }

        try {
            console.log(`[Censys] Fetching certificate details for: ${fingerprint}`);
            
            const response = await axios.get(
                `${this.censysConfig.baseUrl}/certificates/${fingerprint}`,
                {
                    auth: {
                        username: this.censysConfig.uid,
                        password: this.censysConfig.secret
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('[Censys] Error fetching certificate details:', error.message);
            return null;
        }
    }

    /**
     * Censys: Search for services on an IP address
     * 
     * @param {string} ip - IP address to search
     * @returns {Promise<Object>} - IP address details including services
     */
    async censysSearchIPAddress(ip) {
        if (!this.censysConfig.enabled) {
            console.log('[Censys] API not configured');
            return null;
        }

        try {
            console.log(`[Censys] Searching for services on IP: ${ip}`);
            
            const response = await axios.get(
                `${this.censysConfig.baseUrl}/ip-addresses/${ip}`,
                {
                    auth: {
                        username: this.censysConfig.uid,
                        password: this.censysConfig.secret
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('[Censys] Error searching IP address:', error.message);
            return null;
        }
    }

    /**
     * ============================================================================
     * BINARYEDGE API METHODS
     * ============================================================================
     * 
     * BinaryEdge provides:
     * 1. Host Search: Find hosts/services on an IP
     * 2. Domain Search: Find all IPs for a domain
     * 3. Subdomain Search: Find subdomains
     * 4. Streaming: Real-time certificate stream (premium)
     */

    /**
     * BinaryEdge: Search for hosts on an IP address
     * 
     * @param {string} ip - IP address to search
     * @returns {Promise<Object>} - Host information
     */
    async binaryedgeSearchHost(ip) {
        if (!this.binaryedgeConfig.enabled) {
            console.log('[BinaryEdge] API key not configured. Set BINARYEDGE_API_KEY');
            return null;
        }

        try {
            console.log(`[BinaryEdge] Searching for host: ${ip}`);
            
            const response = await axios.get(
                `${this.binaryedgeConfig.baseUrl}/query/ip/${ip}`,
                {
                    headers: {
                        'X-API-Key': this.binaryedgeConfig.apiKey
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('[BinaryEdge] Error searching host:', error.message);
            return null;
        }
    }

    /**
     * BinaryEdge: Search for domains
     * 
     * @param {string} domain - Domain to search
     * @returns {Promise<Object>} - Domain information
     */
    async binaryedgeSearchDomain(domain) {
        if (!this.binaryedgeConfig.enabled) {
            console.log('[BinaryEdge] API key not configured');
            return null;
        }

        try {
            console.log(`[BinaryEdge] Searching for domain: ${domain}`);
            
            const response = await axios.get(
                `${this.binaryedgeConfig.baseUrl}/query/domains/subdomain/${domain}`,
                {
                    headers: {
                        'X-API-Key': this.binaryedgeConfig.apiKey
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('[BinaryEdge] Error searching domain:', error.message);
            return null;
        }
    }

    /**
     * BinaryEdge: Get events for an IP (services, certificates, etc.)
     * 
     * @param {string} ip - IP address
     * @param {string} type - Event type (e.g., 'ssl', 'service')
     * @returns {Promise<Array>} - Events for the IP
     */
    async binaryedgeGetIPEvents(ip, type = 'ssl') {
        if (!this.binaryedgeConfig.enabled) {
            console.log('[BinaryEdge] API key not configured');
            return [];
        }

        try {
            console.log(`[BinaryEdge] Fetching ${type} events for IP: ${ip}`);
            
            const response = await axios.get(
                `${this.binaryedgeConfig.baseUrl}/query/ip/${ip}/events`,
                {
                    params: { type },
                    headers: {
                        'X-API-Key': this.binaryedgeConfig.apiKey
                    }
                }
            );

            return response.data.events || [];
        } catch (error) {
            console.error('[BinaryEdge] Error fetching IP events:', error.message);
            return [];
        }
    }

    /**
     * ============================================================================
     * UNIFIED MONITORING ORCHESTRATION
     * ============================================================================
     */

    /**
     * Perform comprehensive monitoring across all enabled enterprise services
     * 
     * @param {Array<string>} ips - IP addresses to monitor
     * @param {Array<string>} domains - Domain patterns to monitor
     * @returns {Promise<Object>} - Aggregated results from all services
     */
    async runEnterpriseMonitoring(ips = [], domains = []) {
        console.log('\n=== STARTING ENTERPRISE MONITORING ===\n');

        const results = {
            timestamp: new Date().toISOString(),
            censys: {},
            binaryedge: {},
            aggregated: []
        };

        // Monitor via Censys
        if (this.censysConfig.enabled) {
            console.log('[Enterprise] Running Censys monitoring...');
            for (const ip of ips) {
                const certs = await this.censysSearchCertificatesByIP(ip);
                results.censys[ip] = certs;
            }

            for (const domain of domains) {
                const certs = await this.censysSearchCertificatesByDomain(domain);
                results.censys[domain] = certs;
            }
        }

        // Monitor via BinaryEdge
        if (this.binaryedgeConfig.enabled) {
            console.log('[Enterprise] Running BinaryEdge monitoring...');
            for (const ip of ips) {
                const events = await this.binaryedgeGetIPEvents(ip, 'ssl');
                results.binaryedge[ip] = events;
            }

            for (const domain of domains) {
                const domainData = await this.binaryedgeSearchDomain(domain);
                results.binaryedge[domain] = domainData;
            }
        }

        // Save results
        this.saveResults(results);
        return results;
    }

    /**
     * Save monitoring results to file
     */
    saveResults(results) {
        const filename = `enterprise_monitoring_${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
        console.log(`[Enterprise] Results saved to ${filename}`);
    }

    /**
     * Print setup instructions for configuring API credentials
     */
    static printSetupInstructions() {
        console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    ENTERPRISE MONITOR SETUP INSTRUCTIONS                   ║
╚════════════════════════════════════════════════════════════════════════════╝

1. CENSYS SETUP (https://censys.io/)
   ─────────────────────────────────
   - Create a free account at https://censys.io/register/
   - Go to Settings > API > Generate API Credentials
   - Set environment variables:
     export CENSYS_UID="your_uid_here"
     export CENSYS_SECRET="your_secret_here"

   Usage:
   - Search certificates by IP: censysSearchCertificatesByIP('159.198.65.253')
   - Search certificates by domain: censysSearchCertificatesByDomain('*.fun')
   - Get IP details: censysSearchIPAddress('159.198.65.253')

2. BINARYEDGE SETUP (https://www.binaryedge.io/)
   ──────────────────────────────────────────────
   - Create a free account at https://www.binaryedge.io/
   - Go to Account > API > Generate API Key
   - Set environment variable:
     export BINARYEDGE_API_KEY="your_api_key_here"

   Usage:
   - Search host: binaryedgeSearchHost('159.198.65.253')
   - Search domain: binaryedgeSearchDomain('example.fun')
   - Get IP events: binaryedgeGetIPEvents('159.198.65.253', 'ssl')

3. RUNNING ENTERPRISE MONITORING
   ────────────────────────────
   const monitor = new EnterpriseMonitorConfig();
   await monitor.runEnterpriseMonitoring(
       ['159.198.65.253', '159.65.7.68'],
       ['*.fun', '*.xyz']
   );

╔════════════════════════════════════════════════════════════════════════════╗
║                           PRICING COMPARISON                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ Service      │ Free Tier          │ Paid Tier              │ Best For       ║
╠══════════════╪════════════════════╪════════════════════════╪════════════════╣
║ CertStream   │ ✓ Real-time stream │ N/A                    │ Real-time      ║
║ Censys       │ ✓ Limited queries  │ $500-5000/mo           │ Comprehensive  ║
║ BinaryEdge   │ ✓ Limited queries  │ $500-2000/mo           │ Speed & Detail ║
╚════════════════════════════════════════════════════════════════════════════╝
        `);
    }
}

module.exports = EnterpriseMonitorConfig;