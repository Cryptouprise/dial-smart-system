/**
 * SMS Messaging Edge Function
 * 
 * Handles SMS messaging operations via Twilio:
 * - Send SMS messages
 * - Get message history
 * - Get available SMS-enabled numbers
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  canonicalSmsPhone,
  requireSmsIdempotencyKey,
  resolveSmsOrganization,
  sameSmsPhone,
  selectOwnedSmsNumber,
  smsClaimDisposition,
  type SmsProvider,
} from './sms-boundary.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmsRequest {
  action: 'send_sms' | 'get_messages' | 'get_available_numbers' | 'check_webhook_status' | 'configure_webhook' | 'health_check';
  to?: string;
  from?: string;
  body?: string;
  lead_id?: string;
  conversation_id?: string;
  limit?: number;
  phoneNumber?: string; // For single number webhook config
  skip_db_insert?: boolean; // Skip DB insert if message already stored (e.g., from twilio-sms-webhook)
  existing_message_id?: string; // ID of already-stored message to update
  user_id?: string; // Required with the service-role token for internal calls
  organization_id?: string; // Explicit tenant context for multi-org users
  campaign_id?: string;
  is_ai_generated?: boolean;
  idempotency_key?: string;
}

class SmsBoundaryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly retryable = false,
    readonly reconciliationRequired = false,
  ) {
    super(message);
    this.name = 'SmsBoundaryError';
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse request early so we can check action type
    const request: SmsRequest = await req.json();
    
    // Every action requires an authenticated user or an internal service-role
    // request carrying the user whose resources are being operated.
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - Please log in to perform this action' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
      if (!bearer) {
        return new Response(
          JSON.stringify({ success: false, error: 'Authorization must use a Bearer token', code: 'INVALID_AUTH_HEADER' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const token = bearer[1].trim();

      if (token === serviceRoleKey && request.user_id) {
        // Internal service-to-service call (e.g. from workflow-executor)
        userId = request.user_id;
        console.log('[SMS Messaging] Internal call for user:', userId);
      } else {
        // Standard JWT-based auth (frontend calls)
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Authentication failed - Please log in again' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        userId = user.id;
        console.log('[SMS Messaging] User authenticated:', userId);
      }
    }

    console.log('[SMS Messaging] Action:', request.action);

    if (request.action === 'send_sms') {
      return new Response(JSON.stringify({
        success: false,
        disabled: true,
        accepted: false,
        error_code: 'SMS_EGRESS_NOT_CERTIFIED',
        error: 'Physical SMS egress is disabled in the Retell-only launch profile.',
        retryable: false,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (['get_available_numbers', 'check_webhook_status', 'configure_webhook'].includes(request.action)) {
      return new Response(JSON.stringify({
        success: false,
        disabled: true,
        error_code: 'PROVIDER_ADMIN_NOT_CERTIFIED',
        error: 'SMS provider inventory and webhook administration are disabled in the Retell-only launch profile.',
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // Helper function to encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      return btoa(credentials);
    };

    // Get Telnyx credentials (for health check)
    const telnyxApiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    if (!userId) throw new SmsBoundaryError('Authenticated user context is required', 'UNAUTHORIZED', 401);

    const loadOwnedActiveNumber = async (phone: string, expectedProvider?: SmsProvider) => {
      const lookup = await supabaseAdmin
        .from('phone_numbers')
        .select('id, number, provider, status, capabilities, allowed_uses')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (lookup.error) {
        throw new SmsBoundaryError(`Owned number lookup failed: ${lookup.error.message}`, 'FROM_NUMBER_LOOKUP_FAILED', 503);
      }
      let selected: ReturnType<typeof selectOwnedSmsNumber>;
      try {
        selected = selectOwnedSmsNumber(
          (lookup.data || []).filter((row: any) => sameSmsPhone(row.number, phone)),
          phone,
        );
      } catch (error) {
        throw new SmsBoundaryError((error as Error).message, 'FROM_NUMBER_REJECTED', 403);
      }
      if (expectedProvider && selected.provider !== expectedProvider) {
        throw new SmsBoundaryError(`Phone number is not an owned ${expectedProvider} number`, 'FROM_NUMBER_PROVIDER_MISMATCH', 403);
      }
      return selected;
    };

    let result: Record<string, unknown>;

    switch (request.action as SmsRequest['action']) {
      case 'health_check': {
        console.log('[SMS Messaging] Health check requested');
        result = {
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'sms-messaging',
          capabilities: ['get_messages'],
          launch_profile: 'retell_voice_only',
          sms_egress_certified: false,
          twilio_configured: !!(twilioAccountSid && twilioAuthToken),
          telnyx_configured: !!telnyxApiKey,
        };
        break;
      }

      case 'send_sms': {
        if (!request.to || !request.from || !request.body) {
          throw new SmsBoundaryError('To, from, and body are required for sending SMS', 'INVALID_SMS_REQUEST');
        }
        let idempotencyKey: string;
        try {
          idempotencyKey = requireSmsIdempotencyKey(request.idempotency_key);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'IDEMPOTENCY_KEY_REQUIRED', 400);
        }
        if (!userId) throw new SmsBoundaryError('Authenticated user context is required', 'UNAUTHORIZED', 401);

        const cleanTo = canonicalSmsPhone(request.to);
        const cleanFrom = canonicalSmsPhone(request.from);
        console.log('[SMS Messaging] Preparing certified SMS boundary', { userId, cleanFrom, cleanTo });

        const membershipResult = await supabaseAdmin
          .from('organization_users')
          .select('organization_id')
          .eq('user_id', userId);
        if (membershipResult.error) {
          throw new SmsBoundaryError(`Organization membership lookup failed: ${membershipResult.error.message}`, 'TENANT_LOOKUP_FAILED', 503);
        }
        let organizationId: string;
        try {
          organizationId = resolveSmsOrganization({
            memberships: membershipResult.data || [],
            requestedOrganizationId: request.organization_id,
          });
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'TENANT_CONTEXT_REJECTED', 403);
        }

        const phoneResult = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, provider, status, capabilities, allowed_uses')
          .eq('user_id', userId)
          .eq('status', 'active');
        if (phoneResult.error) {
          throw new SmsBoundaryError(`From-number lookup failed: ${phoneResult.error.message}`, 'FROM_NUMBER_LOOKUP_FAILED', 503);
        }
        const matchingPhones = (phoneResult.data || []).filter((row: any) => sameSmsPhone(row.number, cleanFrom));
        if (matchingPhones.length === 0) {
          throw new SmsBoundaryError('From number is not an active number owned by the authenticated user', 'FROM_NUMBER_NOT_OWNED', 403);
        }

        if (request.lead_id) {
          const leadResult = await supabaseAdmin
            .from('leads')
            .select('id, user_id, phone_number, phone_number_normalized, do_not_call')
            .eq('id', request.lead_id)
            .eq('user_id', userId)
            .maybeSingle();
          if (leadResult.error) {
            throw new SmsBoundaryError(`Lead safety lookup failed: ${leadResult.error.message}`, 'LEAD_LOOKUP_FAILED', 503);
          }
          if (!leadResult.data) {
            throw new SmsBoundaryError('Lead is not owned by the authenticated user', 'LEAD_NOT_OWNED', 403);
          }
          if (leadResult.data.phone_number_normalized !== cleanTo
            || !sameSmsPhone(leadResult.data.phone_number, cleanTo)) {
            throw new SmsBoundaryError('SMS destination does not match the owned lead', 'LEAD_DESTINATION_MISMATCH', 409);
          }
        }

        if (request.campaign_id) {
          const campaignResult = await supabaseAdmin
            .from('campaigns')
            .select('id')
            .eq('id', request.campaign_id)
            .eq('user_id', userId)
            .maybeSingle();
          if (campaignResult.error) {
            throw new SmsBoundaryError(`Campaign tenant lookup failed: ${campaignResult.error.message}`, 'CAMPAIGN_LOOKUP_FAILED', 503);
          }
          if (!campaignResult.data) {
            throw new SmsBoundaryError('Campaign is not owned by the authenticated user', 'CAMPAIGN_NOT_OWNED', 403);
          }
        }

        let phoneRecord: ReturnType<typeof selectOwnedSmsNumber>;
        try {
          phoneRecord = selectOwnedSmsNumber(matchingPhones, cleanFrom);
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'FROM_NUMBER_REJECTED', 403);
        }
        const provider: SmsProvider = phoneRecord.provider;

        if (provider === 'telnyx' && !telnyxApiKey) {
          throw new SmsBoundaryError('Telnyx API key is not configured', 'PROVIDER_NOT_CONFIGURED', 503);
        }
        if (provider === 'twilio' && (!twilioAccountSid || !twilioAuthToken)) {
          throw new SmsBoundaryError('Twilio credentials are not configured', 'PROVIDER_NOT_CONFIGURED', 503);
        }

        const assertContactAllowed = async () => {
          const stopResult = await supabaseAdmin.rpc('evaluate_contact_stop', {
            p_user_id: userId,
            p_organization_id: organizationId,
            p_campaign_id: request.campaign_id || null,
            p_provider: provider,
            p_channel: 'sms',
          });
          if (stopResult.error) {
            throw new SmsBoundaryError(`Contact stop evaluation failed: ${stopResult.error.message}`, 'CONTACT_STOP_CHECK_FAILED', 503);
          }
          const stopDecision = Array.isArray(stopResult.data) ? stopResult.data[0] : stopResult.data;
          if (!stopDecision || typeof stopDecision.allowed !== 'boolean') {
            throw new SmsBoundaryError('Contact stop evaluation returned an invalid decision', 'CONTACT_STOP_CHECK_FAILED', 503);
          }
          if (!stopDecision.allowed) {
            throw new SmsBoundaryError(stopDecision.reason || 'SMS sending is stopped by policy', 'SMS_STOPPED', 423);
          }

          let leadSafetyQuery = supabaseAdmin
            .from('leads')
            .select('id, phone_number, phone_number_normalized, do_not_call')
            .eq('user_id', userId)
            .eq('phone_number_normalized', cleanTo);
          if (request.lead_id) leadSafetyQuery = leadSafetyQuery.eq('id', request.lead_id);
          const leadResult = await leadSafetyQuery;
          if (leadResult.error) {
            throw new SmsBoundaryError(`Lead safety recheck failed: ${leadResult.error.message}`, 'LEAD_SAFETY_CHECK_FAILED', 503);
          }
          const destinationLeads = (leadResult.data || []).filter((lead: any) =>
            lead.phone_number_normalized === cleanTo && sameSmsPhone(lead.phone_number, cleanTo));
          if (request.lead_id && destinationLeads.length !== 1) {
            throw new SmsBoundaryError('Owned lead context changed before SMS send', 'LEAD_CONTEXT_CHANGED', 409);
          }
          if (destinationLeads.some((lead: any) => lead.do_not_call)) {
            throw new SmsBoundaryError('Lead is marked do_not_call', 'LEAD_DO_NOT_CALL', 423);
          }

          const dncResult = await supabaseAdmin
            .from('dnc_list')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('phone_number_normalized', cleanTo)
            .limit(1);
          if (dncResult.error) {
            throw new SmsBoundaryError(`DNC lookup failed: ${dncResult.error.message}`, 'DNC_CHECK_FAILED', 503);
          }
          if ((dncResult.data || []).length > 0) {
            throw new SmsBoundaryError('Destination is on the user DNC list', 'DESTINATION_DNC', 423);
          }
        };

        await assertContactAllowed();

        if (request.conversation_id) {
          const conversationResult = await supabaseAdmin
            .from('sms_conversations')
            .select('id, contact_phone')
            .eq('id', request.conversation_id)
            .eq('user_id', userId)
            .maybeSingle();
          if (conversationResult.error) {
            throw new SmsBoundaryError(`Conversation lookup failed: ${conversationResult.error.message}`, 'CONVERSATION_LOOKUP_FAILED', 503);
          }
          if (!conversationResult.data || !sameSmsPhone(conversationResult.data.contact_phone, cleanTo)) {
            throw new SmsBoundaryError('Conversation is not owned or does not match the destination', 'CONVERSATION_REJECTED', 403);
          }
        }

        let smsRecordId: string | null = null;
        if (request.skip_db_insert && request.existing_message_id) {
          const existingResult = await supabaseAdmin
            .from('sms_messages')
            .select('id, to_number, from_number, direction, status')
            .eq('id', request.existing_message_id)
            .eq('user_id', userId)
            .maybeSingle();
          if (existingResult.error) {
            throw new SmsBoundaryError(`Existing SMS lookup failed: ${existingResult.error.message}`, 'SMS_RECORD_LOOKUP_FAILED', 503);
          }
          const existing = existingResult.data;
          if (!existing || existing.direction !== 'outbound'
            || !sameSmsPhone(existing.to_number, cleanTo)
            || !sameSmsPhone(existing.from_number, cleanFrom)
            || !['pending', 'failed'].includes(existing.status)) {
            throw new SmsBoundaryError('Existing SMS record is not eligible for this send', 'SMS_RECORD_REJECTED', 403);
          }
          smsRecordId = existing.id;
        } else {
          const { data: smsRecord, error: insertError } = await supabaseAdmin
            .from('sms_messages')
            .insert({
              user_id: userId,
              to_number: cleanTo,
              from_number: cleanFrom,
              body: request.body,
              direction: 'outbound',
              status: 'pending',
              lead_id: request.lead_id || null,
              conversation_id: request.conversation_id || null,
              provider_type: provider,
              is_ai_generated: request.is_ai_generated ?? false,
              metadata: {
                organization_id: organizationId,
                campaign_id: request.campaign_id || null,
                safety_checked_at: new Date().toISOString(),
              },
            })
            .select('id')
            .maybeSingle();
          if (insertError || !smsRecord) {
            throw new SmsBoundaryError(`Failed to create SMS record: ${insertError?.message || 'no row returned'}`, 'SMS_RECORD_CREATE_FAILED', 503);
          }
          smsRecordId = smsRecord.id;
        }

        const updateMessageStatus = async (status: string, message: string | null, providerMessageId?: string | null) => {
          if (!smsRecordId) return;
          const updateResult = await supabaseAdmin.from('sms_messages')
            .update({
              status,
              error_message: message,
              ...(providerMessageId ? { provider_message_id: providerMessageId } : {}),
            })
            .eq('id', smsRecordId)
            .eq('user_id', userId);
          if (updateResult.error) console.error('[SMS Messaging] Failed to persist message state:', updateResult.error);
        };

        if (provider === 'twilio') {
          await assertContactAllowed();
          const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanFrom)}`;
          let verifyResponse: Response;
          try {
            verifyResponse = await fetch(verifyUrl, {
              headers: { 'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid!, twilioAuthToken!) },
              signal: AbortSignal.timeout(15_000),
            });
          } catch (error) {
            throw new SmsBoundaryError(`Twilio number verification failed: ${(error as Error).message}`, 'PROVIDER_VERIFICATION_UNAVAILABLE', 503, true);
          }
          const verifyData = await verifyResponse.json().catch(() => ({}));
          if (verifyResponse.status >= 500 || verifyResponse.status === 408) {
            throw new SmsBoundaryError(
              `Twilio number verification is unavailable (HTTP ${verifyResponse.status})`,
              'PROVIDER_VERIFICATION_UNAVAILABLE',
              503,
              true,
            );
          }
          const twilioNumber = verifyData.incoming_phone_numbers?.[0];
          if (!verifyResponse.ok || !twilioNumber) {
            throw new SmsBoundaryError('From number is not registered in the configured Twilio account', 'PROVIDER_NUMBER_NOT_OWNED', 403);
          }
          if (twilioNumber.capabilities?.sms === false) {
            throw new SmsBoundaryError('From number is not SMS capable in Twilio', 'PROVIDER_NUMBER_NOT_SMS_CAPABLE', 409);
          }
        }

        // Final database ownership/capability check immediately before the
        // durable attempt claim and physical provider mutation.
        const finalPhoneResult = await supabaseAdmin
          .from('phone_numbers')
          .select('id, number, provider, status, capabilities, allowed_uses')
          .eq('user_id', userId)
          .eq('status', 'active');
        if (finalPhoneResult.error) {
          throw new SmsBoundaryError(`Final from-number recheck failed: ${finalPhoneResult.error.message}`, 'FROM_NUMBER_RECHECK_FAILED', 503, true);
        }
        let finalPhoneRecord: ReturnType<typeof selectOwnedSmsNumber>;
        try {
          finalPhoneRecord = selectOwnedSmsNumber(
            (finalPhoneResult.data || []).filter((row: any) => sameSmsPhone(row.number, cleanFrom)),
            cleanFrom,
          );
        } catch (error) {
          throw new SmsBoundaryError((error as Error).message, 'FROM_NUMBER_RECHECK_REJECTED', 403);
        }
        if (finalPhoneRecord.id !== phoneRecord.id || finalPhoneRecord.provider !== provider) {
          throw new SmsBoundaryError('From-number provider ownership changed before send', 'FROM_NUMBER_CONTEXT_CHANGED', 409);
        }
        await assertContactAllowed();

        const bodySha256 = await sha256Hex(request.body);
        const claimResult = await supabaseAdmin.rpc('claim_sms_delivery_attempt', {
          p_idempotency_key: idempotencyKey,
          p_user_id: userId,
          p_organization_id: organizationId,
          p_sms_message_id: smsRecordId,
          p_provider: provider,
          p_from_number_normalized: cleanFrom,
          p_to_number_normalized: cleanTo,
          p_body_sha256: bodySha256,
          p_metadata: {
            lead_id: request.lead_id || null,
            campaign_id: request.campaign_id || null,
            conversation_id: request.conversation_id || null,
          },
        });
        if (claimResult.error) {
          throw new SmsBoundaryError(`SMS delivery claim failed: ${claimResult.error.message}`, 'DELIVERY_CLAIM_FAILED', 503, true);
        }
        const claim = Array.isArray(claimResult.data) ? claimResult.data[0] : claimResult.data;
        if (!claim?.attempt_id || typeof claim.claimed !== 'boolean') {
          throw new SmsBoundaryError('SMS delivery claim returned an invalid result', 'DELIVERY_CLAIM_FAILED', 503, true);
        }
        const claimDisposition = smsClaimDisposition(claim);
        if (claimDisposition !== 'send') {
          if (claimDisposition === 'accepted_replay') {
            if (smsRecordId !== claim.existing_sms_message_id) await updateMessageStatus('duplicate_suppressed', 'Replayed accepted idempotency key');
            result = {
              success: true,
              sent: true,
              status: 'sent',
              provider,
              message_id: claim.existing_sms_message_id,
              provider_message_id: claim.existing_provider_message_id,
              idempotent_replay: true,
            };
            break;
          }
          if (claimDisposition === 'reconcile') {
            if (smsRecordId !== claim.existing_sms_message_id) {
              await updateMessageStatus('duplicate_suppressed', 'Duplicate suppressed; original delivery requires reconciliation');
            }
            throw new SmsBoundaryError(
              'SMS delivery is already in progress or has unknown provider acceptance; reconciliation is required',
              'DELIVERY_RECONCILIATION_REQUIRED',
              409,
              false,
              true,
            );
          }
          await updateMessageStatus('failed', 'Prior attempt for this idempotency key was rejected');
          throw new SmsBoundaryError('SMS delivery was already rejected for this idempotency key', 'DELIVERY_ALREADY_REJECTED', 409);
        }

        const finalizeAttempt = async (
          status: 'accepted' | 'rejected' | 'acceptance_unknown',
          providerMessageId: string | null,
          lastError: string | null,
          providerResponse: unknown,
        ): Promise<boolean> => {
          const finalizeResult = await supabaseAdmin.rpc('finalize_sms_delivery_attempt', {
            p_attempt_id: claim.attempt_id,
            p_user_id: userId,
            p_status: status,
            p_provider_message_id: providerMessageId,
            p_last_error: lastError,
            p_provider_response: providerResponse && typeof providerResponse === 'object' ? providerResponse : null,
          });
          if (finalizeResult.error || finalizeResult.data !== true) {
            console.error('[SMS Messaging] Failed to finalize delivery attempt:', finalizeResult.error || finalizeResult.data);
            return false;
          }
          return true;
        };

        let providerResponse: Response;
        try {
          if (provider === 'telnyx') {
            providerResponse = await fetch('https://api.telnyx.com/v2/messages', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${telnyxApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ from: cleanFrom, to: cleanTo, text: request.body, type: 'SMS' }),
              signal: AbortSignal.timeout(20_000),
            });
          } else {
            providerResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid!, twilioAuthToken!),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: cleanTo, From: cleanFrom, Body: request.body }).toString(),
              signal: AbortSignal.timeout(20_000),
            });
          }
        } catch (error) {
          const detail = `${provider} delivery response was not received: ${(error as Error).message}`;
          await finalizeAttempt('acceptance_unknown', null, detail, null);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }

        let providerText: string;
        try {
          providerText = await providerResponse.text();
        } catch (error) {
          // The provider returned an HTTP response, but the response body could
          // not be read. At this point we cannot prove whether it accepted the
          // message, so quarantine the attempt instead of leaving it claimed or
          // encouraging an unsafe retry.
          const detail = `${provider} response body could not be read; acceptance is unknown: ${(error as Error).message}`;
          await finalizeAttempt('acceptance_unknown', null, detail, null);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }
        let providerData: any = null;
        try {
          providerData = providerText ? JSON.parse(providerText) : null;
        } catch {
          providerData = null;
        }

        if (providerResponse.status >= 500 || providerResponse.status === 408) {
          const detail = `${provider} returned HTTP ${providerResponse.status}; acceptance is unknown`;
          await finalizeAttempt('acceptance_unknown', null, detail, providerData);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }
        if (!providerResponse.ok) {
          const detail = provider === 'telnyx'
            ? providerData?.errors?.[0]?.detail || `Telnyx rejected the SMS (${providerResponse.status})`
            : providerData?.message || `Twilio rejected the SMS (${providerResponse.status})`;
          await finalizeAttempt('rejected', null, detail, providerData);
          await updateMessageStatus('failed', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_REJECTED', 422);
        }

        const providerMessageId = provider === 'telnyx' ? providerData?.data?.id : providerData?.sid;
        if (!providerData || !providerMessageId) {
          const detail = `${provider} returned an ambiguous success response without a message id`;
          await finalizeAttempt('acceptance_unknown', null, detail, providerData);
          await updateMessageStatus('acceptance_unknown', detail);
          throw new SmsBoundaryError(detail, 'PROVIDER_ACCEPTANCE_UNKNOWN', 502, false, true);
        }

        const ledgerFinalized = await finalizeAttempt('accepted', providerMessageId, null, providerData);
        const sentAt = new Date().toISOString();
        const sentUpdate = await supabaseAdmin.from('sms_messages')
          .update({ status: 'sent', provider_message_id: providerMessageId, sent_at: sentAt, error_message: null })
          .eq('id', smsRecordId)
          .eq('user_id', userId);
        if (sentUpdate.error) {
          // The provider already accepted the physical message. Report that
          // truthfully and surface persistence degradation without inviting a
          // duplicate automatic send.
          console.error('[SMS Messaging] Provider accepted SMS but sent status persistence failed:', sentUpdate.error);
        }

        if (request.conversation_id) {
          const conversationUpdate = await supabaseAdmin.from('sms_conversations')
            .update({ last_message_at: sentAt })
            .eq('id', request.conversation_id)
            .eq('user_id', userId);
          if (conversationUpdate.error) console.error('[SMS Messaging] Conversation update failed:', conversationUpdate.error);
        }

        result = {
          success: true,
          sent: true,
          status: 'sent',
          provider,
          message_id: smsRecordId,
          provider_message_id: providerMessageId,
          persistence_warning: sentUpdate.error?.message || null,
          reconciliation_required: !ledgerFinalized,
          retryable: false,
        };
        break;
      }

      case 'get_messages': {
        const limit = request.limit || 50;

        const { data: messages, error: fetchError } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (fetchError) {
          console.error('[SMS Messaging] Fetch error:', fetchError);
          throw new Error('Failed to fetch messages');
        }

        result = { messages: messages || [] };
        break;
      }

      case 'get_available_numbers': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }

        const ownedNumbersResult = await supabaseAdmin
          .from('phone_numbers')
          .select('number')
          .eq('user_id', userId)
          .eq('status', 'active')
          .eq('provider', 'twilio');
        if (ownedNumbersResult.error) {
          throw new SmsBoundaryError(`Owned number inventory failed: ${ownedNumbersResult.error.message}`, 'NUMBER_INVENTORY_FAILED', 503);
        }
        const ownedNumbers = ownedNumbersResult.data || [];
        if (ownedNumbers.length === 0) {
          result = { success: true, numbers: [] };
          break;
        }

        // Fetch provider state, but only return numbers already owned by the
        // authenticated user in the local resource table.
        console.log('[SMS Messaging] Fetching available numbers from Twilio...');
        
        const twilioNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`;
        const twilioResponse = await fetch(twilioNumbersUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        if (!twilioResponse.ok) {
          console.error('[SMS Messaging] Failed to fetch Twilio numbers');
          throw new Error('Failed to fetch numbers from Twilio');
        }

        const twilioData = await twilioResponse.json();
        const twilioNumbers = twilioData.incoming_phone_numbers || [];
        
        const expectedWebhook = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;

        // Fetch messaging services to check A2P registration
        console.log('[SMS Messaging] Checking A2P messaging services...');
        const messagingServiceNumbers: Set<string> = new Set();
        
        try {
          const messagingServicesUrl = `https://messaging.twilio.com/v1/Services`;
          const msResponse = await fetch(messagingServicesUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            },
          });

          if (msResponse.ok) {
            const msData = await msResponse.json();
            const services = msData.services || [];
            
            // For each messaging service, get the phone numbers assigned to it
            for (const service of services) {
              try {
                const phoneNumbersUrl = `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`;
                const pnResponse = await fetch(phoneNumbersUrl, {
                  headers: {
                    'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
                  },
                });
                
                if (pnResponse.ok) {
                  const pnData = await pnResponse.json();
                  const phoneNumbers = pnData.phone_numbers || [];
                  phoneNumbers.forEach((pn: any) => {
                    messagingServiceNumbers.add(pn.phone_number);
                  });
                }
              } catch (pnError) {
                console.error('[SMS Messaging] Error fetching service numbers:', pnError);
              }
            }
          }
          console.log('[SMS Messaging] Found', messagingServiceNumbers.size, 'numbers in messaging services (A2P registered)');
        } catch (msError) {
          console.error('[SMS Messaging] Error checking messaging services:', msError);
        }

        // Filter for SMS-capable numbers and include webhook + A2P status
        const smsCapableNumbers = twilioNumbers
          .filter((num: any) => num.capabilities?.sms === true
            && ownedNumbers.some((owned: any) => sameSmsPhone(owned.number, num.phone_number)))
          .map((num: any) => {
            const webhookConfigured = num.sms_url === expectedWebhook;
            const a2pRegistered = messagingServiceNumbers.has(num.phone_number);
            const isReady = webhookConfigured && a2pRegistered;
            
            return {
              number: num.phone_number,
              friendly_name: num.friendly_name,
              capabilities: num.capabilities,
              sms_url: num.sms_url,
              webhook_configured: webhookConfigured,
              a2p_registered: a2pRegistered,
              is_ready: isReady,
              status_details: !webhookConfigured && !a2pRegistered 
                ? 'Needs webhook & A2P' 
                : !webhookConfigured 
                  ? 'Needs webhook' 
                  : !a2pRegistered 
                    ? 'Needs A2P registration' 
                    : 'Ready',
            };
          });

        console.log('[SMS Messaging] Found', smsCapableNumbers.length, 'SMS-capable numbers in Twilio');
        console.log('[SMS Messaging] Ready numbers:', smsCapableNumbers.filter((n: any) => n.is_ready).length);

        result = { success: true, numbers: smsCapableNumbers };
        break;
      }

      case 'check_webhook_status': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }
        
        const phoneNumber = request.phoneNumber || request.from;
        if (!phoneNumber) {
          throw new Error('Phone number is required');
        }
        
        const ownedNumber = await loadOwnedActiveNumber(phoneNumber, 'twilio');
        console.log('[SMS Messaging] Checking webhook status for owned number:', ownedNumber.id);
        
        const cleanNumber = canonicalSmsPhone(phoneNumber);
        const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;
        
        const verifyResponse = await fetch(verifyUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        const verifyData = await verifyResponse.json();
        
        if (!verifyResponse.ok || !verifyData.incoming_phone_numbers?.length) {
          throw new Error('Phone number not found in Twilio account');
        }
        
        const twilioNumber = verifyData.incoming_phone_numbers[0];
        const expectedWebhook = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;
        
        result = {
          phone_number: twilioNumber.phone_number,
          current_sms_url: twilioNumber.sms_url,
          expected_webhook: expectedWebhook,
          webhook_configured: twilioNumber.sms_url === expectedWebhook,
        };
        break;
      }

      case 'configure_webhook': {
        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured');
        }
        
        const phoneNumber = request.phoneNumber || request.from;
        if (!phoneNumber) {
          throw new Error('Phone number is required');
        }
        
        const ownedNumber = await loadOwnedActiveNumber(phoneNumber, 'twilio');
        console.log('[SMS Messaging] Configuring webhook for owned number:', ownedNumber.id);
        
        const cleanNumber = canonicalSmsPhone(phoneNumber);
        
        // Get the phone number SID
        const findUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;
        
        const findResponse = await fetch(findUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        const findData = await findResponse.json();
        
        if (!findResponse.ok || !findData.incoming_phone_numbers?.length) {
          throw new Error('Phone number not found in Twilio account');
        }
        
        const twilioNumber = findData.incoming_phone_numbers[0];
        const webhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;

        // Revalidate local ownership/capability immediately before mutating the
        // provider configuration. A stale lookup cannot authorize this write.
        const finalOwnedNumber = await loadOwnedActiveNumber(phoneNumber, 'twilio');
        if (finalOwnedNumber.id !== ownedNumber.id || !sameSmsPhone(twilioNumber.phone_number, phoneNumber)) {
          throw new SmsBoundaryError('Phone number ownership changed before webhook configuration', 'FROM_NUMBER_CONTEXT_CHANGED', 409);
        }
        
        // Update the webhook
        const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${twilioNumber.sid}.json`;
        
        const updateResponse = await fetch(updateUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`,
        });
        
        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          console.error('[SMS Messaging] Failed to configure webhook:', errorText);
          throw new Error('Failed to configure SMS webhook in Twilio');
        }
        
        console.log('[SMS Messaging] Webhook configured successfully for:', phoneNumber);
        
        result = {
          success: true,
          phone_number: phoneNumber,
          webhook_url: webhookUrl,
          message: 'SMS webhook configured. Inbound messages will now trigger auto-replies.',
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[SMS Messaging] Error:', error);
    const boundaryError = error instanceof SmsBoundaryError ? error : null;
    return new Response(JSON.stringify({
      success: false,
      sent: false,
      error: errorMessage,
      code: boundaryError?.code || 'SMS_MESSAGING_ERROR',
      retryable: boundaryError?.retryable ?? false,
      reconciliation_required: boundaryError?.reconciliationRequired ?? false,
    }), {
      status: boundaryError?.status || 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
