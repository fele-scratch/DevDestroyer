const axios = require("axios");
const fs = require("fs");
const dns = require("dns").promises;
const { chromium } = require("playwright");

class ProactiveDiscoveryEnhanced {
    constructor() {
        this.knownCabalIPs = ["159.198.65.253", "159.65.7.68"];
        this.knownCabalDomains = new Set();
        this.discoveredDomains = [];
        this.lastScanTime = null;
    }

    async init() {
        // Load existing known domains from a file if available
        if (fs.existsSync("cabal_domains_list.txt")) {
            const domains = fs.readFileSync("cabal_domains_list.txt", "utf-8").split("\n").filter(Boolean);
            domains.forEach(domain => this.knownCabalDomains.add(domain));
        }
        console.log(`[INIT] Initialized with ${this.knownCabalDomains.size} known cabal domains.`);
    }

    /**
     * Method 1: Monitor CT logs via crt.sh API (JSON endpoint)
     * This queries crt.sh for certificates matching an IP address or domain pattern.
     */
    async monitorCTLogsViaCrtsh(query) {
        console.log(`[CT_LOGS] Querying crt.sh for: ${query}...`);
        try {
            // crt.sh has a JSON API endpoint that returns certificate data
            const response = await axios.get(`https://crt.sh/?q=${encodeURIComponent(query)}&output=json`, {
                timeout: 10000
            });

            if (Array.isArray(response.data)) {
                const domains = response.data.map(cert => cert.name_value).filter(Boolean);
                const uniqueDomains = [...new Set(domains.flatMap(d => d.split("\n")))];
                console.log(`[CT_LOGS] Found ${uniqueDomains.length} unique domains in CT logs.`);
                return uniqueDomains;
            }
        } catch (error) {
            console.error(`[CT_LOGS] Error querying crt.sh: ${error.message}`);
        }
        return [];
    }

    /**
     * Method 2: DNS Resolution Monitoring
     * Attempt to resolve domains and check if they resolve to known cabal IPs.
     */
    async monitorDNSResolution(domains) {
        console.log(`[DNS] Checking DNS resolution for ${domains.length} domains...`);
        const resolvedToCabal = [];

        for (const domain of domains) {
            try {
                const addresses = await dns.resolve4(domain);
                for (const ip of addresses) {
                    if (this.knownCabalIPs.includes(ip)) {
                        console.log(`[DNS] Domain ${domain} resolves to cabal IP ${ip}`);
                        resolvedToCabal.push({ domain, ip });
                    }
                }
            } catch (error) {
                // Domain might not exist yet or DNS resolution failed
                // This is expected for many domains
            }
        }

        return resolvedToCabal;
    }

    /**
     * Method 3: Reverse DNS Lookup
     * Attempt to find domains by checking reverse DNS on known cabal IPs.
     * Note: This is limited by what the ISP/hosting provider has configured.
     */
    async reverseIPLookup(ip) {
        console.log(`[REVERSE_DNS] Attempting reverse DNS lookup for ${ip}...`);
        try {
            const hostnames = await dns.reverse(ip);
            console.log(`[REVERSE_DNS] Found hostnames: ${hostnames.join(", ")}`);
            return hostnames;
        } catch (error) {
            console.log(`[REVERSE_DNS] No reverse DNS records found for ${ip}`);
            return [];
        }
    }

