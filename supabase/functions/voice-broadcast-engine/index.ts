import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProviderConfig {
  retellKey?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  telnyxApiKey?: string;
}

interface SipTrunkConfig {
  id: string;
  provider_type: 'twilio' | 'telnyx' | 'generic';
  is_active: boolean;
  is_default: boolean;
  sip_host?: string;
  sip_port?: number;
  transport?: string;
  auth_type?: string;
  username?: string;
  password_encrypted?: string;
  twilio_trunk_sid?: string;
  twilio_termination_uri?: string;
  telnyx_connection_id?: string;
  outbound_proxy?: string;
  caller_id_header?: string;
  cost_per_minute?: number;
}

interface CallResult {
  success: boolean;
  provider: string;
  callId?: string;
  error?: string;
  usedSipTrunk?: boolean;
}

// Make a call using Retell AI
async function callWithRetell(
  retellKey: string,
  fromNumber: string,
  toNumber: string,
  metadata: Record<string, unknown>,
  agentId?: string
): Promise<CallResult> {
  try {
    console.log(`Making Retell call from ${fromNumber} to ${toNumber}${agentId ? ` with agent ${agentId}` : ''}`);
    
    // Build request body - only include override_agent_id if it's a valid string
    const requestBody: Record<string, unknown> = {
      from_number: fromNumber,
      to_number: toNumber,
      metadata,
    };
    
    // Only add override_agent_id if it's a non-empty string
    if (agentId && typeof agentId === 'string' && agentId.trim() !== '') {
      requestBody.override_agent_id = agentId;
    }
    
    const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Retell API error:', errorText);
      return { success: false, provider: 'retell', error: errorText };
    }

    const result = await response.json();
    return { success: true, provider: 'retell', callId: result.call_id };
  } catch (error: any) {
    console.error('Retell call error:', error);
    return { success: false, provider: 'retell', error: error.message };
  }
}

// Smart number selection with local presence and rotation
function selectBestNumber(
  phoneNumbers: any[],
  toNumber: string,
  numberUsageCount: Map<string, number>,
  enableLocalPresence: boolean = true,
  enableRotation: boolean = true
): any {
  if (phoneNumbers.length === 0) return null;
  if (phoneNumbers.length === 1) return phoneNumbers[0];

  // Extract area code from destination number
  const toAreaCode = toNumber.replace(/\D/g, '').slice(1, 4); // Remove +1 and get area code
  
  let scoredNumbers = phoneNumbers.map(num => {
    let score = 0;
    const numAreaCode = num.number.replace(/\D/g, '').slice(1, 4);
    
    // Local presence: prefer matching area codes (+50 points)
    if (enableLocalPresence && numAreaCode === toAreaCode) {
      score += 50;
    }
    
    // Prefer Retell-registered numbers (+20 points)
    if (num.retell_phone_id) {
      score += 20;
    }
    
    // Avoid spam-flagged numbers (-100 points)
    if (num.is_spam) {
      score -= 100;
    }
    
    // Avoid quarantined numbers (-100 points)
    if (num.quarantine_until && new Date(num.quarantine_until) > new Date()) {
      score -= 100;
    }
    
    // Number rotation: prefer less-used numbers today
    if (enableRotation) {
      const usageToday = numberUsageCount.get(num.id) || 0;
      score -= usageToday * 2; // Penalize heavily-used numbers
    }
    
    // Prefer numbers with lower daily usage
    if (num.daily_usage) {
      score -= Math.min(num.daily_usage, 50);
    }
    
    return { number: num, score };
  });
  
  // Sort by score descending
  scoredNumbers.sort((a, b) => b.score - a.score);
  
  // Return the best number
  return scoredNumbers[0].number;
}

