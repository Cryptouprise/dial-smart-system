/**
 * SMS Messaging Edge Function
 * 
 * Handles SMS messaging operations via Twilio:
 * - Send SMS messages
 * - Get message history
 * - Get available SMS-enabled numbers
 */ import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// ============= P5: PER-COMPANY HELPERS =============
// Error that carries an HTTP status + stable code (the catch block below maps it to the response).
class HttpError extends Error {
  status;
  code;
  constructor(status, code, message){
    super(message);
    this.status = status;
    this.code = code;
  }
}
// Input validation for values that end up in PostgREST filters or as row keys.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_RE = /^\+?\d{7,15}$/;
function assertUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'INVALID_ID', `${field} must be a UUID`);
  }
  return value;
}
function assertPhone(value, field) {
  const v = (value ?? '').toString().trim();
  if (!PHONE_RE.test(v)) {
    throw new HttpError(400, 'INVALID_PHONE', `${field} must be a phone number (digits, optional leading +)`);
  }
  return v;
}
// Candidate spellings of a phone number as it may be stored in phone_numbers.number
// (same digits-only / +digits normalization the live file used).
function phoneNumberCandidates(raw) {
  const value = (raw || '').toString().trim();
  const digits = value.replace(/\D/g, '');
  const candidates = new Set();
  if (value) candidates.add(value);
  if (digits) {
    candidates.add(digits);
    candidates.add(`+${digits}`);
    if (digits.length === 10) candidates.add(`+1${digits}`);
  }
  return Array.from(candidates);
}
function lastTenDigits(raw) {
  return (raw || '').toString().replace(/\D/g, '').slice(-10);
}
// The companies the authenticated user belongs to (organization_users).
async function loadMemberOrgIds(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin.from('organization_users').select('organization_id').eq('user_id', userId);
  if (error) {
    console.error('[SMS Messaging] organization_users lookup failed:', error);
    throw new HttpError(500, 'MEMBERSHIP_LOOKUP_FAILED', 'Could not resolve company membership');
  }
  return (data || []).map((r)=>r.organization_id).filter(Boolean);
}
// phone_numbers rows that spell `rawNumber`, restricted to the given companies.
async function findOwnedNumbers(supabaseAdmin, rawNumber, orgIds) {
  if (!orgIds.length) return [];
  const { data, error } = await supabaseAdmin.from('phone_numbers').select('id, number, provider, organization_id, user_id, status').in('number', phoneNumberCandidates(rawNumber)).in('organization_id', orgIds);
  if (error) {
    console.error('[SMS Messaging] phone_numbers lookup failed:', error);
    throw new HttpError(500, 'PHONE_LOOKUP_FAILED', 'Could not verify caller ID ownership');
  }
  return data || [];
}
// Resolve the company for a send. Rule: the from-number must be a phone_numbers row of a company the
// caller belongs to. If the body names organization_id, the number must belong to THAT company.
// If the body omits it, the number's own company is used (DECISION in REVIEW.md: this keeps the five
// live callers that never send organization_id working; flip to strict by throwing ORGANIZATION_REQUIRED).
async function resolveSendOrganization(supabaseAdmin, userId, memberOrgIds, explicitOrgId, fromNumber) {
  if (explicitOrgId && !memberOrgIds.includes(explicitOrgId)) {
    throw new HttpError(403, 'NOT_A_MEMBER', 'You are not a member of that company');
  }
  const scopeOrgIds = explicitOrgId ? [
    explicitOrgId
  ] : memberOrgIds;
  const owned = await findOwnedNumbers(supabaseAdmin, fromNumber, scopeOrgIds);
  if (owned.length === 0) {
    throw new HttpError(403, 'CALLER_ID_NOT_OWNED', `The from number ${fromNumber} is not a phone number of ${explicitOrgId ? 'that company' : 'any company you belong to'}`);
  }
  const distinctOrgs = Array.from(new Set(owned.map((n)=>n.organization_id)));
  if (distinctOrgs.length > 1) {
    throw new HttpError(400, 'ORGANIZATION_REQUIRED', 'That from number exists in more than one of your companies - pass organization_id');
  }
  return {
    organizationId: distinctOrgs[0],
    phoneRecord: owned[0]
  };
}
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
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
    const request = await req.json();
    // P5: EVERY action needs a verified caller. The live v525 "publicActions" list (get_available_numbers,
    // check_webhook_status answered with no auth and leaked the whole Twilio number inventory) is deleted.
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let isInternalCall = false;
    if (!authHeader) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized - Please log in to perform this action');
    }
    const token = authHeader.replace('Bearer ', '');
    if (token === serviceRoleKey && request.user_id) {
      // Internal service-to-service call (twilio-sms-webhook, api-gateway) acting for an explicit user.
      userId = request.user_id;
      isInternalCall = true;
      console.log('[SMS Messaging] Internal call for user:', userId);
    } else {
      // Standard JWT-based auth (frontend calls)
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication failed - Please log in again');
      }
      userId = user.id;
      console.log('[SMS Messaging] User authenticated:', userId);
    }
    // Company scope of the caller (used by every action below).
    const memberOrgIds = await loadMemberOrgIds(supabaseAdmin, userId);
    console.log('[SMS Messaging] Action:', request.action, 'internal:', isInternalCall, 'companies:', memberOrgIds.length);
    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    // Helper function to encode credentials
    const encodeCredentials = (accountSid, authToken)=>{
      const credentials = `${accountSid}:${authToken}`;
      return btoa(credentials);
    };
    // Get Telnyx credentials (for health check)
    const telnyxApiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '') || null;
    let result;
    switch(request.action){
      case 'health_check':
        {
          console.log('[SMS Messaging] Health check requested');
          result = {
            success: true,
            healthy: true,
            timestamp: new Date().toISOString(),
            function: 'sms-messaging',
            capabilities: [
              'send_sms',
              'get_messages',
              'get_available_numbers',
              'check_webhook_status',
              'configure_webhook'
            ],
            twilio_configured: !!(twilioAccountSid && twilioAuthToken),
            telnyx_configured: !!telnyxApiKey
          };
          break;
        }
      case 'send_sms':
        {
          if (!request.to || !request.from || !request.body) {
            throw new Error('To, from, and body are required for sending SMS');
          }
          console.log('[SMS Messaging] Sending SMS from', request.from, 'to', request.to);
          // Clean phone numbers
          const cleanTo = assertPhone(String(request.to).replace(/[^\d+]/g, ''), 'to');
          let cleanFrom = String(request.from).replace(/[^\d+]/g, '');
          if (!cleanFrom.startsWith('+')) cleanFrom = '+' + cleanFrom;
          cleanFrom = assertPhone(cleanFrom, 'from');
          if (request.organization_id) assertUuid(request.organization_id, 'organization_id');
          if (request.conversation_id) assertUuid(request.conversation_id, 'conversation_id');
          if (request.lead_id) assertUuid(request.lead_id, 'lead_id');
          // P5: the from number must be a phone_numbers row of a company the caller belongs to
          // (explicit request.organization_id wins; see resolveSendOrganization). Provider comes from that row.
          const { organizationId, phoneRecord } = await resolveSendOrganization(supabaseAdmin, userId, memberOrgIds, request.organization_id || null, cleanFrom);
          console.log('[SMS Messaging] Sending on behalf of organization:', organizationId);
          const isTelnyxNumber = phoneRecord?.provider === 'telnyx';
          // Check we have the right credentials
          if (isTelnyxNumber && !telnyxApiKey) {
            throw new Error('Telnyx API key not configured. Please add TELNYX_API_KEY to Supabase secrets.');
          }
          if (!isTelnyxNumber && (!twilioAccountSid || !twilioAuthToken)) {
            throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Supabase secrets.');
          }
          // Check if we should skip DB insert
          let smsRecordId = null;
          // Security review: skip_db_insert / existing_message_id are honoured ONLY for service-role callers
          // (twilio-sms-webhook pre-stores the AI reply). A browser caller cannot point at another row.
          if (request.skip_db_insert && request.existing_message_id && !isInternalCall) {
            console.warn('[SMS Messaging] Ignoring skip_db_insert/existing_message_id from non-service caller');
          }
          if (request.skip_db_insert && request.existing_message_id && isInternalCall) {
            assertUuid(request.existing_message_id, 'existing_message_id');
            // The pre-stored row must belong to the same company AND user we are sending for.
            const { data: existingRow } = await supabaseAdmin.from('sms_messages').select('id, organization_id, user_id').eq('id', request.existing_message_id).maybeSingle();
            if (!existingRow || existingRow.organization_id && existingRow.organization_id !== organizationId || existingRow.user_id !== userId) {
              throw new HttpError(403, 'MESSAGE_NOT_IN_ORGANIZATION', 'existing_message_id does not belong to this company/user');
            }
            smsRecordId = request.existing_message_id;
            console.log('[SMS Messaging] Skipping DB insert, using existing message:', smsRecordId);
          } else {
            const { data: smsRecord, error: insertError } = await supabaseAdmin.from('sms_messages').insert({
              user_id: userId,
              organization_id: organizationId,
              to_number: cleanTo,
              from_number: cleanFrom,
              body: request.body,
              direction: 'outbound',
              status: 'pending',
              lead_id: request.lead_id || null,
              conversation_id: request.conversation_id || null,
              provider_type: isTelnyxNumber ? 'telnyx' : 'twilio',
              metadata: {}
            }).select().maybeSingle();
            if (insertError) {
              console.error('[SMS Messaging] Database insert error:', insertError);
              throw new Error('Failed to create SMS record');
            }
            smsRecordId = smsRecord?.id;
          }
          // ===== TELNYX SMS PATH =====
          if (isTelnyxNumber) {
            try {
              console.log('[SMS Messaging] Sending via Telnyx API');
              const telnyxResponse = await fetch('https://api.telnyx.com/v2/messages', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${telnyxApiKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from: cleanFrom,
                  to: cleanTo,
                  text: request.body,
                  type: 'SMS'
                })
              });
              const telnyxData = await telnyxResponse.json();
              if (!telnyxResponse.ok) {
                console.error('[SMS Messaging] Telnyx error:', telnyxData);
                if (smsRecordId) {
                  await supabaseAdmin.from('sms_messages').update({
                    status: 'failed',
                    error_message: telnyxData.errors?.[0]?.detail || 'Telnyx API error'
                  }).eq('id', smsRecordId).eq('organization_id', organizationId).eq('user_id', userId);
                }
                throw new Error(telnyxData.errors?.[0]?.detail || 'Failed to send SMS via Telnyx');
              }
              const telnyxMessageId = telnyxData.data?.id;
              console.log('[SMS Messaging] Telnyx response:', telnyxMessageId);
              if (smsRecordId) {
                await supabaseAdmin.from('sms_messages').update({
                  status: 'sent',
                  provider_message_id: telnyxMessageId,
                  sent_at: new Date().toISOString()
                }).eq('id', smsRecordId).eq('organization_id', organizationId).eq('user_id', userId);
              }
              if (request.conversation_id) {
                await supabaseAdmin.from('sms_conversations').update({
                  last_message_at: new Date().toISOString(),
                  last_from_number: cleanFrom
                }).eq('id', request.conversation_id).eq('organization_id', organizationId);
              }
              result = {
                success: true,
                sent: true,
                provider: 'telnyx',
                organization_id: organizationId,
                message_id: smsRecordId,
                provider_message_id: telnyxMessageId
              };
            } catch (telnyxError) {
              console.error('[SMS Messaging] Telnyx send error:', telnyxError);
              throw telnyxError;
            }
          } else {
            // Verify the "From" number belongs to the Twilio account
            console.log('[SMS Messaging] Verifying phone number ownership...');
            const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanFrom)}`;
            const verifyResponse = await fetch(verifyUrl, {
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
              }
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyData.incoming_phone_numbers || verifyData.incoming_phone_numbers.length === 0) {
              console.error('[SMS Messaging] Phone number not found in Twilio account:', cleanFrom);
              throw new Error(`The phone number ${cleanFrom} is not registered in your Twilio account.`);
            }
            const twilioNumber = verifyData.incoming_phone_numbers[0];
            if (twilioNumber.capabilities && !twilioNumber.capabilities.sms) {
              throw new Error(`The phone number ${cleanFrom} does not have SMS capability enabled.`);
            }
            console.log('[SMS Messaging] Phone number verified:', twilioNumber.sid);
            try {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const formData = new URLSearchParams();
              formData.append('To', cleanTo);
              formData.append('From', cleanFrom);
              formData.append('Body', request.body);
              const twilioResponse = await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
              });
              const twilioData = await twilioResponse.json();
              if (!twilioResponse.ok) {
                console.error('[SMS Messaging] Twilio error:', twilioData);
                if (smsRecordId) {
                  await supabaseAdmin.from('sms_messages').update({
                    status: 'failed',
                    error_message: twilioData.message || 'Twilio API error'
                  }).eq('id', smsRecordId).eq('organization_id', organizationId).eq('user_id', userId);
                }
                throw new Error(twilioData.message || 'Failed to send SMS via Twilio');
              }
              console.log('[SMS Messaging] Twilio response:', twilioData.sid);
              if (smsRecordId) {
                await supabaseAdmin.from('sms_messages').update({
                  status: 'sent',
                  provider_message_id: twilioData.sid,
                  sent_at: new Date().toISOString()
                }).eq('id', smsRecordId).eq('organization_id', organizationId).eq('user_id', userId);
              }
              if (request.conversation_id) {
                await supabaseAdmin.from('sms_conversations').update({
                  last_message_at: new Date().toISOString(),
                  last_from_number: cleanFrom
                }).eq('id', request.conversation_id).eq('organization_id', organizationId);
              }
              result = {
                success: true,
                sent: true,
                provider: 'twilio',
                organization_id: organizationId,
                message_id: smsRecordId,
                provider_message_id: twilioData.sid
              };
            } catch (twilioError) {
              console.error('[SMS Messaging] Twilio send error:', twilioError);
              throw twilioError;
            }
          }
          break;
        }
      case 'get_messages':
        {
          const limit = request.limit || 50;
          // P5: messages of the caller's companies (optionally one company), not just the caller's own rows.
          let scopeOrgIds = memberOrgIds;
          if (request.organization_id) {
            assertUuid(request.organization_id, 'organization_id');
            if (!memberOrgIds.includes(request.organization_id)) {
              throw new HttpError(403, 'NOT_A_MEMBER', 'You are not a member of that company');
            }
            scopeOrgIds = [
              request.organization_id
            ];
          }
          if (scopeOrgIds.length === 0) {
            result = {
              messages: []
            };
            break;
          }
          const { data: messages, error: fetchError } = await supabaseAdmin.from('sms_messages').select('*').in('organization_id', scopeOrgIds).order('created_at', {
            ascending: false
          }).limit(limit);
          if (fetchError) {
            console.error('[SMS Messaging] Fetch error:', fetchError);
            throw new Error('Failed to fetch messages');
          }
          result = {
            messages: messages || []
          };
          break;
        }
      case 'get_available_numbers':
        {
          if (!twilioAccountSid || !twilioAuthToken) {
            throw new Error('Twilio credentials not configured');
          }
          // P5: only numbers that phone_numbers assigns to one of the caller's companies may be listed.
          let scopeOrgIds = memberOrgIds;
          if (request.organization_id) {
            assertUuid(request.organization_id, 'organization_id');
            if (!memberOrgIds.includes(request.organization_id)) {
              throw new HttpError(403, 'NOT_A_MEMBER', 'You are not a member of that company');
            }
            scopeOrgIds = [
              request.organization_id
            ];
          }
          if (scopeOrgIds.length === 0) {
            console.log('[SMS Messaging] Caller belongs to no company - returning no numbers');
            result = {
              numbers: []
            };
            break;
          }
          const { data: ownedRows, error: ownedErr } = await supabaseAdmin.from('phone_numbers').select('number, organization_id, provider, status').in('organization_id', scopeOrgIds);
          if (ownedErr) {
            console.error('[SMS Messaging] phone_numbers lookup failed:', ownedErr);
            throw new Error('Failed to load company phone numbers');
          }
          const ownedByDigits = new Map();
          (ownedRows || []).forEach((row)=>{
            const key = lastTenDigits(row.number);
            if (key && !ownedByDigits.has(key)) ownedByDigits.set(key, row);
          });
          if (ownedByDigits.size === 0) {
            result = {
              numbers: []
            };
            break;
          }
          // Fetch actual SMS-capable numbers from Twilio
          console.log('[SMS Messaging] Fetching available numbers from Twilio...');
          const twilioNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`;
          const twilioResponse = await fetch(twilioNumbersUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
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
          let messagingServiceNumbers = new Set();
          try {
            const messagingServicesUrl = `https://messaging.twilio.com/v1/Services`;
            const msResponse = await fetch(messagingServicesUrl, {
              headers: {
                'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
              }
            });
            if (msResponse.ok) {
              const msData = await msResponse.json();
              const services = msData.services || [];
              // For each messaging service, get the phone numbers assigned to it
              for (const service of services){
                try {
                  const phoneNumbersUrl = `https://messaging.twilio.com/v1/Services/${service.sid}/PhoneNumbers`;
                  const pnResponse = await fetch(phoneNumbersUrl, {
                    headers: {
                      'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
                    }
                  });
                  if (pnResponse.ok) {
                    const pnData = await pnResponse.json();
                    const phoneNumbers = pnData.phone_numbers || [];
                    phoneNumbers.forEach((pn)=>{
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
          // Filter for SMS-capable numbers OWNED BY THE CALLER'S COMPANIES and include webhook + A2P status
          // (same item shape as live v525, plus organization_id).
          const smsCapableNumbers = twilioNumbers.filter((num)=>num.capabilities?.sms === true && ownedByDigits.has(lastTenDigits(num.phone_number))).map((num)=>{
            const owned = ownedByDigits.get(lastTenDigits(num.phone_number));
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
              organization_id: owned?.organization_id || null,
              status_details: !webhookConfigured && !a2pRegistered ? 'Needs webhook & A2P' : !webhookConfigured ? 'Needs webhook' : !a2pRegistered ? 'Needs A2P registration' : 'Ready'
            };
          });
          console.log('[SMS Messaging] Found', smsCapableNumbers.length, 'SMS-capable numbers in Twilio owned by caller companies (of', twilioNumbers.length, 'in account)');
          console.log('[SMS Messaging] Ready numbers:', smsCapableNumbers.filter((n)=>n.is_ready).length);
          result = {
            numbers: smsCapableNumbers
          };
          break;
        }
      case 'check_webhook_status':
        {
          if (!twilioAccountSid || !twilioAuthToken) {
            throw new Error('Twilio credentials not configured');
          }
          const phoneNumber = request.phoneNumber || request.from;
          if (!phoneNumber) {
            throw new Error('Phone number is required');
          }
          console.log('[SMS Messaging] Checking webhook status for:', phoneNumber);
          const cleanNumber = assertPhone(String(phoneNumber).replace(/[^\d+]/g, ''), 'phoneNumber');
          // P5: a logged-in user may only inspect numbers of their own companies.
          if ((await findOwnedNumbers(supabaseAdmin, cleanNumber, memberOrgIds)).length === 0) {
            throw new HttpError(403, 'CALLER_ID_NOT_OWNED', `The phone number ${cleanNumber} is not a phone number of any company you belong to`);
          }
          const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;
          const verifyResponse = await fetch(verifyUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
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
            webhook_configured: twilioNumber.sms_url === expectedWebhook
          };
          break;
        }
      case 'configure_webhook':
        {
          if (!twilioAccountSid || !twilioAuthToken) {
            throw new Error('Twilio credentials not configured');
          }
          const phoneNumber = request.phoneNumber || request.from;
          if (!phoneNumber) {
            throw new Error('Phone number is required');
          }
          console.log('[SMS Messaging] Configuring webhook for:', phoneNumber);
          const cleanNumber = assertPhone(String(phoneNumber).replace(/[^\d+]/g, ''), 'phoneNumber');
          // P5: only numbers of the caller's own companies may be (re)pointed at our webhook.
          if ((await findOwnedNumbers(supabaseAdmin, cleanNumber, memberOrgIds)).length === 0) {
            throw new HttpError(403, 'CALLER_ID_NOT_OWNED', `The phone number ${cleanNumber} is not a phone number of any company you belong to`);
          }
          // Get the phone number SID
          const findUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanNumber)}`;
          const findResponse = await fetch(findUrl, {
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken)
            }
          });
          const findData = await findResponse.json();
          if (!findResponse.ok || !findData.incoming_phone_numbers?.length) {
            throw new Error('Phone number not found in Twilio account');
          }
          const twilioNumber = findData.incoming_phone_numbers[0];
          const webhookUrl = `${supabaseUrl}/functions/v1/twilio-sms-webhook`;
          // Update the webhook
          const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers/${twilioNumber.sid}.json`;
          const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `SmsUrl=${encodeURIComponent(webhookUrl)}&SmsMethod=POST`
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
            message: 'SMS webhook configured. Inbound messages will now trigger auto-replies.'
          };
          break;
        }
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[SMS Messaging] Error:', error);
    // P5: auth/ownership failures keep their real status (401/403/400); everything else stays 500 as live.
    const status = error instanceof HttpError ? error.status : 500;
    const body = {
      error: errorMessage
    };
    if (error instanceof HttpError) body.code = error.code;
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
