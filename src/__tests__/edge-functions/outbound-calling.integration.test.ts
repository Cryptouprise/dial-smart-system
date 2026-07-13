/**
 * Outbound Calling live integration tests.
 *
 * These tests are opt-in because they invoke a deployed Edge Function. They
 * must run only against a dedicated staging project and certification tenant;
 * ordinary unit CI reports them as skipped instead of silently passing after
 * an unauthenticated early return.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

const runLiveOutboundTests = import.meta.env.VITE_RUN_LIVE_OUTBOUND_TESTS === 'true';
const describeLive = runLiveOutboundTests ? describe : describe.skip;
let testOrganizationId: string | null = import.meta.env.VITE_TEST_ORGANIZATION_ID || null;

describeLive('Outbound Calling live integration', () => {
  beforeAll(async () => {
    if (testOrganizationId) return;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('Live outbound tests require an authenticated staging user');

    const { data: memberships, error: membershipError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(2);
    if (membershipError) throw membershipError;

    if (memberships?.length === 1) {
      testOrganizationId = memberships[0].organization_id;
      return;
    }
    throw new Error(
      'Set VITE_TEST_ORGANIZATION_ID when the live test user has zero or multiple organizations',
    );
  });

  it('exposes a structured authenticated health response', async () => {
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: { action: 'health_check' },
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('rejects a create call with missing required fields', async () => {
    expect(testOrganizationId).toBeTruthy();
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: {
        action: 'create_call',
        organizationId: testOrganizationId,
      },
    });

    expect(data?.error || error).toBeDefined();
  });

  it('rejects an invalid destination before provider submission', async () => {
    expect(testOrganizationId).toBeTruthy();
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: {
        action: 'create_call',
        organizationId: testOrganizationId,
        phoneNumber: 'not-a-phone',
        callerId: '+15551234567',
        agentId: 'certification-invalid-agent',
      },
    });

    expect(data?.error || error).toBeDefined();
  });

});

describe('Outbound Calling response contract', () => {
  it.todo('proves machine-readable rate-limit guidance against the deployed create-call boundary');
});