    /**
     * Method 4: Heuristic Domain Generation
     * Generate potential domain names based on known patterns and check if they resolve to cabal IPs.
     * This is based on observed naming patterns from the cabal.
     */
    async heuristicDomainGeneration() {
        console.log(`[HEURISTIC] Generating potential domain names based on known patterns...`);
        
        // Common patterns observed in the cabal's domain names
        const animals = ["cat", "dog", "whale", "trout", "penguin", "bear", "fox", "eagle", "panda", "bull", "cow"];
        const adjectives = ["white", "black", "red", "golden", "silver", "prime", "small", "big", "giant", "tiny"];
        const tlds = [".fun", ".xyz", ".site", ".online", ".pro", ".guru"];
        
        const potentialDomains = [];
        
        // Generate combinations
        for (const animal of animals) {
            for (const adjective of adjectives) {
                for (const tld of tlds) {
                    potentialDomains.push(`${adjective}${animal}${tld}`);
                    potentialDomains.push(`the${adjective}${animal}${tld}`);
                }
            }
        }

        console.log(`[HEURISTIC] Generated ${potentialDomains.length} potential domain names.`);
        
        // Check which ones resolve to cabal IPs
        const resolvedToCabal = await this.monitorDNSResolution(potentialDomains);
        return resolvedToCabal;
    }

    /**
     * Method 5: Fingerprint-Based Detection
     * For domains that are already known, check for new variants by analyzing their fingerprints.
     */
    async fingerprintBasedDetection(url) {
        console.log(`[FINGERPRINT] Analyzing fingerprints for ${url}...`);
        try {
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            
            await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
            
            // Extract fingerprints (simplified version)
            const fingerprints = {
                title: await page.title(),
                scripts: await page.$$eval("script", els => els.map(s => s.src).filter(Boolean)),
                images: await page.$$eval("img", els => els.map(i => i.src).filter(Boolean))
            };
            
            await browser.close();
            return fingerprints;
        } catch (error) {
            console.error(`[FINGERPRINT] Error analyzing ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * Main proactive scan orchestration
     */
    async runProactiveScan() {
        await this.init();
        console.log("\n=== STARTING PROACTIVE CABAL DETECTION SCAN ===\n");
        this.lastScanTime = new Date();

        // Method 1: Query CT logs for recent certificates on known IPs
        console.log("\n[STEP 1] Monitoring Certificate Transparency Logs...");
        const ctDomains = await this.monitorCTLogsViaCrtsh("159.198.65.253");
        
        // Method 2: Check DNS resolution for CT domains
        console.log("\n[STEP 2] Verifying DNS Resolution...");
        const dnsResolved = await this.monitorDNSResolution(ctDomains);
        
        // Method 3: Attempt reverse DNS lookups
        console.log("\n[STEP 3] Performing Reverse DNS Lookups...");
        for (const ip of this.knownCabalIPs) {
            const hostnames = await this.reverseIPLookup(ip);
            for (const hostname of hostnames) {
                if (!this.knownCabalDomains.has(hostname)) {
                    this.discoveredDomains.push(hostname);
                }
            }
        }

        // Method 4: Heuristic domain generation
        console.log("\n[STEP 4] Heuristic Domain Generation and Resolution...");
        const heuristicDomains = await this.heuristicDomainGeneration();
        
        // Combine all discovered domains
        const allDiscovered = [
            ...dnsResolved.map(d => d.domain),
            ...this.discoveredDomains,
            ...heuristicDomains.map(d => d.domain)
        ];

        // Filter out known domains
        const newDomains = allDiscovered.filter(d => !this.knownCabalDomains.has(d));

        console.log("\n=== SCAN RESULTS ===");
        console.log(`Total domains checked: ${ctDomains.length}`);
        console.log(`Domains resolving to cabal IPs: ${dnsResolved.length}`);
        console.log(`New domains discovered: ${newDomains.length}`);

        if (newDomains.length > 0) {
            console.log("\nNewly discovered potential cabal domains:");
            newDomains.forEach(domain => console.log(`  - ${domain}`));
            
            // Save to file
            fs.appendFileSync("newly_discovered_cabal_domains.txt", newDomains.join("\n") + "\n");
            console.log("\nNewly discovered domains saved to newly_discovered_cabal_domains.txt");
        } else {
            console.log("\nNo new domains discovered in this scan.");
        }

        console.log(`\nScan completed at ${this.lastScanTime}`);
    }
}

// Example Usage:
// const proactive = new ProactiveDiscoveryEnhanced();
// proactive.runProactiveScan();

module.exports = ProactiveDiscoveryEnhanced;