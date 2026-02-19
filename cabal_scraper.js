const crypto = require("crypto");
const https = require("https");
const dns = require("dns").promises;
const axios = require("axios");
const cheerio = require("cheerio");
const { chromium } = require("playwright");

class CabalScraper {
    constructor() {
        this.fingerprints = {};
        this.remoteBrowserEndpoint = process.env.BROWSER_ENDPOINT || null;
    }

    /**
     * Extract SSL Certificate Information
     * Returns issuer details and certificate fingerprint
     */
    async extractSSLFingerprint(hostname) {
        return new Promise((resolve) => {
            const options = {
                hostname,
                port: 443,
                method: 'HEAD',
                rejectUnauthorized: false
            };

            const req = https.request(options, (res) => {
                try {
                    const cert = res.socket.getPeerCertificate();
                    if (cert && cert.issuer) {
                        resolve({
                            issuer: {
                                organization: cert.issuer.O || 'Unknown',
                                commonName: cert.issuer.CN || 'Unknown',
                                country: cert.issuer.C || 'Unknown'
                            },
                            subject: {
                                commonName: cert.subject.CN || 'Unknown'
                            },
                            validFrom: cert.valid_from,
                            validTo: cert.valid_to,
                            fingerprint: cert.fingerprint || 'N/A'
                        });
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    resolve(null);
                }
                res.destroy();
            });

            req.on('error', () => {
                resolve(null);
            });

            req.setTimeout(5000, () => {
                req.destroy();
                resolve(null);
            });

            req.end();
        });
    }

    /**
     * Compare CSS variables with profile
     */
    compareCSSVariables(newVars, profileVars) {
        if (!profileVars || !newVars) return [];
        const newKeys = Object.keys(newVars);
        const profileKeys = Object.keys(profileVars);
        return newKeys.filter(k => profileKeys.includes(k));
    }

    /**
     * Compare script hashes with profile
     */
    compareScriptHashes(newHashes, profileHashes) {
        if (!profileHashes || !newHashes) return [];
        return newHashes.filter(h => profileHashes.includes(h));
    }

    /**
     * Calculate DOM structure hash
     */
    calculateDOMHash(htmlContent) {
        if (!htmlContent) return null;
        const hash = crypto.createHash('sha256');
        hash.update(htmlContent);
        return hash.digest('hex');
    }

    /**
     * Layer 1: Extract CSS variables from HTML using cheerio (parse <style> tags and linked CSS)
     */
    async extractCSSVariablesFromHTML(htmlContent) {
        try {
            const $ = cheerio.load(htmlContent);
            const cssVars = {};

            // Extract CSS variables from inline <style> tags
            $('style').each((i, elem) => {
                const styleContent = $(elem).html();
                if (styleContent) {
                    // Look for :root section and CSS custom properties (--variable-name)
                    const rootMatch = styleContent.match(/:root\s*\{([^}]+)\}/i);
                    if (rootMatch) {
                        const rootVars = rootMatch[1];
                        const varMatches = rootVars.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g);
                        for (const match of varMatches) {
                            cssVars[`--${match[1]}`] = match[2].trim();
                        }
                    }
                    
                    // Also catch any global CSS variables (not just in :root)
                    const allVarMatches = styleContent.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+)/g);
                    for (const match of allVarMatches) {
                        const varName = `--${match[1]}`;
                        if (!cssVars[varName]) {
                            cssVars[varName] = match[2].trim();
                        }
                    }
                }
            });

            console.log(`[SCRAPER] Extracted ${Object.keys(cssVars).length} CSS variables from inline styles`);
            return cssVars;
        } catch (error) {
            console.warn(`[SCRAPER] Failed to extract CSS from HTML: ${error.message}`);
            return {};
        }
    }

    /**
     * Layer 1: Fetch and parse HTML using axios + cheerio (no browser needed)
     */
    async extractUsingHTMLParser(url) {
        try {
            console.log(`[SCRAPER] 📄 Layer 1: Fetching HTML with axios + cheerio...`);
            
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const htmlContent = response.data;

            // Calculate DOM hash
            const domHash = this.calculateDOMHash(htmlContent);

            // Extract CSS variables
            const cssVars = await this.extractCSSVariablesFromHTML(htmlContent);

            // Extract other elements from static HTML
            const $ = cheerio.load(htmlContent);
            
            const elementorIds = [];
            $('[data-elementor-id]').each((i, elem) => {
                const id = $(elem).attr('data-elementor-id');
                if (id) elementorIds.push(id);
            });

            const classNames = new Set();
            $('[class]').each((i, elem) => {
                const classes = $(elem).attr('class');
                if (classes) {
                    classes.split(' ').forEach(c => {
                        if (c && c.length > 2) classNames.add(c);
                    });
                }
            });

            const usesWpUploads = htmlContent.includes('/wp-content/uploads/');
            const usesTinybird = htmlContent.includes('flock.js') || htmlContent.includes('window.flock');

            const scriptHashes = [];
            $('script[src]').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src) scriptHashes.push(src);
            });

            console.log(`[SCRAPER] ✅ Layer 1 successful (HTML Parser)`);
            return {
                dom_hash: domHash,
                css_vars: cssVars,
                elementor_data_ids: elementorIds,
                common_class_names: Array.from(classNames).slice(0, 50),
                uses_wp_uploads: usesWpUploads,
                uses_tinybird: usesTinybird,
                script_hashes: scriptHashes,
                extracted_via: 'AXIOS_CHEERIO',
                success: true
            };
        } catch (error) {
            console.warn(`[SCRAPER] ⚠️  Layer 1 failed: ${error.message}`);
            return { success: false };
        }
    }

    /**
     * Layer 2: Use remote Playwright browser via wsEndpoint
     */
    async extractUsingRemoteBrowser(url) {
        if (!this.remoteBrowserEndpoint) {
            return { success: false };
        }

        try {
            console.log(`[SCRAPER] 🌐 Layer 2: Connecting to remote browser at ${this.remoteBrowserEndpoint}...`);
            
            const browser = await chromium.connectOverCDP(this.remoteBrowserEndpoint);
            const context = await browser.createContext();
            const page = await context.newPage();

            // Navigate and wait for network idle
            console.log(`[SCRAPER] Loading ${url} (waiting for networkidle)...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

            // Extract DOM content and hash
            const htmlContent = await page.content();
            const domHash = this.calculateDOMHash(htmlContent);

            // Extract CSS variables from :root element
            const cssVars = await this.extractCSSVariablesViaBrowser(page);

            // Extract other elements
            const elementorIds = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('[data-elementor-id]'));
                return elements.map(el => el.getAttribute('data-elementor-id'));
            });

            const classNames = await page.evaluate(() => {
                const classes = new Set();
                document.querySelectorAll('[class]').forEach(el => {
                    el.className.split(' ').forEach(c => {
                        if (c && c.length > 2) classes.add(c);
                    });
                });
                return Array.from(classes).slice(0, 50);
            });

            const usesWpUploads = await page.evaluate(() => {
                return document.documentElement.outerHTML.includes('/wp-content/uploads/');
            });

            const usesTinybird = await page.evaluate(() => {
                return !!window.flock || document.documentElement.outerHTML.includes('flock.js');
            });

            const scriptHashes = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                return scripts.map(s => s.src);
            });

            await browser.close();

            console.log(`[SCRAPER] ✅ Layer 2 successful (Remote Browser)`);
            return {
                dom_hash: domHash,
                css_vars: cssVars,
                elementor_data_ids: elementorIds,
                common_class_names: classNames,
                uses_wp_uploads: usesWpUploads,
                uses_tinybird: usesTinybird,
                script_hashes: scriptHashes,
                extracted_via: 'PLAYWRIGHT_REMOTE',
                success: true
            };
        } catch (error) {
            console.warn(`[SCRAPER] ⚠️  Layer 2 failed: ${error.message}`);
            return { success: false };
        }
    }

    /**
     * Layer 3: Try local Playwright launch
     */
    async extractUsingLocalBrowser(url) {
        try {
            console.log(`[SCRAPER] 🖥️  Layer 3: Launching local browser...`);
            
            const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
            const context = await browser.createContext();
            const page = await context.newPage();

            // Navigate and wait for network idle
            console.log(`[SCRAPER] Loading ${url} (waiting for networkidle)...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

            // Extract DOM content and hash
            const htmlContent = await page.content();
            const domHash = this.calculateDOMHash(htmlContent);

            // Extract CSS variables from :root element
            const cssVars = await this.extractCSSVariablesViaBrowser(page);

            // Extract other elements
            const elementorIds = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('[data-elementor-id]'));
                return elements.map(el => el.getAttribute('data-elementor-id'));
            });

            const classNames = await page.evaluate(() => {
                const classes = new Set();
                document.querySelectorAll('[class]').forEach(el => {
                    el.className.split(' ').forEach(c => {
                        if (c && c.length > 2) classes.add(c);
                    });
                });
                return Array.from(classes).slice(0, 50);
            });

            const usesWpUploads = await page.evaluate(() => {
                return document.documentElement.outerHTML.includes('/wp-content/uploads/');
            });

            const usesTinybird = await page.evaluate(() => {
                return !!window.flock || document.documentElement.outerHTML.includes('flock.js');
            });

            const scriptHashes = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                return scripts.map(s => s.src);
            });

            await browser.close();

            console.log(`[SCRAPER] ✅ Layer 3 successful (Local Playwright)`);
            return {
                dom_hash: domHash,
                css_vars: cssVars,
                elementor_data_ids: elementorIds,
                common_class_names: classNames,
                uses_wp_uploads: usesWpUploads,
                uses_tinybird: usesTinybird,
                script_hashes: scriptHashes,
                extracted_via: 'PLAYWRIGHT_LOCAL',
                success: true
            };
        } catch (error) {
            console.warn(`[SCRAPER] ⚠️  Layer 3 failed: ${error.message}`);
            return { success: false };
        }
    }

    /**
     * Extract CSS variables from :root element via browser
     */
    async extractCSSVariablesViaBrowser(page) {
        try {
            const cssVars = await page.evaluate(() => {
                const root = document.documentElement;
                const computedStyle = getComputedStyle(root);
                const vars = {};
                
                // Extract all CSS custom properties (variables) from :root
                for (let i = 0; i < computedStyle.length; i++) {
                    const prop = computedStyle[i];
                    if (prop.startsWith('--')) {
                        const value = computedStyle.getPropertyValue(prop).trim();
                        vars[prop] = value;
                    }
                }
                
                return vars;
            });
            return cssVars;
        } catch (error) {
            console.warn(`[SCRAPER] Failed to extract CSS variables via browser: ${error.message}`);
            return {};
        }
    }

    /**
     * Main fingerprinting method with multi-layered extraction strategy
     */
    async fingerprintSite(url) {
        this.fingerprints = { url };

        try {
            // Extract hostname for SSL info
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // Extract SSL fingerprint (always do this)
            console.log(`[SCRAPER] Extracting SSL certificate info for ${hostname}...`);
            const sslInfo = await this.extractSSLFingerprint(hostname);
            this.fingerprints.ssl = sslInfo || { error: 'Could not retrieve SSL info' };

            // Extract IP via DNS (always do this)
            const addresses = await dns.resolve4(hostname);
            const ip = addresses[0];
            this.fingerprints.ip = ip;
            this.fingerprints.domain = hostname;

            // Multi-layer extraction strategy
            let extractionResult = null;

            // Try each layer in order
            const layers = [
                () => this.extractUsingHTMLParser(url),
                () => this.extractUsingRemoteBrowser(url),
                () => this.extractUsingLocalBrowser(url)
            ];

            for (const layer of layers) {
                extractionResult = await layer();
                if (extractionResult.success) {
                    break;
                }
            }

            // If all layers fail, fallback to DNS/SSL only
            if (!extractionResult || !extractionResult.success) {
                console.warn(`[SCRAPER] ⚠️  All extraction layers failed, falling back to DNS/SSL only`);
                this.fingerprints.dom_hash = null;
                this.fingerprints.css_vars = {};
                this.fingerprints.elementor_data_ids = [];
                this.fingerprints.common_class_names = [];
                this.fingerprints.script_hashes = [];
                this.fingerprints.uses_wp_uploads = false;
                this.fingerprints.uses_tinybird = false;
                this.fingerprints.extracted_via = 'DNS_SSL_ONLY';
            } else {
                // Merge extraction results
                this.fingerprints.dom_hash = extractionResult.dom_hash;
                this.fingerprints.css_vars = extractionResult.css_vars;
                this.fingerprints.elementor_data_ids = extractionResult.elementor_data_ids;
                this.fingerprints.common_class_names = extractionResult.common_class_names;
                this.fingerprints.script_hashes = extractionResult.script_hashes;
                this.fingerprints.uses_wp_uploads = extractionResult.uses_wp_uploads;
                this.fingerprints.uses_tinybird = extractionResult.uses_tinybird;
                this.fingerprints.extracted_via = extractionResult.extracted_via;
            }

            console.log(`[SCRAPER] ✅ Extraction complete (${this.fingerprints.extracted_via})`);
            console.log(`    IP: ${ip}`);
            console.log(`    SSL Issuer: ${sslInfo?.issuer?.organization || 'Unknown'}`);
            console.log(`    DOM Hash: ${this.fingerprints.dom_hash ? this.fingerprints.dom_hash.substring(0, 8) + '...' : 'N/A'}`);
            console.log(`    CSS Variables: ${Object.keys(this.fingerprints.css_vars).length}`);
            console.log(`    Script Hashes: ${this.fingerprints.script_hashes.length}`);
            
        } catch (error) {
            this.fingerprints.error = error.message;
            console.error(`[SCRAPER] ❌ Error: ${error.message}`);
        }
        
        return this.fingerprints;
    }
}

module.exports = CabalScraper;
