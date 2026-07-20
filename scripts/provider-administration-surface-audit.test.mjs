import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditProviderAdministrationSurfaces } from './lib/provider-administration-surface-audit.mjs';

const FILES = [
  'provider-management/index.ts',
  'retell-agent-management/index.ts',
  'retell-phone-management/index.ts',
  'retell-llm-management/index.ts',
  'phone-number-purchasing/index.ts',
  'twilio-integration/index.ts',
  'telnyx-ai-assistant/index.ts',
  'retell-force-webhook/index.ts',
  'setup-lady-jarvis/index.ts',
  'retell-business-verification/index.ts',
];

test('legacy provider administration surfaces remain hard-disabled', () => {
  const report = auditProviderAdministrationSurfaces();
  assert.equal(report.valid, true, report.failures.join('\n'));
  assert.deepEqual(
    Object.fromEntries(report.surfaces.map((surface) => [surface.id, surface.state])),
    {
      multi_carrier_provider_management: 'hard_disabled',
      retell_agent_administration: 'hard_disabled',
      retell_phone_administration: 'hard_disabled',
      retell_llm_administration: 'hard_disabled',
      phone_number_procurement: 'hard_disabled',
      twilio_provider_administration: 'hard_disabled',
      telnyx_assistant_administration: 'hard_disabled',
      retell_maintenance_administration: 'hard_disabled',
      demo_retell_provisioning: 'hard_disabled',
      retell_business_verification: 'hard_disabled',
    },
  );
});

test('audit fails if a Retell administration lock marker is removed', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'provider-admin-audit-'));
  try {
    for (const file of FILES) {
      const destination = join(sandbox, 'supabase/functions', file);
      mkdirSync(join(destination, '..'), { recursive: true });
      cpSync(join('supabase/functions', file), destination);
    }
    const target = join(sandbox, 'supabase/functions/retell-agent-management/index.ts');
    writeFileSync(target, readFileSync(target, 'utf8').replace('PROVIDER_ADMIN_NOT_CERTIFIED', 'PROVIDER_ADMIN_CERTIFIED'));

    const report = auditProviderAdministrationSurfaces(sandbox);
    assert.equal(report.valid, false);
    assert.ok(report.failures.some((failure) => failure.includes('retell_agent_administration')));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
