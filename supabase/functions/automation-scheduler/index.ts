/**
 * Launch-profile automation scheduler.
 *
 * The only certified responsibility is to wake the canonical dispatcher once
 * per exact user/organization that already has due, pending queue work. Legacy
 * callback pickup, rule-driven queue generation, workflow/nudge fan-out, and
 * delayed in-process timers remain disabled until separately certified.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { authorizeAutomationScheduler } from './scheduler-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-dialsmart-automation-cron-token',
};

interface TenantDispatch {
  userId: string;
  organizationId: string;
}

function tenantFromQueueRow(row: any): TenantDispatch | null {
  const campaign = Array.isArray(row?.campaigns) ? row.campaigns[0] : row?.campaigns;
  const userId = typeof campaign?.user_id === 'string' ? campaign.user_id : '';
  const organizationId = typeof campaign?.organization_id === 'string'
    ? campaign.organization_id
    : '';
  return userId && organizationId ? { userId, organizationId } : null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    // Platform JWT verification is not scheduler authorization: anon and user
    // JWTs must never start global automation.
    const authorization = authorizeAutomationScheduler({
      authorizationHeader: req.headers.get('Authorization'),
      suppliedCronToken: req.headers.get('X-DialSmart-Automation-Cron-Token'),
      serviceRoleKey,
      configuredCronToken: Deno.env.get('AUTOMATION_SCHEDULER_CRON_TOKEN') || '',
    });
    if (!authorization.authorized) {
      return new Response(JSON.stringify({ error: 'Authorized scheduler invocation required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();
    const { data: dueQueue, error: dueQueueError } = await supabase
      .from('dialing_queues')
      .select('campaign_id, campaigns(user_id, organization_id)')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)
      .limit(200);

    if (dueQueueError) {
      throw new Error(`Due-queue lookup failed: ${dueQueueError.message}`);
    }

    const tenants = new Map<string, TenantDispatch>();
    let invalidTenantRows = 0;
    for (const row of dueQueue || []) {
      const tenant = tenantFromQueueRow(row);
      if (!tenant) {
        invalidTenantRows++;
        continue;
      }
      tenants.set(`${tenant.userId}:${tenant.organizationId}`, tenant);
    }

    // A due queue row without an authoritative campaign tenant is not safe to
    // dispatch. Fail the scheduler run so the data defect is visible.
    if (invalidTenantRows > 0) {
      throw new Error(`${invalidTenantRows} due queue row(s) lack an authoritative campaign tenant`);
    }

    const dispatchSummary = {
      tenants: tenants.size,
      invocations: 0,
      ok: 0,
      failed: 0,
      results: [] as Array<Record<string, unknown>>,
    };

    for (const tenant of tenants.values()) {
      dispatchSummary.invocations++;
      try {
        // Exactly one awaited invocation per tenant per scheduler tick. Edge
        // runtimes do not guarantee bare setTimeout work after the response.
        const response = await fetch(`${supabaseUrl}/functions/v1/call-dispatcher`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            internal: true,
            userId: tenant.userId,
            organizationId: tenant.organizationId,
          }),
        });

        const responseText = await response.text();
        let providerResult: unknown = responseText;
        try {
          providerResult = responseText ? JSON.parse(responseText) : null;
        } catch {
          // Preserve bounded text for diagnostics without inventing success.
          providerResult = responseText.slice(0, 1000);
        }

        if (!response.ok) {
          dispatchSummary.failed++;
          dispatchSummary.results.push({ ...tenant, ok: false, status: response.status, result: providerResult });
          continue;
        }

        dispatchSummary.ok++;
        dispatchSummary.results.push({ ...tenant, ok: true, status: response.status, result: providerResult });
      } catch (error) {
        dispatchSummary.failed++;
        dispatchSummary.results.push({
          ...tenant,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return new Response(JSON.stringify({
      success: dispatchSummary.failed === 0,
      launch_profile: 'existing_pending_queue_dispatch_only',
      authorization: authorization.mechanism,
      callbacks_queued: 0,
      callbacks_reset: 0,
      workflow_steps_processed: 0,
      nudges_sent: 0,
      automation_rules_processed: 0,
      dispatch_summary: dispatchSummary,
    }), {
      status: dispatchSummary.failed === 0 ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[Scheduler] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
});
