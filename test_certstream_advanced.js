/**
 * Advanced CertStream Diagnostic - Tests for:
 * 1. WebSocket connection with proper headers
 * 2. Heartbeat messages (distinguishes them from cert messages)
 * 3. Actual certificate events (if any)
 * 4. Message timing and throughput
 */

const WebSocket = require('ws');

console.log('='.repeat(60));
console.log('CertStream Advanced Connection Diagnostic');
console.log('='.repeat(60));
console.log(`Target: wss://certstream.calidog.io/`);
console.log(`Time: ${new Date().toISOString()}`);
console.log(`NOTE: Waiting 120 seconds for actual certificate events...`);
console.log('='.repeat(60) + '\n');

const TIMEOUT_SECONDS = 120;
const ws = new WebSocket('wss://certstream.calidog.io/', {
    handshakeTimeout: 30000,
    rejectUnauthorized: false,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    perMessageDeflate: true
});

let messageCount = 0;
let heartbeatCount = 0;
let certCount = 0;
let lastHeartbeat = null;
const startTime = Date.now();
let firstMessageTime = null;

ws.on('open', () => {
    console.log('✅ WebSocket OPEN: Successfully connected to CertStream');
    console.log(`   Connection established at: ${new Date().toISOString()}`);
    console.log(`   Listening for messages for ${TIMEOUT_SECONDS} seconds...\n`);
});

ws.on('message', (data) => {
    messageCount++;
    
    try {
        const parsed = JSON.parse(data);
        
        if (parsed.message_type === 'heartbeat') {
            heartbeatCount++;
            lastHeartbeat = Date.now();
            process.stdout.write('H'); // Print H for heartbeat
            
            if (messageCount % 50 === 0) {
                console.log(`\n   ℹ️  Heartbeats: ${heartbeatCount}, Certificates: ${certCount}`);
            }
        } else if (parsed.message_type === 'certificate_update') {
            certCount++;
            if (firstMessageTime === null) {
                firstMessageTime = Date.now();
            }
            
            process.stdout.write('C'); // Print C for certificate
            
            if (certCount === 1) {
                console.log('\n✅ First certificate received!');
                const leafCert = parsed.data.leaf_cert;
                if (leafCert && leafCert.subject && leafCert.subject.CN) {
                    console.log(`   Domain: ${leafCert.subject.CN}`);
                }
                console.log(`   Time from connection: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
                console.log('');
            }
            
            if (certCount % 10 === 0) {
                console.log(`\n   📊 Total: ${messageCount} messages (${heartbeatCount} heartbeats, ${certCount} certs)\n`);
            }
        }
    } catch (e) {
        console.error('\n❌ Failed to parse message:', e.message);
    }
});

ws.on('error', (error) => {
    console.error('\n❌ WebSocket ERROR:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Code: ${error.code}`);
});

ws.on('close', (code, reason) => {
    console.log(`\n✅ Connection CLOSED`);
    console.log(`   Code: ${code}`);
    console.log(`   Reason: ${reason || '(none)'}`);
});

// Timeout handler
setTimeout(() => {
    console.log(`\n${'='.repeat(60)}`);
    console.log('DIAGNOSTIC COMPLETE (Timeout reached)');
    console.log('='.repeat(60));
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n📊 RESULTS:`);
    console.log(`   Duration: ${duration.toFixed(1)} seconds`);
    console.log(`   Total Messages: ${messageCount}`);
    console.log(`   Heartbeats: ${heartbeatCount}`);
    console.log(`   Certificates: ${certCount}`);
    
    if (lastHeartbeat) {
        const timeSinceHB = (Date.now() - lastHeartbeat) / 1000;
        console.log(`   Last Heartbeat: ${timeSinceHB.toFixed(1)}s ago`);
    }
    
    if (certCount > 0) {
        console.log(`\n✅ SUCCESS: Connection is working!`);
        console.log(`   Messages flowing at: ${(messageCount / duration).toFixed(2)} msg/sec`);
        console.log(`   Certificates at: ${(certCount / duration).toFixed(4)} certs/sec`);
    } else if (heartbeatCount > 0) {
        console.log(`\n⚠️  PARTIAL: Getting heartbeats but no certificates`);
        console.log(`   This means connection is alive but CertStream isn't sending cert events`);
        console.log(`   Possible reasons:`);
        console.log(`     1. CertStream server under low traffic right now`);
        console.log(`     2. Your connection might be rate-limited`);
        console.log(`     3. Try again in a few minutes`);
    } else {
        console.log(`\n❌ FAILURE: No messages received`);
        console.log(`   No heartbeats, no certificates`);
        console.log(`   This suggests connection failed at WebSocket level`);
    }
    
    console.log(`\n${'='.repeat(60)}\n`);
    
    ws.close();
    process.exit(certCount > 0 ? 0 : 1);
}, TIMEOUT_SECONDS * 1000);

process.on('SIGINT', () => {
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('User interrupted test');
    console.log('='.repeat(60));
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\nPartial Results (ran for ${duration.toFixed(1)}s):`);
    console.log(`   Total Messages: ${messageCount}`);
    console.log(`   Heartbeats: ${heartbeatCount}`);
    console.log(`   Certificates: ${certCount}`);
    
    ws.close();
    process.exit(0);
});
