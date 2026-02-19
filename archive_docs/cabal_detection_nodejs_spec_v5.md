Cabal Detection Bot: Node.js Technical Specification (v5)

This document outlines the two-part development structure for a Cabal Detection Bot implemented in Node.js/JavaScript. The system is designed to identify serial scammers (cabals) by separating mechanical infrastructure monitoring from advanced AI-driven analysis.

Part 1: Mechanical Infrastructure & Monitoring

The first part focuses on the "Mechanical Structure"—the automated, independent monitoring of website and domain infrastructure. This layer operates without AI intervention to provide raw data and immediate flags based on known "DNA" markers.

1.1 Key Tracking Identifiers (The "DNA")

The bot must monitor these specific markers. This list has been expanded based on analysis of the initial dataset.

Category
Identifier
Significance
Infrastructure
IP: 159.198.65.253
Known "dirty" subnet hosting 76+ low-effort meme coin domains.
Infrastructure
IP: 159.65.7.68
A second IP address associated with the same cabal, often showing "Database Error".
Tracking API
Tinybird (flock.js)
Use of flock.js with proxy URL api/analytics. A rare and strong fingerprint for this specific cabal.
DOM Structure
Elementor ID: 3cb9110
Specific WordPress/Elementor container IDs reused across templates for structural matching.
DOM Structure
Common Class Names
Recurring class names like campbell-gallery, campbell-faq, faq-card, etc. indicate template reuse.
Asset Reuse
Video Naming
Background videos following the [PROJECT]-BG-HEAD.mp4 naming convention.
Asset Reuse
WordPress Uploads
Reused images and media assets uploaded to the /wp-content/uploads/ directory.
Code Patterns
Elementor data-id
Recurring data-id values in Elementor widgets suggest copied layouts.



1.2 Independent Monitoring Logic

The bot must independently:

•
Listen for New Launches: Monitor Pump.fun, Raydium, and social channels for new URLs.

•
Infrastructure Check: Automatically perform DNS lookups and IP subnet checks for every new domain.

•
Asset Extraction: Download and catalog scripts, CSS, and media files for comparison.

1.3 Proactive Discovery Logic

To proactively detect new scam sites at the infrastructure level, the bot will implement the following strategies:

•
Certificate Transparency (CT) Log Monitoring: Continuously monitor public CT logs (e.g., via crt.sh) for new SSL/TLS certificates issued for domains hosted on known cabal IP addresses or subnets, or for domains matching common naming patterns (e.g., *.fun, *.xyz). This allows for early detection of newly registered domains before they are actively promoted 
.

•
Reverse IP Monitoring: Regularly perform reverse IP lookups on known cabal IP addresses (e.g., 159.198.65.253, 159.65.7.68) to identify newly hosted domains. This can reveal new scam sites as soon as they are pointed to the cabal's infrastructure 
.

•
DNS Monitoring: Monitor DNS records for changes or new registrations associated with known cabal patterns or IP ranges. This can involve tracking new A records pointing to the cabal's infrastructure.

1.4 Real-Time Infrastructure Listener (The "Web3 Equivalent")

To achieve real-time detection akin to blockchain logsSubscribe, the bot will leverage Certificate Transparency (CT) Log Streaming. This method provides a continuous feed of newly issued SSL/TLS certificates, which are a prerequisite for any HTTPS website. This is the closest equivalent to listening for
blockchain events, as every new website (or significant change to an existing one) will typically trigger a new certificate issuance.

1.4.1 CertStream (Free, Real-time CT Log Streaming)

Concept: CertStream provides a free, real-time WebSocket stream of all certificates observed by various Certificate Transparency logs. It acts as a global "log listener" for SSL certificate issuances.

Mechanism: The bot will connect to the CertStream WebSocket and continuously receive data about newly issued certificates. It will then filter this stream based on:

•
Known Cabal IP Addresses/Subnets: By resolving the domain names in the certificate to IP addresses and checking if they fall within the cabal's known infrastructure.

•
Domain Naming Patterns: Matching against observed cabal naming conventions (e.g., *.fun, *.xyz, the[adjective][animal].*).

•
Issuer Information: Identifying certificates issued by specific Certificate Authorities (CAs) that the cabal frequently uses.

Advantages:

•
Real-time: Provides immediate notification of new certificate issuances.

•
Free: No cost for accessing the stream.

•
Comprehensive: Aggregates data from multiple CT logs.

Limitations:

•
Rate Limiting: May have limitations on the volume of data that can be processed or the speed of filtering without dedicated infrastructure.

•
Data Volume: The raw stream can be very high-volume, requiring efficient filtering and processing.

•
IP Resolution: Requires active DNS resolution for each domain in the certificate to check against known cabal IPs, which can add latency.

1.4.2 Commercial CT Log Aggregators (Censys, BinaryEdge)

Concept: Commercial services like Censys and BinaryEdge offer more advanced and robust APIs for querying and streaming CT log data, as well as other internet-wide scan data.

