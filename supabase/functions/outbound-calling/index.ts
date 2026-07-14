
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  certifiedOutboundCallingWindow,
  normalizePhoneVariants,
  timezoneForUsState,
} from '../_shared/contact-safety.ts';
import {
  assertTenantResourceOwnership,
  authorizeOrganizationContext,
} from '../_shared/tenant-context.ts';
import { certifiedRetellCallDurationMinutes } from '../_shared/call-exposure-policy.ts';
import {
  assertRetellLaunchAgentConfiguration,
  buildRetellCreatePhoneCallPayload,
  launchRetellDynamicVariables,
  RETELL_V2_API_BASE,
  retellGetAgentUrl,
  retellGetLlmUrl,
} from '../_shared/retell-provider-contract.ts';
import {
  evaluateCampaignContactRelease,
  type CampaignContactReleaseInput,
} from '../_shared/campaign-contact-release.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch with timeout to prevent hanging requests
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

class AmbiguousProviderCreateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousProviderCreateError';
  }
}

function isScriptExperimentCertified(): boolean {
  return false;
}

function isProviderDiagnosticLoggingCertified(): boolean {
  return false;
}

// Retry helper for transient failures
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryable = error.message?.includes('rate limit') ||
                         error.message?.includes('timeout') ||
                         error.message?.includes('network') ||
                         error.message?.includes('503') ||
                         error.message?.includes('502');
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Retry ${context}] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper to log errors to database
async function logError(
  supabase: any,
  functionName: string,
  action: string,
  userId: string | null,
  error: any,
  context: any = {}
) {
  try {
    await supabase.from('edge_function_errors').insert({
      function_name: functionName,
      action: action,
      user_id: userId,
      lead_id: context.leadId || null,
      campaign_id: context.campaignId || null,
      workflow_id: context.workflowId || null,
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : null,
      request_payload: context.payload || null,
      severity: context.severity || 'error'
    });
  } catch (logError) {
    console.error('[Error Logging] Failed to log error:', logError);
  }
}

function sanitizeTelnyxDynamicVariables(
  variables: Record<string, unknown>,
  context: string,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(variables).flatMap(([key, value]) => {
      if (value === null || value === undefined) return [[key, '']];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [[key, value]];
      }
      if (Array.isArray(value)) {
        return [[key, value.map((item) => String(item ?? '')).join(', ')]];
      }

      console.warn(`[${context}] Dropping non-scalar Telnyx dynamic variable "${key}"`);
      return [];
    }),
  );
}

interface OutboundCallRequest {
  action: 'create_call' | 'get_call_status' | 'end_call' | 'health_check';
  organizationId?: string; // Explicit browser/API/service tenant selection
  campaignId?: string;
  leadId?: string;
  phoneNumber?: string;
  callerId?: string;
  agentId?: string;
  retellCallId?: string;
  userId?: string; // For service-role calls from call-dispatcher
  queueId?: string; // Queue row; counted only after the provider accepts a physical call
  dispatchGeneration?: string; // Exclusive pre-network claim generation for queue calls
  idempotencyKey?: string; // Required for non-queue calls and workflow/action effects
  provider?: 'retell' | 'telnyx'; // Which voice AI provider to use (default: retell)
  telnyxAssistantId?: string; // Local DB ID of telnyx_assistants row
  isTestCall?: boolean; // Labels test UX only; never bypasses safety or billing
  skipDncCheck?: boolean;
  skipCreditCheck?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let releaseReservationOnDefiniteFailure: ((reason: string) => Promise<void>) | null = null;
  let finalizeDispatchOnError: ((
    status: 'accepted' | 'definite_failure' | 'acceptance_unknown',
    providerCallId: string | null,
    errorMessage: string | null,
  ) => Promise<void>) | null = null;
  let dispatchClaimFinalized = false;
  let providerCreateState: 'not_started' | 'in_flight' | 'definite_failure' | 'ambiguous' | 'accepted' = 'not_started';

