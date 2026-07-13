import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  canonicalWebhookCall,
  planRetellSnapshot,
  retryDelaySeconds,
  shouldEscalateUnresolvedLookup,
  signRetellWebhook,
  validateRetellCallIdentity,
  type ExpectedRetellIdentity,
  type RetellCallSnapshot,
} from './reconciliation-policy.ts';

interface ReconciliationJobRow {
  job_id: string;
  reconciliation_claim_token: string;
  attempt_count: number;
  first_detected_at: string;
  dispatch_claim_id: string;
  dispatch_status: string;
  provider_call_id: string | null;
  call_log_id: string;
  organization_id: string;
  user_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  queue_id: string | null;
  dispatch_generation: string | null;
  reconciliation_reason: string;
  identity_contract_version: number;
  failed_effect_receipt: boolean;
  phone_number: string;
  caller_id: string;
  agent_id: string | null;
}

type LookupResult =
  | { kind: 'found'; call: RetellCallSnapshot }
  | { kind: 'not_found'; reason: string }
  | { kind: 'transient_error'; reason: string }
  | { kind: 'configuration_error'; reason: string }
  | { kind: 'invalid_evidence'; reason: string };

type PersistedOutcome = 'waiting_provider' | 'resolved' | 'manual_required';

interface JobResult {
  job_id: string;
  outcome: PersistedOutcome | 'lease_retry';
  provider_call_id?: string;
  provider_status?: string;
  reason?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const length = Math.max(actual.length, expected.length);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function lookupRetellCall(
  job: ReconciliationJobRow,
  apiKey: string,
  timeoutMs: number,
): Promise<LookupResult> {
  try {
    if (job.provider_call_id) {
      const response = await fetchWithTimeout(
        `https://api.retellai.com/v2/get-call/${encodeURIComponent(job.provider_call_id)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
        timeoutMs,
      );
      if (response.status === 404) {
        return { kind: 'not_found', reason: 'Retell has not returned the accepted call id' };
      }
      if (response.status === 401 || response.status === 403) {
        return { kind: 'configuration_error', reason: `Retell rejected reconciler credentials (${response.status})` };
      }
      if (response.status === 429 || response.status >= 500) {
        return { kind: 'transient_error', reason: `Retell lookup is temporarily unavailable (${response.status})` };
      }
      if (!response.ok) {
        return { kind: 'invalid_evidence', reason: `Retell get-call rejected the lookup (${response.status}): ${await responseText(response)}` };
      }
      const call = await response.json();
      return call && typeof call === 'object'
        ? { kind: 'found', call: call as RetellCallSnapshot }
        : { kind: 'invalid_evidence', reason: 'Retell get-call returned a non-object payload' };
    }

    // A call_log_id is unique locally and is included in every certified
    // create-phone-call metadata object. Request at most three so duplicate
    // provider calls are detected without listing account history.
    const response = await fetchWithTimeout(
      'https://api.retellai.com/v3/list-calls',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter_criteria: {
            metadata: [
              { key: 'call_log_id', type: 'string', value: job.call_log_id },
              { key: 'user_id', type: 'string', value: job.user_id },
            ],
          },
          sort_order: 'descending',
          limit: 3,
          include_total: false,
        }),
      },
      timeoutMs,
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: 'configuration_error', reason: `Retell rejected reconciler credentials (${response.status})` };
    }
    if (response.status === 429 || response.status >= 500) {
      return { kind: 'transient_error', reason: `Retell list-calls is temporarily unavailable (${response.status})` };
    }
    if (!response.ok) {
      return { kind: 'invalid_evidence', reason: `Retell list-calls rejected the lookup (${response.status}): ${await responseText(response)}` };
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      return { kind: 'invalid_evidence', reason: 'Retell list-calls returned a malformed payload' };
    }
    if (payload.items.length === 0) {
      return { kind: 'not_found', reason: 'No Retell call currently matches the immutable call-log metadata' };
    }
    if (payload.items.length !== 1) {
      return { kind: 'invalid_evidence', reason: `Retell returned ${payload.items.length} calls for one logical dispatch` };
    }
    return { kind: 'found', call: payload.items[0] as RetellCallSnapshot };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'transient_error', reason: `Retell lookup failed safely: ${message}` };
  }
}

function expectedIdentity(job: ReconciliationJobRow): ExpectedRetellIdentity {
  return {
    callLogId: job.call_log_id,
    userId: job.user_id,
    organizationId: job.organization_id,
    campaignId: job.campaign_id,
    leadId: job.lead_id,
    queueId: job.queue_id,
    dispatchGeneration: job.dispatch_generation,
    dispatchClaimId: job.dispatch_claim_id,
    contractVersion: job.identity_contract_version,
    phoneNumber: job.phone_number,
    callerId: job.caller_id,
    agentId: job.agent_id,
  };
}

async function invokeReconstructedWebhook(input: {
  supabaseUrl: string;
  serviceKey: string;
  signingKey: string;
  event: 'call_ended' | 'call_failed' | 'call_analyzed';
  call: RetellCallSnapshot;
  timeoutMs: number;
}): Promise<void> {
  const rawBody = JSON.stringify({ event: input.event, call: input.call });
  const signature = await signRetellWebhook(rawBody, input.signingKey);
  const response = await fetchWithTimeout(
    `${input.supabaseUrl.replace(/\/$/, '')}/functions/v1/retell-call-webhook`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.serviceKey}`,
        apikey: input.serviceKey,
        'Content-Type': 'application/json',
        'X-Retell-Signature': signature,
        'X-DialSmart-Reconciliation': 'retell-provider-lookup',
      },
      body: rawBody,
    },
    input.timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`Reconstructed ${input.event} failed (${response.status}): ${await responseText(response)}`);
  }
}

