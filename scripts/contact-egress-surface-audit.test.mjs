import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditContactEgressSurfaces } from './lib/contact-egress-surface-audit.mjs';

test('known physical contact surfaces are either release-gated or hard-disabled', () => {
  const report = auditContactEgressSurfaces();
  assert.equal(report.valid, true, report.failures.join('\n'));
  assert.deepEqual(
    Object.fromEntries(report.surfaces.map((surface) => [surface.id, surface.state])),
    {
      canonical_retell_outbound: 'release_gate_required',
      voice_broadcast_retell_twilio_telnyx: 'hard_disabled',
      standalone_telnyx_outbound: 'hard_disabled',
      telnyx_assistant_test_call: 'hard_disabled',
      assistable_make_call: 'hard_disabled',
      legacy_twilio_test_call: 'hard_disabled',
      public_demo_call: 'hard_disabled',
    },
  );
});

test('audit fails if a legacy containment marker is removed', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'contact-egress-audit-'));
  try {
    const files = [
      'outbound-calling/index.ts',
      'voice-broadcast-engine/index.ts',
      'telnyx-outbound-ai/index.ts',
      'telnyx-ai-assistant/index.ts',
      'assistable-make-call/index.ts',
      'quick-test-call/index.ts',
      'demo-call/index.ts',
    ];
    for (const file of files) {
      const destination = join(sandbox, 'supabase/functions', file);
      mkdirSync(join(destination, '..'), { recursive: true });
      cpSync(join('supabase/functions', file), destination);
    }
    const target = join(sandbox, 'supabase/functions/assistable-make-call/index.ts');
    writeFileSync(target, readFileSync(target, 'utf8').replace('ASSISTABLE_EGRESS_NOT_CERTIFIED', 'ASSISTABLE_EGRESS_CERTIFIED'));
    const report = auditContactEgressSurfaces(sandbox);
    assert.equal(report.valid, false);
    assert.ok(report.failures.some((failure) => failure.includes('assistable_make_call')));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
