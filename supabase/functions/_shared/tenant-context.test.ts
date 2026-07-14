import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  assertOrganizationMembership,
  assertTenantResourceOwnership,
  authorizeOrganizationContext,
  requireExplicitOrganizationId,
} from './tenant-context.ts';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const USER_A = 'user-a';

Deno.test('tenant selection is explicit and never falls back to first membership', () => {
  assertThrows(() => requireExplicitOrganizationId(undefined));
  assertThrows(() => requireExplicitOrganizationId('org-a'));
  assertEquals(requireExplicitOrganizationId(` ${ORG_A.toUpperCase()} `), ORG_A);

  assertThrows(() => assertOrganizationMembership({
    requestedOrganizationId: undefined,
    membershipOrganizationIds: [ORG_A, ORG_B],
  }));
  assertEquals(assertOrganizationMembership({
    requestedOrganizationId: ORG_B,
    membershipOrganizationIds: [ORG_A, ORG_B],
  }), ORG_B);
});

Deno.test('forged and stale organization selections are rejected', () => {
  assertThrows(() => assertOrganizationMembership({
    requestedOrganizationId: ORG_B,
    membershipOrganizationIds: [ORG_A],
  }));
  assertThrows(() => assertOrganizationMembership({
    requestedOrganizationId: ORG_A,
    membershipOrganizationIds: [],
  }));
});

Deno.test('campaign, lead, number, and agent must all match the selected tenant', () => {
  const validResources = [
    { kind: 'campaign', id: 'campaign-a', organization_id: ORG_A, user_id: USER_A },
    { kind: 'lead', id: 'lead-a', organization_id: ORG_A, user_id: USER_A },
    { kind: 'phone number', id: 'phone-a', organization_id: ORG_A, user_id: USER_A },
    { kind: 'Retell agent', id: 'agent-a', organization_id: ORG_A, user_id: USER_A },
  ];
  assertEquals(assertTenantResourceOwnership({
    organizationId: ORG_A,
    userId: USER_A,
    resources: validResources,
  }), ORG_A);

  for (const index of [0, 1, 2, 3]) {
    const resources = validResources.map((resource, current) =>
      current === index ? { ...resource, organization_id: ORG_B } : resource
    );
    assertThrows(() => assertTenantResourceOwnership({
      organizationId: ORG_A,
      userId: USER_A,
      resources,
    }));
  }
  assertThrows(() => assertTenantResourceOwnership({
    organizationId: ORG_A,
    userId: USER_A,
    resources: [{ kind: 'legacy campaign', organization_id: null, user_id: USER_A }],
  }));
  assertThrows(() => assertTenantResourceOwnership({
    organizationId: ORG_A,
    userId: USER_A,
    resources: [{ kind: 'campaign', organization_id: ORG_A, user_id: 'user-b' }],
  }));
});

Deno.test('database authorization requires the exact requested membership', async () => {
  const fakeSupabase = {
    from: () => ({
      select: () => ({
        eq: (_field: string, value: string) => ({
          eq: (_orgField: string, organizationId: string) => ({
            maybeSingle: async () => ({
              data: value === USER_A && organizationId === ORG_A
                ? { organization_id: ORG_A }
                : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  assertEquals(await authorizeOrganizationContext(fakeSupabase, USER_A, ORG_A), ORG_A);
  await assertRejects(() => authorizeOrganizationContext(fakeSupabase, USER_A, ORG_B));
});
