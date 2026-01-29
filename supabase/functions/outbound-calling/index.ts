
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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

interface OutboundCallRequest {
  action: 'create_call' | 'get_call_status' | 'end_call' | 'health_check';
  campaignId?: string;
  leadId?: string;
  phoneNumber?: string;
  callerId?: string;
  agentId?: string;
  retellCallId?: string;
  userId?: string; // For service-role calls from call-dispatcher
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    
    let userId: string;
    
    if (isServiceRoleCall) {
      // Service role call - get userId from request body
      console.log('[Outbound Calling] Service role call detected');
      const body = await req.clone().json();
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
      campaignId, 
      leadId, 
      phoneNumber, 
      callerId, 
      agentId, 
      retellCallId
    }: OutboundCallRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Outbound Calling] Processing ${action} request for user:`, userId);


    const baseUrl = 'https://api.retellai.com/v2';
    const retellHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;
    let result: any = {};

    switch (action) {
      case 'create_call':
        if (!phoneNumber || !callerId || !agentId) {
          throw new Error('Phone number, caller ID, and agent ID are required');
        }
        
        // Validate and normalize phone number
        const normalizedPhone = phoneNumber.replace(/\D/g, '');
        if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
          throw new Error(`Invalid phone number format: ${phoneNumber}. Must be 10-15 digits.`);
        }
        
        // Ensure phone number has country code
        const finalPhone = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

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
            caller_id: callerId,
            status: 'queued'
          })
          .select()
          .maybeSingle();

        if (callLogError) {
          console.error('[Outbound Calling] Call log error:', callLogError);
          throw callLogError;
        }

        console.log('[Outbound Calling] Call log created:', callLog.id);

        // ========================================================================
        // CREDIT SYSTEM: Pre-call balance check and reservation
        // ========================================================================
        let organizationId: string | null = null;
        let creditReserved = false;

        try {
          // Get organization from user
          const { data: orgUser } = await supabaseAdmin
            .from('organization_users')
            .select('organization_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

          organizationId = orgUser?.organization_id || null;

          if (organizationId) {
            // Check credit balance (estimated 1 minute)
            const { data: balanceCheck, error: balanceError } = await supabaseAdmin
              .rpc('check_credit_balance', {
                p_organization_id: organizationId,
                p_minutes_needed: 1
              });

            if (!balanceError && balanceCheck?.[0]) {
              const check = balanceCheck[0];

              // If billing is enabled, verify credits
              if (check.billing_enabled) {
                // Look up agent-specific pricing first
                let costPerMinuteCents = check.cost_per_minute_cents || 15;

                const { data: agentPricing } = await supabaseAdmin
                  .from('agent_pricing')
                  .select('customer_price_per_min_cents')
                  .eq('organization_id', organizationId)
                  .eq('retell_agent_id', agentId)
                  .eq('is_active', true)
                  .maybeSingle();

                if (agentPricing?.customer_price_per_min_cents) {
                  costPerMinuteCents = Math.round(agentPricing.customer_price_per_min_cents);
                  console.log(`[Outbound Calling] Using agent-specific pricing: ${costPerMinuteCents}c/min for agent ${agentId}`);
                } else {
                  console.log(`[Outbound Calling] Using default org pricing: ${costPerMinuteCents}c/min`);
                }

                console.log(`[Outbound Calling] Credit check: balance=${check.available_balance_cents}c, required=${costPerMinuteCents}c`);

                // Check if balance covers the cost
                if (check.available_balance_cents < costPerMinuteCents) {
                  // Insufficient credits - fail the call
                  await supabaseAdmin
                    .from('call_logs')
                    .update({
                      status: 'failed',
                      ended_at: new Date().toISOString(),
                      notes: `Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}`
                    })
                    .eq('id', callLog.id);

                  throw new Error(`Insufficient credits. Available: $${(check.available_balance_cents / 100).toFixed(2)}. Please add credits to continue making calls.`);
                }

                // Reserve credits for this call using agent-specific rate
                const { data: reservation, error: reserveError } = await supabaseAdmin
                  .rpc('reserve_credits', {
                    p_organization_id: organizationId,
                    p_amount_cents: costPerMinuteCents,
                    p_call_log_id: callLog.id,
                    p_retell_call_id: null // Will be updated after Retell responds
                  });

                if (!reserveError && reservation?.[0]?.success) {
                  creditReserved = true;
                  console.log(`[Outbound Calling] Reserved ${costPerMinuteCents}c. Remaining: ${reservation[0].available_balance_cents}c`);
                } else {
                  console.warn('[Outbound Calling] Credit reservation failed:', reserveError || reservation?.[0]?.error_message);
                  // Continue anyway - finalization will handle deduction
                }
              }
            }

            // Store organization_id in call log for webhook processing
            await supabaseAdmin
              .from('call_logs')
              .update({ organization_id: organizationId })
              .eq('id', callLog.id);
          }
        } catch (creditError: any) {
          // If it's an insufficient credits error, propagate it
          if (creditError.message?.includes('Insufficient credits')) {
            throw creditError;
          }
          // Otherwise log and continue (fail open for backward compatibility)
          console.error('[Outbound Calling] Credit check error (continuing):', creditError);
        }
        // ========================================================================

        // Create outbound call via Retell AI
        console.log('[Outbound Calling] Initiating Retell AI call:', {
          from: callerId,
          to: finalPhone, // Use normalized phone
          agent: agentId
        });

        // First, check if the phone number exists in Retell and set the outbound agent
        console.log('[Outbound Calling] Checking phone number in Retell:', callerId);
        
        // Try to get the phone number first to see if it exists in Retell
        const getPhoneResponse = await fetchWithTimeout(`https://api.retellai.com/get-phone-number/${encodeURIComponent(callerId)}`, {
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
                notes: `Phone number ${callerId} is not imported in Retell AI. Please import this number in your Retell dashboard or use a number that has been imported.`,
              })
              .eq('id', callLog.id);
            
            throw new Error(`Phone number ${callerId} is not registered in Retell AI. To use this number for AI calls, you must first import it in the Retell dashboard (Phone Numbers section). Alternatively, use a different number that is already in Retell.`);
          }
        }
        
        // Now try to set the outbound agent on the phone number
        console.log('[Outbound Calling] Setting outbound agent on phone number...');
        const updatePhoneResponse = await fetchWithTimeout(`https://api.retellai.com/update-phone-number/${encodeURIComponent(callerId)}`, {
          method: 'PATCH',
          headers: retellHeaders,
          body: JSON.stringify({
            outbound_agent_id: agentId
          }),
        }, 15000);

        if (!updatePhoneResponse.ok) {
          const updateError = await updatePhoneResponse.text();
          console.error('[Outbound Calling] CRITICAL: Failed to set outbound agent:', updateError);

          // Log this critical error
          await logError(supabaseAdmin, 'outbound-calling', 'set_outbound_agent', userId, {
            message: `Failed to set Retell agent ${agentId} on phone ${callerId}`,
            retellError: updateError
          }, { callerId, agentId, phoneNumber });

          // Check if this is a permissions/not-found error vs transient error
          if (updateError.includes('not found') || updateError.includes('404')) {
            throw new Error(`Phone number ${callerId} not found in Retell. Import it first.`);
          } else if (updateError.includes('permission') || updateError.includes('403')) {
            throw new Error(`Permission denied setting agent on ${callerId}. Check Retell API key permissions.`);
          }
          // For other errors, throw with the original message
          throw new Error(`Failed to configure Retell agent for calling: ${updateError}`);
        } else {
          console.log('[Outbound Calling] Outbound agent set successfully');
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
          const firstName = String(lead.first_name || '');
          const lastName = String(lead.last_name || '');
          const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'there';
          const email = String(lead.email || '');
          const phone = String(lead.phone_number || finalPhone || '');
          const company = String(lead.company || '');
          const leadSource = String(lead.lead_source || '');
          const notes = String(lead.notes || '');
          const tags = Array.isArray(lead.tags) ? lead.tags.join(', ') : '';
          const preferredContactTime = String(lead.preferred_contact_time || '');
          const timezone = String(lead.timezone || 'America/New_York');
          
          // Address fields
          const address = String(lead.address || '');
          const city = String(lead.city || '');
          const state = String(lead.state || '');
          const zipCode = String(lead.zip_code || '');
          const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

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

          console.log('[Outbound Calling] Dynamic variables prepared:', JSON.stringify(dynamicVariables));
        } else {
          console.log('[Outbound Calling] No lead found, using empty dynamic variables');
        }

        try {
          response = await retryWithBackoff(
            async () => {
              // Use fetchWithTimeout to prevent hanging requests (30 second timeout)
              const res = await fetchWithTimeout(`${baseUrl}/create-phone-call`, {
                method: 'POST',
                headers: retellHeaders,
                body: JSON.stringify({
                  from_number: callerId,
                  to_number: finalPhone,
                  agent_id: agentId,
                  retell_llm_dynamic_variables: dynamicVariables,
                  metadata: {
                    campaign_id: campaignId,
                    lead_id: leadId,
                    call_log_id: callLog.id,
                    user_id: userId,
                    organization_id: organizationId // For credit deduction in webhook
                  }
                }),
              }, 30000);

              if (!res.ok) {
                const errorText = await res.text();
                
                // Check for rate limit / concurrency errors from Retell
                if (res.status === 429 || errorText.includes('concurrency') || errorText.includes('rate limit')) {
                  console.warn('[Outbound Calling] Retell rate limit hit - concurrency exceeded');
                  throw new Error(`RATE_LIMIT: Retell concurrency limit exceeded. Status ${res.status}`);
                }
                
                throw new Error(`Retell API error ${res.status}: ${errorText}`);
              }

              return res;
            },
            'Retell create-phone-call',
            3,  // 3 retries
            2000 // 2 second base delay
          );
        } catch (err: any) {
          const message = err?.message ? String(err.message) : String(err);
          console.error('[Outbound Calling] Retell create-phone-call failed:', message);

          // IMPORTANT: ensure we don't leave call_logs stuck in "queued" when Retell rejects the call.
          await supabaseAdmin
            .from('call_logs')
            .update({
              status: 'failed',
              ended_at: new Date().toISOString(),
              notes: `Retell API error: ${message}`,
            })
            .eq('id', callLog.id);

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
            .eq('id', callLog.id);
          
          // Log error to database
          await logError(supabaseAdmin, 'outbound-calling', 'create_call', userId,
            new Error(errorMessage),
            { leadId, campaignId, severity: 'error' }
          );
            
          throw new Error(`Failed to create call via Retell: ${errorMessage}`);
        }

        const callData = await response.json();
        console.log('[Outbound Calling] Retell AI call created:', callData.call_id);

        // Update call log with Retell call ID using admin client
        await supabaseAdmin
          .from('call_logs')
          .update({ 
            retell_call_id: callData.call_id,
            status: 'ringing'
          })
          .eq('id', callLog.id);

        result = { 
          call_id: callData.call_id, 
          call_log_id: callLog.id,
          status: 'created' 
        };
        break;

      case 'get_call_status':
        if (!retellCallId) {
          throw new Error('Retell call ID is required');
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

      case 'health_check':
        // Health check for system verification
        console.log('[Outbound Calling] Health check requested');
        const retellConfigured = !!apiKey;
        result = {
          success: true,
          healthy: true,
          retell_configured: retellConfigured,
          timestamp: new Date().toISOString(),
          capabilities: ['create_call', 'get_call_status', 'end_call', 'health_check'],
          rate_limit_handling: true,
          retry_logic: true
        };
        break;

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[Outbound Calling] Error:', error);
    console.error('[Outbound Calling] Error stack:', (error as Error).stack);
    return new Response(JSON.stringify({ 
      error: (error as Error).message,
      details: 'Check edge function logs for more information'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
