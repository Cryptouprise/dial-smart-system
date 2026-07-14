import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  assertAcceptedSmsEnvelope,
  canonicalSmsPhone,
  requireSmsIdempotencyKey,
  resolveSmsOrganization,
  selectOwnedSmsNumber,
  smsClaimDisposition,
  smsPhoneLookupVariants,
} from './sms-boundary.ts';

Deno.test('normalizes SMS destinations deterministically', () => {
  assertEquals(canonicalSmsPhone('(303) 555-0123'), '+13035550123');
  assertEquals(canonicalSmsPhone('+44 20 7946 0958'), '+442079460958');
  assertEquals(smsPhoneLookupVariants('(303) 555-0123'), [
    '+13035550123', '13035550123', '3035550123',
  ]);
  assertThrows(() => canonicalSmsPhone('911'));
  assertEquals(requireSmsIdempotencyKey(' effect:123 '), 'effect:123');
  assertThrows(() => requireSmsIdempotencyKey('short'));
  assertThrows(() => requireSmsIdempotencyKey('x'.repeat(513)));
});

Deno.test('requires explicit certified context for multi-organization users', () => {
  const memberships = [{ organization_id: 'org-a' }, { organization_id: 'org-b' }];
  assertThrows(() => resolveSmsOrganization({ memberships }));
  assertThrows(() => resolveSmsOrganization({ memberships, requestedOrganizationId: 'org-b' }));
  assertEquals(resolveSmsOrganization({
    memberships: [{ organization_id: 'org-a' }],
    requestedOrganizationId: 'org-a',
  }), 'org-a');
  assertThrows(() => resolveSmsOrganization({
    memberships: [{ organization_id: 'org-a' }],
    requestedOrganizationId: 'org-c',
  }));
});

Deno.test('selects one active tenant-owned SMS number and rejects unsafe provider metadata', () => {
  const records = [{
    id: 'phone-1', number: '+13035550123', provider: 'telnyx',
    status: 'active', capabilities: { sms: true }, allowed_uses: ['sms'],
  }];
  assertEquals(selectOwnedSmsNumber(records, '303-555-0123').provider, 'telnyx');
  assertThrows(() => selectOwnedSmsNumber(records, '+13035550999'));
  assertThrows(() => selectOwnedSmsNumber([{ ...records[0], provider: 'retell_native' }], '+13035550123'));
  assertThrows(() => selectOwnedSmsNumber([{ ...records[0], allowed_uses: ['voice_ai'] }], '+13035550123'));
});

Deno.test('acceptance envelope cannot treat skipped or incomplete sends as success', () => {
  assertAcceptedSmsEnvelope({
    success: true, sent: true, provider: 'twilio', provider_message_id: 'SM123', message_id: 'message-1',
  });
  assertThrows(() => assertAcceptedSmsEnvelope({ success: true, skipped: true }));
  assertThrows(() => assertAcceptedSmsEnvelope({ success: true, sent: true, provider: 'twilio' }));
  assertThrows(() => assertAcceptedSmsEnvelope({ success: false, error: 'DNC' }));
});

Deno.test('duplicate attempt claims never authorize a second provider send', () => {
  assertEquals(smsClaimDisposition({ claimed: true, current_status: 'claimed' }), 'send');
  assertEquals(smsClaimDisposition({
    claimed: false,
    current_status: 'accepted',
    existing_provider_message_id: 'SM123',
  }), 'accepted_replay');
  assertEquals(smsClaimDisposition({ claimed: false, current_status: 'claimed' }), 'reconcile');
  assertEquals(smsClaimDisposition({ claimed: false, current_status: 'acceptance_unknown' }), 'reconcile');
  assertEquals(smsClaimDisposition({ claimed: false, current_status: 'rejected' }), 'rejected');
});
