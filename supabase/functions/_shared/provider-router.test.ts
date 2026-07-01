/**
 * Deno tests for the provider/agent router.
 * Run: deno test supabase/functions/_shared/provider-router.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { resolveRouting } from './provider-router.ts';

Deno.test('explicit retell with agent → retell, no fallback', () => {
  const d = resolveRouting({ campaign: { provider: 'retell', agent_id: 'a1' }, attempt: 0 });
  assertEquals(d.provider, 'retell');
  assertEquals(d.agentId, 'a1');
  assertEquals(d.fallbackUsed, false);
});

Deno.test('missing provider defaults to retell', () => {
  const d = resolveRouting({ campaign: { agent_id: 'a1' }, attempt: 0 });
  assertEquals(d.provider, 'retell');
});

Deno.test('explicit retell without agent falls back to telnyx', () => {
  const d = resolveRouting({ campaign: { provider: 'retell', telnyx_assistant_id: 't1' }, attempt: 0 });
  assertEquals(d.provider, 'telnyx');
  assertEquals(d.agentId, 't1');
  assertEquals(d.fallbackUsed, true);
});

Deno.test('both mode alternates by attempt parity', () => {
  const campaign = { provider: 'both', agent_id: 'a1', telnyx_assistant_id: 't1' };
  assertEquals(resolveRouting({ campaign, attempt: 0 }).provider, 'retell');
  assertEquals(resolveRouting({ campaign, attempt: 1 }).provider, 'telnyx');
  assertEquals(resolveRouting({ campaign, attempt: 2 }).provider, 'retell');
});

Deno.test('both mode falls back when preferred provider has no agent', () => {
  // Prefer telnyx on odd attempt, but only a retell agent exists.
  const d = resolveRouting({ campaign: { provider: 'both', agent_id: 'a1' }, attempt: 1 });
  assertEquals(d.provider, 'retell');
  assertEquals(d.fallbackUsed, true);
});

Deno.test('health signal steers away from unhealthy provider', () => {
  const d = resolveRouting({
    campaign: { provider: 'retell', agent_id: 'a1', telnyx_assistant_id: 't1' },
    attempt: 0,
    health: { retell: { healthy: false, reason: 'spam-flagged' }, telnyx: { healthy: true } },
  });
  assertEquals(d.provider, 'telnyx');
  assertEquals(d.fallbackUsed, true);
});

Deno.test('no agent anywhere → null decision', () => {
  const d = resolveRouting({ campaign: { provider: 'both' }, attempt: 0 });
  assertEquals(d.provider, null);
  assertEquals(d.agentId, null);
});

Deno.test('assistable explicit with agent → assistable', () => {
  const d = resolveRouting({ campaign: { provider: 'assistable', assistable_assistant_id: 'as1' }, attempt: 0 });
  assertEquals(d.provider, 'assistable');
  assertEquals(d.agentId, 'as1');
});
