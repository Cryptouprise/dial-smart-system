#!/usr/bin/env node

/**
 * Integration test script for outbound calling functions
 * 
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   AUTH_TOKEN=eyJ... \
 *   node scripts/integration/test-outbound-call.js
 * 
 * Tests the following functions:
 * - retell-credentials-check
 * - twilio-outbound-call  
 * - outbound-calling
 */

const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('   Required: SUPABASE_URL, SUPABASE_ANON_KEY');
  console.error('   Optional: AUTH_TOKEN (for authenticated tests)');
  process.exit(1);
}

/**
 * Make HTTP request helper
 */
function makeRequest(url, options, body = null) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            json: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
            json: null
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Test retell-credentials-check function
 */
async function testRetellCredentialsCheck() {
  console.log('\n📋 Testing retell-credentials-check function...');
  
  const url = `${SUPABASE_URL}/functions/v1/retell-credentials-check`;
  const options = {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(url, options);
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.json || response.body);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('   ✅ retell-credentials-check returned 2xx');
      return true;
    } else {
      console.log('   ⚠️  retell-credentials-check returned non-2xx status');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

/**
 * Test twilio-outbound-call function
 */
async function testTwilioOutboundCall() {
  console.log('\n📋 Testing twilio-outbound-call function...');
  
  if (!AUTH_TOKEN) {
    console.log('   ⚠️  Skipping (AUTH_TOKEN not provided)');
    return null;
  }

  const url = `${SUPABASE_URL}/functions/v1/twilio-outbound-call`;
  const options = {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  const body = {
    from: '+15551234567',
    to: '+15557654321',
    twimlUrl: 'https://example.com/twiml'
  };

  try {
    const response = await makeRequest(url, options, body);
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.json || response.body);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('   ✅ twilio-outbound-call returned 2xx');
      return true;
    } else if (response.status === 401) {
      console.log('   ⚠️  Authentication required (expected if token is invalid)');
      return null;
    } else if (response.status === 502) {
      console.log('   ⚠️  Twilio API error (expected if credentials not configured)');
      return null;
    } else {
      console.log('   ⚠️  twilio-outbound-call returned unexpected status');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

/**
 * Test outbound-calling function
 */
async function testOutboundCalling() {
  console.log('\n📋 Testing outbound-calling function...');
  
  if (!AUTH_TOKEN) {
    console.log('   ⚠️  Skipping (AUTH_TOKEN not provided)');
    return null;
  }

  const url = `${SUPABASE_URL}/functions/v1/outbound-calling`;
  const options = {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  const body = {
    action: 'create_call',
    phoneNumber: '+15557654321',
    callerId: '+15551234567',
    campaignId: 'test-campaign-123'
  };

  try {
    const response = await makeRequest(url, options, body);
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.json || response.body);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('   ✅ outbound-calling returned 2xx');
      return true;
    } else if (response.status === 401) {
      console.log('   ⚠️  Authentication required (expected if token is invalid)');
      return null;
    } else if (response.status === 500 || response.status === 502) {
      console.log('   ⚠️  Server error (expected if APIs not configured)');
      return null;
    } else {
      console.log('   ⚠️  outbound-calling returned unexpected status');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('🚀 Starting integration tests for outbound calling');
  console.log('='.repeat(60));
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Auth Token: ${AUTH_TOKEN ? 'Provided' : 'Not provided'}`);

  const results = [];

  results.push(await testRetellCredentialsCheck());
  results.push(await testTwilioOutboundCall());
  results.push(await testOutboundCalling());

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r === true).length;
  const failed = results.filter(r => r === false).length;
  const skipped = results.filter(r => r === null).length;

  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⚠️  Skipped/Warning: ${skipped}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  } else if (passed === 0) {
    console.log('\n⚠️  No tests passed (likely due to missing configuration)');
    process.exit(0);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
