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
    const request: SmsRequest & { user_id?: string } = await req.json();
    
    // Actions that don't require user authentication (read-only Twilio operations)
    const publicActions = ['get_available_numbers', 'check_webhook_status'];
    
    // Verify authentication (supports both frontend JWT calls and internal service calls)
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (publicActions.includes(request.action)) {
      // These actions don't require user auth - they just query Twilio
      console.log('[SMS Messaging] Public action:', request.action);
      userId = null;
    } else if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Please log in to perform this action' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const token = authHeader.replace('Bearer ', '');

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

    let result: Record<string, unknown>;

    switch (request.action) {
      case 'health_check': {
        console.log('[SMS Messaging] Health check requested');
        result = {
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'sms-messaging',
          capabilities: ['send_sms', 'get_messages', 'get_available_numbers', 'check_webhook_status', 'configure_webhook'],
          twilio_configured: !!(twilioAccountSid && twilioAuthToken),
          telnyx_configured: !!telnyxApiKey,
        };
        break;
      }

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

        // Check if we should skip DB insert (message already stored by caller like twilio-sms-webhook)
        let smsRecordId: string | null = null;
        
        if (request.skip_db_insert && request.existing_message_id) {
          // Message already exists, just use the provided ID
          smsRecordId = request.existing_message_id;
          console.log('[SMS Messaging] Skipping DB insert, using existing message:', smsRecordId);
        } else {
          // Create SMS record first
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
              provider_type: 'twilio',
              metadata: {},
            })
            .select()
            .maybeSingle();

          if (insertError) {
            console.error('[SMS Messaging] Database insert error:', insertError);
            throw new Error('Failed to create SMS record');
          }
          
          smsRecordId = smsRecord?.id;
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
            if (smsRecordId) {
              await supabaseAdmin
                .from('sms_messages')
                .update({ 
                  status: 'failed',
                  error_message: twilioData.message || 'Twilio API error',
                })
                .eq('id', smsRecordId);
            }

            throw new Error(twilioData.message || 'Failed to send SMS via Twilio');
          }

          console.log('[SMS Messaging] Twilio response:', twilioData.sid);

          // Update SMS record with success
          if (smsRecordId) {
            await supabaseAdmin
              .from('sms_messages')
              .update({ 
                status: 'sent',
                provider_message_id: twilioData.sid,
                sent_at: new Date().toISOString(),
              })
              .eq('id', smsRecordId);
          }

          // Update conversation last_message_at if conversation_id provided
          if (request.conversation_id) {
            await supabaseAdmin
              .from('sms_conversations')
              .update({ last_message_at: new Date().toISOString() })
              .eq('id', request.conversation_id);
          }

          result = { 
            success: true, 
            message_id: smsRecordId,
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

        // Fetch actual SMS-capable numbers from Twilio
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
        let messagingServiceNumbers: Set<string> = new Set();
        
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
          .filter((num: any) => num.capabilities?.sms === true)
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

        result = { numbers: smsCapableNumbers };
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
        
        console.log('[SMS Messaging] Checking webhook status for:', phoneNumber);
        
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
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
        
        console.log('[SMS Messaging] Configuring webhook for:', phoneNumber);
        
        const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
        
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
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