Mechanism: These services provide structured APIs that allow for more targeted queries, such as:

•
Searching by IP Range: Directly querying for certificates issued for domains resolving to specific IP subnets.

•
Historical Data: Access to extensive historical CT log data for retrospective analysis.

•
Enrichment: Often include additional data points like WHOIS information, open ports, and associated infrastructure.

Advantages:

•
Targeted Queries: More efficient filtering and searching capabilities.

•
Higher Reliability/SLA: Designed for production use with better uptime and support.

•
Enriched Data: Provides more context and linked information.

Limitations:

•
Cost: These are paid services, with pricing tiers based on usage and data access.

•
API Integration: Requires API keys and specific integration logic for each service.

Part 2: AI Integration & Advanced Analysis

The second part involves integrating an AI Agent to perform deep research on the data discovered in Part 1. This layer provides the "Apex Tracker" intelligence.

2.1 Advanced Fingerprinting Strategy

The AI Agent will apply the following logic to turn the bot into an apex tracker:

1.
Script Fingerprinting: Hash the content of custom scripts (like flock.js). Identical hashes across domains confirm the same deployer.

2.
CSS Variable Analysis: Track unique CSS variable names (e.g., --n-tabs-color-accent-fallback) that belong to the developer’s custom "kit."

3.
Perceptual Hashing (pHash): Use pHash for images to catch slightly tweaked logos that MD5 hashes would miss.

2.2 Risk Scoring Matrix

The AI will assign a risk score based on the following markers:

•
IP Match (Same /24 Subnet): +50 points (Increased weight due to high confidence).

•
Script Hash Match (Non-standard): +50 points.

•
DOM Structure Similarity > 90%: +40 points.

•
Shared CSS Variables: +30 points.

•
Registrar (Namecheap/Cheap Domains): +10 points.

•
New Domain (< 48h old): +20 points.

•
Score > 100: Flag as "Confirmed Cabal".

2.3 Dynamic Learning & GMGN Integration

The AI Agent will:

•
Cross-Verify with GMGN: Query wss://gmgn.ai/ws to check token age, ATH, and developer wallet history.

•
Terminate Research: If the AI finds an "old CA" or a known failed project via GMGN, it will immediately terminate research on that site to save resources.

•
Adaptive Structure: The AI will continuously update its markers and scoring logic as it processes more sites and identifies new scammer behaviors.

3. Node.js Implementation: Scraping & Fingerprinting Module

This module uses Playwright to extract the fingerprints for both Part 1 and Part 2.

JavaScript


const { chromium } = require("playwright");
const crypto = require("crypto");

class CabalScraper {
    constructor() {
        this.fingerprints = {};
    }

    async fingerprintSite(url) {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            // 1. Network & IP Analysis (Part 1)
            const response = await page.goto(url, { waitUntil: "networkidle" });
            const server = await response.serverAddr();
            this.fingerprints.ip = server ? server.ipAddress : null;

            // 2. DOM Fingerprinting (Part 1 & 2)
            const domContent = await page.content();
            // Remove text to find structural clones
            const structureOnly = domContent.replace(/>[^<]+</g, ""><");
            this.fingerprints.dom_hash = crypto.createHash("sha256").update(structureOnly).digest("hex");

            // 3. Script & Asset Tracking (Part 1 & 2)
            const scripts = await page.$$eval("script", (el) => el.map((s) => s.src));
            this.fingerprints.uses_tinybird = scripts.some((src) =>
                src.includes("flock.js")
            );
            this.fingerprints.script_sources = scripts;

            // 4. CSS Variable Extraction (Part 2)
            this.fingerprints.css_vars = await page.evaluate(() => {
                const vars = {};
                const root = getComputedStyle(document.documentElement);
                // Logic to extract custom -- variables
                return vars;
            });
        } catch (error) {
            console.error(`Error scraping ${url}:`, error);
        }
        finally {
            await browser.close();
        }
        return this.fingerprints;
    }
}



4. Node.js Implementation: Proactive Discovery Module

This module implements the proactive discovery logic, including CT log monitoring, DNS resolution, reverse IP lookups, and heuristic domain generation.

JavaScript


const axios = require("axios");
const fs = require("fs");
const dns = require("dns").promises;
const { chromium } = require("playwright");

class ProactiveDiscovery {
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
            const response = await axios.get(`https://crt.sh/?q=${encodeURIComponent(query )}&output=json`, {
                timeout: 10000
            });

            if (Array.isArray(response.data)) {
                const domains = response.data.map(cert => cert.name_value).filter(Boolean);
                const uniqueDomains = [...new Set(domains.flatMap(d => d.split("\n")))];
                console.log(`[CT_LOGS] Found ${uniqueDomains.length} unique domains in CT logs.`);
                return uniqueDomains;
            }
        }
        catch (error) {
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
            }
            catch (error) {
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
        }
        catch (error) {
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

*** End Patch