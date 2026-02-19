const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const CabalScraper = require('./cabal_scraper');

/**
 * Research Mode: One-time DNA extraction from seed URLs
 * Extracts Cabal DNA (IPs, /24 subnets, DOM/CSS fingerprints) and saves to Target Watchlist
 */
class ResearchMode {
    constructor(watchlistPath = 'target_watchlist.json', profilePath = 'cabal_profile.json', researchedPath = 'researched_seed_urls.txt') {
        this.scraper = new CabalScraper();
        this.watchlistPath = path.resolve(process.cwd(), watchlistPath);
        this.profilePath = path.resolve(process.cwd(), profilePath);
        this.researchedPath = path.resolve(process.cwd(), researchedPath);
        this.watchlist = this.loadWatchlist();
        this.profile = this.loadProfile();
        this.researchedURLs = this.loadResearchedURLs();
    }

    loadWatchlist() {
        if (fs.existsSync(this.watchlistPath)) {
            try {
                const content = fs.readFileSync(this.watchlistPath, 'utf-8');
                return JSON.parse(content);
            } catch (e) {
                console.error('[RESEARCH] Failed to load watchlist:', e.message);
            }
        }
        // Initialize empty watchlist
        return {
            ips: [],
            subnets: [],
            fingerprints: []
        };
    }

    loadProfile() {
        if (fs.existsSync(this.profilePath)) {
            try {
                const content = fs.readFileSync(this.profilePath, 'utf-8');
                return JSON.parse(content);
            } catch (e) {
                console.error('[RESEARCH] Failed to load profile:', e.message);
            }
        }
        // Initialize empty profile
        return {
            profile_name: 'Cabal DNA Profile',
            created_at: new Date().toISOString(),
            seed_urls: [],
            infrastructure: {
                ips: [],
                subnets: []
            },
            deep_dna: {
                ssl_issuers: [],
                css_variables: [],
                script_hashes: [],
                dom_hashes: [],
                elementor_data_ids: [],
                common_class_names: [],
                tracking_scripts: []
            }
        };
    }

    /**
     * Load previously researched seed URLs to avoid re-processing
     */
    loadResearchedURLs() {
        if (fs.existsSync(this.researchedPath)) {
            try {
                const content = fs.readFileSync(this.researchedPath, 'utf-8');
                return content
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
            } catch (e) {
                console.error('[RESEARCH] Failed to load researched URLs:', e.message);
            }
        }
        return [];
    }

    /**
     * Save researched URL to tracking file
     */
    saveResearchedURL(url) {
        try {
            if (!this.researchedURLs.includes(url)) {
                this.researchedURLs.push(url);
                const content = this.researchedURLs.join('\n');
                fs.writeFileSync(this.researchedPath, content, 'utf-8');
            }
        } catch (e) {
            console.error('[RESEARCH] Failed to save researched URL:', e.message);
        }
    }

    saveWatchlist() {
        try {
            fs.writeFileSync(this.watchlistPath, JSON.stringify(this.watchlist, null, 2));
            console.log(`[RESEARCH] Watchlist saved to ${this.watchlistPath}`);
        } catch (e) {
            console.error('[RESEARCH] Failed to save watchlist:', e.message);
        }
    }

    saveProfile() {
        try {
            // Update metadata
            this.profile.created_at = new Date().toISOString();
            fs.writeFileSync(this.profilePath, JSON.stringify(this.profile, null, 2));
            console.log(`[RESEARCH] Profile saved to ${this.profilePath}`);
        } catch (e) {
            console.error('[RESEARCH] Failed to save profile:', e.message);
        }
    }