  try {
    const authHeader = req.headers.get('Authorization');
    console.log('[Outbound Calling] Request received');
    console.log('[Outbound Calling] Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[Outbound Calling] Missing Authorization header');
      return new Response(
        JSON.stringify({ 
          error: 'Missing authorization. Please log in and try again.',
          details: 'Authorization header not found'
        }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create client with service role for backend operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('[Outbound Calling] Supabase URL configured:', !!supabaseUrl);
    console.log('[Outbound Calling] Service role key configured:', !!serviceRoleKey);

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    // Use service role client for all operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract JWT token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Check if this is a service-role call (from call-dispatcher)
    const isServiceRoleCall = token === serviceRoleKey;
    
    // Read body once to avoid double consumption crash
    const body = await req.json();

    let userId: string;

    if (isServiceRoleCall) {
      // Service role call - get userId from request body
      console.log('[Outbound Calling] Service role call detected');
      if (!body.userId) {
        return new Response(
          JSON.stringify({ error: 'userId required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = body.userId;
      console.log('[Outbound Calling] ✓ Service role auth, userId from body:', userId);
    } else {
      // User JWT call - verify the token
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      console.log('[Outbound Calling] Auth verification:', {
        hasUser: !!user,
        userId: user?.id,
        error: authError?.message
      });

      if (authError || !user) {
        console.error('[Outbound Calling] Auth failed:', authError?.message || 'No user');
        return new Response(
          JSON.stringify({
            error: 'Authentication failed: Auth session missing!',
            details: authError?.message || 'Invalid or expired session. Please refresh and try again.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
      console.log('[Outbound Calling] ✓ User verified:', userId);
    }


    const {
      action,
      organizationId: requestedOrganizationId,
      campaignId,
      leadId,
      phoneNumber,
      callerId,
      agentId,
      retellCallId,
      provider: requestedProvider,
      telnyxAssistantId,
      isTestCall,
      skipDncCheck,
      skipCreditCheck,
      queueId,
      dispatchGeneration,
      idempotencyKey,
    }: OutboundCallRequest = body;

    // Determine provider: explicit request > auto-detect from agentId
    const provider = requestedProvider || 'retell';
    console.log(`[Outbound Calling] Processing ${action} request for user: ${userId}, provider: ${provider}`);

    // Health is provider-global and read-only. Every resource read or mutation
    // is bound to one explicit, current organization membership.
    const organizationId = action === 'health_check'
      ? null
      : await authorizeOrganizationContext(supabaseAdmin, userId, requestedOrganizationId);

    // Retell is the only certified launch provider. The canonical Telnyx path
    // remains hard-disabled until its signed callback, terminal queue, billing,
    // and accepted-attempt reconciliation use the same proven contract.
    if (action === 'create_call' && provider !== 'retell') {
      return new Response(JSON.stringify({
        success: false,
        disabled: true,
        error_code: 'PROVIDER_EGRESS_NOT_CERTIFIED',
        error: 'Only Retell outbound calling is enabled in the certified launch profile.',
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Provider-specific setup
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
    const telnyxApiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;

    if (action !== 'health_check' && provider === 'retell' && !retellApiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }
    if (action !== 'health_check' && provider === 'telnyx' && !telnyxApiKey) {
      throw new Error('TELNYX_API_KEY is not configured. Set it in Supabase secrets.');
    }

    const apiKey = retellApiKey; // Keep backward compatible
    const baseUrl = RETELL_V2_API_BASE;
    const retellHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;
    let result: any = {};

    switch (action) {
      case 'create_call': {
        const isTelnyxProvider = provider === 'telnyx';

        if (!phoneNumber || !callerId) {
          return new Response(
            JSON.stringify({
              error: 'Phone number and caller ID are required',
              error_code: 'MISSING_CALLER_ID',
              hint: 'Pass a callerId from your phone_numbers table. For Retell, use a number with retell_phone_id. For Telnyx, use a provider=telnyx number.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!isTelnyxProvider && !agentId) {
          throw new Error('Agent ID is required for Retell calls');
        }
        
        // Validate and normalize phone number
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
          throw new Error(`Invalid phone number format: ${phoneNumber}. Must be 10-15 digits.`);
        }
        
        // Ensure phone number has country code
        const finalPhone = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

        if (!organizationId) throw new Error('Explicit organization context is required for calling');
        let leadTimezone: string | null = null;
        let ownedCampaign: any = null;
        let ownedLead: any = null;

        if (!!campaignId !== !!leadId) {
          throw new Error('Campaign calls require both campaignId and leadId');
        }
        if (campaignId && (!isServiceRoleCall || !queueId || !dispatchGeneration)) {
          throw new Error(
            'Campaign calls require the service dispatcher and an exact atomic queue claim',
          );
        }
        if (campaignId) {
          const { data, error: campaignLookupError } = await supabaseAdmin
            .from('campaigns')
            .select('id, user_id, organization_id, status, provider, agent_id, telnyx_assistant_id, calling_hours_start, calling_hours_end, timezone')
            .eq('id', campaignId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (campaignLookupError) throw new Error(`Campaign safety lookup failed: ${campaignLookupError.message}`);
          if (!data) throw new Error('Campaign not found or does not belong to the authenticated tenant');
          if (data.status !== 'active') throw new Error('Campaign is not active');
          if (![provider, 'both'].includes(data.provider || 'retell')) {
            throw new Error(`Campaign provider ${data.provider} does not match requested provider ${provider}`);
          }
          if (provider === 'retell' && data.agent_id !== agentId) {
            throw new Error('Retell agent does not match the campaign agent');
          }
          if (provider === 'telnyx' && data.telnyx_assistant_id !== telnyxAssistantId) {
            throw new Error('Telnyx assistant does not match the campaign assistant');
          }
          ownedCampaign = data;
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'campaign', ...data }],
          });
        }
        if (leadId) {
          const { data, error: leadLookupError } = await supabaseAdmin
            .from('leads')
            .select('id, user_id, organization_id, timezone, state, phone_number')
            .eq('id', leadId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (leadLookupError) throw new Error(`Lead safety lookup failed: ${leadLookupError.message}`);
          if (!data) throw new Error('Lead not found or does not belong to the authenticated tenant');
          const leadPhones = normalizePhoneVariants(data.phone_number);
          if (!leadPhones.includes(finalPhone)) {
            throw new Error('Requested destination does not match the owned lead');
          }
          ownedLead = data;
          leadTimezone = data.timezone || timezoneForUsState(data.state);
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'lead', ...data }],
          });
        }

        if (ownedCampaign && ownedLead && ownedCampaign.organization_id !== ownedLead.organization_id) {
          throw new Error('Campaign and lead belong to different organizations');
        }

        if (queueId) {
          if (!dispatchGeneration) throw new Error('queueId requires dispatchGeneration');
          if (!campaignId || !leadId) throw new Error('queueId requires campaignId and leadId');
          const { data: ownedQueue, error: queueLookupError } = await supabaseAdmin
            .from('dialing_queues')
            .select('id, campaign_id, lead_id, phone_number, status, dispatch_generation, last_provider_call_id')
            .eq('id', queueId)
            .maybeSingle();
          if (queueLookupError) throw new Error(`Queue safety lookup failed: ${queueLookupError.message}`);
          if (!ownedQueue || ownedQueue.campaign_id !== campaignId || ownedQueue.lead_id !== leadId) {
            throw new Error('Queue does not belong to the requested campaign and lead');
          }
          if (ownedQueue.status !== 'calling') throw new Error('Queue row is not atomically claimed for calling');
          if (ownedQueue.dispatch_generation !== dispatchGeneration || ownedQueue.last_provider_call_id) {
            throw new Error('Queue dispatch generation is stale or already bound to a provider call');
          }
          if (!normalizePhoneVariants(ownedQueue.phone_number).includes(finalPhone)) {
            throw new Error('Queue destination does not match the requested destination');
          }
        } else {
          if (!idempotencyKey || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 512) {
            throw new Error('Non-queue calls require an 8-512 character idempotencyKey');
          }
        }
        if (!queueId && campaignId && leadId) {
          const { data: campaignLead, error: campaignLeadError } = await supabaseAdmin
            .from('campaign_leads')
            .select('id')
            .eq('campaign_id', campaignId)
            .eq('lead_id', leadId)
            .limit(1)
            .maybeSingle();
          if (campaignLeadError) throw new Error(`Campaign/lead relationship lookup failed: ${campaignLeadError.message}`);
          if (!campaignLead) throw new Error('Lead is not enrolled in the requested campaign');
        }

        const callerVariants = normalizePhoneVariants(callerId);
        const { data: ownedCaller, error: callerLookupError } = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, user_id, organization_id, status, provider, retell_phone_id, rotation_enabled, is_spam, quarantine_until')
          .eq('user_id', userId)
          .eq('organization_id', organizationId)
          .in('number', callerVariants)
          .limit(1)
          .maybeSingle();
        if (callerLookupError) throw new Error(`Caller ID ownership lookup failed: ${callerLookupError.message}`);
        if (!ownedCaller || ownedCaller.status !== 'active') {
          throw new Error('Caller ID is not an active phone number owned by the authenticated tenant');
        }
        const canonicalCallerId = String(ownedCaller.number || '').trim();
        if (!/^\+[1-9]\d{7,14}$/.test(canonicalCallerId)) {
          throw new Error('Owned caller ID is not stored in canonical E.164 format');
        }
        if (ownedCaller.rotation_enabled !== true) {
          throw new Error('Caller ID is not enabled for launch-profile rotation');
        }
        if (
          ownedCaller.is_spam === true ||
          (ownedCaller.quarantine_until && new Date(ownedCaller.quarantine_until) > new Date())
        ) {
          throw new Error('Caller ID is spam-flagged or quarantined');
        }
        assertTenantResourceOwnership({
          organizationId,
          userId,
          resources: [{ kind: 'caller ID', ...ownedCaller }],
        });
        if (provider === 'retell' && !ownedCaller.retell_phone_id) {
          throw new Error('Caller ID is not registered for Retell');
        }
        if (provider === 'telnyx' && ownedCaller.provider !== 'telnyx') {
          throw new Error('Caller ID is not a Telnyx number owned by the authenticated tenant');
        }

        if (campaignId) {
          const { data: campaignPool, error: campaignPoolError } = await supabaseAdmin
            .from('campaign_phone_pools')
            .select('phone_number_id, role')
            .eq('campaign_id', campaignId)
            .eq('user_id', userId)
            .in('role', ['outbound', 'caller_id_only']);
          if (campaignPoolError) throw new Error(`Campaign caller-ID policy lookup failed: ${campaignPoolError.message}`);
          if ((campaignPool || []).length > 0 && !campaignPool!.some((row: any) => row.phone_number_id === ownedCaller.id)) {
            throw new Error('Caller ID is not assigned to the requested campaign');
          }
        }

        if (provider === 'retell') {
          const { data: ownedAgent, error: agentLookupError } = await supabaseAdmin
            .from('retell_agents')
            .select('retell_agent_id, user_id, organization_id, status')
            .eq('retell_agent_id', agentId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (agentLookupError) throw new Error(`Retell agent ownership lookup failed: ${agentLookupError.message}`);
          if (!ownedAgent || (ownedAgent.status && ownedAgent.status !== 'active')) {
            throw new Error('Retell agent is not active or is not owned by the authenticated tenant');
          }
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'Retell agent', id: agentId, ...ownedAgent }],
          });
        }

        // Calls outside a campaign are permitted only to another active number
        // owned by this same user. This is the explicit safe test-call policy;
        // client flags never authorize an arbitrary destination.
        if (!campaignId) {
          const destinationVariants = normalizePhoneVariants(finalPhone);
          const { data: ownedDestination, error: destinationLookupError } = await supabaseAdmin
            .from('phone_numbers')
            .select('id, user_id, organization_id')
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .eq('status', 'active')
            .in('number', destinationVariants)
            .limit(1)
            .maybeSingle();
          if (destinationLookupError) throw new Error(`Safe test destination lookup failed: ${destinationLookupError.message}`);
          if (!ownedDestination) {
            throw new Error('Non-campaign calls are restricted to active company-controlled phone numbers');
          }
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'test destination', ...ownedDestination }],
          });
        }

        console.log('[Outbound Calling] Creating call log for user:', userId);
        console.log('[Outbound Calling] Normalized phone:', finalPhone);

        // Use admin client for database operations
        const { data: callLog, error: callLogError } = await supabaseAdmin
          .from('call_logs')
          .insert({
            user_id: userId,
            campaign_id: campaignId,
            lead_id: leadId,
            phone_number: finalPhone, // Use normalized phone
            caller_id: canonicalCallerId,
            status: 'queued',
            provider,
            agent_id: agentId || null,
            provider_reconciliation_queue_id: queueId || null,
            organization_id: organizationId,
          })
          .select()
          .maybeSingle();

        if (callLogError) {
          console.error('[Outbound Calling] Call log error:', callLogError);
          throw callLogError;
        }

        if (!callLog) {
          throw new Error('Call log insert returned no data — possible RLS policy block');
        }

        console.log('[Outbound Calling] Call log created:', callLog.id);

        // ========================================================================
        // CREDIT SYSTEM: Pre-call balance check and reservation
        // Applies to every physical call, including test calls.
        // ========================================================================
        const dispatchLogicalKey = queueId
          ? `queue:${queueId}:${dispatchGeneration}`
          : `request:${userId}:${idempotencyKey!.trim()}`;
        const { data: dispatchClaimRows, error: dispatchClaimError } = await supabaseAdmin
          .rpc('claim_provider_dispatch', {
            p_logical_key: dispatchLogicalKey,
            p_queue_id: queueId || null,
            p_dispatch_generation: dispatchGeneration || null,
            p_call_log_id: callLog.id,
            p_organization_id: organizationId,
            p_user_id: userId,
            p_campaign_id: campaignId || null,
            p_lead_id: leadId || null,
            p_provider: provider,
          });
        if (dispatchClaimError || !dispatchClaimRows?.[0]?.claim_id) {
          throw new Error(`DISPATCH_CLAIM_UNAVAILABLE: ${dispatchClaimError?.message || 'no claim returned'}`);
        }
        const dispatchClaim = dispatchClaimRows[0];
        if (dispatchClaim.claimed !== true) {
          await supabaseAdmin.from('call_logs').update({
            status: 'failed',
            ended_at: new Date().toISOString(),
            notes: `Duplicate physical-call initiation suppressed; dispatch is ${dispatchClaim.claim_status}`,
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
          return new Response(JSON.stringify({
            success: false,
            duplicate_suppressed: true,
            reconciliation_required: ['claimed', 'accepted', 'acceptance_unknown'].includes(dispatchClaim.claim_status),
            error_code: 'DISPATCH_ALREADY_CLAIMED',
            error: 'This logical call attempt was already claimed before provider egress.',
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const dispatchClaimId = dispatchClaim.claim_id as string;
        const finalizeDispatchClaim = async (
          status: 'accepted' | 'definite_failure' | 'acceptance_unknown',
          providerCallId: string | null,
          errorMessage: string | null,
        ) => {
          const result = await supabaseAdmin.rpc('finalize_provider_dispatch', {
            p_claim_id: dispatchClaimId,
            p_user_id: userId,
            p_status: status,
            p_provider_call_id: providerCallId,
            p_last_error: errorMessage,
          });
          if (result.error || result.data !== true) {
            throw new Error(`DISPATCH_FINALIZATION_UNAVAILABLE: ${result.error?.message || 'claim not finalized'}`);
          }
          dispatchClaimFinalized = true;
        };
        finalizeDispatchOnError = finalizeDispatchClaim;

        let creditReserved = false;

        if (isTestCall) {
          console.log('[Outbound Calling] TEST CALL MODE — safety and billing remain enforced');
        }

        const assertContactAllowed = async (boundary: string) => {
          const { data: stopResult, error: stopError } = await supabaseAdmin.rpc('evaluate_contact_stop', {
            p_user_id: userId,
            p_organization_id: organizationId,
            p_campaign_id: campaignId || null,
            p_provider: provider,
            p_channel: 'voice',
          });
          if (stopError || !stopResult?.[0]) {
            throw new Error(`CONTACT_SAFETY_UNAVAILABLE: ${stopError?.message || 'stop evaluation returned no result'}`);
          }
          if (!stopResult[0].allowed) {
            throw new Error(`CONTACT_STOPPED: ${stopResult[0].scope_type}: ${stopResult[0].reason}`);
          }

          if (leadId) {
            const { data: leadSafety, error: leadSafetyError } = await supabaseAdmin
              .from('leads')
              .select('do_not_call')
              .eq('id', leadId)
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .maybeSingle();
            if (leadSafetyError || !leadSafety) {
              throw new Error(`DNC_SAFETY_UNAVAILABLE: ${leadSafetyError?.message || 'lead not found'}`);
            }
            if (leadSafety.do_not_call) throw new Error('DNC_BLOCKED: lead is marked do-not-call');
          }

          // The legacy bypass input is deliberately ignored at the provider
          // boundary. Test calls must use non-DNC company-controlled phones.
          if (skipDncCheck) console.warn('[Outbound Calling] skipDncCheck ignored at provider boundary');
          const normalizedDestination = `+${finalPhone.replace(/\D/g, '')}`;
          const dncQuery = supabaseAdmin.from('dnc_list').select('id')
            .eq('organization_id', organizationId)
            .eq('phone_number_normalized', normalizedDestination)
            .limit(1);
          const { data: dncRows, error: dncError } = await dncQuery;
          if (dncError) throw new Error(`DNC_SAFETY_UNAVAILABLE: ${dncError.message}`);
          if (dncRows && dncRows.length > 0) throw new Error('DNC_BLOCKED: phone is on the do-not-call list');
          console.log(`[Outbound Calling] Contact safety passed at ${boundary}`);
        };

        const cancelReservation = async (reason: string) => {
          if (!creditReserved || !organizationId) return;
          // The canonical finalizer owns reservation release in the live schema.
          // A zero-minute finalization releases the reservation without charging.
          const { data, error } = await supabaseAdmin.rpc('finalize_call_cost', {
            p_organization_id: organizationId,
            p_call_log_id: callLog.id,
            p_retell_call_id: null,
            p_actual_minutes: 0,
            p_retell_cost_cents: 0,
            p_idempotency_key: `cancel_${callLog.id}`,
            p_agent_id: agentId || null,
          });
          if (error || !data?.[0]?.success) {
            console.error('[Outbound Calling] CRITICAL: reservation cancellation failed:', error || data);
          } else {
            console.log(`[Outbound Calling] Credit reservation released: ${reason}`);
            creditReserved = false;
          }
        };

        releaseReservationOnDefiniteFailure = cancelReservation;

        const markProviderReconciliationRequired = async (reason: string) => {
          const { error } = await supabaseAdmin.from('call_logs').update({
            provider_reconciliation_required: true,
            provider_reconciliation_reason: reason,
            provider_reconciliation_marked_at: new Date().toISOString(),
            provider_reconciled_at: null,
            provider_reconciliation_queue_id: queueId || null,
            notes: `Provider create acknowledgement is ambiguous; do not redial automatically. ${reason}`,
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
          if (error) throw new Error(`Failed to persist provider reconciliation quarantine: ${error.message}`);
        };

        const recordAcceptedAttempt = async (providerCallId: string) => {
          const { data, error } = await supabaseAdmin.rpc('record_physical_call_attempt', {
            p_provider: provider,
            p_provider_call_id: providerCallId,
            p_queue_id: queueId || null,
            p_call_log_id: callLog.id,
            p_organization_id: organizationId,
            p_user_id: userId,
            p_campaign_id: campaignId || null,
            p_lead_id: leadId || null,
          });
          if (error) {
            // The call already exists. Do not throw and cause the caller to
            // redial; Retell's callback reconciles this same idempotent record.
            console.error('[Outbound Calling] CRITICAL: accepted-call attempt ledger failed:', error);
            await logError(supabaseAdmin, 'outbound-calling', 'record_physical_call_attempt', userId, error, {
              leadId, campaignId, severity: 'critical', payload: { provider, providerCallId, queueId },
            });
            return false;
          }
          if (data === true) return true;
          const existingAttempt = await supabaseAdmin.from('provider_call_attempts')
            .select('id')
            .eq('provider', provider)
            .eq('provider_call_id', providerCallId)
            .eq('call_log_id', callLog.id)
            .eq('user_id', userId)
            .maybeSingle();
          if (existingAttempt.error) {
            console.error('[Outbound Calling] Existing attempt verification failed:', existingAttempt.error);
            return false;
          }
          return !!existingAttempt.data;
        };

        const assertCallingHoursAllowed = () => {
          // The only no-campaign policy is a company-controlled test destination,
          // validated above. Campaign calls require a configured, valid timezone
          // and window every time the provider boundary is crossed.
          if (!ownedCampaign) return;
          if (!ownedCampaign.calling_hours_start || !ownedCampaign.calling_hours_end) {
            throw new Error('CALLING_HOURS_SAFETY_UNAVAILABLE: campaign calling hours are not configured');
          }
          const timezone = leadTimezone;
          if (!timezone) throw new Error('CALLING_HOURS_SAFETY_UNAVAILABLE: lead-local timezone is not configured or derivable');
          let nowHM: string;
          try {
            nowHM = new Date().toLocaleTimeString('en-GB', {
              timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
            });
          } catch (error) {
            throw new Error(`CALLING_HOURS_SAFETY_UNAVAILABLE: invalid timezone ${timezone}: ${String(error)}`);
          }
          const { start, end } = certifiedOutboundCallingWindow(
            ownedCampaign.calling_hours_start,
            ownedCampaign.calling_hours_end,
          );
          if (nowHM < start || nowHM >= end) {
            throw new Error(`OUTSIDE_CALLING_HOURS: ${nowHM} ${timezone} is outside ${start}-${end}`);
          }
        };

        let campaignContactRelease: CampaignContactReleaseInput | null = null;
        const assertCampaignContactReleased = async () => {
          if (!campaignId) return;
          if (!campaignContactRelease) {
            throw new Error('CAMPAIGN_RELEASE_NOT_AUTHORIZED: release context is not initialized');
          }
          const releaseDecision = await evaluateCampaignContactRelease(
            supabaseAdmin,
            campaignContactRelease,
          );
          if (!releaseDecision.allowed) {
            throw new Error(`CAMPAIGN_RELEASE_NOT_AUTHORIZED: ${releaseDecision.reason_code}`);
          }
        };

        const enforceFinalBoundary = async () => {
          try {
            await assertContactAllowed('final-provider-boundary');
            assertCallingHoursAllowed();
            await assertCampaignContactReleased();
          } catch (safetyError: any) {
            await cancelReservation(`Call blocked at provider boundary: ${safetyError.message}`);
            await supabaseAdmin.from('call_logs').update({
              status: 'failed', ended_at: new Date().toISOString(), notes: safetyError.message,
            }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
            throw safetyError;
          }
        };

        try {
          await assertContactAllowed('preflight');
        } catch (safetyError: any) {
          await supabaseAdmin.from('call_logs').update({
            status: 'failed', ended_at: new Date().toISOString(), notes: safetyError.message,
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
          throw safetyError;
        }

        // ============= CALLING-HOURS SAFETY GUARD =============
        // Last-resort net: if a campaign somehow tries to dial outside its
        // configured calling hours (dispatcher should have already filtered),
        // block it here. Client-controlled test flags never bypass this.
        if (campaignId) {
          try {
            const { data: campaignRow, error: campaignHoursError } = await supabaseAdmin
              .from('campaigns')
              .select('calling_hours_start, calling_hours_end, timezone')
              .eq('id', campaignId)
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .maybeSingle();
            if (campaignHoursError || !campaignRow) {
              throw new Error(campaignHoursError?.message || 'campaign not found');
            }
            const effectiveTimezone = leadTimezone;
            if (!campaignRow.calling_hours_start || !campaignRow.calling_hours_end || !effectiveTimezone) {
              throw new Error('campaign calling hours and lead-local timezone must be configured');
            }
            {
              const tz = effectiveTimezone;
              const nowHM = new Date().toLocaleTimeString('en-GB', {
                timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
              }); // "HH:MM"
              const { start, end } = certifiedOutboundCallingWindow(
                campaignRow.calling_hours_start,
                campaignRow.calling_hours_end,
              );
              if (nowHM < start || nowHM >= end) {
                console.warn(`[Outbound Calling] BLOCKED: ${nowHM} ${tz} outside calling hours ${start}-${end}`);
                await supabaseAdmin.from('call_logs').update({
                  status: 'failed',
                  notes: `Blocked: outside calling hours ${start}-${end} ${tz} (now ${nowHM})`,
                }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
                return new Response(
                  JSON.stringify({
                    success: false,
                    error: 'Outside calling hours',
                    error_code: 'OUTSIDE_CALLING_HOURS',
                    details: { now: nowHM, start, end, timezone: tz },
                  }),
                  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
            }
          } catch (chErr) {
            console.error('[Outbound Calling] Calling-hours guard error:', chErr);
            throw new Error(`CALLING_HOURS_SAFETY_UNAVAILABLE: ${chErr instanceof Error ? chErr.message : String(chErr)}`);
          }
        }

        // Read the authoritative provider state immediately before billing and
        // egress. A UI default or local copy is not a safety boundary: missing,
        // malformed, or >60-minute Retell limits fail closed.
        const liveAgentResponse = await fetchWithTimeout(retellGetAgentUrl(agentId!), {
          method: 'GET',
          headers: retellHeaders,
        }, 10000);
        if (!liveAgentResponse.ok) {
          throw new Error(`RETELL_CALL_DURATION_NOT_CERTIFIED: provider agent lookup failed with ${liveAgentResponse.status}`);
        }
        const liveAgentConfiguration = await liveAgentResponse.json();
        const certifiedMaxCallDurationMs = Number(liveAgentConfiguration?.max_call_duration_ms);
        const billingExposureMinutes = certifiedRetellCallDurationMinutes(
          certifiedMaxCallDurationMs,
        );
        const certifiedAgentVersion = Number(liveAgentConfiguration?.version);
        if (!Number.isSafeInteger(certifiedAgentVersion) || certifiedAgentVersion < 0) {
          throw new Error('RETELL_AGENT_NOT_CERTIFIED: live agent version is invalid');
        }
        const liveLlmId = liveAgentConfiguration?.response_engine?.llm_id;
        if (typeof liveLlmId !== 'string' || !liveLlmId.trim()) {
          throw new Error('RETELL_AGENT_NOT_CERTIFIED: live agent has no Retell LLM');
        }
        const liveLlmVersion = Number(liveAgentConfiguration?.response_engine?.version);
        if (!Number.isSafeInteger(liveLlmVersion) || liveLlmVersion < 0) {
          throw new Error('RETELL_AGENT_NOT_CERTIFIED: live agent LLM version is invalid');
        }
        const liveLlmResponse = await fetchWithTimeout(retellGetLlmUrl(liveLlmId, liveLlmVersion), {
          method: 'GET',
          headers: retellHeaders,
        }, 10000);
        if (!liveLlmResponse.ok) {
          throw new Error(`RETELL_AGENT_NOT_CERTIFIED: provider LLM lookup failed with ${liveLlmResponse.status}`);
        }
        const liveLlmConfiguration = await liveLlmResponse.json();
        assertRetellLaunchAgentConfiguration({
          agent: liveAgentConfiguration,
          llm: liveLlmConfiguration,
          expectedWebhookUrl: `${supabaseUrl}/functions/v1/retell-call-webhook`,
        });

        // This is deliberately evaluated both before a credit hold and again
        // at the last provider boundary. A campaign call has no release row by
        // default, and a changed/revoked/expired cohort cannot spend or dial.
        if (campaignId) {
          if (!leadId) {
            throw new Error('CAMPAIGN_RELEASE_NOT_AUTHORIZED: campaign lead is required');
          }
          campaignContactRelease = {
            user_id: userId,
            organization_id: organizationId,
            campaign_id: campaignId,
            lead_id: leadId,
            provider: 'retell',
            retell_agent_id: agentId!,
            retell_agent_version: certifiedAgentVersion,
            retell_llm_id: liveLlmId,
            retell_llm_version: liveLlmVersion,
            caller_number_id: ownedCaller.id,
          };
          await assertCampaignContactReleased();
        }

        if (skipCreditCheck) console.warn('[Outbound Calling] skipCreditCheck ignored; all physical calls require billing checks');
        {
        try {
          if (organizationId) {
            // Check balance for the entire certified maximum call exposure.
            const { data: balanceCheck, error: balanceError } = await supabaseAdmin
              .rpc('check_credit_balance', {
                p_organization_id: organizationId,
                p_minutes_needed: billingExposureMinutes
              });

            if (balanceError || !balanceCheck?.[0]) {
              throw new Error(`Credit balance check failed: ${balanceError?.message || 'no balance result'}`);
            }
            const check = balanceCheck[0];

              // If billing is enabled, verify credits
              if (check.billing_enabled) {
                // Look up agent-specific pricing first
                let costPerMinuteCents = check.cost_per_minute_cents || 15;

                let agentPricing: { customer_price_per_min_cents?: number } | null = null;
                if (agentId) {
                  const { data, error: pricingError } = await supabaseAdmin
                    .from('agent_pricing')
                    .select('customer_price_per_min_cents')
                    .eq('organization_id', organizationId)
                    .eq('retell_agent_id', agentId)
                    .eq('is_active', true)
                    .maybeSingle();
                  if (pricingError) throw new Error(`Agent pricing lookup failed: ${pricingError.message}`);
                  agentPricing = data;
                }

                if (agentPricing?.customer_price_per_min_cents) {
                  costPerMinuteCents = Math.round(agentPricing.customer_price_per_min_cents);
                  console.log(`[Outbound Calling] Using agent-specific pricing: ${costPerMinuteCents}c/min for agent ${agentId}`);
                } else {
                  console.log(`[Outbound Calling] Using default org pricing: ${costPerMinuteCents}c/min`);
                }

                const maximumCallExposureCents = costPerMinuteCents * billingExposureMinutes;
                console.log(`[Outbound Calling] Credit check: balance=${check.available_balance_cents}c, required=${maximumCallExposureCents}c`);

                // Check if balance covers the maximum certified call exposure.
                if (check.available_balance_cents < maximumCallExposureCents) {
                  // Insufficient credits - fail the call
                  await supabaseAdmin
                    .from('call_logs')
                    .update({
                      status: 'failed',
                      ended_at: new Date().toISOString(),
                      notes: `Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}`
                    })
                    .eq('id', callLog.id)
                    .eq('user_id', userId)
                    .eq('organization_id', organizationId);

                  throw new Error(`Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}. Please add credits to continue making calls.`);
                }

                // Reserve the full certified exposure using the agent-specific rate.
                const { data: reservation, error: reserveError } = await supabaseAdmin
                  .rpc('reserve_credits', {
                    p_organization_id: organizationId,
                    p_amount_cents: maximumCallExposureCents,
                    p_call_log_id: callLog.id,
                    p_retell_call_id: null, // Will be updated after Retell responds
                    p_idempotency_key: `reserve:${callLog.id}`,
                    p_customer_rate_cents: costPerMinuteCents,
                    p_agent_id: agentId || null,
                  });

                if (!reserveError && reservation?.[0]?.success) {
                  creditReserved = true;
                  console.log(`[Outbound Calling] Reserved ${maximumCallExposureCents}c. Remaining: ${reservation[0].available_balance_cents}c`);
                } else {
                  throw new Error(`Credit reservation failed: ${reserveError?.message || reservation?.[0]?.error_message || 'no reservation result'}`);
                }
              }

            // Store organization_id in call log for webhook processing
            const { error: orgLogError } = await supabaseAdmin
              .from('call_logs')
              .update({ organization_id: organizationId })
              .eq('id', callLog.id)
              .eq('user_id', userId)
              .eq('organization_id', organizationId);
            if (orgLogError) throw new Error(`Failed to persist call tenant: ${orgLogError.message}`);
          }
        } catch (creditError: any) {
          console.error('[Outbound Calling] Credit safety failed closed:', creditError);
          await supabaseAdmin.from('call_logs').update({
            status: 'failed', ended_at: new Date().toISOString(),
            notes: `Credit safety blocked call: ${creditError.message || String(creditError)}`,
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
          throw creditError;
        }
        }
        // ========================================================================

        // ========================================================================
        // PROVIDER ROUTING: Telnyx AI vs Retell AI
        // ========================================================================
        if (provider === 'telnyx') {
          // ---- TELNYX AI CALL PATH ----
          console.log('[Outbound Calling] Using TELNYX provider');

          if (!telnyxAssistantId) {
            throw new Error('telnyxAssistantId is required for Telnyx calls');
          }

          // Get Telnyx assistant details
          const { data: telnyxAssistant, error: telnyxAssistantError } = await supabaseAdmin
            .from('telnyx_assistants')
            .select('telnyx_assistant_id, telnyx_texml_app_id, name')
            .eq('id', telnyxAssistantId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();

          if (telnyxAssistantError) {
            throw new Error(`Failed to load Telnyx assistant: ${telnyxAssistantError.message}`);
          }

          if (!telnyxAssistant?.telnyx_assistant_id) {
            await supabaseAdmin.from('call_logs').update({
              status: 'failed', ended_at: new Date().toISOString(),
              notes: 'Telnyx assistant not found or not synced to Telnyx API',
            }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
            throw new Error('Telnyx assistant not found. Create one in the Telnyx AI Manager.');
          }

          // Update call log with provider info
          await supabaseAdmin.from('call_logs').update({
            provider: 'telnyx',
            telnyx_assistant_id: telnyxAssistant.telnyx_assistant_id,
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);

          // TeXML app ID is optional now — we fall back to direct assistant calls if missing or invalid
          const hasTexmlApp = !!telnyxAssistant.telnyx_texml_app_id;
          if (!hasTexmlApp) {
            console.log('[Outbound Calling] No TeXML app ID — will use direct AI Assistant Calls endpoint');
          }

          let dynamicVariables: Record<string, unknown> = {};
          let resolvedLeadId = leadId;
          let lead = null;

          if (leadId) {
            const { data: leadById } = await supabaseAdmin
              .from('leads')
              .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
              .eq('id', leadId)
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .maybeSingle();
            lead = leadById;
          }

          if (!lead && finalPhone) {
            const phoneDigits = finalPhone.replace(/\D/g, '');
            const { data: leadByPhone } = await supabaseAdmin
              .from('leads')
              .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .or(`phone_number.eq.${finalPhone},phone_number.eq.${phoneDigits},phone_number.ilike.%${phoneDigits.slice(-10)}%`)
              .limit(1)
              .maybeSingle();

            if (leadByPhone) {
              lead = leadByPhone;
              resolvedLeadId = leadByPhone.id;
            }
          }

          if (lead) {
            const customFields = (lead.custom_fields && typeof lead.custom_fields === 'object')
              ? (lead.custom_fields as Record<string, unknown>)
              : {};
            const firstName = String(lead.first_name || customFields.first_name || customFields.firstname || customFields.contact_first_name || '').trim();
            const lastName = String(lead.last_name || customFields.last_name || customFields.lastname || customFields.contact_last_name || '').trim();
            const fallbackFullName = String(customFields.full_name || customFields.name || '').trim();
            const fullName = [firstName, lastName].filter(Boolean).join(' ') || fallbackFullName || 'there';
            const email = String(lead.email || customFields.email || '').trim();
            const phone = String(lead.phone_number || finalPhone || '').trim();
            const company = String(lead.company || customFields.company || '').trim();
            const leadSource = String(lead.lead_source || customFields.lead_source || customFields.source || '').trim();
            const notes = String(lead.notes || customFields.notes || '').trim();
            const tags = Array.isArray(lead.tags) ? lead.tags.join(', ') : '';
            const preferredContactTime = String(lead.preferred_contact_time || customFields.preferred_contact_time || '').trim();
            const timezone = String(lead.timezone || customFields.timezone || 'America/New_York').trim() || 'America/New_York';
            const address = String(lead.address || customFields.address || customFields.street_address || customFields.street || '').trim();
            const city = String(lead.city || customFields.city || '').trim();
            const state = String(lead.state || customFields.state || '').trim();
            const zipCode = String(lead.zip_code || customFields.zip_code || customFields.zip || customFields.postal_code || '').trim();
            const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
            const currentTimeFormatted = new Date().toLocaleString('en-US', {
              timeZone: timezone,
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            });

            dynamicVariables = {
              // CRITICAL: lead_id required by update_lead_info tool webhook ({{lead_id}} substitution)
              lead_id: lead.id,
              current_time: currentTimeFormatted,
              current_time_iso: new Date().toISOString(),
              current_timezone: timezone,
              first_name: firstName,
              last_name: lastName,
              full_name: fullName,
              name: fullName,
              email,
              phone,
              phone_number: phone,
              company,
              lead_source: leadSource,
              notes,
              tags,
              preferred_contact_time: preferredContactTime,
              timezone,
              address,
              city,
              state,
              zip_code: zipCode,
              full_address: fullAddress,
              'contact.first_name': firstName,
              'contact.last_name': lastName,
              'contact.full_name': fullName,
              'contact.email': email,
              'contact.phone': phone,
              'contact.company': company,
              'contact.lead_source': leadSource,
              'contact.notes': notes,
              'contact.tags': tags,
              'contact.timezone': timezone,
            };

            if (lead.custom_fields && typeof lead.custom_fields === 'object') {
              for (const [rawKey, rawVal] of Object.entries(lead.custom_fields as Record<string, unknown>)) {
                const key = String(rawKey || '').trim();
                if (!key) continue;

                const value =
                  rawVal === null || rawVal === undefined
                    ? ''
                    : typeof rawVal === 'string'
                      ? rawVal
                      : (typeof rawVal === 'number' || typeof rawVal === 'boolean')
                        ? String(rawVal)
                        : JSON.stringify(rawVal);

                dynamicVariables[key] = value;
                dynamicVariables[`contact.${key}`] = value;
              }
            }

            const isCallback = lead.next_callback_at && new Date(lead.next_callback_at) <= new Date(Date.now() + 5 * 60 * 1000);
            if (isCallback) {
              const { data: lastCall } = await supabaseAdmin
                .from('call_logs')
                .select('notes, ended_at, outcome')
                .eq('lead_id', resolvedLeadId)
                .eq('user_id', userId)
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              const lastCallDate = lastCall?.ended_at
                ? new Date(lastCall.ended_at).toLocaleString('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })
                : 'recently';
              const previousConversation = String(lastCall?.notes || '');
              const conversationSummary = previousConversation.length > 500
                ? `${previousConversation.substring(0, 500)}...`
                : previousConversation;

              dynamicVariables['is_callback'] = 'true';
              dynamicVariables['callback_context'] = 'This is a callback - the customer previously requested we call them back.';
              dynamicVariables['last_call_date'] = lastCallDate;
              dynamicVariables['previous_conversation'] = conversationSummary;
              dynamicVariables['previous_outcome'] = String(lastCall?.outcome || 'callback_requested');
              dynamicVariables['contact.is_callback'] = 'true';
            } else {
              dynamicVariables['is_callback'] = 'false';
              dynamicVariables['contact.is_callback'] = 'false';
            }
          }

          const telnyxCallPayload: Record<string, unknown> = {
            From: canonicalCallerId,
            To: finalPhone,
            AIAssistantId: telnyxAssistant.telnyx_assistant_id,
          };

          const sanitizedDynamicVariables = sanitizeTelnyxDynamicVariables(dynamicVariables, 'Outbound Calling');

          if (Object.keys(sanitizedDynamicVariables).length > 0) {
            telnyxCallPayload.AIAssistantDynamicVariables = sanitizedDynamicVariables;
          }

          let telnyxCallData: any;
          let usedTexml = false;

          // --- PRIMARY: Direct AI Assistant Calls endpoint (what your agents use natively) ---
          console.log('[Outbound Calling] Using direct AI Assistant Calls endpoint (primary): POST /v2/ai/assistants/{id}/calls');

          const directPayload: Record<string, unknown> = {
            assistant_id: telnyxAssistant.telnyx_assistant_id,
            from: canonicalCallerId,
            to: finalPhone,
          };

          if (Object.keys(sanitizedDynamicVariables).length > 0) {
            directPayload.dynamic_variables = sanitizedDynamicVariables;
          }

          await enforceFinalBoundary();
          providerCreateState = 'in_flight';
          const directRes = await fetch(`https://api.telnyx.com/v2/ai/assistants/${telnyxAssistant.telnyx_assistant_id}/calls`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${telnyxApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(directPayload),
          });

          if (directRes.ok) {
            providerCreateState = 'accepted';
            telnyxCallData = await directRes.json();
          } else {
            const errText = await directRes.text();
            console.warn(`[Outbound Calling] Direct assistant calls failed (${directRes.status}): ${errText}`);

            if (directRes.status >= 500) {
              providerCreateState = 'ambiguous';
              const reason = `Telnyx direct create returned ${directRes.status}: ${errText}`;
              await finalizeDispatchClaim('acceptance_unknown', null, reason);
              await markProviderReconciliationRequired(reason);
              return new Response(JSON.stringify({
                success: false,
                reconciliation_required: true,
                error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
                error: 'Telnyx acknowledgement is ambiguous; the call is quarantined',
                call_log_id: callLog.id,
                queue_id: queueId || null,
              }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            providerCreateState = 'definite_failure';

            // --- FALLBACK: TeXML AI Calls endpoint (only if TeXML app ID exists) ---
            if (hasTexmlApp) {
              console.log('[Outbound Calling] Falling back to TeXML AI Calls endpoint...');
              await enforceFinalBoundary();
              providerCreateState = 'in_flight';
              const telnyxRes = await fetch(`https://api.telnyx.com/v2/texml/ai_calls/${telnyxAssistant.telnyx_texml_app_id}`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${telnyxApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(telnyxCallPayload),
              });

              if (telnyxRes.ok) {
                providerCreateState = 'accepted';
                telnyxCallData = await telnyxRes.json();
                usedTexml = true;
              } else {
                const texmlErr = await telnyxRes.text();
                console.error(`[Outbound Calling] TeXML fallback also failed (${telnyxRes.status}): ${texmlErr}`);
                if (telnyxRes.status >= 500) {
                  providerCreateState = 'ambiguous';
                  const reason = `Telnyx TeXML create returned ${telnyxRes.status}: ${texmlErr}`;
                  await finalizeDispatchClaim('acceptance_unknown', null, reason);
                  await markProviderReconciliationRequired(reason);
                  return new Response(JSON.stringify({
                    success: false,
                    reconciliation_required: true,
                    error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
                    error: 'Telnyx acknowledgement is ambiguous; the call is quarantined',
                    call_log_id: callLog.id,
                    queue_id: queueId || null,
                  }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                providerCreateState = 'definite_failure';
              }
            }

            // If both failed, log and throw
            if (!telnyxCallData) {
              await finalizeDispatchClaim('definite_failure', null, `Telnyx API error: ${errText}`);
              await supabaseAdmin.from('call_logs').update({
                status: 'failed', ended_at: new Date().toISOString(),
                notes: `Telnyx API error: ${errText}`,
              }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);
              throw new Error(`Telnyx API error: ${errText}`);
            }
          }

          const tCallData = telnyxCallData.data;
          const telnyxProviderCallId = tCallData.call_control_id || tCallData.call_sid || tCallData.sid;

          if (!telnyxProviderCallId) {
            providerCreateState = 'ambiguous';
            const reason = 'Telnyx accepted response had no provider call ID';
            await finalizeDispatchClaim('acceptance_unknown', null, reason);
            await markProviderReconciliationRequired(reason);
            return new Response(JSON.stringify({
              success: false,
              reconciliation_required: true,
              error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
              error: 'Telnyx accepted the request without a provider call ID; the call is quarantined',
              call_log_id: callLog.id,
              queue_id: queueId || null,
            }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          console.log(`[Outbound Calling] Telnyx call initiated${usedTexml ? ' (via TeXML fallback)' : ' (via direct assistant calls)'}: ${telnyxProviderCallId}`);
          await finalizeDispatchClaim('accepted', telnyxProviderCallId, null);

          // Update call log with Telnyx IDs
          await supabaseAdmin.from('call_logs').update({
            lead_id: resolvedLeadId || callLog.lead_id,
            telnyx_call_control_id: tCallData.call_control_id || null,
            telnyx_call_session_id: tCallData.call_session_id || null,
            status: 'ringing',
          }).eq('id', callLog.id).eq('user_id', userId).eq('organization_id', organizationId);

          const attemptRecorded = await recordAcceptedAttempt(telnyxProviderCallId);
          if (!attemptRecorded) {
            await markProviderReconciliationRequired(`Telnyx accepted call ${telnyxProviderCallId}, but the physical-attempt ledger did not bind the queue`);
            return new Response(JSON.stringify({
              success: false,
              reconciliation_required: true,
              error_code: 'ATTEMPT_LEDGER_RECONCILIATION_REQUIRED',
              error: 'Telnyx accepted the call, but queue reconciliation is incomplete',
              provider_call_id: telnyxProviderCallId,
              call_log_id: callLog.id,
              queue_id: queueId || null,
            }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }

          result = {
            call_id: telnyxProviderCallId,
            call_log_id: callLog.id,
            status: 'created',
            provider: 'telnyx',
            attempt_recorded: attemptRecorded,
            assistant_name: telnyxAssistant.name,
            used_fallback: usedTexml,
          };
          break;
        }

        // ---- RETELL AI CALL PATH (existing, unchanged) ----
        // Create outbound call via Retell AI
        console.log('[Outbound Calling] Initiating Retell AI call:', {
          from: canonicalCallerId,
          to: finalPhone, // Use normalized phone
          agent: agentId
        });

        // First, check that the owned caller ID exists in Retell. Agent
        // selection is passed atomically on create-phone-call below; never
        // mutate shared phone-number configuration per call.
        console.log('[Outbound Calling] Checking phone number in Retell:', canonicalCallerId);
        
        // Try to get the phone number first to see if it exists in Retell
        const getPhoneResponse = await fetchWithTimeout(`https://api.retellai.com/get-phone-number/${encodeURIComponent(canonicalCallerId)}`, {
          method: 'GET',
          headers: retellHeaders,
        }, 15000);
        
        if (!getPhoneResponse.ok) {
          const getError = await getPhoneResponse.text();
          console.error('[Outbound Calling] Phone number not found in Retell:', getError);
          
          // Check if it's a 404 - number not in Retell
          if (getPhoneResponse.status === 404) {
            // Update call log with clear error
            await supabaseAdmin
              .from('call_logs')
              .update({
                status: 'failed',
                ended_at: new Date().toISOString(),
                notes: `Phone number ${canonicalCallerId} is not imported in Retell AI. Please import this number in your Retell dashboard or use a number that has been imported.`,
              })
              .eq('id', callLog.id)
              .eq('user_id', userId)
              .eq('organization_id', organizationId);
            
            throw new Error(`Phone number ${canonicalCallerId} is not registered in Retell AI. To use this number for AI calls, you must first import it in the Retell dashboard (Phone Numbers section). Alternatively, use a different number that is already in Retell.`);
          }

          throw new Error(
            `Retell caller-ID verification failed with ${getPhoneResponse.status}; no call was attempted`,
          );
        }

        // Fetch lead data for dynamic variables - try leadId first, then phone number lookup
        let dynamicVariables: Record<string, string> = {};
        let resolvedLeadId = leadId;
        
        // Try to find lead by ID first, or by phone number if no leadId provided
        let lead = null;
        if (leadId) {
          const { data: leadById } = await supabaseAdmin
            .from('leads')
            .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
            .eq('id', leadId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          lead = leadById;
        }
        
        // If no lead found by ID, try phone number lookup
        if (!lead && finalPhone) {
          const phoneDigits = finalPhone.replace(/\D/g, '');
          console.log('[Outbound Calling] No leadId provided, looking up by phone:', phoneDigits);
          
          const { data: leadByPhone } = await supabaseAdmin
            .from('leads')
            .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, next_callback_at')
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .or(`phone_number.eq.${finalPhone},phone_number.eq.${phoneDigits},phone_number.ilike.%${phoneDigits.slice(-10)}%`)
            .limit(1)
            .maybeSingle();
          
          if (leadByPhone) {
            lead = leadByPhone;
            resolvedLeadId = leadByPhone.id;
            console.log('[Outbound Calling] Found lead by phone number:', lead.first_name, lead.last_name, lead.id);
          }
        }
        
        if (lead) {
            const customFields = (lead.custom_fields && typeof lead.custom_fields === 'object')
              ? (lead.custom_fields as Record<string, unknown>)
              : {};
            const firstName = String(lead.first_name || customFields.first_name || customFields.firstname || customFields.contact_first_name || '').trim();
            const lastName = String(lead.last_name || customFields.last_name || customFields.lastname || customFields.contact_last_name || '').trim();
            const fallbackFullName = String(customFields.full_name || customFields.name || '').trim();
            const fullName = [firstName, lastName].filter(Boolean).join(' ') || fallbackFullName || 'there';
            const email = String(lead.email || customFields.email || '').trim();
            const phone = String(lead.phone_number || finalPhone || '').trim();
            const company = String(lead.company || customFields.company || '').trim();
            const leadSource = String(lead.lead_source || customFields.lead_source || customFields.source || '').trim();
            const notes = String(lead.notes || customFields.notes || '').trim();
          const tags = Array.isArray(lead.tags) ? lead.tags.join(', ') : '';
            const preferredContactTime = String(lead.preferred_contact_time || customFields.preferred_contact_time || '').trim();
            const timezone = String(lead.timezone || customFields.timezone || 'America/New_York').trim() || 'America/New_York';
          
          // Address fields
            const address = String(lead.address || customFields.address || customFields.street_address || customFields.street || '').trim();
            const city = String(lead.city || customFields.city || '').trim();
            const state = String(lead.state || customFields.state || '').trim();
            const zipCode = String(lead.zip_code || customFields.zip_code || customFields.zip || customFields.postal_code || '').trim();
          const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
            const contactPayload = {
              first_name: firstName,
              firstName,
              last_name: lastName,
              lastName,
              full_name: fullName,
              fullName,
              name: fullName,
              email,
              phone,
              phoneNumber: phone,
              phone_number: phone,
              company,
              companyName: company,
              source: leadSource,
              leadSource,
              lead_source: leadSource,
              timezone,
              notes,
              tags,
              address,
              city,
              state,
              zip_code: zipCode,
              zipCode,
              zip: zipCode,
              full_address: fullAddress,
              fullAddress,
            };

          // Generate current time in user's timezone for agent awareness
          const currentTimeFormatted = new Date().toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });
          const currentTimeIso = new Date().toISOString();
          const currentDateYmd = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
          const currentDayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });

          dynamicVariables = {
            // CRITICAL: lead_id required by update_lead_info tool webhook ({{lead_id}} substitution)
            lead_id: lead.id,
            // CRITICAL: Current time variables so agent always knows the date/time
            current_time: currentTimeFormatted,
            current_time_iso: currentTimeIso,
            current_timezone: timezone,
            current_date_ymd: currentDateYmd,
            current_day_of_week: currentDayOfWeek,

            // Standard variables
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            name: fullName,
            email: email,
            phone: phone,
            phone_number: phone,
            company: company,
            lead_source: leadSource,
            notes: notes,
            tags: tags,
            preferred_contact_time: preferredContactTime,
            timezone: timezone,
            
            // Address variables
            address: address,
            city: city,
            state: state,
            zip_code: zipCode,
            zipCode: zipCode,
            zip: zipCode,
            full_address: fullAddress,
            fullAddress: fullAddress,
            contact: JSON.stringify(contactPayload),

            // GoHighLevel-style contact.* variables
            'contact.first_name': firstName,
            'contact.firstName': firstName,
            'contact.last_name': lastName,
            'contact.lastName': lastName,
            'contact.full_name': fullName,
            'contact.fullName': fullName,
            'contact.name': fullName,
            'contact.email': email,
            'contact.phone': phone,
            'contact.phoneNumber': phone,
            'contact.phone_number': phone,
            'contact.company': company,
            'contact.companyName': company,
            'contact.source': leadSource,
            'contact.leadSource': leadSource,
            'contact.lead_source': leadSource,
            'contact.timezone': timezone,
            'contact.notes': notes,
            'contact.tags': tags,
            'contact.address': address,
            'contact.city': city,
            'contact.state': state,
            'contact.zip_code': zipCode,
            'contact.zipCode': zipCode,
            'contact.zip': zipCode,
            'contact.full_address': fullAddress,
            'contact.fullAddress': fullAddress,
          };

          // CALLBACK CONTEXT INJECTION
          // Check if this is a callback (lead has next_callback_at within 5 minutes of now)
          const isCallback = lead.next_callback_at && 
            new Date(lead.next_callback_at) <= new Date(Date.now() + 5 * 60 * 1000);
          
          if (isCallback) {
            console.log('[Outbound Calling] This is a CALLBACK - injecting context');
            
            // Fetch last call transcript from call_logs
            const { data: lastCall } = await supabaseAdmin
              .from('call_logs')
              .select('notes, ended_at, outcome')
              .eq('lead_id', resolvedLeadId)
              .eq('user_id', userId)
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            const lastCallDate = lastCall?.ended_at 
              ? new Date(lastCall.ended_at).toLocaleString('en-US', { 
                  timeZone: timezone,
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })
              : 'recently';
            
            // Extract key points from previous transcript (limit to 500 chars for context)
            const previousConversation = lastCall?.notes || '';
            const conversationSummary = previousConversation.length > 500 
              ? previousConversation.substring(0, 500) + '...'
              : previousConversation;
            
            // Add callback-specific variables
            dynamicVariables['is_callback'] = 'true';
            dynamicVariables['callback_context'] = 'This is a callback - the customer previously requested we call them back.';
            dynamicVariables['last_call_date'] = lastCallDate;
            dynamicVariables['previous_conversation'] = conversationSummary;
            dynamicVariables['previous_outcome'] = lastCall?.outcome || 'callback_requested';
            
            // GoHighLevel-style prefixes for callback
            dynamicVariables['contact.is_callback'] = 'true';
            dynamicVariables['contact.last_call_date'] = lastCallDate;
            dynamicVariables['contact.previous_conversation'] = conversationSummary;
            dynamicVariables['contact.previous_outcome'] = lastCall?.outcome || 'callback_requested';
            
            console.log('[Outbound Calling] Callback context injected:', {
              is_callback: true,
              last_call_date: lastCallDate,
              previous_outcome: lastCall?.outcome,
              conversation_length: conversationSummary.length
            });
          } else {
            dynamicVariables['is_callback'] = 'false';
            dynamicVariables['callback_context'] = '';
            dynamicVariables['previous_conversation'] = '';
            dynamicVariables['contact.is_callback'] = 'false';
          }

          // Include lead custom_fields as additional variables
          if (lead.custom_fields && typeof lead.custom_fields === 'object') {
            for (const [rawKey, rawVal] of Object.entries(lead.custom_fields as Record<string, unknown>)) {
              const key = String(rawKey || '').trim();
              if (!key) continue;

              const value =
                rawVal === null || rawVal === undefined
                  ? ''
                  : typeof rawVal === 'string'
                    ? rawVal
                    : (typeof rawVal === 'number' || typeof rawVal === 'boolean')
                      ? String(rawVal)
                      : JSON.stringify(rawVal);

              const snakeKey = key
                .replace(/[^\w]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .toLowerCase();

              dynamicVariables[key] = value;
              if (snakeKey) dynamicVariables[snakeKey] = value;

              dynamicVariables[`contact.${key}`] = value;
              if (snakeKey) {
                dynamicVariables[`contact.${snakeKey}`] = value;
              }
            }
          }

          console.log('[Outbound Calling] Dynamic variable candidates prepared:', Object.keys(dynamicVariables).length);
        } else {
          console.log('[Outbound Calling] No lead found, using empty dynamic variables');
        }

        // Phase 7: A/B variant selection - inject variant prompt into dynamic variables
        let selectedVariantId: string | null = null;
        if (isScriptExperimentCertified()) {
          try {
            const { data: variant } = await supabaseAdmin.rpc('select_script_variant', {
              p_user_id: userId,
              p_agent_id: agentId,
            });
            if (variant && variant.length > 0) {
              const v = variant[0];
              selectedVariantId = v.variant_id;
              if (v.general_prompt) {
                dynamicVariables['script_variant'] = v.variant_name;
                dynamicVariables['variant_prompt_override'] = v.general_prompt;
              }
              if (v.begin_message) {
                dynamicVariables['variant_begin_message'] = v.begin_message;
              }
              console.log(`[Outbound Calling] A/B variant selected: ${v.variant_name} (${selectedVariantId})`);
              await supabaseAdmin.from('call_variant_assignments').insert({
                call_id: callLog.id,
                variant_id: selectedVariantId,
                agent_id: agentId,
              });
            }
          } catch (variantError: any) {
            console.error('[Outbound Calling] A/B variant selection error (continuing):', variantError.message);
          }
        }

        // ===== DIAGNOSTIC: Fetch and log the agent's live LLM tool config =====
        if (isProviderDiagnosticLoggingCertified()) try {
          console.log('[Outbound Calling] Fetching agent LLM config for diagnostic audit...');
          const agentConfigRes = await fetchWithTimeout(retellGetAgentUrl(agentId!), {
            method: 'GET',
            headers: retellHeaders,
          }, 10000);
          if (agentConfigRes.ok) {
            const agentConfig = await agentConfigRes.json();
            const llmId = agentConfig?.response_engine?.llm_id || agentConfig?.llm_id || 'unknown';
            console.log(`[Outbound Calling] Agent LLM ID: ${llmId}`);

            // Fetch the LLM to inspect tools
            if (llmId && llmId !== 'unknown') {
              const llmRes = await fetchWithTimeout(retellGetLlmUrl(llmId), {
                method: 'GET',
                headers: retellHeaders,
              }, 10000);
              if (llmRes.ok) {
                const llmConfig = await llmRes.json();
                const tools = llmConfig?.tool_functions || llmConfig?.tools || [];
                console.log(`[Outbound Calling] Agent has ${tools.length} tools configured`);
                for (const tool of tools) {
                  const toolName = tool?.name || tool?.type || 'unnamed';
                  if (tool?.type === 'transfer_call' || tool?.type === 'warm_transfer' || toolName.toLowerCase().includes('transfer')) {
                    // Retell stores show_transferee_as_caller nested under transfer_option
                    const showTransfereeAsCaller =
                      tool?.transfer_option?.show_transferee_as_caller ??
                      tool?.show_transferee_as_caller ??
                      'NOT SET';
                    const transferNumber =
                      tool?.transfer_destination?.number ||
                      tool?.transfer_option?.number ||
                      tool?.number ||
                      'N/A';
                    console.log(`[Outbound Calling] TRANSFER TOOL: "${toolName}" | show_transferee_as_caller=${showTransfereeAsCaller} | number=${transferNumber} | transfer_option=${JSON.stringify(tool?.transfer_option || {})}`);
                  }
                  if (tool?.type === 'webhook' || tool?.type === 'custom') {
                    const url = tool?.url || tool?.webhook_url || '';
                    console.log(`[Outbound Calling] WEBHOOK TOOL: "${toolName}" | url=${url || 'EMPTY'}`);
                  }
                }
              } else {
                console.warn('[Outbound Calling] Could not fetch LLM config:', await llmRes.text());
              }
            }
          } else {
            console.warn('[Outbound Calling] Could not fetch agent config:', await agentConfigRes.text());
          }
        } catch (diagErr: any) {
          console.warn('[Outbound Calling] Diagnostic audit failed (non-blocking):', diagErr.message);
        }

        const approvedDynamicVariables = launchRetellDynamicVariables(dynamicVariables);
        console.log('[Outbound Calling] Launch-approved dynamic variables:', Object.keys(approvedDynamicVariables));

        try {
          response = await retryWithBackoff(
            async () => {
              await enforceFinalBoundary();
              providerCreateState = 'in_flight';
              // Use fetchWithTimeout to prevent hanging requests (30 second timeout)
              const res = await fetchWithTimeout(`${baseUrl}/create-phone-call`, {
                method: 'POST',
                headers: retellHeaders,
                body: JSON.stringify(buildRetellCreatePhoneCallPayload({
                  fromNumber: canonicalCallerId,
                  toNumber: finalPhone,
                  agentId: agentId!,
                  agentVersion: certifiedAgentVersion,
                  maxCallDurationMs: certifiedMaxCallDurationMs,
                  webhookUrl: `${supabaseUrl}/functions/v1/retell-call-webhook`,
                  dynamicVariables: approvedDynamicVariables,
                  metadata: {
                    campaign_id: campaignId,
                    lead_id: leadId,
                    call_log_id: callLog.id,
                    user_id: userId,
                    organization_id: organizationId, // For credit deduction in webhook
                    variant_id: selectedVariantId, // For A/B tracking in webhook
                    queue_id: queueId || null,
                    dispatch_generation: dispatchGeneration || null,
                    dispatch_claim_id: dispatchClaimId,
                    reconciliation_contract_version: 1,
                  }
                })),
              }, 30000);

              if (!res.ok) {
                const errorText = await res.text();

                // A 5xx can be emitted after Retell accepted the request. There
                // is no safe retry/cancel decision until a signed callback or a
                // provider lookup reconciles the call.
                if (res.status >= 500) {
                  throw new AmbiguousProviderCreateError(`Retell API ${res.status}: ${errorText}`);
                }
                providerCreateState = 'definite_failure';
                
                // Check for rate limit / concurrency errors from Retell
                if (res.status === 429 || errorText.includes('concurrency') || errorText.includes('rate limit')) {
                  console.warn('[Outbound Calling] Retell rate limit hit - concurrency exceeded');
                  throw new Error(`RATE_LIMIT: Retell concurrency limit exceeded. Status ${res.status}`);
                }
                
                throw new Error(`Retell API error ${res.status}: ${errorText}`);
              }

              providerCreateState = 'accepted';
              return res;
            },
            'Retell create-phone-call',
            1,  // Never retry an ambiguous create request; it may already be a physical call
            2000 // 2 second base delay
          );
        } catch (err: any) {
          const message = err?.message ? String(err.message) : String(err);
          console.error('[Outbound Calling] Retell create-phone-call failed:', message);

          // The request-state assignment occurs inside the retry callback, so
          // TypeScript cannot follow that mutation across the async closure.
          const ambiguous = err instanceof AmbiguousProviderCreateError || String(providerCreateState) === 'in_flight';
          if (ambiguous) {
            providerCreateState = 'ambiguous';
            await finalizeDispatchClaim('acceptance_unknown', null, message);
            await markProviderReconciliationRequired(message);
            await logError(supabaseAdmin, 'outbound-calling', 'create_call_reconciliation_required', userId,
              new Error(message),
              { leadId, campaignId, severity: 'critical', payload: { queueId, callLogId: callLog.id } }
            );
            return new Response(JSON.stringify({
              success: false,
              reconciliation_required: true,
              error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
              error: 'Provider acknowledgement is ambiguous; the call is quarantined and will not be redialed automatically',
              call_log_id: callLog.id,
              queue_id: queueId || null,
            }), {
              status: 202,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          providerCreateState = 'definite_failure';
          await finalizeDispatchClaim('definite_failure', null, message);

          // IMPORTANT: ensure we don't leave call_logs stuck in "queued" when Retell rejects the call.
          const { error: failedLogError } = await supabaseAdmin
            .from('call_logs')
            .update({
              status: 'failed',
              ended_at: new Date().toISOString(),
              notes: `Retell API error: ${message}`,
            })
            .eq('id', callLog.id)
            .eq('user_id', userId)
            .eq('organization_id', organizationId);
          if (failedLogError) console.error('[Outbound Calling] Failed to persist definite Retell rejection:', failedLogError);

          await cancelReservation(`Retell did not accept call: ${message}`);
          releaseReservationOnDefiniteFailure = null;

          await logError(supabaseAdmin, 'outbound-calling', 'create_call', userId,
            new Error(message),
            { leadId, campaignId, severity: 'error' }
          );

          throw err;
        }


        if (!response.ok) {
          const errorData = await response.text();
          console.error('[Outbound Calling] Retell API error:', errorData);
          let errorMessage = 'Retell API call failed';
          
          // Parse Retell error for better user feedback
          try {
            const errorJson = JSON.parse(errorData);
            if (errorJson.message) {
              errorMessage = errorJson.message;
            }
          } catch {
            errorMessage = errorData || 'Unknown Retell API error';
          }
          
          // Update call log to failed using admin client
          await supabaseAdmin
            .from('call_logs')
            .update({ 
              status: 'failed',
              notes: `Retell API error: ${errorMessage}`
            })
            .eq('id', callLog.id)
            .eq('user_id', userId)
            .eq('organization_id', organizationId);
          
          // Log error to database
          await logError(supabaseAdmin, 'outbound-calling', 'create_call', userId,
            new Error(errorMessage),
            { leadId, campaignId, severity: 'error' }
          );
            
          throw new Error(`Failed to create call via Retell: ${errorMessage}`);
        }

        let callData: any;
        try {
          callData = await response.json();
        } catch (parseError) {
          providerCreateState = 'ambiguous';
          const reason = `Retell accepted the request but returned an unreadable response: ${String(parseError)}`;
          await finalizeDispatchClaim('acceptance_unknown', null, reason);
          await markProviderReconciliationRequired(reason);
          return new Response(JSON.stringify({
            success: false,
            reconciliation_required: true,
            error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
            error: 'Retell accepted the request, but its response could not be reconciled',
            call_log_id: callLog.id,
            queue_id: queueId || null,
          }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.log('[Outbound Calling] Retell AI call created:', callData.call_id);

        if (!callData.call_id) {
          providerCreateState = 'ambiguous';
          const reason = 'Retell returned a success response without a call ID';
          await finalizeDispatchClaim('acceptance_unknown', null, reason);
          await markProviderReconciliationRequired(reason);
          return new Response(JSON.stringify({
            success: false,
            reconciliation_required: true,
            error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
            error: 'Retell accepted the request without a call ID; the call is quarantined',
            call_log_id: callLog.id,
            queue_id: queueId || null,
          }), {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await finalizeDispatchClaim('accepted', callData.call_id, null);

        // Update call log with Retell call ID using admin client
        const { error: acceptedLogError } = await supabaseAdmin
          .from('call_logs')
          .update({ 
            retell_call_id: callData.call_id,
            status: 'ringing',
            provider_reconciliation_required: false,
            provider_reconciliation_reason: null,
            provider_reconciled_at: new Date().toISOString(),
          })
          .eq('id', callLog.id)
          .eq('user_id', userId)
          .eq('organization_id', organizationId);
        if (acceptedLogError) {
          providerCreateState = 'ambiguous';
          await markProviderReconciliationRequired(`Retell accepted call ${callData.call_id}, but call-log persistence failed: ${acceptedLogError.message}`);
          return new Response(JSON.stringify({
            success: false,
            reconciliation_required: true,
            error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
            error: 'Retell accepted the call, but local reconciliation is incomplete',
            provider_call_id: callData.call_id,
            call_log_id: callLog.id,
            queue_id: queueId || null,
          }), {
            status: 202,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const attemptRecorded = await recordAcceptedAttempt(callData.call_id);
        if (!attemptRecorded) {
          await markProviderReconciliationRequired(`Retell accepted call ${callData.call_id}, but the physical-attempt ledger did not bind the queue`);
          return new Response(JSON.stringify({
            success: false,
            reconciliation_required: true,
            error_code: 'ATTEMPT_LEDGER_RECONCILIATION_REQUIRED',
            error: 'Retell accepted the call, but queue reconciliation is incomplete',
            provider_call_id: callData.call_id,
            call_log_id: callLog.id,
            queue_id: queueId || null,
          }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        result = { 
          call_id: callData.call_id, 
          call_log_id: callLog.id,
          status: 'created',
          attempt_recorded: attemptRecorded,
        };
        break;
      }

      case 'get_call_status':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        {
          const { data: ownedCall, error: ownedCallError } = await supabaseAdmin
            .from('call_logs')
            .select('id, user_id, organization_id')
            .eq('retell_call_id', retellCallId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (ownedCallError) throw new Error(`Call ownership lookup failed: ${ownedCallError.message}`);
          if (!ownedCall) throw new Error('Call not found or not owned by the authenticated tenant');
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'call', ...ownedCall }],
          });
        }

        // Try Retell API first - use correct endpoint (15 second timeout)
        response = await fetchWithTimeout(`${baseUrl}/get-call/${retellCallId}`, {
          method: 'GET',
          headers: retellHeaders,
        }, 15000);

        if (!response.ok) {
          // If Retell API fails (404 = call expired), check our database for status
          console.log('[Outbound Calling] Retell API returned error, checking database...');
          
          const { data: dbCallLog } = await supabaseAdmin
            .from('call_logs')
            .select('status, outcome, duration_seconds, ended_at')
            .eq('retell_call_id', retellCallId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          
          if (dbCallLog) {
            // Return status from database
            const isEnded = dbCallLog.status === 'completed' || dbCallLog.status === 'failed' || 
                           dbCallLog.ended_at || dbCallLog.outcome;
            result = {
              call_status: dbCallLog.status || (isEnded ? 'ended' : 'unknown'),
              status: dbCallLog.status || (isEnded ? 'ended' : 'unknown'),
              outcome: dbCallLog.outcome,
              duration_seconds: dbCallLog.duration_seconds,
              from_database: true,
            };
            console.log('[Outbound Calling] Returning status from database:', result);
          } else {
            // No database record found, assume call ended/expired
            result = {
              call_status: 'ended',
              status: 'ended',
              outcome: 'unknown',
              from_database: true,
              expired: true,
            };
            console.log('[Outbound Calling] Call not found in database, assuming ended');
          }
        } else {
          result = await response.json();
        }
        break;

      case 'end_call':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
        }

        {
          const { data: ownedCall, error: ownedCallError } = await supabaseAdmin
            .from('call_logs')
            .select('id, user_id, organization_id')
            .eq('retell_call_id', retellCallId)
            .eq('user_id', userId)
            .eq('organization_id', organizationId)
            .maybeSingle();
          if (ownedCallError) throw new Error(`Call ownership lookup failed: ${ownedCallError.message}`);
          if (!ownedCall) throw new Error('Call not found or not owned by the authenticated tenant');
          assertTenantResourceOwnership({
            organizationId,
            userId,
            resources: [{ kind: 'call', ...ownedCall }],
          });
        }

        response = await fetchWithTimeout(`${baseUrl}/call/${retellCallId}`, {
          method: 'DELETE',
          headers: retellHeaders,
        }, 15000);

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
        }

        result = { success: true };
        break;

      case 'health_check': {
        // Health check for system verification
        console.log('[Outbound Calling] Health check requested');
        const retellConfigured = !!apiKey;
        const webhookSigningConfigured = !!Deno.env.get('RETELL_WEBHOOK_SIGNING_KEY');
        const webhookVerifyMode = (Deno.env.get('RETELL_WEBHOOK_VERIFY_MODE') || 'enforce').trim().toLowerCase();
        const { data: safetyHealth, error: safetyHealthError } = await supabaseAdmin.rpc('provider_safety_health_check');
        const idempotencyReady = !safetyHealthError &&
          safetyHealth?.[0]?.idempotency_ready === true &&
          safetyHealth?.[0]?.attempt_ledger_ready === true &&
          safetyHealth?.[0]?.reconciliation_ready === true &&
          safetyHealth?.[0]?.dispatch_claim_ready === true &&
          safetyHealth?.[0]?.contact_stop_ready === true &&
          safetyHealth?.[0]?.normalized_dnc_ready === true &&
          safetyHealth?.[0]?.provider_safe_backstop_ready === true;
        const healthy = retellConfigured && webhookSigningConfigured && webhookVerifyMode === 'enforce' && idempotencyReady;
        result = {
          success: healthy,
          healthy,
          retell_configured: retellConfigured,
          webhook_signing_configured: webhookSigningConfigured,
          webhook_verify_mode: webhookVerifyMode,
          idempotency_ready: idempotencyReady,
          safety_error: safetyHealthError?.message || null,
          timestamp: new Date().toISOString(),
          capabilities: ['create_call', 'get_call_status', 'end_call', 'health_check'],
          rate_limit_handling: true,
          retry_logic: true
        };
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[Outbound Calling] Error:', error);
    console.error('[Outbound Calling] Error stack:', (error as Error).stack);

    if (finalizeDispatchOnError && !dispatchClaimFinalized) {
      const ambiguousState = providerCreateState === 'in_flight'
        || providerCreateState === 'ambiguous'
        || providerCreateState === 'accepted';
      try {
        await finalizeDispatchOnError(
          ambiguousState ? 'acceptance_unknown' : 'definite_failure',
          null,
          (error as Error).message,
        );
      } catch (dispatchFinalizeError) {
        console.error('[Outbound Calling] CRITICAL: failed to finalize logical dispatch claim:', dispatchFinalizeError);
      }
    }

    if (
      releaseReservationOnDefiniteFailure &&
      (providerCreateState === 'in_flight' || providerCreateState === 'ambiguous' || providerCreateState === 'accepted')
    ) {
      return new Response(JSON.stringify({
        success: false,
        reconciliation_required: true,
        error_code: 'PROVIDER_RECONCILIATION_REQUIRED',
        error: `Provider create may have been accepted; automatic redial is blocked: ${(error as Error).message}`,
      }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Any failure before a provider create request, or a definite provider
    // rejection, must release a reservation. Ambiguous/accepted creates remain
    // reserved until their signed callback or reconciliation finalizes billing.
    if (
      releaseReservationOnDefiniteFailure &&
      (providerCreateState === 'not_started' || providerCreateState === 'definite_failure')
    ) {
      try {
        await releaseReservationOnDefiniteFailure(`Definite pre-acceptance failure: ${(error as Error).message}`);
      } catch (releaseError) {
        console.error('[Outbound Calling] CRITICAL: failed to release reservation after definite failure:', releaseError);
      }
    }
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      details: 'Check edge function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
