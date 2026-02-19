Cabal Detection Bot: Proactive Infrastructure Monitoring

This project provides a comprehensive framework for proactively detecting crypto meme coin scam websites launched by a specific cabal. It combines forensic analysis of existing scam sites with real-time infrastructure monitoring techniques to identify new deployments at the earliest possible stage.

Project Structure

Plain Text


/home/ubuntu/
├── cabal_detection_nodejs_spec_v5.md  # Updated technical specification
├── cabal_scraper.js                   # Enhanced scraping module for fingerprinting
├── proactive_discovery_enhanced.js    # Module for heuristic and crt.sh based discovery
├── realtime_certstream_listener.js    # Real-time CertStream listener (WebSocket)
├── enterprise_monitor_config.js       # Configuration for Censys/BinaryEdge APIs
├── cabal_domains_list.txt             # List of known cabal domains
├── newly_discovered_cabal_domains.txt # Log of newly discovered domains
├── final_cabal_detection_report.md    # Comprehensive project report
└── README.md                          # This file



Key Components and Their Roles

1.
cabal_detection_nodejs_spec_v5.md: This document is the definitive technical specification, outlining the cabal'sDNA, risk scoring, and the proactive discovery logic, including the real-time listener concepts.

2.
cabal_scraper.js: This module is responsible for deep forensic analysis of individual websites. It uses Playwright to extract frontend DNA (DOM structure, CSS variables, tracking scripts) and asset information. This is crucial for confirming a site belongs to the cabal once it has been identified.

3.
proactive_discovery_enhanced.js: This module implements several proactive discovery methods:

•
monitorCTLogsViaCrtsh: Queries crt.sh for certificates matching known IPs or patterns.

•
monitorDNSResolution: Checks if domains resolve to known cabal IP addresses.

•
reverseIPLookup: Performs reverse DNS lookups on cabal IPs.

•
heuristicDomainGeneration: Generates and checks domains based on observed cabal naming patterns.

1.
realtime_certstream_listener.js: This is the core real-time monitoring component. It connects to the CertStream WebSocket and continuously processes newly issued SSL certificates. It filters these certificates based on known cabal IPs, domain patterns, and certificate issuers, providing immediate alerts for potential new scam sites. This module is the "blockchain logsSubscribe equivalent" for web infrastructure.

2.
enterprise_monitor_config.js: This module provides the framework for integrating with commercial CT log and internet-wide scanning services like Censys and BinaryEdge. It includes methods for searching certificates by IP/domain, fetching IP details, and searching host/domain information. Note: This module requires API keys for the respective services, which should be set as environment variables (CENSYS_UID, CENSYS_SECRET, BINARYEDGE_API_KEY).

3.
cabal_domains_list.txt: A plain text file containing a list of domains previously identified as belonging to the cabal. This is used by the proactive discovery modules to avoid re-alerting on known sites and to filter new discoveries.

4.
newly_discovered_cabal_domains.txt: A log file where newly detected potential cabal domains are appended by the proactive discovery modules.

5.
final_cabal_detection_report.md: The comprehensive report summarizing the project, its findings, and the implemented solutions.

Setup and Usage for Coding AI Agent

Your coding AI agent can now proceed with the following steps:

1.
Review ****cabal_detection_nodejs_spec_v5.md: Understand the overall architecture, cabal fingerprints, and detection logic.

2.
Install Dependencies: Ensure websocket and axios are installed for the listener and enterprise modules. (npm install ws axios or pnpm install ws axios). Playwright is already installed for cabal_scraper.js.

3.
Configure Environment Variables: For enterprise_monitor_config.js, set CENSYS_UID, CENSYS_SECRET, and BINARYEDGE_API_KEY in your environment.

4.
Integrate Modules: Combine these modules into a cohesive application. The realtime_certstream_listener.js should run continuously in the background, feeding newly detected domains to the cabal_scraper.js for deeper analysis and risk scoring.

5.
Implement Alerting: Develop an alerting mechanism (e.g., Discord webhook, Telegram bot, email) to notify users when a new cabal site is detected.

6.
Refine Heuristics: Continuously update knownCabalIPs, knownCabalDomains, and domainPatterns in realtime_certstream_listener.js and proactive_discovery_enhanced.js as new information becomes available.

This structured approach will allow for efficient development and deployment of the Cabal Detection Bot.

