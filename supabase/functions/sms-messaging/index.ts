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
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmsRequest {
  action: 'send_sms' | 'get_messages' | 'get_available_numbers';
  to?: string;
  from?: string;
  body?: string;
  lead_id?: string;
  conversation_id?: string;
  limit?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SMS Messaging] User authenticated:', user.id);

    const request: SmsRequest = await req.json();
    console.log('[SMS Messaging] Action:', request.action);

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // Helper function to encode credentials
    const encodeCredentials = (accountSid: string, authToken: string): string => {
      const credentials = `${accountSid}:${authToken}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(credentials);
      return base64Encode(data);
    };

    let result: Record<string, unknown>;

    switch (request.action) {
      case 'send_sms': {
        if (!request.to || !request.from || !request.body) {
          throw new Error('To, from, and body are required for sending SMS');
        }

        if (!twilioAccountSid || !twilioAuthToken) {
          throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Supabase secrets.');
        }

        console.log('[SMS Messaging] Sending SMS from', request.from, 'to', request.to);

        // Clean phone numbers
        const cleanTo = request.to.replace(/[^\d+]/g, '');
        let cleanFrom = request.from.replace(/[^\d+]/g, '');
        
        // Ensure E.164 format
        if (!cleanFrom.startsWith('+')) {
          cleanFrom = '+' + cleanFrom;
        }

        // Verify the "From" number belongs to the Twilio account
        console.log('[SMS Messaging] Verifying phone number ownership...');
        const verifyUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(cleanFrom)}`;
        
        const verifyResponse = await fetch(verifyUrl, {
          headers: {
            'Authorization': 'Basic ' + encodeCredentials(twilioAccountSid, twilioAuthToken),
          },
        });

        const verifyData = await verifyResponse.json();
        
        if (!verifyResponse.ok || !verifyData.incoming_phone_numbers || verifyData.incoming_phone_numbers.length === 0) {
          console.error('[SMS Messaging] Phone number not found in Twilio account:', cleanFrom);
          throw new Error(`The phone number ${cleanFrom} is not registered in your Twilio account. Please ensure the number is purchased and active in your Twilio console, or select a different number.`);
        }

        // Check if the number has SMS capability
        const twilioNumber = verifyData.incoming_phone_numbers[0];
        if (twilioNumber.capabilities && !twilioNumber.capabilities.sms) {
          console.error('[SMS Messaging] Phone number does not support SMS:', cleanFrom);
          throw new Error(`The phone number ${cleanFrom} does not have SMS capability enabled. Please enable SMS in your Twilio console or use a different number.`);
        }

        console.log('[SMS Messaging] Phone number verified:', twilioNumber.sid);

        // Create SMS record first
        const { data: smsRecord, error: insertError } = await supabaseAdmin
          .from('sms_messages')
          .insert({
            user_id: user.id,
            to_number: cleanTo,
            from_number: cleanFrom,
            body: request.body,
            direction: 'outbound',
            status: 'pending',
            lead_id: request.lead_id || null,
            conversation_id: request.conversation_id || null,
            provider_type: 'twilio',
            metadata: {},
          })
          .select()
          .single();

        if (insertError) {
          console.error('[SMS Messaging] Database insert error:', insertError);
          throw new Error('Failed to create SMS record');
        }

        // Send via Twilio
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
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
          });

          const twilioData = await twilioResponse.json();

          if (!twilioResponse.ok) {
            console.error('[SMS Messaging] Twilio error:', twilioData);
            
            // Update SMS record with error
            await supabaseAdmin
              .from('sms_messages')
              .update({ 
                status: 'failed',
                error_message: twilioData.message || 'Twilio API error',
              })
              .eq('id', smsRecord.id);

            throw new Error(twilioData.message || 'Failed to send SMS via Twilio');
          }

          console.log('[SMS Messaging] Twilio response:', twilioData.sid);

          // Update SMS record with success
          await supabaseAdmin
            .from('sms_messages')
            .update({ 
              status: 'sent',
              provider_message_id: twilioData.sid,
              sent_at: new Date().toISOString(),
            })
            .eq('id', smsRecord.id);

          // Update conversation last_message_at if conversation_id provided
          if (request.conversation_id) {
            await supabaseAdmin
              .from('sms_conversations')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', request.conversation_id);
          }

          result = { 
            success: true, 
            message_id: smsRecord.id,
            provider_message_id: twilioData.sid,
          };
        } catch (twilioError) {
          console.error('[SMS Messaging] Twilio send error:', twilioError);
          throw twilioError;
        }
        break;
      }

      case 'get_messages': {
        const limit = request.limit || 50;

        const { data: messages, error: fetchError } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('user_id', user.id)
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
        // Get phone numbers that are SMS-capable from provider_numbers or phone_numbers table
        const { data: numbers, error: numbersError } = await supabaseAdmin
          .from('phone_numbers')
          .select('number')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (numbersError) {
          console.error('[SMS Messaging] Numbers fetch error:', numbersError);
        }

        // Also check provider_numbers for SMS capability
        const { data: providerNumbers, error: providerError } = await supabaseAdmin
          .from('provider_numbers')
          .select('number, capabilities_json')
          .eq('user_id', user.id);

        if (providerError) {
          console.error('[SMS Messaging] Provider numbers fetch error:', providerError);
        }

        // Combine and filter for SMS-capable numbers
        const allNumbers = new Set<string>();
        
        // Add all phone numbers from phone_numbers table
        // These are typically Twilio numbers imported via the system
        // and are assumed to be SMS-capable since Twilio numbers generally support both voice and SMS
        numbers?.forEach(n => allNumbers.add(n.number));
        
        // Add provider numbers that explicitly have SMS capability
        // Note: We only include numbers with explicit 'sms' capability from provider_numbers
        // Voice-only numbers are not included here
        providerNumbers?.forEach(n => {
          const capabilities = n.capabilities_json as string[] || [];
          if (capabilities.includes('sms')) {
            allNumbers.add(n.number);
          }
        });

        result = { numbers: Array.from(allNumbers) };
        break;
      }

      default:
        throw new Error(`Unknown action: ${request.action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[SMS Messaging] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
