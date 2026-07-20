import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SURFACES = Object.freeze([
  {
    id: 'canonical_retell_outbound',
    file: 'supabase/functions/outbound-calling/index.ts',
    physicalApi: 'create-phone-call',
    required: [
      'evaluateCampaignContactRelease',
      'CAMPAIGN_RELEASE_NOT_AUTHORIZED',
      'Retell create-phone-call',
    ],
    state: 'release_gate_required',
  },
  {
    id: 'voice_broadcast_retell_twilio_telnyx',
    file: 'supabase/functions/voice-broadcast-engine/index.ts',
    physicalApi: 'https://api.retellai.com/v2/create-phone-call',
    required: [
      'function isVoiceBroadcastSurfaceTenantCertified(): boolean {',
      'return false;',
      'VOICE_BROADCAST_SURFACE_NOT_TENANT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecedeServe: 'function isVoiceBroadcastSurfaceTenantCertified(): boolean {',
  },
  {
    id: 'standalone_telnyx_outbound',
    file: 'supabase/functions/telnyx-outbound-ai/index.ts',
    physicalApi: "'/calls'",
    required: [
      "if (action === 'make_call') {",
      'TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED',
      action: "case 'make_call': {",
    },
  },
  {
    id: 'telnyx_assistant_test_call',
    file: 'supabase/functions/telnyx-ai-assistant/index.ts',
    physicalApi: "action === 'test_call'",
    required: [
      'function isTelnyxAssistantManagementTenantCertified(): boolean {',
      'TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED',
      action: 'const rawApiKey = Deno.env.get(\'TELNYX_API_KEY\')',
    },
  },
  {
    id: 'assistable_make_call',
    file: 'supabase/functions/assistable-make-call/index.ts',
    physicalApi: 'https://api.assistable.ai/v2/ghl/make-call',
    required: [
      'function isAssistableEgressCertified(): boolean {',
      'ASSISTABLE_EGRESS_NOT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'ASSISTABLE_EGRESS_NOT_CERTIFIED',
      action: 'const { assistant_id, location_id, contact_id, number_pool_id, lead_id, campaign_id } = body;',
    },
  },
  {
    id: 'legacy_twilio_test_call',
    file: 'supabase/functions/quick-test-call/index.ts',
    required: [
      'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED',
      'Twilio test calls are disabled until they use the canonical provider boundary.',
    ],
    state: 'hard_disabled',
  },
  {
    id: 'public_demo_call',
    file: 'supabase/functions/demo-call/index.ts',
    required: [
      'PUBLIC_DEMO_CALLS_DISABLED',
      'Public demo calls are disabled until the consented canonical call flow is deployed.',
    ],
    state: 'hard_disabled',
  },
  {
    id: 'sms_physical_egress',
    file: 'supabase/functions/sms-messaging/index.ts',
    physicalApi: 'https://api.telnyx.com/v2/messages',
    required: [
      "if (request.action === 'send_sms') {",
      'SMS_EGRESS_NOT_CERTIFIED',
      'Physical SMS egress is disabled in the Retell-only launch profile.',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'SMS_EGRESS_NOT_CERTIFIED',
      action: 'const twilioAccountSid',
    },
  },
  {
    id: 'twilio_provider_administration',
    file: 'supabase/functions/twilio-integration/index.ts',
    physicalApi: 'IncomingPhoneNumbers.json',
    required: [
      'PROVIDER_ADMIN_NOT_CERTIFIED',
      'Twilio provider administration is disabled until provider resources are tenant-scoped and operator authorization is certified.',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'PROVIDER_ADMIN_NOT_CERTIFIED',
      action: 'const supabaseUrl',
    },
  },
  {
    id: 'phone_number_purchase',
    file: 'supabase/functions/phone-number-purchasing/index.ts',
    physicalApi: 'AvailablePhoneNumbers/US/Local.json',
    required: [
      'PROVIDER_ADMIN_NOT_CERTIFIED',
      'Phone-number search and purchasing are disabled until provider spend and tenant ownership are certified.',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'PROVIDER_ADMIN_NOT_CERTIFIED',
      action: 'const supabaseUrl',
    },
  },
  {
    id: 'ai_assistant_legacy_tools',
    file: 'supabase/functions/ai-assistant/index.ts',
    physicalApi: 'https://api.retellai.com/create-phone-number',
    required: [
      'function isAiAssistantToolSurfaceTenantCertified(): boolean {',
      'AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED',
      action: "const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')",
    },
  },
  {
    id: 'external_api_control_plane',
    file: 'supabase/functions/api-gateway/index.ts',
    physicalApi: 'functions/v1/outbound-calling',
    required: [
      'function isExternalApiGatewayCertified(): boolean {',
      'EXTERNAL_API_NOT_CERTIFIED',
    ],
    state: 'hard_disabled',
    mustPrecede: {
      marker: 'EXTERNAL_API_NOT_CERTIFIED',
      action: 'const supabase = createClient',
    },
  },
  {
    id: 'campaign_dispatcher_provider_boundary',
    file: 'supabase/functions/call-dispatcher/index.ts',
    physicalApi: "supabase.functions.invoke('outbound-calling'",
    required: [
      'evaluate_contact_stop',
      'TELNYX_EGRESS_NOT_CERTIFIED',
      'PROVIDER_NOT_CERTIFIED',
    ],
    state: 'release_gate_required',
    mustPrecede: {
      marker: 'TELNYX_EGRESS_NOT_CERTIFIED',
      action: "supabase.functions.invoke('outbound-calling'",
    },
  },
]);

function sourceAt(root, relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function issue(surface, message) {
  return `${surface.id}: ${message}`;
}

/**
 * Checks the source-level topology of every known physical-contact surface.
 * It is intentionally a deployment-independent guard: a source change cannot
 * claim that a legacy adapter is safe merely because an environment variable
 * happens to be unset in one environment.
 */
export function auditContactEgressSurfaces(root = process.cwd()) {
  const failures = [];
  const results = SURFACES.map((surface) => {
    let source = '';
    try {
      source = sourceAt(root, surface.file);
    } catch (error) {
      failures.push(issue(surface, `cannot read source (${error instanceof Error ? error.message : String(error)})`));
      return { id: surface.id, file: surface.file, state: surface.state, verified: false };
    }
    if (surface.physicalApi && !source.includes(surface.physicalApi)) {
      failures.push(issue(surface, `missing physical boundary marker: ${surface.physicalApi}`));
    }
    for (const required of surface.required) {
      if (!source.includes(required)) failures.push(issue(surface, `missing required safety marker: ${required}`));
    }
    if (surface.mustPrecedeServe) {
      const markerIndex = source.indexOf(surface.mustPrecedeServe);
      const serveIndex = source.indexOf('serve(async (req) =>');
      if (markerIndex < 0 || serveIndex < 0 || markerIndex > serveIndex) {
        failures.push(issue(surface, 'containment marker must be established before the request handler is registered'));
      }
    }
    if (surface.mustPrecede) {
      const markerIndex = source.indexOf(surface.mustPrecede.marker);
      const actionIndex = source.indexOf(surface.mustPrecede.action);
      if (markerIndex < 0 || actionIndex < 0 || markerIndex > actionIndex) {
        failures.push(issue(surface, 'containment marker must appear before the legacy call action'));
      }
    }
    return {
      id: surface.id,
      file: surface.file,
      state: surface.state,
      verified: true,
    };
  });
  return {
    schema_version: '1.0.0',
    audit: 'contact_egress_surface_topology',
    valid: failures.length === 0,
    failures,
    surfaces: results,
  };
}

export function assertContactEgressSurfaces(root = process.cwd()) {
  const report = auditContactEgressSurfaces(root);
  if (!report.valid) throw new Error(`Contact-egress surface audit failed:\n${report.failures.map((failure) => `- ${failure}`).join('\n')}`);
  return report;
}
