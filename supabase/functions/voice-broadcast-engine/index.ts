import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting and concurrency configuration
const MAX_CONCURRENT_CALLS = 100; // Maximum calls in 'calling' status at once
const ERROR_RATE_PAUSE_THRESHOLD = 0.25; // 25% error rate triggers pause
const ERROR_RATE_ALERT_THRESHOLD = 0.10; // 10% error rate triggers alert
const CALL_DELAY_MS = 100; // Delay between individual calls to avoid API hammering
const MAX_RETRIES_ON_429 = 3; // Max retries on rate limit errors

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
  rateLimited?: boolean;
}

// Helper function for exponential backoff
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a system alert for monitoring
async function createSystemAlert(
  supabase: any,
  userId: string,
  alertType: string,
  severity: string,
  title: string,
  message: string,
  broadcastId?: string
): Promise<void> {
  try {
    await supabase.from('system_alerts').insert({
      user_id: userId,
      alert_type: alertType,
      severity,
      title,
      message,
      related_id: broadcastId,
      related_type: 'broadcast',
      metadata: { broadcastId, timestamp: new Date().toISOString() },
    });
    console.log(`[Alert Created] ${alertType}: ${message}`);
  } catch (error) {
    console.error('Failed to create system alert:', error);
  }
}

// Make a call using Retell AI with retry logic
async function callWithRetell(
  retellKey: string,
  fromNumber: string,
  toNumber: string,
  metadata: Record<string, unknown>,
  agentId?: string
): Promise<CallResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    try {
      console.log(`Making Retell call from ${fromNumber} to ${toNumber}${agentId ? ` with agent ${agentId}` : ''} (attempt ${attempt + 1})`);
      
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

      if (response.status === 429) {
        console.warn(`Retell rate limited, waiting before retry (attempt ${attempt + 1}/${MAX_RETRIES_ON_429})`);
        if (attempt < MAX_RETRIES_ON_429) {
          await sleep(Math.pow(2, attempt) * 1000); // Exponential backoff: 1s, 2s, 4s
          continue;
        }
        return { success: false, provider: 'retell', error: 'Rate limited after retries', rateLimited: true };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Retell API error:', errorText);
        return { success: false, provider: 'retell', error: errorText };
      }

      const result = await response.json();
      return { success: true, provider: 'retell', callId: result.call_id };
    } catch (error: any) {
      console.error('Retell call error:', error);
      if (attempt === MAX_RETRIES_ON_429) {
        return { success: false, provider: 'retell', error: error.message };
      }
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  return { success: false, provider: 'retell', error: 'Max retries exceeded' };
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

// Make a call using Twilio with optional AMD
async function callWithTwilio(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  toNumber: string,
  audioUrl: string,
  metadata: Record<string, unknown>,
  statusCallbackUrl: string,
  dtmfHandlerUrl: string,
  transferNumber?: string,
  amdEnabled: boolean = false,
  amdCallbackUrl?: string
): Promise<CallResult> {
  try {
    console.log(`Making Twilio call from ${fromNumber} to ${toNumber}${amdEnabled ? ' with AMD enabled' : ''}`);
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

    // Build request body
    const requestBody: Record<string, string> = {
      To: toNumber,
      From: fromNumber,
      Twiml: twimlResponse,
      StatusCallback: statusCallbackUrl,
      StatusCallbackEvent: 'initiated ringing answered completed',
    };
    
    // Add AMD parameters if enabled
    if (amdEnabled && amdCallbackUrl) {
      requestBody.MachineDetection = 'DetectMessageEnd';
      requestBody.AsyncAmd = 'true';
      requestBody.AsyncAmdStatusCallback = amdCallbackUrl;
      requestBody.MachineDetectionTimeout = '30';
      requestBody.MachineDetectionSpeechThreshold = '2500';
      requestBody.MachineDetectionSpeechEndThreshold = '1200';
      requestBody.MachineDetectionSilenceTimeout = '5000';
      console.log('AMD enabled with callback:', amdCallbackUrl);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(requestBody),
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

// Make a call using Twilio Elastic SIP Trunk with optional AMD
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
  transferNumber?: string,
  amdEnabled: boolean = false,
  amdCallbackUrl?: string
): Promise<CallResult> {
  try {
    console.log(`Making Twilio SIP trunk call from ${fromNumber} to ${toNumber} via trunk ${trunkSid}${amdEnabled ? ' with AMD enabled' : ''}`);
    
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

    // Build request body
    const requestBody: Record<string, string> = {
      To: sipTo,
      From: fromNumber,
      Twiml: twimlResponse,
      StatusCallback: statusCallbackUrl,
      StatusCallbackEvent: 'initiated ringing answered completed',
    };
    
    // Add AMD parameters if enabled
    if (amdEnabled && amdCallbackUrl) {
      requestBody.MachineDetection = 'DetectMessageEnd';
      requestBody.AsyncAmd = 'true';
      requestBody.AsyncAmdStatusCallback = amdCallbackUrl;
      requestBody.MachineDetectionTimeout = '30';
      requestBody.MachineDetectionSpeechThreshold = '2500';
      requestBody.MachineDetectionSpeechEndThreshold = '1200';
      requestBody.MachineDetectionSilenceTimeout = '5000';
      console.log('AMD enabled with callback:', amdCallbackUrl);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(requestBody),
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
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
    const { action, broadcastId, queueItemId, digit, testBatchSize } = requestBody;
    
    // Test mode: if testBatchSize is provided, limit calls and don't set status to active
    const isTestMode = typeof testBatchSize === 'number' && testBatchSize > 0;

    console.log(`Voice broadcast engine action: ${action} for broadcast ${broadcastId}${isTestMode ? ` (TEST MODE: ${testBatchSize} calls)` : ''}`);

    // Verify broadcast ownership
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (broadcastError || !broadcast) {
      throw new Error('Broadcast not found or access denied');
    }

    switch (action) {
      case 'start': {
        if (!broadcast.audio_url && broadcast.ivr_mode !== 'ai_conversational') {
          const errorMsg = 'No audio generated for this broadcast. Please generate audio first.';
          await supabase.from('voice_broadcasts').update({ last_error: errorMsg, last_error_at: new Date().toISOString() }).eq('id', broadcastId);
          throw new Error(errorMsg);
        }

        // First, cleanup any stuck calls from previous runs
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabase
          .from('broadcast_queue')
          .update({ status: 'pending' })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'calling')
          .lt('updated_at', fiveMinutesAgo);

        // Check calling hours BEFORE starting (unless bypass is enabled)
        const bypassCallingHours = broadcast.bypass_calling_hours === true;
        
        if (!bypassCallingHours) {
          const broadcastTimezone = broadcast.timezone || 'America/New_York';
          const callingHoursStart = broadcast.calling_hours_start || '09:00:00';
          const callingHoursEnd = broadcast.calling_hours_end || '21:00:00';
          
          // Get current time in the broadcast's timezone
          const now = new Date();
          const options: Intl.DateTimeFormatOptions = {
            timeZone: broadcastTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          };
          const currentTimeStr = now.toLocaleTimeString('en-US', options);
          const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
          const currentMinutes = currentHour * 60 + currentMinute;
          
          const [startHour, startMin] = callingHoursStart.split(':').map(Number);
          const [endHour, endMin] = callingHoursEnd.split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          console.log(`Calling hours check - Current: ${currentTimeStr} (${currentMinutes} min), Start: ${callingHoursStart} (${startMinutes} min), End: ${callingHoursEnd} (${endMinutes} min), TZ: ${broadcastTimezone}`);
          
          if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
            const errorMsg = `Outside calling hours. Current time in ${broadcastTimezone} is ${currentTimeStr}. Calling hours are ${callingHoursStart.slice(0,5)} - ${callingHoursEnd.slice(0,5)}. Enable "Bypass Calling Hours" in settings to test outside these hours.`;
            await supabase.from('voice_broadcasts').update({ last_error: errorMsg, last_error_at: new Date().toISOString() }).eq('id', broadcastId);
            throw new Error(errorMsg);
          }
        } else {
          console.log('Bypass calling hours enabled - skipping time check');
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

        // Update broadcast status only if NOT in test mode
        if (!isTestMode) {
          const { error: updateStatusError } = await supabase
            .from('voice_broadcasts')
            .update({ status: 'active' })
            .eq('id', broadcastId);

          if (updateStatusError) throw updateStatusError;
        } else {
          console.log('Test mode: skipping status update to active');
        }

        // Get available phone numbers with provider info - filter by rotation_enabled
        const { data: phoneNumbers, error: numbersError } = await supabase
          .from('phone_numbers')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .eq('is_spam', false)
          .eq('rotation_enabled', true);

        if (numbersError) throw numbersError;

        if (!phoneNumbers || phoneNumbers.length === 0) {
          throw new Error('No active phone numbers available for rotation. Enable rotation on your phone numbers or add new ones.');
        }
        
        // Apply max_daily_calls hard cap - filter out numbers that hit their limit
        const maxDailyDefault = 100;
        const availablePhoneNumbers = phoneNumbers.filter(n => {
          const maxCalls = n.max_daily_calls || maxDailyDefault;
          const currentCalls = n.daily_calls || 0;
          return currentCalls < maxCalls;
        });
        
        if (availablePhoneNumbers.length === 0) {
          throw new Error('All phone numbers have reached their daily call limit. Try again tomorrow or increase limits.');
        }
        
        console.log(`[Broadcast] ${availablePhoneNumbers.length}/${phoneNumbers.length} numbers available (within daily limits)`);
        
        // Determine broadcast type and filter numbers accordingly
        const hasAudioUrl = !!broadcast.audio_url;
        
        // For audio broadcasts, we need Twilio or Telnyx numbers (NOT Retell-only numbers)
        // Retell-only numbers have retell_phone_id but no Twilio/Telnyx registration
        // Check if numbers have Twilio capability (no carrier_name or non-telnyx carrier)
        // or Telnyx capability (carrier_name contains 'telnyx')
        const hasTwilioNumbers = availablePhoneNumbers.some(n => 
          !n.retell_phone_id || n.provider === 'twilio'
        );
        const hasTelnyxNumbers = availablePhoneNumbers.some(n => 
          n.carrier_name?.toLowerCase().includes('telnyx') || n.provider === 'telnyx'
        );
        const hasRetellOnlyNumbers = availablePhoneNumbers.some(n => 
          n.retell_phone_id && !n.carrier_name?.toLowerCase().includes('telnyx') && n.provider !== 'twilio'
        );
        
        console.log(`[Broadcast] Number providers available - Twilio: ${hasTwilioNumbers}, Telnyx: ${hasTelnyxNumbers}, Retell-only: ${hasRetellOnlyNumbers}`);
        
        // For audio broadcasts, filter to only numbers that can be used with Twilio/Telnyx
        let rotationNumbers = availablePhoneNumbers;
        if (hasAudioUrl) {
          // Audio broadcasts require Twilio or Telnyx numbers
          rotationNumbers = availablePhoneNumbers.filter(n => {
            // Telnyx numbers
            if (n.carrier_name?.toLowerCase().includes('telnyx') || n.provider === 'telnyx') return true;
            // Twilio numbers (not Retell-only)
            if (!n.retell_phone_id || n.provider === 'twilio') return true;
            return false;
          });
          
          if (rotationNumbers.length === 0) {
            const errorMsg = 'Audio broadcasts require Twilio or Telnyx phone numbers. Your numbers are Retell-native only (for AI agent calls). Please add Twilio/Telnyx numbers or use Retell Agent mode instead of audio files.';
            await supabase.from('voice_broadcasts').update({ 
              last_error: errorMsg, 
              last_error_at: new Date().toISOString(),
              status: 'failed' 
            }).eq('id', broadcastId);
            throw new Error(errorMsg);
          }
          
          console.log(`[Broadcast] Filtered to ${rotationNumbers.length} Twilio/Telnyx numbers for audio broadcast`);
        }

        // Determine which provider to use based on available number types
        let selectedProvider: 'retell' | 'twilio' | 'telnyx' | null = null;
        
        if (hasAudioUrl) {
          // For audio broadcasts, prefer Telnyx (cheaper), then Twilio
          if (hasTelnyxNumbers && providers.telnyxApiKey) {
            selectedProvider = 'telnyx';
          } else if (hasTwilioNumbers && providers.twilioAccountSid && providers.twilioAuthToken) {
            selectedProvider = 'twilio';
          }
        } else {
          // For AI agent mode, prefer Retell
          if (providers.retellKey) {
            selectedProvider = 'retell';
          } else if (providers.twilioAccountSid && providers.twilioAuthToken) {
            selectedProvider = 'twilio';
          } else if (providers.telnyxApiKey) {
            selectedProvider = 'telnyx';
          }
        }
        
        if (!selectedProvider) {
          const errorMsg = hasAudioUrl 
            ? 'No Twilio or Telnyx API keys configured for audio broadcasts. Please add Twilio or Telnyx credentials in your settings.'
            : 'No telephony provider configured. Please configure Retell AI, Twilio, or Telnyx API keys.';
          throw new Error(errorMsg);
        }
        
        console.log(`[Broadcast] Selected provider: ${selectedProvider} (hasAudio: ${hasAudioUrl})`);


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

        // === CONCURRENCY CHECK ===
        // Check current concurrent calls and limit if necessary
        const { count: currentCallingCount } = await supabase
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'calling');

        const currentConcurrent = currentCallingCount || 0;
        console.log(`Current concurrent calls: ${currentConcurrent}/${MAX_CONCURRENT_CALLS}`);

        if (currentConcurrent >= MAX_CONCURRENT_CALLS) {
          console.log('Max concurrent calls reached, waiting for current calls to complete');
          return new Response(
            JSON.stringify({ 
              success: true, 
              status: 'throttled',
              message: `Max concurrent calls (${MAX_CONCURRENT_CALLS}) reached. Waiting for current calls to complete.`,
              currentConcurrent,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // === ERROR RATE CHECK ===
        // Check recent error rate and auto-pause if too high
        const { data: recentQueue } = await supabase
          .from('broadcast_queue')
          .select('status')
          .eq('broadcast_id', broadcastId)
          .in('status', ['completed', 'answered', 'transferred', 'failed', 'dnc'])
          .order('updated_at', { ascending: false })
          .limit(100);

        if (recentQueue && recentQueue.length >= 10) {
          const recentFailed = recentQueue.filter(q => q.status === 'failed').length;
          const recentErrorRate = recentFailed / recentQueue.length;
          
          if (recentErrorRate >= ERROR_RATE_PAUSE_THRESHOLD) {
            console.error(`Error rate ${(recentErrorRate * 100).toFixed(1)}% exceeds threshold, auto-pausing broadcast`);
            
            await supabase
              .from('voice_broadcasts')
              .update({ 
                status: 'paused',
                last_error: `Auto-paused: ${(recentErrorRate * 100).toFixed(1)}% error rate in last ${recentQueue.length} calls`,
                last_error_at: new Date().toISOString()
              })
              .eq('id', broadcastId);

            await createSystemAlert(
              supabase, 
              user.id, 
              'high_error_rate', 
              'critical',
              'Campaign Auto-Paused',
              `Campaign paused due to ${(recentErrorRate * 100).toFixed(1)}% error rate. Please check your configuration.`,
              broadcastId
            );

            return new Response(
              JSON.stringify({ 
                success: false, 
                status: 'paused',
                error: `Campaign auto-paused due to high error rate (${(recentErrorRate * 100).toFixed(1)}%)`,
                errorRate: recentErrorRate,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else if (recentErrorRate >= ERROR_RATE_ALERT_THRESHOLD) {
            console.warn(`Error rate ${(recentErrorRate * 100).toFixed(1)}% above alert threshold`);
            await createSystemAlert(
              supabase, 
              user.id, 
              'error_rate_warning', 
              'warning',
              'High Error Rate Warning',
              `Campaign has ${(recentErrorRate * 100).toFixed(1)}% error rate. Monitor closely.`,
              broadcastId
            );
          }
        }

        // Calculate actual batch size accounting for concurrent limit and test mode
        const availableConcurrency = MAX_CONCURRENT_CALLS - currentConcurrent;
        const maxBatchSize = isTestMode ? testBatchSize : (broadcast.calls_per_minute || 50);
        const batchSize = Math.min(maxBatchSize, pendingCount, availableConcurrency);
        
        console.log(`Dispatching batch of ${batchSize} calls (pending: ${pendingCount}, available slots: ${availableConcurrency}${isTestMode ? `, test limit: ${testBatchSize}` : ''})`);
        
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
        let rateLimitHits = 0;
        const errors: string[] = [];
        const statusCallbackUrl = `${supabaseUrl}/functions/v1/call-tracking-webhook`;
        const dtmfHandlerUrl = `${supabaseUrl}/functions/v1/twilio-dtmf-handler`;
        
        // Get transfer number from DTMF actions
        const dtmfActions = broadcast.dtmf_actions || [];
        const transferAction = dtmfActions.find((a: any) => a.digit === '1' && a.action === 'transfer');
        const transferNumber = transferAction?.transfer_to || '';
        
        // Track number usage for smart rotation - use rotationNumbers (filtered list)
        const numberUsageCount = new Map<string, number>();
        rotationNumbers.forEach(n => numberUsageCount.set(n.id, n.daily_usage || 0));
        
        // Check if dialer features are enabled (from broadcast settings or default to true)
        const enableLocalPresence = broadcast.enable_local_presence !== false;
        const enableNumberRotation = broadcast.enable_number_rotation !== false;
        
        // Check AMD settings (default to enabled with hangup action)
        const amdEnabled = broadcast.enable_amd !== false;
        
        console.log(`Dialer features - Local Presence: ${enableLocalPresence}, Number Rotation: ${enableNumberRotation}, AMD: ${amdEnabled}`);

        for (const item of queueItems || []) {
          try {
            let callerNumber: any;
            
            // If a specific caller_id is set on the broadcast, use that
            if (broadcast.caller_id) {
              callerNumber = rotationNumbers.find(n => n.number === broadcast.caller_id);
              if (!callerNumber) {
                console.log(`Specified caller_id ${broadcast.caller_id} not found in rotation pool, falling back to auto-selection`);
              }
            }
            
            // If no specific caller_id or it wasn't found, use smart selection from rotation pool
            if (!callerNumber) {
              callerNumber = selectBestNumber(
                rotationNumbers,
                item.phone_number,
                numberUsageCount,
                enableLocalPresence,
                enableNumberRotation
              );
            }
            
            if (!callerNumber) {
              errors.push(`No suitable number for ${item.phone_number}`);
              continue;
            }
            
            // Track usage for this call
            numberUsageCount.set(callerNumber.id, (numberUsageCount.get(callerNumber.id) || 0) + 1);
            
            // Determine provider based on number's actual registration
            // For audio broadcasts: use the number's actual provider (already filtered above)
            // For AI mode: prefer Retell if registered
            let numberProvider: 'retell' | 'twilio' | 'telnyx';
            
            if (hasAudioUrl) {
              // For audio broadcasts, use Telnyx if the number is Telnyx, otherwise Twilio
              if (callerNumber.carrier_name?.toLowerCase().includes('telnyx') || callerNumber.provider === 'telnyx') {
                numberProvider = 'telnyx';
              } else {
                numberProvider = 'twilio';
              }
            } else {
              // For AI/agent mode, use Retell if registered, otherwise carrier
              if (callerNumber.retell_phone_id) {
                numberProvider = 'retell';
              } else if (callerNumber.carrier_name?.toLowerCase().includes('telnyx') || callerNumber.provider === 'telnyx') {
                numberProvider = 'telnyx';
              } else {
                numberProvider = 'twilio';
              }
            }

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
                // Build AMD callback URL if AMD is enabled
                const amdCallbackUrl = amdEnabled 
                  ? `${supabaseUrl}/functions/v1/twilio-amd-webhook?queue_item_id=${item.id}&broadcast_id=${broadcastId}`
                  : undefined;
                
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
                    transferNumber,
                    amdEnabled,
                    amdCallbackUrl
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
                    transferNumber,
                    amdEnabled,
                    amdCallbackUrl
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
              
              // BULLETPROOF: Store call_sid on queue item for reliable webhook matching
              if (callResult.callId) {
                await supabase
                  .from('broadcast_queue')
                  .update({ call_sid: callResult.callId })
                  .eq('id', item.id);
                console.log(`Stored call_sid ${callResult.callId} on queue item ${item.id}`);
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
              // Track rate limit hits
              if (callResult.rateLimited) {
                rateLimitHits++;
                console.warn(`Rate limited on call to ${item.phone_number}`);
              }
              throw new Error(callResult.error || 'Call failed');
            }

            // Add delay between calls to avoid hammering APIs
            if (CALL_DELAY_MS > 0) {
              await sleep(CALL_DELAY_MS);
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

        // Check if we hit too many rate limits
        if (rateLimitHits > 5) {
          await createSystemAlert(
            supabase,
            user.id,
            'api_rate_limit',
            'warning',
            'API Rate Limiting Detected',
            `${rateLimitHits} calls were rate-limited. Consider reducing calls_per_minute setting.`,
            broadcastId
          );
        }

        // Update broadcast stats
        const { error: statsUpdateError } = await supabase
          .from('voice_broadcasts')
          .update({ calls_made: (broadcast.calls_made || 0) + dispatched })
          .eq('id', broadcastId);

        if (statsUpdateError) console.error('Error updating broadcast stats:', statsUpdateError);

        console.log(`Broadcast ${broadcastId} started: ${dispatched} calls dispatched (${sipTrunkCalls} via SIP trunk, ${rateLimitHits} rate limited)`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'active',
            provider: selectedProvider,
            dispatched,
            sipTrunkCalls,
            rateLimitHits,
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
            .maybeSingle();
          
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
          .maybeSingle();

        if (queueItemError) throw queueItemError;
        if (!queueItem) throw new Error('Queue item not found');

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
            
            // Get callback options from the DTMF action
            const callbackOptions = dtmfAction.callback_options || {
              create_calendar_event: true,
              send_sms_reminder: true,
              auto_callback_call: false,
              sms_reminder_hours_before: 1
            };
            
            // Get lead info for calendar/SMS
            let leadInfo: any = null;
            if (queueItem?.lead_id) {
              const { data: lead } = await supabase
                .from('leads')
                .select('first_name, last_name, phone_number, email')
                .eq('id', queueItem.lead_id)
                .maybeSingle();
              leadInfo = lead;
              
              // Update lead with callback time
              await supabase
                .from('leads')
                .update({ next_callback_at: callbackAt })
                .eq('id', queueItem.lead_id);
            }
            
            // 1. Create Google Calendar event if enabled
            if (callbackOptions.create_calendar_event) {
              try {
                console.log('Creating Google Calendar event for callback...');
                const calendarEndTime = new Date(new Date(callbackAt).getTime() + 30 * 60 * 1000).toISOString();
                const leadName = leadInfo ? `${leadInfo.first_name || ''} ${leadInfo.last_name || ''}`.trim() : queueItem.phone_number;
                
                // Check if user has Google Calendar connected
                const { data: calendarIntegration } = await supabase
                  .from('calendar_integrations')
                  .select('*')
                  .eq('user_id', user.id)
                  .eq('provider', 'google')
                  .maybeSingle();
                
                if (calendarIntegration?.access_token_encrypted) {
                  // Call calendar-integration function to create event
                  const calendarResponse = await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      action: 'book_appointment',
                      title: `Callback: ${leadName}`,
                      description: `Scheduled callback from voice broadcast.\nPhone: ${queueItem.phone_number}\nBroadcast: ${broadcast.name}`,
                      start_time: callbackAt,
                      end_time: calendarEndTime,
                      lead_id: queueItem.lead_id,
                    }),
                  });
                  
                  if (calendarResponse.ok) {
                    console.log('Google Calendar event created successfully');
                  } else {
                    console.error('Failed to create calendar event:', await calendarResponse.text());
                  }
                } else {
                  // Save to local calendar_appointments table
                  await supabase
                    .from('calendar_appointments')
                    .insert({
                      user_id: user.id,
                      lead_id: queueItem.lead_id,
                      title: `Callback: ${leadName}`,
                      description: `Scheduled callback from voice broadcast: ${broadcast.name}`,
                      start_time: callbackAt,
                      end_time: calendarEndTime,
                      status: 'scheduled',
                      timezone: broadcast.timezone || 'America/New_York',
                    });
                  console.log('Saved callback to local calendar_appointments');
                }
              } catch (calError) {
                console.error('Error creating calendar event:', calError);
              }
            }
            
            // 2. Schedule SMS reminder if enabled
            if (callbackOptions.send_sms_reminder && queueItem.phone_number) {
              try {
                console.log('Scheduling SMS reminder for callback...');
                const reminderHours = callbackOptions.sms_reminder_hours_before || 1;
                const reminderTime = new Date(new Date(callbackAt).getTime() - reminderHours * 60 * 60 * 1000).toISOString();
                
                // Get default or custom SMS template
                let smsTemplate = callbackOptions.sms_reminder_template || 
                  'Hi {{first_name}}, just a reminder about your scheduled callback in {{hours}} hour(s). Talk soon!';
                
                // Replace placeholders
                const firstName = leadInfo?.first_name || 'there';
                smsTemplate = smsTemplate
                  .replace(/\{\{first_name\}\}/g, firstName)
                  .replace(/\{\{hours\}\}/g, String(reminderHours));
                
                // Save to scheduled_follow_ups for processing later
                await supabase
                  .from('scheduled_follow_ups')
                  .insert({
                    user_id: user.id,
                    lead_id: queueItem.lead_id,
                    scheduled_at: reminderTime,
                    action_type: 'sms',
                    action_config: {
                      phone_number: queueItem.phone_number,
                      message: smsTemplate,
                      callback_reminder: true,
                      callback_time: callbackAt,
                    },
                    status: 'pending',
                  });
                console.log('SMS reminder scheduled for:', reminderTime);
              } catch (smsError) {
                console.error('Error scheduling SMS reminder:', smsError);
              }
            }
            
            // 3. Schedule auto-callback call if enabled
            if (callbackOptions.auto_callback_call && queueItem.phone_number) {
              try {
                console.log('Scheduling auto-callback call...');
                // Create a new queue item for the callback
                await supabase
                  .from('broadcast_queue')
                  .insert({
                    broadcast_id: broadcastId,
                    lead_id: queueItem.lead_id,
                    phone_number: queueItem.phone_number,
                    lead_name: leadInfo ? `${leadInfo.first_name || ''} ${leadInfo.last_name || ''}`.trim() : null,
                    status: 'pending',
                    scheduled_at: callbackAt,
                    attempts: 0,
                    max_attempts: 1,
                  });
                console.log('Auto-callback scheduled for:', callbackAt);
              } catch (autoCallError) {
                console.error('Error scheduling auto-callback:', autoCallError);
              }
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