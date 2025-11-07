#!/usr/bin/env node

/**
 * Integration test script for outbound calling functionality
 * 
 * Usage:
 *   SUPABASE_URL=https://your-project.supabase.co \
 *   SUPABASE_ANON_KEY=your-anon-key \
 *   USER_EMAIL=test@example.com \
 *   USER_PASSWORD=password \
 *   node scripts/integration/test-outbound-call.js
 * 
 * Tests:
 * 1. Retell credentials check
 * 2. Twilio outbound call initiation
 * 3. Outbound calling via Retell
 */

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USER_EMAIL = process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
  process.exit(1);
}

// Helper to make HTTPS POST requests
function httpsPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// Helper to make HTTPS GET requests
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function login() {
  if (!USER_EMAIL || !USER_PASSWORD) {
    console.log('⚠️  Skipping authentication (USER_EMAIL/USER_PASSWORD not provided)');
    return null;
  }

  console.log('🔐 Logging in...');
  const response = await httpsPost(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      email: USER_EMAIL,
      password: USER_PASSWORD
    },
    {
      'apikey': SUPABASE_ANON_KEY
    }
  );

  if (response.status === 200 && response.data.access_token) {
    console.log('✅ Login successful');
    return response.data.access_token;
  } else {
    throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
  }
}

async function testRetellCredentialsCheck() {
  console.log('\n📋 Test 1: Retell Credentials Check');
  console.log('─────────────────────────────────────');
  
  try {
    const response = await httpsGet(
      `${SUPABASE_URL}/functions/v1/retell-credentials-check`,
      {
        'apikey': SUPABASE_ANON_KEY
      }
    );

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Response:`, JSON.stringify(response.data, null, 2));
      return true;
    } else {
      console.log(`⚠️  Status: ${response.status}`);
      console.log(`⚠️  Response:`, JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testTwilioOutboundCall(accessToken) {
  console.log('\n📋 Test 2: Twilio Outbound Call');
  console.log('─────────────────────────────────────');
  
  if (!accessToken) {
    console.log('⚠️  Skipping (no access token)');
    return false;
  }

  try {
    const testPayload = {
      from: '+15555551234',  // Test number
      to: '+15555555678',    // Test number
      twimlUrl: 'http://demo.twilio.com/docs/voice.xml'
    };

    console.log('📤 Request:', JSON.stringify(testPayload, null, 2));

    const response = await httpsPost(
      `${SUPABASE_URL}/functions/v1/twilio-outbound-call`,
      testPayload,
      {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY
      }
    );

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Response:`, JSON.stringify(response.data, null, 2));
      return true;
    } else {
      console.log(`⚠️  Status: ${response.status}`);
      console.log(`⚠️  Response:`, JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testOutboundCalling(accessToken) {
  console.log('\n📋 Test 3: Outbound Calling (via Retell)');
  console.log('─────────────────────────────────────');
  
  if (!accessToken) {
    console.log('⚠️  Skipping (no access token)');
    return false;
  }

  try {
    const testPayload = {
      action: 'create_call',
      phoneNumber: '+15555555678',
      callerId: '+15555551234',
      agentId: 'test-agent-id',
      campaignId: 'test-campaign-id',
      leadId: 'test-lead-id'
    };

    console.log('📤 Request:', JSON.stringify(testPayload, null, 2));

    const response = await httpsPost(
      `${SUPABASE_URL}/functions/v1/outbound-calling`,
      testPayload,
      {
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_ANON_KEY
      }
    );

    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ Status: ${response.status}`);
      console.log(`✅ Response:`, JSON.stringify(response.data, null, 2));
      return true;
    } else {
      console.log(`⚠️  Status: ${response.status}`);
      console.log(`⚠️  Response:`, JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Outbound Calling Integration Tests     ║');
  console.log('╚══════════════════════════════════════════╝');
  
  let accessToken = null;
  try {
    accessToken = await login();
  } catch (error) {
    console.error('❌ Login failed:', error.message);
  }

  const results = [];
  
  results.push(await testRetellCredentialsCheck());
  results.push(await testTwilioOutboundCall(accessToken));
  results.push(await testOutboundCalling(accessToken));

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  Test Summary                           ║');
  console.log('╚══════════════════════════════════════════╝');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed or were skipped');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