    /**
     * Extract /24 subnet from IP (e.g., 159.198.65.253 -> 159.198.65.0/24)
     */
    extractSubnet(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) return null;
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    }

    /**
     * Resolve domain to IP
     */
    async resolveIP(domain) {
        try {
            const addresses = await dns.resolve4(domain);
            return addresses[0] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Perform one-time deep forensic analysis on a seed URL
     */
    async profileURL(url) {
        console.log(`[RESEARCH] Profiling seed URL: ${url}`);

        const fingerprints = await this.scraper.fingerprintSite(url);
        if (fingerprints.error) {
            console.error(`[RESEARCH] Failed to fingerprint ${url}: ${fingerprints.error}`);
            return null;
        }

        // Extract DNA
        const ip = fingerprints.ip;
        const subnet = ip ? this.extractSubnet(ip) : null;

        // Normalize fingerprint data
        const dnaEntry = {
            url,
            ip,
            subnet,
            dom_hash: fingerprints.dom_hash || null,
            css_vars: fingerprints.css_vars || {},
            elementor_data_ids: fingerprints.elementor_data_ids || [],
            common_class_names: fingerprints.common_class_names || [],
            script_hashes: fingerprints.script_hashes || [],
            uses_wordpress: fingerprints.uses_wp_uploads || false,
            uses_tinybird: fingerprints.uses_tinybird || false,
            ssl_info: fingerprints.ssl || null,
            fingerprinted_at: new Date().toISOString()
        };

        console.log(`[RESEARCH] DNA extracted:`);
        console.log(`  IP: ${ip}`);
        console.log(`  Subnet: ${subnet}`);
        console.log(`  DOM Hash: ${dnaEntry.dom_hash ? dnaEntry.dom_hash.substring(0, 8) + '...' : 'N/A'}`);
        console.log(`  SSL Issuer: ${dnaEntry.ssl_info?.issuer?.organization || 'N/A'}`);
        console.log(`  CSS Variables: ${Object.keys(dnaEntry.css_vars).length}`);
        console.log(`  Script Hashes: ${dnaEntry.script_hashes.length}`);

        // Add to profile's deep DNA (merge with existing)
        if (dnaEntry.ssl_info?.issuer) {
            const issuerKey = `${dnaEntry.ssl_info.issuer.organization}`;
            if (!this.profile.deep_dna.ssl_issuers.includes(issuerKey)) {
                this.profile.deep_dna.ssl_issuers.push(issuerKey);
            }
        }

        // Merge CSS variables
        Object.keys(dnaEntry.css_vars).forEach(varName => {
            if (!this.profile.deep_dna.css_variables.includes(varName)) {
                this.profile.deep_dna.css_variables.push(varName);
            }
        });

        // Merge script hashes
        dnaEntry.script_hashes.forEach(hash => {
            if (!this.profile.deep_dna.script_hashes.includes(hash)) {
                this.profile.deep_dna.script_hashes.push(hash);
            }
        });

        // Merge DOM hashes
        if (dnaEntry.dom_hash && !this.profile.deep_dna.dom_hashes.includes(dnaEntry.dom_hash)) {
            this.profile.deep_dna.dom_hashes.push(dnaEntry.dom_hash);
        }

        // Merge elementor IDs
        dnaEntry.elementor_data_ids.forEach(id => {
            if (!this.profile.deep_dna.elementor_data_ids.includes(id)) {
                this.profile.deep_dna.elementor_data_ids.push(id);
            }
        });

        // Merge class names
        dnaEntry.common_class_names.forEach(cn => {
            if (!this.profile.deep_dna.common_class_names.includes(cn)) {
                this.profile.deep_dna.common_class_names.push(cn);
            }
        });

        if (fingerprints.uses_tinybird && !this.profile.deep_dna.tracking_scripts.includes('flock.js')) {
            this.profile.deep_dna.tracking_scripts.push('flock.js');
        }

        return dnaEntry;
    }

    /**
     * Run research on a list of seed URLs
     */
    async profileSeedURLs(urls) {
        console.log(`\n[RESEARCH] Starting forensic analysis on ${urls.length} seed URL(s)...\n`);

        if (!this.profile.seed_urls) {
            this.profile.seed_urls = [];
        }

        // Separate already-researched from new URLs
        const newURLs = urls.filter(url => !this.researchedURLs.includes(url));
        const skippedURLs = urls.filter(url => this.researchedURLs.includes(url));

        // Display deduplication stats
        if (skippedURLs.length > 0) {
            console.log(`[RESEARCH] ⏭️  Skipping ${skippedURLs.length} already-researched URL(s):`);
            skippedURLs.forEach(url => console.log(`  ✓ ${url}`));
            console.log('');
        }

        if (newURLs.length === 0) {
            console.log(`[RESEARCH] ℹ️  All ${urls.length} seed URL(s) have already been researched.`);
            console.log('[RESEARCH] To force re-research, remove URLs from researched_seed_urls.txt\n');
            return;
        }

        console.log(`[RESEARCH] 🔍 Processing ${newURLs.length} new URL(s) requiring analysis...\n`);

        for (const url of newURLs) {
            const dnaEntry = await this.profileURL(url);
            if (!dnaEntry) {
                console.error(`[RESEARCH] ❌ Failed to profile ${url}\n`);
                continue;
            }

            // Add to watchlist (avoid duplicates)
            if (dnaEntry.ip && !this.watchlist.ips.includes(dnaEntry.ip)) {
                this.watchlist.ips.push(dnaEntry.ip);
            }
            if (dnaEntry.subnet && !this.watchlist.subnets.includes(dnaEntry.subnet)) {
                this.watchlist.subnets.push(dnaEntry.subnet);
            }
            this.watchlist.fingerprints.push(dnaEntry);

            // Add to profile seed URLs
            if (!this.profile.seed_urls.includes(url)) {
                this.profile.seed_urls.push(url);
            }

            // Update infrastructure in profile
            if (dnaEntry.ip && !this.profile.infrastructure.ips.includes(dnaEntry.ip)) {
                this.profile.infrastructure.ips.push(dnaEntry.ip);
            }
            if (dnaEntry.subnet && !this.profile.infrastructure.subnets.includes(dnaEntry.subnet)) {
                this.profile.infrastructure.subnets.push(dnaEntry.subnet);
            }

            // Mark this URL as researched
            this.saveResearchedURL(url);
            console.log(`[RESEARCH] ✅ Tracked: ${url}\n`);
        }

        this.saveWatchlist();
        this.saveProfile();

        console.log(`\n[RESEARCH] Watchlist now contains:`);
        console.log(`  - ${this.watchlist.ips.length} known IPs`);
        console.log(`  - ${this.watchlist.subnets.length} known subnets`);
        console.log(`  - ${this.watchlist.fingerprints.length} fingerprint profiles`);

        console.log(`\n[RESEARCH] Deep DNA Profile contains:`);
        console.log(`  - ${this.profile.deep_dna.ssl_issuers.length} SSL issuers`);
        console.log(`  - ${this.profile.deep_dna.css_variables.length} unique CSS variables`);
        console.log(`  - ${this.profile.deep_dna.script_hashes.length} script hashes`);
        console.log(`  - ${this.profile.deep_dna.dom_hashes.length} DOM structure hashes`);
        console.log(`  - ${this.profile.deep_dna.tracking_scripts.length} tracking scripts detected`);
    }

    /**
     * Check if an IP is in the watchlist (direct match or subnet match)
     */
    isIPWatched(ip) {
        // Direct IP match
        if (this.watchlist.ips.includes(ip)) return true;

        // Subnet match (e.g., 159.198.65.1 matches 159.198.65.0/24)
        const parts = ip.split('.');
        if (parts.length === 4) {
            const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
            if (this.watchlist.subnets.includes(subnet)) return true;
        }

        return false;
    }

    /**
     * Match domain against known fingerprints (DOM/CSS similarity)
     */
    async matchFingerprints(newDomain) {
        const newFingerprints = await this.scraper.fingerprintSite(`https://${newDomain}`);
        if (newFingerprints.error) return null;

        // Simple similarity check: compare DOM hash and script hashes
        for (const known of this.watchlist.fingerprints) {
            if (known.dom_hash === newFingerprints.dom_hash) {
                console.log(`[RESEARCH] DOM match found: ${newDomain} matches ${known.url}`);
                return { type: 'dom_match', knownURL: known.url, confidence: 'high' };
            }

            // Check for shared CSS variables
            const sharedVars = Object.keys(newFingerprints.css_vars || {})
                .filter(v => known.css_vars && known.css_vars[v]);
            if (sharedVars.length > 0) {
                console.log(`[RESEARCH] CSS variable match: ${newDomain} shares ${sharedVars.length} CSS vars with ${known.url}`);
                return { type: 'css_match', knownURL: known.url, sharedVars, confidence: 'medium' };
            }
        }

        return null;
    }
}

module.exports = ResearchMode;
