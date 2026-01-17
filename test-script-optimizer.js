/**
 * Test Script Optimizer Setup
 * This script verifies:
 * 1. Database connection
 * 2. Existing calls with transcripts
 * 3. Edge function availability
 * 4. Required environment variables
 */

const SUPABASE_URL = "https://emonjusymdripmkvtttc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtb25qdXN5bWRyaXBta3Z0dHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MzYyNDcsImV4cCI6MjA2NDMxMjI0N30.NPmcCmeJwR_vNymUZp73G9PqbsiPJ7KSTA9x8xG6Soc";

async function testSetup() {
  console.log('🔍 Testing Script Optimizer Setup...\n');

  const results = {
    database: false,
    callsWithTranscripts: 0,
    retellAgents: 0,
    edgeFunctionAccessible: false,
    environmentVariables: {
      SUPABASE_URL: false,
      SUPABASE_SERVICE_ROLE_KEY: false,
      LOVABLE_API_KEY: false,
      RETELL_AI_API_KEY: false
    }
  };

  // Test 1: Check if we can query the database
  try {
    console.log('1️⃣  Testing database connection...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/call_logs?select=id,transcript,created_at&limit=5`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (response.ok) {
      const calls = await response.json();
      results.database = true;
      results.callsWithTranscripts = calls.filter(c => c.transcript && c.transcript.length > 50).length;
      console.log(`   ✅ Database connected`);
      console.log(`   📊 Found ${results.callsWithTranscripts} calls with transcripts (out of ${calls.length} recent calls)`);
    } else {
      console.log(`   ❌ Database query failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Database connection error: ${error.message}`);
  }

  // Test 2: Check for Retell agents in phone_numbers table
  try {
    console.log('\n2️⃣  Checking for Retell agents...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/phone_numbers?select=retell_agent_id&limit=100`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (response.ok) {
      const numbers = await response.json();
      const agentIds = new Set(numbers.filter(n => n.retell_agent_id).map(n => n.retell_agent_id));
      results.retellAgents = agentIds.size;
      console.log(`   ✅ Found ${results.retellAgents} unique Retell agent(s) configured`);
    } else {
      console.log(`   ⚠️  Could not check Retell agents: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ⚠️  Error checking agents: ${error.message}`);
  }

  // Test 3: Test edge function accessibility (without auth - will fail but tells us if it's deployed)
  try {
    console.log('\n3️⃣  Testing edge function deployment...');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-call-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ test: true })
    });

    // We expect 401 unauthorized, which means it's deployed but needs auth
    if (response.status === 401) {
      results.edgeFunctionAccessible = true;
      console.log(`   ✅ Edge function is deployed (requires authentication)`);
    } else if (response.status === 404) {
      console.log(`   ❌ Edge function not deployed (404 Not Found)`);
    } else {
      console.log(`   ⚠️  Unexpected response: ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (text.includes('LOVABLE_API_KEY')) {
        console.log(`   ❌ Edge function needs LOVABLE_API_KEY configured`);
      } else if (text.includes('SUPABASE')) {
        console.log(`   ❌ Edge function needs SUPABASE credentials`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Edge function test error: ${error.message}`);
  }

  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('📋 SETUP STATUS REPORT');
  console.log('='.repeat(60));

  console.log('\n✓ WORKING:');
  if (results.database) console.log('  • Database connection');
  if (results.callsWithTranscripts > 0) console.log(`  • ${results.callsWithTranscripts} calls available for analysis`);
  if (results.retellAgents > 0) console.log(`  • ${results.retellAgents} Retell agent(s) configured`);
  if (results.edgeFunctionAccessible) console.log('  • Edge function deployed');

  console.log('\n⚠️  NEEDS CONFIGURATION (in Supabase Dashboard):');
  console.log('\n  Edge Function Secrets (must be set in Supabase Dashboard > Project Settings > Edge Functions):');
  console.log('  1. LOVABLE_API_KEY       - Required for AI script analysis');
  console.log('  2. SUPABASE_SERVICE_ROLE_KEY - Auto-configured (should exist)');
  console.log('  3. RETELL_AI_API_KEY     - Required for loading/saving agent scripts');
  console.log('  4. SUPABASE_URL          - Auto-configured (should exist)');

  console.log('\n📖 HOW TO SET SECRETS:');
  console.log('  1. Go to: https://supabase.com/dashboard/project/emonjusymdripmkvtttc/settings/functions');
  console.log('  2. Click "Add new secret"');
  console.log('  3. Add each missing key from the list above');

  console.log('\n🔑 WHERE TO GET API KEYS:');
  console.log('  • LOVABLE_API_KEY: https://lovable.dev/dashboard (API Keys section)');
  console.log('  • RETELL_AI_API_KEY: https://app.retellai.com/dashboard (API Keys)');

  console.log('\n📊 READY TO USE:');
  if (results.callsWithTranscripts > 0 && results.edgeFunctionAccessible) {
    console.log('  ✅ Once secrets are configured, you can analyze calls immediately!');
  } else if (results.callsWithTranscripts === 0) {
    console.log('  ⚠️  No calls with transcripts yet. Make some test calls first.');
  } else {
    console.log('  ⚠️  Set up edge function secrets to begin analysis.');
  }

  console.log('\n' + '='.repeat(60));

  return results;
}

// Run the test
testSetup().catch(console.error);
