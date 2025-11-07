#!/usr/bin/env node

/**
 * Integration Test: Outbound Call
 * 
 * Tests the outbound calling functionality through both Retell AI and Twilio endpoints.
 * Requires environment variables:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - TEST_AUTH_TOKEN (valid Supabase auth token)
 * - TEST_PHONE_NUMBER (number to call, format: +1234567890)
 * - TEST_CALLER_ID (verified caller ID, format: +1234567890)
 * - TEST_AGENT_ID (Retell AI agent ID)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEST_AUTH_TOKEN = process.env.TEST_AUTH_TOKEN;
const TEST_PHONE_NUMBER = process.env.TEST_PHONE_NUMBER;
const TEST_CALLER_ID = process.env.TEST_CALLER_ID;
const TEST_AGENT_ID = process.env.TEST_AGENT_ID;

async function testRetellCredentials() {
  console.log('\n=== Testing Retell Credentials ===');
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/retell-credentials-check`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        }
      }
    );

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.status !== 200) {
      console.error('❌ Retell credentials check failed');
      return false;
    }

    if (!data.configured || !data.valid) {
      console.error('❌ Retell credentials not properly configured');
      return false;
    }

    console.log('✅ Retell credentials check passed');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testRetellOutboundCall() {
  console.log('\n=== Testing Retell AI Outbound Call ===');
  
  if (!TEST_PHONE_NUMBER || !TEST_CALLER_ID || !TEST_AGENT_ID) {
    console.log('⏭️  Skipping (missing required env vars)');
    return true;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/outbound-calling`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          action: 'create_call',
          phoneNumber: TEST_PHONE_NUMBER,
          callerId: TEST_CALLER_ID,
          agentId: TEST_AGENT_ID
        })
      }
    );

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.status !== 200) {
      console.error('❌ Retell outbound call failed');
      return false;
    }

    console.log('✅ Retell outbound call initiated');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testTwilioOutboundCall() {
  console.log('\n=== Testing Twilio Outbound Call ===');
  
  if (!TEST_PHONE_NUMBER || !TEST_CALLER_ID) {
    console.log('⏭️  Skipping (missing required env vars)');
    return true;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/twilio-outbound-call`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          phoneNumber: TEST_PHONE_NUMBER,
          callerId: TEST_CALLER_ID
        })
      }
    );

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.status !== 200) {
      console.error('❌ Twilio outbound call failed');
      return false;
    }

    console.log('✅ Twilio outbound call initiated');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('=== Outbound Call Integration Tests ===\n');
  
  // Validate required environment variables
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TEST_AUTH_TOKEN) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL:', !!SUPABASE_URL);
    console.error('   SUPABASE_ANON_KEY:', !!SUPABASE_ANON_KEY);
    console.error('   TEST_AUTH_TOKEN:', !!TEST_AUTH_TOKEN);
    process.exit(1);
  }

  console.log('Configuration:');
  console.log('  SUPABASE_URL:', SUPABASE_URL);
  console.log('  TEST_PHONE_NUMBER:', TEST_PHONE_NUMBER || 'not set');
  console.log('  TEST_CALLER_ID:', TEST_CALLER_ID || 'not set');
  console.log('  TEST_AGENT_ID:', TEST_AGENT_ID || 'not set');

  const results = [];
  
  // Run tests
  results.push(await testRetellCredentials());
  results.push(await testRetellOutboundCall());
  results.push(await testTwilioOutboundCall());

  // Summary
  console.log('\n=== Test Summary ===');
  const passed = results.filter(r => r).length;
  const total = results.length;
  console.log(`${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
