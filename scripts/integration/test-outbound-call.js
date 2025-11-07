#!/usr/bin/env node

/**
 * Integration Test Script for Outbound Calling
 * 
 * This script tests the twilio-outbound-call edge function end-to-end.
 * It requires environment variables to be set for authentication.
 * 
 * Usage:
 *   node scripts/integration/test-outbound-call.js
 * 
 * Required Environment Variables:
 *   SUPABASE_URL - Your Supabase project URL
 *   SUPABASE_ANON_KEY - Your Supabase anonymous key
 *   SUPABASE_ACCESS_TOKEN - Valid user JWT token for authentication
 *   TEST_TO_NUMBER - Destination phone number (E.164 format)
 *   TEST_FROM_NUMBER - Source phone number (must be a Twilio number)
 */

const https = require('https');
const http = require('http');

// Configuration from environment variables
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  toNumber: process.env.TEST_TO_NUMBER,
  fromNumber: process.env.TEST_FROM_NUMBER,
};

// Validate configuration
function validateConfig() {
  const missing = [];
  
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.anonKey) missing.push('SUPABASE_ANON_KEY');
  if (!config.accessToken) missing.push('SUPABASE_ACCESS_TOKEN');
  if (!config.toNumber) missing.push('TEST_TO_NUMBER');
  if (!config.fromNumber) missing.push('TEST_FROM_NUMBER');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('\nPlease set the following environment variables:');
    console.error('  SUPABASE_URL - Your Supabase project URL');
    console.error('  SUPABASE_ANON_KEY - Your Supabase anonymous key');
    console.error('  SUPABASE_ACCESS_TOKEN - Valid user JWT token');
    console.error('  TEST_TO_NUMBER - Destination phone number (E.164 format, e.g., +14155551234)');
    console.error('  TEST_FROM_NUMBER - Source phone number (must be a Twilio number)');
    console.error('\nExample:');
    console.error('  export SUPABASE_URL="https://your-project.supabase.co"');
    console.error('  export SUPABASE_ANON_KEY="your-anon-key"');
    console.error('  export SUPABASE_ACCESS_TOKEN="eyJ..."');
    console.error('  export TEST_TO_NUMBER="+14155551234"');
    console.error('  export TEST_FROM_NUMBER="+14155556789"');
    process.exit(1);
  }
}

// Make HTTP request with proper error handling
function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

// Test the twilio-outbound-call function
async function testOutboundCall() {
  console.log('🧪 Testing Twilio Outbound Call Function\n');
  console.log('Configuration:');
  console.log('  Supabase URL:', config.supabaseUrl);
  console.log('  To Number:', config.toNumber);
  console.log('  From Number:', config.fromNumber);
  console.log('  Token:', config.accessToken.substring(0, 20) + '...\n');
  
  const functionUrl = `${config.supabaseUrl}/functions/v1/twilio-outbound-call`;
  
  // Simple TwiML message
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is a test call from the dial smart system. Goodbye.</Say>
</Response>`;
  
  const requestBody = JSON.stringify({
    to: config.toNumber,
    from: config.fromNumber,
    twiml: twiml
  });
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'apikey': config.anonKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };
  
  console.log('📤 Sending request to:', functionUrl);
  console.log('Request headers:', JSON.stringify(options.headers, null, 2));
  console.log('Request body:', requestBody);
  console.log('\n⏳ Waiting for response...\n');
  
  try {
    const response = await makeRequest(functionUrl, options, requestBody);
    
    console.log('📥 Response received:');
    console.log('  Status:', response.statusCode, response.statusMessage);
    console.log('  Headers:', JSON.stringify(response.headers, null, 2));
    console.log('  Body:', response.body);
    
    let bodyJson;
    try {
      bodyJson = JSON.parse(response.body);
      console.log('\n📋 Parsed response:', JSON.stringify(bodyJson, null, 2));
    } catch (e) {
      console.log('\n⚠️  Could not parse response as JSON');
    }
    
    if (response.statusCode === 200) {
      console.log('\n✅ Test PASSED - Call created successfully');
      if (bodyJson && bodyJson.sid) {
        console.log('   Call SID:', bodyJson.sid);
        console.log('   Call Status:', bodyJson.status);
      }
      return true;
    } else {
      console.log('\n❌ Test FAILED - Non-200 status code');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test FAILED - Request error:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Test credentials check function
async function testCredentialsCheck() {
  console.log('\n\n🧪 Testing Retell Credentials Check Function\n');
  
  const functionUrl = `${config.supabaseUrl}/functions/v1/retell-credentials-check`;
  
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'apikey': config.anonKey,
      'Content-Type': 'application/json',
    }
  };
  
  console.log('📤 Sending request to:', functionUrl);
  console.log('⏳ Waiting for response...\n');
  
  try {
    const response = await makeRequest(functionUrl, options, '{}');
    
    console.log('📥 Response received:');
    console.log('  Status:', response.statusCode, response.statusMessage);
    console.log('  Body:', response.body);
    
    let bodyJson;
    try {
      bodyJson = JSON.parse(response.body);
      console.log('\n📋 Parsed response:', JSON.stringify(bodyJson, null, 2));
    } catch (e) {
      console.log('\n⚠️  Could not parse response as JSON');
    }
    
    if (response.statusCode === 200) {
      console.log('\n✅ Credentials check PASSED');
      if (bodyJson) {
        console.log('   Retell configured:', bodyJson.retell_configured ? '✅' : '❌');
        console.log('   Twilio configured:', bodyJson.twilio_configured ? '✅' : '❌');
        console.log('   Message:', bodyJson.message);
      }
      return true;
    } else {
      console.log('\n❌ Credentials check FAILED');
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test FAILED - Request error:', error.message);
    return false;
  }
}

// Main test runner
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Integration Test: Outbound Calling & Retell Integration  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  validateConfig();
  
  const results = {
    credentialsCheck: false,
    outboundCall: false
  };
  
  // Test 1: Credentials check
  results.credentialsCheck = await testCredentialsCheck();
  
  // Test 2: Outbound call (only if credentials are configured)
  if (results.credentialsCheck) {
    results.outboundCall = await testOutboundCall();
  } else {
    console.log('\n⚠️  Skipping outbound call test due to credentials check failure');
  }
  
  // Summary
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n  Credentials Check:', results.credentialsCheck ? '✅ PASS' : '❌ FAIL');
  console.log('  Outbound Call:    ', results.outboundCall ? '✅ PASS' : (results.credentialsCheck ? '❌ FAIL' : '⏭️  SKIP'));
  
  const allPassed = results.credentialsCheck && results.outboundCall;
  console.log('\n  Overall:          ', allPassed ? '✅ PASS' : '❌ FAIL');
  
  process.exit(allPassed ? 0 : 1);
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
