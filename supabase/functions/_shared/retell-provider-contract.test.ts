import {
  assert,
  assertEquals,
  assertFalse,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  assertRetellLaunchAgentConfiguration,
  buildRetellCreatePhoneCallPayload,
  launchRetellDynamicVariables,
  retellCombinedCostCents,
  RETELL_V2_API_BASE,
  retellGetAgentUrl,
  retellGetLlmUrl,
} from './retell-provider-contract.ts';

Deno.test('Retell combined call cost is already denominated in cents', () => {
  assertEquals(retellCombinedCostCents({ combined_cost: 70 }), 70);
  assertEquals(retellCombinedCostCents({ combined_cost: 7.4 }), 7);
  assertEquals(retellCombinedCostCents({ combined_cost: '12' }), 12);
  assertEquals(retellCombinedCostCents({ combined_cost: 0 }), 0);
  assertEquals(retellCombinedCostCents({ combined_cost: -1 }), null);
  assertEquals(retellCombinedCostCents({}), null);
});

Deno.test('Retell read and create endpoints use their official version boundaries', () => {
  assertEquals(retellGetAgentUrl('agent-1'), 'https://api.retellai.com/get-agent/agent-1');
  assertEquals(retellGetLlmUrl('llm-1'), 'https://api.retellai.com/get-retell-llm/llm-1');
  assertEquals(retellGetLlmUrl('llm-1', 0), 'https://api.retellai.com/get-retell-llm/llm-1?version=0');
  assertEquals(`${RETELL_V2_API_BASE}/create-phone-call`, 'https://api.retellai.com/v2/create-phone-call');
  assertThrows(() => retellGetAgentUrl(''));
  assertThrows(() => retellGetLlmUrl('llm-1', -1));
});

Deno.test('Retell launch profile permits only published, canonical, tool-minimal agents', () => {
  const agent = {
    version: 7,
    is_published: true,
    opt_in_signed_url: true,
    webhook_url: 'https://project.supabase.co/functions/v1/retell-call-webhook/',
    webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
    response_engine: { type: 'retell-llm', llm_id: 'llm-1', version: 3 },
  };
  const llm = {
    llm_id: 'llm-1',
    version: 3,
    is_published: true,
    general_tools: [{ type: 'end_call', name: 'end_call' }],
    states: [{ tools: [{ type: 'end_call', name: 'finish' }] }],
    mcps: [],
  };

  assertRetellLaunchAgentConfiguration({
    agent,
    llm,
    expectedWebhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
  });

  assertThrows(() => assertRetellLaunchAgentConfiguration({
    agent,
    llm: { ...llm, general_tools: [{ type: 'transfer_call' }] },
    expectedWebhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
  }));
  assertThrows(() => assertRetellLaunchAgentConfiguration({
    agent,
    llm: { ...llm, mcps: [{ url: 'https://example.com' }] },
    expectedWebhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
  }));
  assertThrows(() => assertRetellLaunchAgentConfiguration({
    agent: { ...agent, webhook_url: 'https://attacker.example/webhook' },
    llm,
    expectedWebhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
  }));
  assertThrows(() => assertRetellLaunchAgentConfiguration({
    agent,
    llm: { ...llm, version: 4 },
    expectedWebhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
  }));
});

Deno.test('Retell launch dynamic variables minimize customer data', () => {
  const variables = launchRetellDynamicVariables({
    first_name: 'Taylor',
    company: 'Example Co',
    email: 'private@example.com',
    notes: 'sensitive notes',
    custom_secret: 'do not send',
    state: `CO\u0000${'x'.repeat(600)}`,
  });

  assertEquals(variables.first_name, 'Taylor');
  assertEquals(variables.company, 'Example Co');
  assertFalse(Object.hasOwn(variables, 'email'));
  assertFalse(Object.hasOwn(variables, 'notes'));
  assertFalse(Object.hasOwn(variables, 'custom_secret'));
  assertEquals(variables.state.length, 512);
  assertFalse(variables.state.includes('\u0000'));
});

Deno.test('Retell create payload selects the agent atomically without shared phone mutation', () => {
  const payload = buildRetellCreatePhoneCallPayload({
    fromNumber: '+15550000001',
    toNumber: '+15550000002',
    agentId: 'agent-a',
    agentVersion: 7,
    maxCallDurationMs: 900_000,
    webhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook/',
    dynamicVariables: { name: 'Taylor' },
    metadata: { organization_id: 'org-a' },
  });

  assertEquals(payload.override_agent_id, 'agent-a');
  assertEquals(payload.override_agent_version, 7);
  assertFalse(Object.hasOwn(payload, 'agent_id'));
  assertEquals(payload.from_number, '+15550000001');
  assertEquals(payload.to_number, '+15550000002');
  assert(Object.hasOwn(payload, 'metadata'));
  assertEquals(payload.agent_override, {
    agent: {
      webhook_url: 'https://project.supabase.co/functions/v1/retell-call-webhook',
      webhook_events: ['call_started', 'call_ended', 'call_analyzed'],
      opt_in_signed_url: true,
      data_storage_setting: 'everything_except_pii',
      data_storage_retention_days: 30,
      pii_config: {
        mode: 'post_call',
        categories: [
          'person_name',
          'address',
          'email',
          'phone_number',
          'ssn',
          'passport',
          'driver_license',
          'credit_card',
          'bank_account',
          'password',
          'pin',
          'medical_id',
          'date_of_birth',
          'customer_account_number',
        ],
      },
      max_call_duration_ms: 900_000,
    },
  });
  assertThrows(() => buildRetellCreatePhoneCallPayload({
    fromNumber: '+15550000001',
    toNumber: '+15550000002',
    agentId: 'agent-a',
    agentVersion: -1,
    maxCallDurationMs: 900_000,
    webhookUrl: 'https://project.supabase.co/functions/v1/retell-call-webhook',
    dynamicVariables: {},
    metadata: {},
  }));
});