async function processWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function runWorker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()));
  return results;
}

serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'POST required' }, 405);

  let body: Record<string, unknown> = {};
  try {
    const parsedBody: unknown = await req.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return jsonResponse({ error: 'JSON body must be an object' }, 400);
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Valid JSON body required' }, 400);
  }
  const action = String(body.action || 'run');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const retellApiKey = Deno.env.get('RETELL_AI_API_KEY') || '';
  const signingKey = Deno.env.get('RETELL_WEBHOOK_SIGNING_KEY') || '';
  const verifyMode = (Deno.env.get('RETELL_WEBHOOK_VERIFY_MODE') || 'enforce').trim().toLowerCase();
  const enabled = (Deno.env.get('RETELL_RECONCILER_ENABLED') || 'false').trim().toLowerCase() === 'true';
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const configuredCronToken = Deno.env.get('RETELL_RECONCILER_CRON_TOKEN') || '';
  const suppliedCronToken = req.headers.get('X-DialSmart-Cron-Token') || '';
  const serviceAuthorized = !!serviceKey && !!bearer && constantTimeEqual(bearer, serviceKey);
  const cronAuthorized = action === 'run'
    && body.source === 'pg_cron'
    && !!configuredCronToken
    && !!suppliedCronToken
    && constantTimeEqual(suppliedCronToken, configuredCronToken);

  if (!serviceKey || (!serviceAuthorized && !cronAuthorized)) {
    return jsonResponse({ error: 'Authorized reconciler invocation required' }, 401);
  }
  if (action !== 'run' && !serviceAuthorized) {
    return jsonResponse({ error: 'Service-role authorization required for this action' }, 401);
  }
  if (!supabaseUrl) return jsonResponse({ error: 'SUPABASE_URL is not configured' }, 503);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === 'health_check') {
    const health = await supabase.rpc('retell_reconciliation_health_check');
    const row = Array.isArray(health.data) ? health.data[0] : health.data;
    const configured = !!retellApiKey
      && !!signingKey
      && !!configuredCronToken
      && verifyMode === 'enforce';
    const healthy = enabled
      && configured
      && !health.error
      && row?.contract_ready === true
      && row?.cron_scheduled === true
      && row?.cron_active === true
      && row?.vault_configured === true
      && row?.recent_success === true;
    return jsonResponse({
      healthy,
      enabled,
      provider_configured: !!retellApiKey,
      webhook_signing_configured: !!signingKey,
      cron_token_configured: !!configuredCronToken,
      webhook_verify_mode: verifyMode,
      contract_ready: row?.contract_ready === true,
      cron_scheduled: row?.cron_scheduled === true,
      cron_active: row?.cron_active === true,
      vault_configured: row?.vault_configured === true,
      last_started_at: row?.last_started_at ?? null,
      last_succeeded_at: row?.last_succeeded_at ?? null,
      recent_success: row?.recent_success === true,
      queued_count: row?.queued_count ?? null,
      expired_lease_count: row?.expired_lease_count ?? null,
      manual_required_count: row?.manual_required_count ?? null,
      database_error: health.error?.message || null,
    }, healthy ? 200 : 503);
  }

  if (action === 'requeue') {
    const jobIds = Array.isArray(body.job_ids) ? body.job_ids.map(String) : [];
    const reason = String(body.reason || '').trim();
    if (jobIds.length < 1 || jobIds.length > 20 || reason.length < 8) {
      return jsonResponse({ error: 'requeue requires 1-20 job_ids and a meaningful reason' }, 400);
    }
    const results = [];
    for (const jobId of jobIds) {
      const result = await supabase.rpc('requeue_retell_reconciliation_job', {
        p_job_id: jobId,
        p_reason: reason,
      });
      results.push({ job_id: jobId, requeued: result.data === true, error: result.error?.message || null });
    }
    return jsonResponse({ success: results.every((result) => result.requeued), results });
  }

  if (action !== 'run') return jsonResponse({ error: 'Unsupported action' }, 400);
  if (!enabled) return jsonResponse({ error: 'Retell reconciler is disabled until explicitly certified' }, 503);
  if (!retellApiKey || !signingKey || verifyMode !== 'enforce') {
    return jsonResponse({
      error: 'Retell API access and enforced signed-webhook configuration are required',
    }, 503);
  }

  const defaultBatchSize = boundedInteger(Deno.env.get('RETELL_RECONCILER_BATCH_SIZE'), 8, 1, 8);
  const requestedLimit = typeof body.limit === 'number' && Number.isFinite(body.limit)
    ? Math.floor(body.limit)
    : defaultBatchSize;
  const batchSize = Math.max(1, Math.min(8, requestedLimit));
  const concurrency = boundedInteger(Deno.env.get('RETELL_RECONCILER_CONCURRENCY'), 4, 1, 4);
  const providerTimeoutMs = boundedInteger(Deno.env.get('RETELL_RECONCILER_PROVIDER_TIMEOUT_MS'), 8000, 2000, 15000);
  const webhookTimeoutMs = boundedInteger(Deno.env.get('RETELL_RECONCILER_WEBHOOK_TIMEOUT_MS'), 45000, 5000, 60000);

  const started = await supabase.rpc('mark_retell_reconciliation_run', {
    p_status: 'started',
    p_claimed_count: 0,
    p_error: null,
  });
  if (started.error) {
    return jsonResponse({ error: `Could not persist reconciler start heartbeat: ${started.error.message}` }, 503);
  }

  const claimed = await supabase.rpc('claim_retell_reconciliation_jobs', { p_limit: batchSize });
  if (claimed.error) {
    await supabase.rpc('mark_retell_reconciliation_run', {
      p_status: 'failed',
      p_claimed_count: 0,
      p_error: claimed.error.message,
    });
    return jsonResponse({ error: `Retell reconciliation claim failed: ${claimed.error.message}` }, 503);
  }
  const jobs = (claimed.data || []) as ReconciliationJobRow[];

  const finish = async (
    job: ReconciliationJobRow,
    outcome: PersistedOutcome,
    options: {
      providerStatus?: string | null;
      error?: string | null;
      delaySeconds?: number;
      analysisExpected?: boolean;
    } = {},
  ) => {
    const result = await supabase.rpc('finish_retell_reconciliation_job', {
      p_job_id: job.job_id,
      p_claim_token: job.reconciliation_claim_token,
      p_outcome: outcome,
      p_provider_status: options.providerStatus || null,
      p_error: options.error || null,
      p_next_attempt_at: outcome === 'waiting_provider'
        ? new Date(Date.now() + ((options.delaySeconds || 60) * 1000)).toISOString()
        : null,
      p_analysis_expected: options.analysisExpected === true,
    });
    if (result.error || result.data !== true) {
      throw new Error(`Could not finish reconciliation job ${job.job_id}: ${result.error?.message || 'no acknowledgement'}`);
    }
  };

  const results = await processWithConcurrency(jobs, concurrency, async (job): Promise<JobResult> => {
    try {
    if (job.failed_effect_receipt) {
      const reason = 'A terminal or analysis effect partially failed and cannot be replayed safely without per-effect idempotency';
      await finish(job, 'manual_required', { error: reason });
      return { job_id: job.job_id, outcome: 'manual_required', reason };
    }

    const lookup = await lookupRetellCall(job, retellApiKey, providerTimeoutMs);

    if (lookup.kind !== 'found') {
      const escalate = lookup.kind === 'configuration_error'
        || lookup.kind === 'invalid_evidence'
        || shouldEscalateUnresolvedLookup({
          attemptCount: job.attempt_count,
          firstDetectedAt: job.first_detected_at,
        });
      const outcome = escalate ? 'manual_required' : 'waiting_provider';
      await finish(job, outcome, {
        error: lookup.reason,
        delaySeconds: retryDelaySeconds(job.attempt_count),
      });
      return { job_id: job.job_id, outcome, reason: lookup.reason };
    }

    const identity = expectedIdentity(job);
    const validation = validateRetellCallIdentity(lookup.call, identity);
    if (validation.valid === false) {
      await finish(job, 'manual_required', { error: validation.reason });
      return { job_id: job.job_id, outcome: 'manual_required', reason: validation.reason };
    }

    let plan;
    try {
      plan = planRetellSnapshot(lookup.call);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await finish(job, 'manual_required', { error: reason });
      return { job_id: job.job_id, outcome: 'manual_required', reason };
    }

    const bind = await supabase.rpc('bind_retell_reconciliation_call', {
      p_job_id: job.job_id,
      p_claim_token: job.reconciliation_claim_token,
      p_provider_call_id: lookup.call.call_id,
      p_provider_status: plan.providerStatus,
      p_provider_metadata: lookup.call.metadata || null,
    });
    if (bind.error || bind.data !== true) {
      const reason = `Authoritative Retell binding failed: ${bind.error?.message || 'no acknowledgement'}`;
      await finish(job, 'manual_required', { providerStatus: plan.providerStatus, error: reason });
      return { job_id: job.job_id, outcome: 'manual_required', reason };
    }

    if (!plan.terminal) {
      const firstDetectedMs = Date.parse(job.first_detected_at);
      const activeAgeMs = Date.now() - (Number(lookup.call.start_timestamp) || firstDetectedMs);
      const activeLimitMs = plan.providerStatus === 'registered'
        ? 30 * 60 * 1000
        : 4 * 60 * 60 * 1000;
      if (!Number.isFinite(activeAgeMs) || activeAgeMs >= activeLimitMs) {
        const reason = `Retell call remained ${plan.providerStatus} beyond the bounded reconciliation window`;
        await finish(job, 'manual_required', { providerStatus: plan.providerStatus, error: reason });
        return { job_id: job.job_id, outcome: 'manual_required', provider_call_id: lookup.call.call_id, provider_status: plan.providerStatus, reason };
      }
      await finish(job, 'waiting_provider', {
        providerStatus: plan.providerStatus,
        delaySeconds: plan.nextDelaySeconds,
      });
      return { job_id: job.job_id, outcome: 'waiting_provider', provider_call_id: lookup.call.call_id, provider_status: plan.providerStatus };
    }

    const webhookCall = canonicalWebhookCall(lookup.call, identity);
    try {
      await invokeReconstructedWebhook({
        supabaseUrl,
        serviceKey,
        signingKey,
        event: plan.terminalEvent,
        call: webhookCall,
        timeoutMs: webhookTimeoutMs,
      });
      if (plan.analysisEvent) {
        await invokeReconstructedWebhook({
          supabaseUrl,
          serviceKey,
          signingKey,
          event: 'call_analyzed',
          call: webhookCall,
          timeoutMs: webhookTimeoutMs,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // A timed-out/failed webhook may already have committed some broad
      // effects. Never replay it automatically; quarantine for effect-ledger
      // inspection instead.
      const outcome = 'manual_required';
      await finish(job, outcome, {
        providerStatus: plan.providerStatus,
        error: reason,
      });
      return { job_id: job.job_id, outcome, provider_call_id: lookup.call.call_id, provider_status: plan.providerStatus, reason };
    }

    if (plan.waitForAnalysis) {
      await finish(job, 'waiting_provider', {
        providerStatus: plan.providerStatus,
        error: 'Terminal lifecycle reconciled; waiting for bounded post-call analysis window',
        delaySeconds: 120,
      });
      return { job_id: job.job_id, outcome: 'waiting_provider', provider_call_id: lookup.call.call_id, provider_status: plan.providerStatus };
    }

    await finish(job, 'resolved', {
      providerStatus: plan.providerStatus,
      analysisExpected: plan.analysisEvent,
    });
    return { job_id: job.job_id, outcome: 'resolved', provider_call_id: lookup.call.call_id, provider_status: plan.providerStatus };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failed = await supabase.rpc('fail_retell_reconciliation_job', {
        p_job_id: job.job_id,
        p_claim_token: job.reconciliation_claim_token,
        p_error: reason,
        p_retryable: false,
      });
      if (!failed.error && (failed.data === 'manual_required' || failed.data === 'waiting_provider')) {
        const outcome = failed.data as PersistedOutcome;
        return { job_id: job.job_id, outcome, reason };
      }
      // Only a genuinely lost/expired token can remain for lease recovery.
      console.error(`[Retell Reconciler] Job ${job.job_id} lost its persistence lease:`, failed.error || reason);
      return { job_id: job.job_id, outcome: 'lease_retry', reason: failed.error?.message || reason };
    }
  });

  const heartbeat = await supabase.rpc('mark_retell_reconciliation_run', {
    p_status: 'succeeded',
    p_claimed_count: jobs.length,
    p_error: null,
  });
  if (heartbeat.error) {
    return jsonResponse({
      error: `Reconciler completed but success heartbeat failed: ${heartbeat.error.message}`,
      claimed: jobs.length,
      results,
    }, 503);
  }

  return jsonResponse({
    success: true,
    source: String(body.source || 'manual'),
    claimed: jobs.length,
    resolved: results.filter((result) => result.outcome === 'resolved').length,
    waiting_provider: results.filter((result) => result.outcome === 'waiting_provider').length,
    manual_required: results.filter((result) => result.outcome === 'manual_required').length,
    lease_retry: results.filter((result) => result.outcome === 'lease_retry').length,
    results,
  });
});
