#!/usr/bin/env node

/**
 * Integration test script for twilio-outbound-call function
 * 
 * Usage:
 *   node scripts/integration/test-outbound-call.js
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL: Your Supabase project URL
 *   - SUPABASE_ANON_KEY: Your Supabase anon/public key
 *   - TEST_USER_TOKEN: A valid JWT token from an authenticated user
 *   - TEST_FROM_NUMBER: The Twilio phone number to call from (E.164 format)
 *   - TEST_TO_NUMBER: The phone number to call (E.164 format)
 *   - TEST_TWIML_URL: (Optional) URL for TwiML instructions
 */

const https = require('https');
const http = require('http');

// Configuration from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN;
const TEST_FROM_NUMBER = process.env.TEST_FROM_NUMBER || '+15555551234';
const TEST_TO_NUMBER = process.env.TEST_TO_NUMBER || '+15555554321';
const TEST_TWIML_URL = process.env.TEST_TWIML_URL;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  process.exit(1);
}

if (!TEST_USER_TOKEN) {
  console.error('❌ Error: TEST_USER_TOKEN must be set (use a valid JWT from authenticated user)');
  process.exit(1);
}

console.log('🚀 Testing twilio-outbound-call function...\n');
console.log('Configuration:');
console.log(`  Supabase URL: ${SUPABASE_URL}`);
console.log(`  From Number: ${TEST_FROM_NUMBER}`);
console.log(`  To Number: ${TEST_TO_NUMBER}`);
console.log(`  TwiML URL: ${TEST_TWIML_URL || '(not set)'}\n`);

// Build the request URL
const url = new URL(`${SUPABASE_URL}/functions/v1/twilio-outbound-call`);

// Build request body
const requestBody = {
  from: TEST_FROM_NUMBER,
  to: TEST_TO_NUMBER
};

if (TEST_TWIML_URL) {
  requestBody.twimlUrl = TEST_TWIML_URL;
}

const requestBodyString = JSON.stringify(requestBody);

// Build request options
const protocol = url.protocol === 'https:' ? https : http;
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestBodyString),
    'Authorization': `Bearer ${TEST_USER_TOKEN}`,
    'apikey': SUPABASE_ANON_KEY
  }
};

console.log('📤 Sending request...\n');

// Make the request
const req = protocol.request(options, (res) => {
  let responseBody = '';

  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log(`📥 Response received (Status: ${res.statusCode})\n`);
    console.log('Response Headers:');
    console.log(JSON.stringify(res.headers, null, 2));
    console.log('\nResponse Body:');
    
    try {
      const parsed = JSON.parse(responseBody);
      console.log(JSON.stringify(parsed, null, 2));
      
      // Mask any sensitive information in the output
      if (parsed.twilio) {
        console.log('\n✅ Call initiated successfully!');
        console.log(`Call SID: ${parsed.twilio.sid || '(not available)'}`);
        console.log(`Status: ${parsed.twilio.status || '(not available)'}`);
      } else if (parsed.error) {
        console.log('\n❌ Call failed:');
        console.log(`Error: ${parsed.error}`);
        if (parsed.details) {
          console.log('Details:', JSON.stringify(parsed.details, null, 2));
        }
      }
    } catch (err) {
      console.log(responseBody);
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Exit with appropriate code
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Test completed successfully');
      process.exit(0);
    } else {
      console.log('❌ Test failed with non-2xx status code');
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ Request failed:');
  console.error(error);
  process.exit(1);
});

// Send the request
req.write(requestBodyString);
req.end();