// Helper function to escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Make a call using Twilio
async function callWithTwilio(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  toNumber: string,
  audioUrl: string,
  metadata: Record<string, unknown>,
  statusCallbackUrl: string,
  dtmfHandlerUrl: string,
  transferNumber?: string
): Promise<CallResult> {
  try {
    console.log(`Making Twilio call from ${fromNumber} to ${toNumber}`);
    console.log(`Audio URL: ${audioUrl}`);
    
    // Build DTMF action URL with transfer number if available
    const dtmfActionUrl = transferNumber 
      ? `${dtmfHandlerUrl}?transfer=${encodeURIComponent(transferNumber)}&queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`
      : `${dtmfHandlerUrl}?queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`;
    
    // XML-escape URLs for TwiML
    const escapedAudioUrl = escapeXml(audioUrl);
    const escapedDtmfActionUrl = escapeXml(dtmfActionUrl);
    
    console.log(`Escaped Audio URL: ${escapedAudioUrl}`);
    console.log(`Escaped DTMF Action URL: ${escapedDtmfActionUrl}`);
    
    // Create TwiML for playing audio and handling DTMF
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${escapedDtmfActionUrl}" method="POST" timeout="10">
    <Play>${escapedAudioUrl}</Play>
  </Gather>
  <Say>We didn't receive a response. Goodbye.</Say>
  <Hangup/>
</Response>`;
    
    console.log('TwiML Response:', twimlResponse);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toNumber,
          From: fromNumber,
          Twiml: twimlResponse,
          StatusCallback: statusCallbackUrl,
          StatusCallbackEvent: 'initiated ringing answered completed',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio API error:', errorText);
      return { success: false, provider: 'twilio', error: errorText };
    }

    const result = await response.json();
    return { success: true, provider: 'twilio', callId: result.sid };
  } catch (error: any) {
    console.error('Twilio call error:', error);
    return { success: false, provider: 'twilio', error: error.message };
  }
}

// Make a call using Telnyx
async function callWithTelnyx(
  apiKey: string,
  fromNumber: string,
  toNumber: string,
  audioUrl: string,
  metadata: Record<string, unknown>,
  webhookUrl: string,
  connectionId?: string
): Promise<CallResult> {
  try {
    console.log(`Making Telnyx call from ${fromNumber} to ${toNumber}${connectionId ? ` via connection ${connectionId}` : ''}`);
    
    const response = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: connectionId || '', // Use SIP connection if provided
        to: toNumber,
        from: fromNumber,
        webhook_url: webhookUrl,
        answering_machine_detection: 'detect',
        custom_headers: metadata,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telnyx API error:', errorText);
      return { success: false, provider: 'telnyx', error: errorText };
    }

    const result = await response.json();
    return { success: true, provider: 'telnyx', callId: result.data?.call_control_id, usedSipTrunk: !!connectionId };
  } catch (error: any) {
    console.error('Telnyx call error:', error);
    return { success: false, provider: 'telnyx', error: error.message };
  }
}

// Make a call using Twilio Elastic SIP Trunk
async function callWithTwilioSipTrunk(
  accountSid: string,
  authToken: string,
  trunkSid: string,
  terminationUri: string,
  fromNumber: string,
  toNumber: string,
  audioUrl: string,
  metadata: Record<string, unknown>,
  statusCallbackUrl: string,
  dtmfHandlerUrl: string,
  transferNumber?: string
): Promise<CallResult> {
  try {
    console.log(`Making Twilio SIP trunk call from ${fromNumber} to ${toNumber} via trunk ${trunkSid}`);
    
    // Build DTMF action URL with transfer number if available
    const dtmfActionUrl = transferNumber 
      ? `${dtmfHandlerUrl}?transfer=${encodeURIComponent(transferNumber)}&queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`
      : `${dtmfHandlerUrl}?queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`;
    
    // XML-escape URLs for TwiML
    const escapedAudioUrl = escapeXml(audioUrl);
    const escapedDtmfActionUrl = escapeXml(dtmfActionUrl);
    
    // Create TwiML for playing audio and handling DTMF
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${escapedDtmfActionUrl}" method="POST" timeout="10">
    <Play>${escapedAudioUrl}</Play>
  </Gather>
  <Say>We didn't receive a response. Goodbye.</Say>
  <Hangup/>
</Response>`;

    // For SIP trunk, we use the sip: URI format to route through the trunk
    // The To field uses sip:number@terminationUri format
    const sipTo = `sip:${toNumber.replace(/\+/g, '')}@${terminationUri}`;
    
    console.log(`SIP To address: ${sipTo}`);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: sipTo,
          From: fromNumber,
          Twiml: twimlResponse,
          StatusCallback: statusCallbackUrl,
          StatusCallbackEvent: 'initiated ringing answered completed',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio SIP trunk API error:', errorText);
      return { success: false, provider: 'twilio-sip', error: errorText };
    }

    const result = await response.json();
    return { success: true, provider: 'twilio-sip', callId: result.sid, usedSipTrunk: true };
  } catch (error: any) {
    console.error('Twilio SIP trunk call error:', error);
    return { success: false, provider: 'twilio-sip', error: error.message };
  }
}

