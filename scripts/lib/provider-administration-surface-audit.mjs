import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SURFACES = Object.freeze([
  {
    id: 'multi_carrier_provider_management',
    file: 'supabase/functions/provider-management/index.ts',
    state: 'hard_disabled',
    disabledFunction: 'function isProviderConfigurationTenantCertified(): boolean {',
    required: ['PROVIDER_CONFIGURATION_NOT_TENANT_CERTIFIED'],
    mustPrecede: 'const request: ProviderManagementRequest = await req.json();',
  },
  {
    id: 'retell_agent_administration',
    file: 'supabase/functions/retell-agent-management/index.ts',
    state: 'hard_disabled',
    required: ['PROVIDER_ADMIN_NOT_CERTIFIED', 'Retell agent administration is disabled'],
    mustPrecede: "const apiKey = Deno.env.get('RETELL_AI_API_KEY');",
  },
  {
    id: 'retell_phone_administration',
    file: 'supabase/functions/retell-phone-management/index.ts',
    state: 'hard_disabled',
    required: ['PROVIDER_ADMIN_NOT_CERTIFIED', 'Retell phone-number administration is disabled'],
    mustPrecede: "const apiKey = Deno.env.get('RETELL_AI_API_KEY');",
  },
  {
    id: 'retell_llm_administration',
    file: 'supabase/functions/retell-llm-management/index.ts',
    state: 'hard_disabled',
    required: ['PROVIDER_ADMIN_NOT_CERTIFIED', 'Retell LLM administration is disabled'],
    mustPrecede: "const apiKey = Deno.env.get('RETELL_AI_API_KEY');",
  },
  {
    id: 'phone_number_procurement',
    file: 'supabase/functions/phone-number-purchasing/index.ts',
    state: 'hard_disabled',
    required: ['PROVIDER_ADMIN_NOT_CERTIFIED', 'Phone-number search and purchasing are disabled'],
    mustPrecede: "const supabaseUrl = Deno.env.get('SUPABASE_URL');",
  },
  {
    id: 'retell_business_verification',
    file: 'supabase/functions/retell-business-verification/index.ts',
    state: 'hard_disabled',
    disabledFunction: 'function isRetellBusinessVerificationCertified(): boolean {',
    required: ['RETELL_BUSINESS_VERIFICATION_NOT_CERTIFIED'],
    mustPrecede: 'const { action, profileData, verificationData, brandedData }: BusinessVerificationRequest = await req.json();',
  },
]);

function sourceAt(root, relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function issue(surface, message) {
  return `${surface.id}: ${message}`;
}

function disabledFunctionReturnsFalse(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return false;
  const end = source.indexOf('\n}', start);
  return end > start && source.slice(start, end).includes('return false;');
}

/**
 * Verifies the server-side counterpart to the browser provider lock. These
 * endpoints retain legacy implementation code below the guard so that a
 * future certified service can be deliberately rebuilt, but none may parse a
 * request, read a provider secret, or mutate a provider until that work is
 * independently tenant-bound and reviewed.
 */
export function auditProviderAdministrationSurfaces(root = process.cwd()) {
  const failures = [];
  const surfaces = SURFACES.map((surface) => {
    let source = '';
    try {
      source = sourceAt(root, surface.file);
    } catch (error) {
      failures.push(issue(surface, `cannot read source (${error instanceof Error ? error.message : String(error)})`));
      return { id: surface.id, file: surface.file, state: surface.state, verified: false };
    }

    for (const required of surface.required) {
      if (!source.includes(required)) {
        failures.push(issue(surface, `missing required disabled marker: ${required}`));
      }
    }
    if (surface.disabledFunction && !disabledFunctionReturnsFalse(source, surface.disabledFunction)) {
      failures.push(issue(surface, 'tenant-certification predicate must exist and return false'));
    }

    const marker = surface.required[0];
    const markerIndex = source.indexOf(marker);
    const operationIndex = source.indexOf(surface.mustPrecede);
    if (markerIndex < 0 || operationIndex < 0 || markerIndex > operationIndex) {
      failures.push(issue(surface, 'disabled response must occur before the legacy provider operation'));
    }

    return { id: surface.id, file: surface.file, state: surface.state, verified: true };
  });

  return {
    schema_version: '1.0.0',
    audit: 'provider_administration_surface_topology',
    valid: failures.length === 0,
    failures,
    surfaces,
  };
}

export function assertProviderAdministrationSurfaces(root = process.cwd()) {
  const report = auditProviderAdministrationSurfaces(root);
  if (!report.valid) {
    throw new Error(`Provider-administration surface audit failed:\n${report.failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
  return report;
}