// Determine best provider based on number and availability
// For voice broadcasts with audio files, prefer Twilio since it handles TwiML/audio playback
function selectProvider(
  providers: ProviderConfig,
  numberProvider?: string,
  hasAudioUrl: boolean = true
): 'retell' | 'twilio' | 'telnyx' | null {
  // If number has a specific provider, prefer that
  if (numberProvider === 'retell' && providers.retellKey) return 'retell';
  if (numberProvider === 'twilio' && providers.twilioAccountSid && providers.twilioAuthToken) return 'twilio';
  if (numberProvider === 'telnyx' && providers.telnyxApiKey) return 'telnyx';
  
  // For voice broadcasts with audio URLs, prefer Twilio (better for TwiML/audio playback)
  if (hasAudioUrl) {
    if (providers.twilioAccountSid && providers.twilioAuthToken) return 'twilio';
    if (providers.telnyxApiKey) return 'telnyx';
    if (providers.retellKey) return 'retell';
  } else {
    // For AI conversational mode, prefer Retell
    if (providers.retellKey) return 'retell';
    if (providers.twilioAccountSid && providers.twilioAuthToken) return 'twilio';
    if (providers.telnyxApiKey) return 'telnyx';
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get provider API keys
    const providers: ProviderConfig = {
      retellKey: Deno.env.get('RETELL_AI_API_KEY'),
      twilioAccountSid: Deno.env.get('TWILIO_ACCOUNT_SID'),
      twilioAuthToken: Deno.env.get('TWILIO_AUTH_TOKEN'),
      telnyxApiKey: Deno.env.get('TELNYX_API_KEY'),
    };
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const requestBody = await req.json();
    const { action, broadcastId, queueItemId, digit } = requestBody;

    console.log(`Voice broadcast engine action: ${action} for broadcast ${broadcastId}`);

    // Verify broadcast ownership
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .single();

    if (broadcastError || !broadcast) {
      throw new Error('Broadcast not found or access denied');
    }

    switch (action) {
      case 'start': {
        if (!broadcast.audio_url && broadcast.ivr_mode !== 'ai_conversational') {
          throw new Error('No audio generated for this broadcast. Please generate audio first.');
        }

        // Check if there are pending calls
        const { count: pendingCount, error: countError } = await supabase
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending');

        if (countError) throw countError;

        if (!pendingCount || pendingCount === 0) {
          throw new Error('No pending calls in the queue. Add leads first.');
        }

        // Update broadcast status
        const { error: updateStatusError } = await supabase
          .from('voice_broadcasts')
          .update({ status: 'active' })
          .eq('id', broadcastId);

        if (updateStatusError) throw updateStatusError;

        // Get available phone numbers with provider info
        const { data: phoneNumbers, error: numbersError } = await supabase
          .from('phone_numbers')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .eq('is_spam', false);

        if (numbersError) throw numbersError;

        if (!phoneNumbers || phoneNumbers.length === 0) {
          throw new Error('No active phone numbers available. Please add phone numbers first.');
        }

        // Determine which provider to use - pass hasAudioUrl to prefer Twilio for audio playback
        const hasAudioUrl = !!broadcast.audio_url;
        const selectedProvider = selectProvider(providers, undefined, hasAudioUrl);
        if (!selectedProvider) {
          throw new Error('No telephony provider configured. Please configure Retell AI, Twilio, or Telnyx API keys.');
        }

        // Fetch SIP trunk configurations for cost savings
        const { data: sipConfigs } = await supabase
          .from('sip_trunk_configs')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('is_default', { ascending: false });
        
        // Get the default or first active SIP config
        const sipConfig: SipTrunkConfig | null = sipConfigs?.[0] || null;
        
        if (sipConfig) {
          console.log(`SIP trunk configured: ${sipConfig.provider_type} - ${sipConfig.id}`);
        } else {
          console.log('No SIP trunk configured, using standard API calls');
        }

        console.log(`Using provider: ${selectedProvider} (hasAudio: ${hasAudioUrl})`);

        // Start dispatching calls (in batches based on calls_per_minute)
        const batchSize = Math.min(broadcast.calls_per_minute || 50, pendingCount);
        
        const { data: queueItems, error: queueError } = await supabase
          .from('broadcast_queue')
          .select('*')
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true })
          .limit(batchSize);

        if (queueError) throw queueError;

        let dispatched = 0;
        let sipTrunkCalls = 0;
        const errors: string[] = [];
        const statusCallbackUrl = `${supabaseUrl}/functions/v1/call-tracking-webhook`;
        const dtmfHandlerUrl = `${supabaseUrl}/functions/v1/twilio-dtmf-handler`;
        
        // Get transfer number from DTMF actions
        const dtmfActions = broadcast.dtmf_actions || [];
        const transferAction = dtmfActions.find((a: any) => a.digit === '1' && a.action === 'transfer');
        const transferNumber = transferAction?.transfer_to || '';
        
        // Track number usage for smart rotation
        const numberUsageCount = new Map<string, number>();
        phoneNumbers.forEach(n => numberUsageCount.set(n.id, n.daily_usage || 0));
        
        // Check if dialer features are enabled (from broadcast settings or default to true)
        const enableLocalPresence = broadcast.enable_local_presence !== false;
        const enableNumberRotation = broadcast.enable_number_rotation !== false;
        
        console.log(`Dialer features - Local Presence: ${enableLocalPresence}, Number Rotation: ${enableNumberRotation}`);

        for (const item of queueItems || []) {
          try {
            // Select best phone number using smart selection with dialer features
            const callerNumber = selectBestNumber(
              phoneNumbers,
              item.phone_number,
              numberUsageCount,
              enableLocalPresence,
              enableNumberRotation
            );
            
            if (!callerNumber) {
              errors.push(`No suitable number for ${item.phone_number}`);
              continue;
            }
            
            // Track usage for this call
            numberUsageCount.set(callerNumber.id, (numberUsageCount.get(callerNumber.id) || 0) + 1);
            
            // For voice broadcasts with audio, ALWAYS use Twilio regardless of number's retell_phone_id
            // The number provider only matters for AI conversational mode
            const numberProvider = hasAudioUrl 
              ? 'twilio'  // Force Twilio for audio playback
              : (callerNumber.retell_phone_id ? 'retell' : 
                  callerNumber.carrier_name?.toLowerCase().includes('telnyx') ? 'telnyx' : 'twilio');

            // Update queue item to 'calling'
            const { error: updateItemError } = await supabase
              .from('broadcast_queue')
              .update({ 
                status: 'calling',
                attempts: (item.attempts || 0) + 1,
              })
              .eq('id', item.id);

            if (updateItemError) throw updateItemError;

            // Prepare metadata
            const callMetadata = {
              broadcast_id: broadcastId,
              queue_item_id: item.id,
              ivr_mode: broadcast.ivr_mode,
              dtmf_actions: broadcast.dtmf_actions,
              lead_id: item.lead_id,
            };

            // Make the call based on provider - for audio broadcasts, always use selectedProvider (Twilio)
            // Try SIP trunk first if configured for the provider
            let callResult: CallResult;
            const providerToUse = hasAudioUrl ? selectedProvider : (selectProvider(providers, numberProvider, hasAudioUrl) || selectedProvider);
            
            console.log(`Dispatching call to ${item.phone_number} using ${providerToUse} from ${callerNumber.number}`);

            // Check if we should use SIP trunk for this provider
            const useSipTrunk = sipConfig && (
              (providerToUse === 'twilio' && sipConfig.provider_type === 'twilio' && sipConfig.twilio_trunk_sid && sipConfig.twilio_termination_uri) ||
              (providerToUse === 'telnyx' && sipConfig.provider_type === 'telnyx' && sipConfig.telnyx_connection_id)
            );

            if (useSipTrunk) {
              console.log(`Using SIP trunk: ${sipConfig.provider_type} (${sipConfig.id})`);
            }

            switch (providerToUse) {
              case 'retell':
                callResult = await callWithRetell(
                  providers.retellKey!,
                  callerNumber.number,
                  item.phone_number,
                  callMetadata,
                  broadcast.retell_agent_id
                );
                break;
              case 'twilio':
                // Use SIP trunk if configured
                if (useSipTrunk && sipConfig.provider_type === 'twilio') {
                  callResult = await callWithTwilioSipTrunk(
                    providers.twilioAccountSid!,
                    providers.twilioAuthToken!,
                    sipConfig.twilio_trunk_sid!,
                    sipConfig.twilio_termination_uri!,
                    callerNumber.number,
                    item.phone_number,
                    broadcast.audio_url || '',
                    callMetadata,
                    statusCallbackUrl,
                    dtmfHandlerUrl,
                    transferNumber
                  );
                } else {
                  callResult = await callWithTwilio(
                    providers.twilioAccountSid!,
                    providers.twilioAuthToken!,
                    callerNumber.number,
                    item.phone_number,
                    broadcast.audio_url || '',
                    callMetadata,
                    statusCallbackUrl,
                    dtmfHandlerUrl,
                    transferNumber
                  );
                }
                break;
              case 'telnyx':
                // Use SIP connection ID if configured
                const connectionId = (useSipTrunk && sipConfig.provider_type === 'telnyx') 
                  ? sipConfig.telnyx_connection_id 
                  : undefined;
                callResult = await callWithTelnyx(
                  providers.telnyxApiKey!,
                  callerNumber.number,
                  item.phone_number,
                  broadcast.audio_url || '',
                  callMetadata,
                  statusCallbackUrl,
                  connectionId
                );
                break;
              default:
                throw new Error(`Unknown provider: ${providerToUse}`);
            }

            if (callResult.success) {
              dispatched++;
              if (callResult.usedSipTrunk) {
                sipTrunkCalls++;
              }
              
              // Update phone number usage
              await supabase
                .from('phone_numbers')
                .update({ 
                  daily_calls: (callerNumber.daily_calls || 0) + 1,
                  last_used: new Date().toISOString(),
                })
                .eq('id', callerNumber.id);
            } else {
              throw new Error(callResult.error || 'Call failed');
            }

          } catch (callError: any) {
            console.error(`Error dispatching call to ${item.phone_number}:`, callError);
            errors.push(`${item.phone_number}: ${callError.message}`);
            
            // Mark as failed if max attempts reached
            const newAttempts = (item.attempts || 0) + 1;
            const maxAttempts = item.max_attempts || broadcast.max_attempts || 1;
            
            await supabase
              .from('broadcast_queue')
              .update({ 
                status: newAttempts >= maxAttempts ? 'failed' : 'pending',
                attempts: newAttempts,
              })
              .eq('id', item.id);
          }
        }

        // Update broadcast stats
        const { error: statsUpdateError } = await supabase
          .from('voice_broadcasts')
          .update({ calls_made: (broadcast.calls_made || 0) + dispatched })
          .eq('id', broadcastId);

        if (statsUpdateError) console.error('Error updating broadcast stats:', statsUpdateError);

        console.log(`Broadcast ${broadcastId} started: ${dispatched} calls dispatched (${sipTrunkCalls} via SIP trunk)`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'active',
            provider: selectedProvider,
            dispatched,
            sipTrunkCalls,
            usingSipTrunk: sipConfig ? sipConfig.provider_type : null,
            pending: (pendingCount || 0) - dispatched,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop': {
        // Update broadcast status
        const { error: stopError } = await supabase
          .from('voice_broadcasts')
          .update({ status: 'paused' })
          .eq('id', broadcastId);

        if (stopError) throw stopError;

        // Pause any 'calling' items back to 'pending'
        const { error: pauseError } = await supabase
          .from('broadcast_queue')
          .update({ status: 'pending' })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'calling');

        if (pauseError) console.error('Error pausing queue items:', pauseError);

        console.log(`Broadcast ${broadcastId} stopped`);

        return new Response(
          JSON.stringify({ success: true, status: 'paused' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stats': {
        const { data: queueStats, error: statsError } = await supabase
          .from('broadcast_queue')
          .select('status, dtmf_pressed, call_duration_seconds')
          .eq('broadcast_id', broadcastId);

        if (statsError) throw statsError;

        const stats: Record<string, any> = {
          total: queueStats?.length || 0,
          pending: 0,
          calling: 0,
          answered: 0,
          completed: 0,
          failed: 0,
          transferred: 0,
          callback: 0,
          dnc: 0,
          avgDuration: 0,
          dtmfBreakdown: {} as Record<string, number>,
        };

        let totalDuration = 0;
        let durationCount = 0;

        for (const item of queueStats || []) {
          const status = item.status as string;
          if (status in stats) {
            stats[status]++;
          }
          
          if (item.call_duration_seconds) {
            totalDuration += item.call_duration_seconds;
            durationCount++;
          }

          if (item.dtmf_pressed) {
            stats.dtmfBreakdown[item.dtmf_pressed] = 
              (stats.dtmfBreakdown[item.dtmf_pressed] || 0) + 1;
          }
        }

        stats.avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

        // Auto-complete broadcast if no pending or calling items remain
        if (stats.pending === 0 && stats.calling === 0 && stats.total > 0) {
          const { data: currentBroadcast } = await supabase
            .from('voice_broadcasts')
            .select('status')
            .eq('id', broadcastId)
            .single();
          
          if (currentBroadcast?.status === 'active') {
            console.log(`Auto-completing broadcast ${broadcastId} - all calls finished`);
            await supabase
              .from('voice_broadcasts')
              .update({ status: 'completed' })
              .eq('id', broadcastId);
          }
        }

        return new Response(
          JSON.stringify({ success: true, ...stats }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'handle_dtmf': {
        // This is called by webhooks when a user presses a digit
        if (!queueItemId || !digit) {
          throw new Error('Missing queueItemId or digit');
        }

        const dtmfActions = (broadcast.dtmf_actions as any[]) || [];
        const dtmfAction = dtmfActions.find(a => a.digit === digit);

        if (!dtmfAction) {
          console.log(`No action configured for digit ${digit}`);
          return new Response(
            JSON.stringify({ success: false, message: 'Invalid digit' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let newStatus = 'completed';
        let callbackAt = null;

        // Get queue item for lead info
        const { data: queueItem, error: queueItemError } = await supabase
          .from('broadcast_queue')
          .select('phone_number, lead_id')
          .eq('id', queueItemId)
          .single();

        if (queueItemError) throw queueItemError;

        switch (dtmfAction.action) {
          case 'transfer':
            newStatus = 'transferred';
            await supabase
              .from('voice_broadcasts')
              .update({ transfers_completed: (broadcast.transfers_completed || 0) + 1 })
              .eq('id', broadcastId);
            break;

          case 'callback':
            newStatus = 'callback';
            const delayHours = dtmfAction.delay_hours || 24;
            callbackAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
            await supabase
              .from('voice_broadcasts')
              .update({ callbacks_scheduled: (broadcast.callbacks_scheduled || 0) + 1 })
              .eq('id', broadcastId);
            
            // Also schedule a follow-up if lead exists
            if (queueItem?.lead_id) {
              await supabase
                .from('leads')
                .update({ next_callback_at: callbackAt })
                .eq('id', queueItem.lead_id);
            }
            break;

          case 'dnc':
            newStatus = 'dnc';
            // Add to DNC list
            if (queueItem) {
              const { error: dncError } = await supabase
                .from('dnc_list')
                .upsert({
                  user_id: user.id,
                  phone_number: queueItem.phone_number,
                  reason: 'Opted out via voice broadcast IVR',
                }, { onConflict: 'user_id,phone_number' });

              if (dncError) console.error('Error adding to DNC:', dncError);

              // Update lead if exists
              if (queueItem.lead_id) {
                await supabase
                  .from('leads')
                  .update({ do_not_call: true, status: 'dnc' })
                  .eq('id', queueItem.lead_id);
              }
            }

            await supabase
              .from('voice_broadcasts')
              .update({ dnc_requests: (broadcast.dnc_requests || 0) + 1 })
              .eq('id', broadcastId);
            break;

          case 'replay':
            // Don't change status, the call will replay the message
            return new Response(
              JSON.stringify({ success: true, action: 'replay' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Update queue item
        const { error: updateError } = await supabase
          .from('broadcast_queue')
          .update({ 
            status: newStatus,
            dtmf_pressed: digit,
            callback_scheduled_at: callbackAt,
          })
          .eq('id', queueItemId);

        if (updateError) throw updateError;

        return new Response(
          JSON.stringify({ success: true, action: dtmfAction.action, status: newStatus }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Voice broadcast engine error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});