/**
 * Retell Call Webhook Handler
 * 
 * Receives call completion webhooks from Retell AI, processes transcripts,
 * triggers disposition analysis, and initiates follow-up workflows.
 * 
 * This is the critical "close the loop" function that connects:
 * Retell Call Complete → Transcript Analysis → Disposition → Workflow
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellWebhookPayload {
  event: string;
  call: {
    call_id: string;
    call_status: string;
    start_timestamp?: number;
    end_timestamp?: number;
    transcript?: string;
    transcript_object?: Array<{
      role: string;
      content: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
    call_analysis?: {
      call_summary?: string;
      user_sentiment?: string;
      call_successful?: boolean;
      custom_analysis_data?: Record<string, any>;
    };
    recording_url?: string;
    metadata?: {
      lead_id?: string;
      campaign_id?: string;
      user_id?: string;
      caller_id?: string;
    };
    from_number?: string;
    to_number?: string;
    direction?: string;
    disconnection_reason?: string;
    agent_id?: string;
  };
}

// ============= ADVANCED VOICEMAIL DETECTION SYSTEM =============
const VOICEMAIL_DETECTION = {
  // Greeting patterns (what VM systems say when answering)
  greetingPatterns: [
    /hi,?\s*(this\s+is|you[''']ve?\s+reached)/i,
    /hello,?\s*(this\s+is|you[''']ve?\s+reached)/i,
    /you[''']ve?\s+reached\s+(the\s+)?(voicemail|mailbox|phone|number)/i,
    /leave\s+(me\s+)?(a\s+)?your\s+(name|number|message)/i,
    /please\s+leave\s+(a\s+)?message/i,
    /sorry\s+(i\s+)?(missed|can[''']t\s+take|couldn[''']t\s+get)/i,
    /not\s+available\s+(right\s+now|to\s+take|at\s+(the\s+)?this\s+time)/i,
    /at\s+the\s+(tone|beep),?\s+(please\s+)?(leave|record)/i,
    /after\s+the\s+(tone|beep)/i,
    /record\s+(your\s+)?message/i,
    /i('m|\s+am)\s+not\s+here/i,
    /can('t|not)\s+come\s+to\s+the\s+phone/i,
    /leave\s+your\s+name\s+and\s+number/i,
    /i('ll)?\s+get\s+back\s+to\s+you/i,
  ],
  
  // Carrier/System voicemail patterns
  carrierPatterns: [
    /the\s+(person|party|number)\s+(you\s+)?(are\s+)?(trying\s+to\s+)?(call|reach|dial)/i,
    /the\s+(subscriber|customer|caller)\s+(you\s+)?(have\s+)?dialed/i,
    /is\s+not\s+available/i,
    /mailbox\s+is\s+full/i,
    /cannot\s+be\s+completed\s+as\s+dialed/i,
    /has\s+not\s+set\s+up\s+(their\s+)?voicemail/i,
    /press\s+\d+\s+to\s+leave\s+(a\s+)?message/i,
    /this\s+is\s+the\s+t-?mobile/i,
    /this\s+is\s+the\s+verizon/i,
    /this\s+is\s+the\s+at&?t/i,
    /google\s+voice/i,
    /vonage/i,
    /comcast/i,
    /spectrum/i,
    /xfinity/i,
    /your\s+call\s+has\s+been\s+forwarded/i,
    /the\s+mailbox\s+belonging\s+to/i,
    /the\s+google\s+subscriber/i,
    /please\s+record\s+your\s+message/i,
    /when\s+you('re|\s+are)\s+finished\s+(recording|speaking)/i,
    /hang\s+up\s+or\s+press\s+(pound|#|\d)/i,
  ],
  
  // Personal voicemail indicators
  personalPatterns: [
    /i[''']m\s+(currently\s+)?(not\s+available|unavailable|away|busy|out)/i,
    /i\s+will\s+(get\s+back|return\s+your\s+call|call\s+you\s+back)/i,
    /please\s+leave\s+(your\s+)?name/i,
    /leave\s+(your\s+)?name,?\s+(and\s+)?(phone\s+)?number/i,
    /and\s+(a\s+)?brief\s+message/i,
    /reason\s+(for\s+)?(your\s+)?call/i,
    /call\s+you\s+(right\s+)?back/i,
    /as\s+soon\s+as\s+(i\s+can|possible|i('m|\s+am)\s+able)/i,
    /thank\s+you\s+(for\s+)?calling/i,
    /god\s+bless/i,
    /have\s+a\s+(blessed|great|good|wonderful)\s+day/i,
    /thanks\s+for\s+calling/i,
    /leave\s+a\s+detailed\s+message/i,
    /i('ll)?\s+return\s+your\s+call/i,
    /speak(ing)?\s+to\s+a\s+live\s+person/i,
    /this\s+is\s+\w+,?\s+leave\s+a\s+message/i,
    /hey\s+(this\s+is|it('s|s))\s+\w+/i,
  ],
  
  // Beep/tone indicators (often transcribed or described)
  beepPatterns: [
    /\bbeep\b/i,
    /\btone\b/i,
    /\bbleep\b/i,
    /\[beep\]/i,
    /\[tone\]/i,
    /\*beep\*/i,
  ],
  
  // Phrases that indicate NOT a voicemail (real person talking)
  antiVoicemailPatterns: [
    /who\s+is\s+this/i,
    /who('s|s)\s+calling/i,
    /what\s+do\s+you\s+want/i,
    /can\s+i\s+help\s+you/i,
    /how\s+can\s+i\s+help/i,
    /yeah\s+speaking/i,
    /this\s+is\s+(he|she|him|her|them)/i,
    /hold\s+on/i,
    /one\s+(second|moment|sec)/i,
    /let\s+me\s+(check|see|think)/i,
    /i('m|\s+am)\s+listening/i,
    /go\s+ahead/i,
    /what('s|s)\s+up/i,
    /yeah\s+what('s|s)\s+going\s+on/i,
  ],

  // Duration thresholds
  durationThresholds: {
    definitelyNoAnswer: { max: 8 },
    likelyVoicemail: { min: 12, max: 45 },
    shortCall: { max: 15 },
    normalCall: { min: 30 },
  },

  // Scoring weights
  weights: {
    greetingPattern: 30,
    carrierPattern: 45,
    personalPattern: 25,
    beepPattern: 35,
    durationMatch: 20,
    noLeadResponse: 40,
    disconnectionReason: 35,
    antiPattern: -50,
    shortDuration: 15,
    onlyAgentSpeaking: 30,
    structuredGreeting: 20,
  }
};

interface VoicemailDetectionResult {
  isVoicemail: boolean;
  confidence: number;
  score: number;
  matchedPatterns: string[];
  factors: {
    greetingPatterns: number;
    carrierPatterns: number;
    personalPatterns: number;
    beepPatterns: number;
    durationScore: number;
    conversationStructure: number;
    disconnectionScore: number;
    antiPatternPenalty: number;
  };
}

function detectVoicemail(params: {
  transcript: string;
  durationSeconds: number;
  disconnectionReason?: string;
  transcriptObject?: Array<{ role: string; content: string }>;
}): VoicemailDetectionResult {
  const { transcript, durationSeconds, disconnectionReason, transcriptObject } = params;
  const transcriptLower = (transcript || '').toLowerCase();
  const matchedPatterns: string[] = [];
  
  let score = 0;
  const factors = {
    greetingPatterns: 0,
    carrierPatterns: 0,
    personalPatterns: 0,
    beepPatterns: 0,
    durationScore: 0,
    conversationStructure: 0,
    disconnectionScore: 0,
    antiPatternPenalty: 0,
  };

  // 1. Check greeting patterns
  for (const pattern of VOICEMAIL_DETECTION.greetingPatterns) {
    if (pattern.test(transcriptLower)) {
      factors.greetingPatterns += VOICEMAIL_DETECTION.weights.greetingPattern;
      matchedPatterns.push(`greeting: ${pattern.source.substring(0, 30)}`);
      break; // Only count once per category
    }
  }
  
  // 2. Check carrier patterns (highest weight)
  for (const pattern of VOICEMAIL_DETECTION.carrierPatterns) {
    if (pattern.test(transcriptLower)) {
      factors.carrierPatterns += VOICEMAIL_DETECTION.weights.carrierPattern;
      matchedPatterns.push(`carrier: ${pattern.source.substring(0, 30)}`);
      break;
    }
  }
  
  // 3. Check personal VM patterns
  for (const pattern of VOICEMAIL_DETECTION.personalPatterns) {
    if (pattern.test(transcriptLower)) {
      factors.personalPatterns += VOICEMAIL_DETECTION.weights.personalPattern;
      matchedPatterns.push(`personal: ${pattern.source.substring(0, 30)}`);
      break;
    }
  }
  
  // 4. Check for beep/tone indicators
  for (const pattern of VOICEMAIL_DETECTION.beepPatterns) {
    if (pattern.test(transcriptLower)) {
      factors.beepPatterns += VOICEMAIL_DETECTION.weights.beepPattern;
      matchedPatterns.push(`beep: ${pattern.source}`);
      break;
    }
  }
  
  // 5. Check anti-voicemail patterns (real person indicators)
  for (const pattern of VOICEMAIL_DETECTION.antiVoicemailPatterns) {
    if (pattern.test(transcriptLower)) {
      factors.antiPatternPenalty += VOICEMAIL_DETECTION.weights.antiPattern;
      matchedPatterns.push(`anti: ${pattern.source.substring(0, 30)}`);
      break;
    }
  }
  
  // 6. Duration-based scoring
  const { definitelyNoAnswer, likelyVoicemail, shortCall } = VOICEMAIL_DETECTION.durationThresholds;
  
  if (durationSeconds <= definitelyNoAnswer.max) {
    // Very short = likely no answer, not voicemail
    factors.durationScore -= 10;
    matchedPatterns.push('duration: very_short');
  } else if (durationSeconds >= likelyVoicemail.min && durationSeconds <= likelyVoicemail.max) {
    // Sweet spot for voicemail greetings
    factors.durationScore += VOICEMAIL_DETECTION.weights.durationMatch;
    matchedPatterns.push('duration: vm_range');
  } else if (durationSeconds <= shortCall.max && durationSeconds > definitelyNoAnswer.max) {
    // Short call could be VM
    factors.durationScore += VOICEMAIL_DETECTION.weights.shortDuration;
    matchedPatterns.push('duration: short_possible_vm');
  }
  
  // 7. Conversation structure analysis
  if (transcriptObject && transcriptObject.length > 0) {
    const agentTurns = transcriptObject.filter(t => t.role === 'agent').length;
    const leadTurns = transcriptObject.filter(t => t.role === 'user' || t.role === 'lead' || t.role === 'customer').length;
    
    // If only agent spoke (no lead responses), likely voicemail
    if (leadTurns === 0 && agentTurns > 0) {
      factors.conversationStructure += VOICEMAIL_DETECTION.weights.onlyAgentSpeaking;
      matchedPatterns.push('structure: no_lead_response');
    }
    
    // If lead only said very short things, could be VM prompt
    if (leadTurns === 1 && agentTurns > 0) {
      const leadContent = transcriptObject.find(t => t.role !== 'agent')?.content || '';
      if (leadContent.length < 100) {
        // Check if lead content matches VM greeting patterns
        const leadLower = leadContent.toLowerCase();
        const looksLikeVMGreeting = VOICEMAIL_DETECTION.greetingPatterns.some(p => p.test(leadLower)) ||
                                    VOICEMAIL_DETECTION.personalPatterns.some(p => p.test(leadLower));
        if (looksLikeVMGreeting) {
          factors.conversationStructure += VOICEMAIL_DETECTION.weights.structuredGreeting;
          matchedPatterns.push('structure: vm_greeting_detected');
        }
      }
    }
  } else if (transcript) {
    // Fallback: Check if transcript seems one-sided
    const lines = transcript.split('\n').filter(l => l.trim());
    const aiLines = lines.filter(l => l.toLowerCase().startsWith('ai:') || l.toLowerCase().startsWith('agent:'));
    const leadLines = lines.filter(l => l.toLowerCase().startsWith('lead:') || l.toLowerCase().startsWith('user:'));
    
    if (leadLines.length === 0 && aiLines.length > 0) {
      factors.conversationStructure += VOICEMAIL_DETECTION.weights.noLeadResponse;
      matchedPatterns.push('structure: one_sided_transcript');
    }
  }
  
  // 8. Disconnection reason analysis
  if (disconnectionReason) {
    const reason = disconnectionReason.toLowerCase();
    if (reason.includes('machine') || reason.includes('voicemail') || reason.includes('answering')) {
      factors.disconnectionScore += VOICEMAIL_DETECTION.weights.disconnectionReason;
      matchedPatterns.push(`disconnection: ${reason}`);
    }
  }
  
  // Calculate total score
  score = factors.greetingPatterns +
          factors.carrierPatterns +
          factors.personalPatterns +
          factors.beepPatterns +
          factors.durationScore +
          factors.conversationStructure +
          factors.disconnectionScore +
          factors.antiPatternPenalty;
  
  // Normalize confidence to 0-100
  const maxPossibleScore = 200; // Approximate max
  const confidence = Math.min(100, Math.max(0, (score / maxPossibleScore) * 100));
  
  // Determine if it's voicemail (threshold of 40%)
  const isVoicemail = confidence >= 40;
  
  console.log('[Voicemail Detection] Score:', score, 'Confidence:', confidence.toFixed(1) + '%', 'Is VM:', isVoicemail);
  console.log('[Voicemail Detection] Factors:', JSON.stringify(factors));
  console.log('[Voicemail Detection] Matched:', matchedPatterns.join(', '));
  
  return {
    isVoicemail,
    confidence,
    score,
    matchedPatterns,
    factors,
  };
}

// Normalize phone number for matching - returns multiple formats to try
function normalizePhoneFormats(phone: string): string[] {
  if (!phone) return [];
  const digitsOnly = phone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);
  
  return [
    phone,                    // Original
    `+${digitsOnly}`,         // E.164 with +
    `+1${last10}`,            // US E.164
    digitsOnly,               // Just digits
    `1${last10}`,             // US without +
    last10,                   // Last 10 digits
  ].filter((v, i, a) => v && a.indexOf(v) === i); // unique non-empty
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Clone the request to read body twice if needed
    const bodyText = await req.text();
    
    // Handle health check requests (from System Testing)
    try {
      const testBody = JSON.parse(bodyText);
      if (testBody.action === 'health_check') {
        console.log('[Retell Webhook] Health check requested');
        return new Response(
          JSON.stringify({
            success: true,
            healthy: true,
            timestamp: new Date().toISOString(),
            function: 'retell-call-webhook',
            capabilities: ['call_started', 'call_ended', 'call_analyzed', 'voicemail_detection'],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (e) {
      // Not a JSON body or not a health check, continue with normal processing
    }

    const payload: RetellWebhookPayload = JSON.parse(bodyText);
    console.log('[Retell Webhook] Received event:', payload.event);
    console.log('[Retell Webhook] Call ID:', payload.call?.call_id);

    const { event, call } = payload;

    // Handle call_started for inbound calls - inject dynamic variables
    if (event === 'call_started') {
      console.log('[Retell Webhook] Processing call_started for dynamic variable injection');
      console.log('[Retell Webhook] Call direction:', call.direction);
      console.log('[Retell Webhook] From:', call.from_number, 'To:', call.to_number);
      
      // For inbound calls, the caller is from_number
      const callerNumber = call.from_number;
      const receivingNumber = call.to_number;
      
      // Get multiple phone format variations for matching
      const callerFormats = normalizePhoneFormats(callerNumber || '');
      const receivingFormats = normalizePhoneFormats(receivingNumber || '');
      
      console.log('[Retell Webhook] Caller formats to match:', callerFormats);
      console.log('[Retell Webhook] Receiving formats to match:', receivingFormats);
      
      // Find the user who owns this receiving number
      let userId: string | null = null;
      
      if (receivingFormats.length > 0) {
        // Build OR query for phone number matching
        const phoneOrQuery = receivingFormats.map(f => `number.eq.${f}`).join(',');
        const { data: phoneNumber, error: phoneError } = await supabase
          .from('phone_numbers')
          .select('user_id')
          .or(phoneOrQuery)
          .limit(1)
          .maybeSingle();
        
        if (phoneError) {
          console.error('[Retell Webhook] Phone lookup error:', phoneError);
        }
        
        userId = phoneNumber?.user_id || null;
        console.log('[Retell Webhook] Phone owner user_id:', userId);
      }
      
      let lead: any = null;
      
      const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];
      
      if (callerFormats.length > 0) {
        // Look up lead by caller's phone number
        // If we have userId, filter by it; otherwise search all leads
        let query = supabase
          .from('leads')
          .select('id, first_name, last_name, email, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, phone_number, address, city, state, zip_code, user_id')
          .or(`phone_number.ilike.%${last10}`)
          .order('updated_at', { ascending: false })
          .limit(10);
        
        if (userId) {
          query = query.eq('user_id', userId);
        }
        
        const { data: leads, error: leadError } = await query;
        
        if (leadError) {
          console.error('[Retell Webhook] Lead lookup error:', leadError);
        } else if (leads && leads.length > 0) {
          // Prefer leads with first_name populated
          lead = leads.find(l => l.first_name && l.first_name.trim() !== '') || leads[0];
          // If we didn't have userId, get it from the lead
          if (!userId && lead.user_id) {
            userId = lead.user_id;
            console.log('[Retell Webhook] Got userId from lead:', userId);
          }
          console.log('[Retell Webhook] Found', leads.length, 'matching leads, selected:', lead.first_name, lead.last_name, '(id:', lead.id, ')');
        } else {
          console.log('[Retell Webhook] No lead found for caller:', callerNumber);
        }
      }
      
      // Create a call log entry at call_started so we have context for later events
      if (userId) {
        const callLogEntry: any = {
          retell_call_id: call.call_id,
          user_id: userId,
          phone_number: receivingNumber || '',
          caller_id: callerNumber || '',
          status: 'ringing',
          notes: 'Inbound call started',
        };

        if (lead) {
          callLogEntry.lead_id = lead.id;
        }

        const { error: callLogInsertError } = await supabase
          .from('call_logs')
          .upsert(callLogEntry, { onConflict: 'retell_call_id' });

        if (callLogInsertError) {
          console.error('[Retell Webhook] Failed to insert call log:', callLogInsertError);
        } else {
          console.log('[Retell Webhook] Created/updated call_log for call_started');
        }
      }

      // If we found a lead, inject dynamic variables
      if (lead) {
        console.log('[Retell Webhook] Found lead for inbound caller:', lead.first_name, lead.last_name);

        // Support BOTH our variables AND GoHighLevel-style variables (contact.*)
        const firstName = String(lead?.first_name || '');
        const lastName = String(lead?.last_name || '');
        const fullName = String([lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || '');
        const email = String(lead?.email || '');
        const company = String(lead?.company || '');
        const leadSource = String(lead?.lead_source || '');
        const notes = String(lead?.notes || '');
        const tags = String(Array.isArray(lead?.tags) ? lead.tags.join(', ') : '');
        const preferredContactTime = String(lead?.preferred_contact_time || '');
        const timezone = String(lead?.timezone || 'America/New_York');
        const phone = String(lead?.phone_number || callerNumber || '');

        // Address fields
        const address = String(lead?.address || '');
        const city = String(lead?.city || '');
        const state = String(lead?.state || '');
        const zipCode = String(lead?.zip_code || '');
        const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

        // Prepare dynamic variables (Retell requires string values)
        const dynamicVariables: Record<string, string> = {
          // Standard variables
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          name: fullName,
          email: email,
          company: company,
          lead_source: leadSource,
          notes: notes,
          tags: tags,
          preferred_contact_time: preferredContactTime,
          timezone: timezone,
          phone: phone,
          phone_number: phone,

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
          'contact.company': company,
          'contact.companyName': company,
          'contact.phone': phone,
          'contact.phoneNumber': phone,
          'contact.phone_number': phone,
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
          'contact.address1': address,
          'contact.address_1': address,
          'contact.address_line_1': address,
          'contact.addressLine1': address,
          'contact.street': address,
          'contact.street_address': address,
          'contact.streetAddress': address,
          'contact.postal_code': zipCode,
          'contact.postalCode': zipCode,

          // Alternative formats
          'customer.first_name': firstName,
          'customer.last_name': lastName,
          'customer.name': fullName,
          'customer.email': email,
          'customer.phone': phone,
          'customer.company': company,
          'customer.address': address,
          'customer.city': city,
          'customer.state': state,
          'customer.zip_code': zipCode,
          'customer.full_address': fullAddress,
          'customer.address1': address,
          'customer.postal_code': zipCode,

          // Lead prefix
          'lead.first_name': firstName,
          'lead.last_name': lastName,
          'lead.name': fullName,
          'lead.email': email,
          'lead.phone': phone,
          'lead.company': company,
          'lead.address': address,
          'lead.city': city,
          'lead.state': state,
          'lead.zip_code': zipCode,
          'lead.full_address': fullAddress,
          'lead.address1': address,
          'lead.postal_code': zipCode,
        };

        // Include lead custom_fields as additional variables
        if (lead?.custom_fields && typeof lead.custom_fields === 'object') {
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
              dynamicVariables[`lead.${snakeKey}`] = value;
              dynamicVariables[`customer.${snakeKey}`] = value;
            }
          }
        }

        console.log('[Retell Webhook] Prepared dynamic variables:', Object.keys(dynamicVariables));

        // Update the call with dynamic variables via Retell API
        const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
        if (retellApiKey) {
          try {
            const updateResponse = await fetch(`https://api.retellai.com/v2/update-call/${call.call_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${retellApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                retell_llm_dynamic_variables: dynamicVariables,
              }),
            });

            if (updateResponse.ok) {
              console.log('[Retell Webhook] Successfully injected dynamic variables for inbound call');
            } else {
              const errorText = await updateResponse.text();
              console.error('[Retell Webhook] Failed to update call:', updateResponse.status, errorText);
            }
          } catch (apiError) {
            console.error('[Retell Webhook] Error calling Retell update API:', apiError);
          }
        } else {
          console.warn('[Retell Webhook] RETELL_AI_API_KEY not configured');
        }
      } else {
        console.log('[Retell Webhook] No lead found for caller:', callerNumber);
      }

      return new Response(JSON.stringify({
        received: true,
        processed: true,
        event: 'call_started',
        lead_found: !!lead,
        user_id: userId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process call_ended, call_analyzed, and call_failed events for the rest
    if (!['call_ended', 'call_analyzed', 'call_failed'].includes(event)) {
      console.log('[Retell Webhook] Ignoring event type:', event);
      return new Response(JSON.stringify({ received: true, processed: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle call_failed immediately - mark as failed and return early
    if (event === 'call_failed') {
      console.log('[Retell Webhook] Processing call_failed event for call:', call.call_id);

      // Update call_logs to mark as failed
      const { error: updateError } = await supabase
        .from('call_logs')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString(),
          notes: `Call failed: ${call.disconnection_reason || 'Unknown reason'}`,
        })
        .eq('retell_call_id', call.call_id);

      if (updateError) {
        console.error('[Retell Webhook] Failed to update call_logs for failed call:', updateError);
      }

      // Also update dialing_queues if this was a campaign call
      const metadata = call.metadata || {};
      if (metadata.campaign_id && metadata.lead_id) {
        const { error: queueError } = await supabase
          .from('dialing_queues')
          .update({
            status: 'failed',
            last_error: call.disconnection_reason || 'Call failed',
            updated_at: new Date().toISOString(),
          })
          .eq('campaign_id', metadata.campaign_id)
          .eq('lead_id', metadata.lead_id)
          .eq('status', 'calling');

        if (queueError) {
          console.error('[Retell Webhook] Failed to update dialing_queues:', queueError);
        }
      }

      // Decrement phone number daily_calls if it was incremented
      if (call.from_number) {
        const fromLast10 = call.from_number.replace(/\D/g, '').slice(-10);
        await supabase.rpc('decrement_daily_calls', { phone_last_10: fromLast10 });
      }

      return new Response(JSON.stringify({
        received: true,
        processed: true,
        event: 'call_failed',
        call_id: call.call_id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metadata = call.metadata || {};
    let leadId = metadata.lead_id;
    const campaignId = metadata.campaign_id;
    let userId = metadata.user_id;

    // Phone numbers for fallback lookups
    const callerNumber = call.from_number || '';
    const receivingNumber = call.to_number || '';
    const callerLast10 = callerNumber.replace(/\D/g, '').slice(-10);
    const receivingLast10 = receivingNumber.replace(/\D/g, '').slice(-10);

    // If user_id is missing from metadata, try to look it up from call_logs
    if (!userId) {
      console.log('[Retell Webhook] user_id missing from metadata, looking up from call_logs...');
      const { data: callLogLookup } = await supabase
        .from('call_logs')
        .select('user_id, lead_id')
        .eq('retell_call_id', call.call_id)
        .maybeSingle();
      
      if (callLogLookup?.user_id) {
        userId = callLogLookup.user_id;
        if (!leadId && callLogLookup.lead_id) {
          leadId = callLogLookup.lead_id;
        }
        console.log('[Retell Webhook] Found user_id from call_logs:', userId, 'lead_id:', leadId);
      }
    }

    // === PHASE 1: FALLBACK PHONE LOOKUP ===
    // If still no userId, try to find user by receiving phone number
    if (!userId && receivingLast10) {
      console.log('[Retell Webhook] Trying phone lookup for userId using receiving number:', receivingNumber);
      const { data: phoneOwner } = await supabase
        .from('phone_numbers')
        .select('user_id')
        .ilike('number', `%${receivingLast10}`)
        .limit(1)
        .maybeSingle();
      
      if (phoneOwner?.user_id) {
        userId = phoneOwner.user_id;
        console.log('[Retell Webhook] Found userId via phone lookup:', userId);
      }
    }

    // If still no user, we can't process this call
    if (!userId) {
      console.error('[Retell Webhook] Could not find user_id for call:', call.call_id);
      return new Response(JSON.stringify({ error: 'Could not determine user_id for call' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === PHASE 1 CONTINUED: FALLBACK LEAD LOOKUP ===
    // If we have userId but no leadId, try to find lead by caller phone number
    if (!leadId && userId && callerLast10) {
      console.log('[Retell Webhook] No lead_id, trying phone lookup for lead using caller number:', callerNumber);
      const { data: foundLead } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId)
        .ilike('phone_number', `%${callerLast10}`)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (foundLead?.id) {
        leadId = foundLead.id;
        console.log('[Retell Webhook] Found lead via phone lookup:', leadId);
      }
    }

    // === PHASE 2: AUTO-CREATE LEAD FOR UNKNOWN INBOUND CALLERS ===
    if (!leadId && userId && callerLast10) {
      console.log('[Retell Webhook] Creating new lead for unknown inbound caller:', callerNumber);
      const formattedPhone = callerNumber.startsWith('+') ? callerNumber : `+1${callerLast10}`;
      
      const { data: newLead, error: createError } = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          phone_number: formattedPhone,
          first_name: '',
          last_name: '',
          status: 'new',
          lead_source: 'inbound_call',
          notes: `Auto-created from inbound call on ${new Date().toLocaleString()}`,
        })
        .select('id')
        .maybeSingle();
      
      if (!createError && newLead?.id) {
        leadId = newLead.id;
        console.log('[Retell Webhook] Created new lead for inbound caller:', leadId);
      } else if (createError) {
        console.error('[Retell Webhook] Failed to create lead for inbound caller:', createError);
      }
    }

    // === PHASE 3: DETAILED LOGGING FOR INBOUND CALL LIFECYCLE ===
    console.log('[Retell Webhook] === CALL ENDED LIFECYCLE CHECK ===');
    console.log('[Retell Webhook] Direction:', call.direction || 'unknown');
    console.log('[Retell Webhook] Caller:', callerNumber);
    console.log('[Retell Webhook] Receiving:', receivingNumber);
    console.log('[Retell Webhook] Lead ID found:', leadId ? `YES (${leadId})` : 'NO');
    console.log('[Retell Webhook] User ID:', userId);
    console.log('[Retell Webhook] Will process lifecycle:', leadId && userId ? 'YES' : 'NO - missing lead or user');

    // Calculate call duration
    const durationSeconds = call.start_timestamp && call.end_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : 0;

    // Format transcript for storage
    const formattedTranscript = formatTranscript(call.transcript_object || [], call.transcript);

    // ============= ADVANCED VOICEMAIL DETECTION =============
    const vmDetection = detectVoicemail({
      transcript: formattedTranscript,
      durationSeconds,
      disconnectionReason: call.disconnection_reason,
      transcriptObject: call.transcript_object,
    });

    // Determine initial outcome from call status
    let outcome = mapCallStatusToOutcome(call.call_status, call.disconnection_reason, durationSeconds);
    
    // ============= SWIFT VOICEMAIL DETECTION =============
    // Check for Retell's real-time AMD detection first (fastest, ~3-5 second detection)
    const disconnectionReason = (call.disconnection_reason || '').toLowerCase();
    const wasVoicemailDetectedByRetell = 
      disconnectionReason === 'voicemail_reached' ||
      disconnectionReason === 'machine_detected' ||
      disconnectionReason.includes('voicemail') ||
      disconnectionReason.includes('answering_machine');
    
    if (wasVoicemailDetectedByRetell) {
      console.log(`[Retell Webhook] SWIFT VM DETECTION: Retell AMD detected voicemail (reason: ${call.disconnection_reason}), call hung up automatically`);
      outcome = 'voicemail';
      // Log the time savings - Retell AMD typically detects in 3-5 seconds vs 30-60 seconds of talking to VM
      console.log(`[Retell Webhook] Estimated time saved: ~${Math.max(0, 45 - durationSeconds)} seconds by early detection`);
    }
    // Fall back to our transcript-based detection for non-AMD calls
    else if (vmDetection.isVoicemail && vmDetection.confidence >= 40) {
      console.log(`[Retell Webhook] Voicemail detected via transcript analysis with ${vmDetection.confidence.toFixed(1)}% confidence, overriding outcome from "${outcome}" to "voicemail"`);
      outcome = 'voicemail';
    }

    // 1. Update or create call log with ALL available data including new columns
    console.log('[Retell Webhook] Updating call log with extended fields...');
    const { data: callLog, error: callLogError } = await supabase
      .from('call_logs')
      .upsert({
        retell_call_id: call.call_id,
        user_id: userId,
        lead_id: leadId,
        campaign_id: campaignId,
        phone_number: call.to_number || '',
        caller_id: call.from_number || metadata.caller_id || '',
        status: call.call_status === 'ended' ? 'completed' : call.call_status,
        outcome: outcome,
        duration_seconds: durationSeconds,
        notes: formattedTranscript,
        // NEW COLUMNS - save transcript, agent info, recording, and analysis data
        transcript: formattedTranscript,
        agent_id: call.agent_id || null,
        recording_url: call.recording_url || null,
        call_summary: call.call_analysis?.call_summary || null,
        sentiment: call.call_analysis?.user_sentiment || null,
        answered_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
        ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
      }, {
        onConflict: 'retell_call_id',
      })
      .select()
      .maybeSingle();

    if (callLogError) {
      console.error('[Retell Webhook] Call log error:', callLogError);
    }

    // 2. If we have a transcript and it's a call_ended/call_analyzed event, analyze it
    let dispositionResult = null;
    if (formattedTranscript && formattedTranscript.length > 50) {
      console.log('[Retell Webhook] Triggering transcript analysis...');
      
      try {
        // Use Retell's built-in analysis if available
        if (call.call_analysis) {
          dispositionResult = mapRetellAnalysisToDisposition(call.call_analysis, formattedTranscript);
          console.log('[Retell Webhook] Using Retell analysis:', dispositionResult);
        } else if (userId) {
          // Fall back to our AI analysis
          dispositionResult = await analyzeTranscriptWithAI(supabase, {
            transcript: formattedTranscript,
            callId: callLog?.id,
            userId,
          });
        }

        // Update call log with disposition
        // IMPORTANT: Do NOT let transcript analysis override voicemail outcome
        if (dispositionResult && callLog?.id) {
          const nonConnectionOutcomes = ['voicemail', 'no_answer', 'busy', 'failed', 'unknown'];
          const analyzedDisposition = dispositionResult.disposition;

          // If we detected voicemail via our advanced system, keep it
          const shouldKeepStatusOutcome =
            (outcome === 'voicemail' && vmDetection.isVoicemail) ||
            (nonConnectionOutcomes.includes(outcome) && analyzedDisposition === 'contacted');

          const finalOutcome = shouldKeepStatusOutcome ? outcome : analyzedDisposition;

          await supabase
            .from('call_logs')
            .update({ outcome: finalOutcome })
            .eq('id', callLog.id);

          outcome = finalOutcome;
        }
      } catch (analysisError: any) {
        console.error('[Retell Webhook] Analysis error:', analysisError);
        // Queue for retry by logging to system_alerts
        if (userId) {
          await logFailedOperation(supabase, userId, 'transcript_analysis', {
            callId: call.call_id,
            leadId,
            error: analysisError.message,
            transcript: formattedTranscript.substring(0, 500),
          });
        }
      }
    }

    // 2.5 Update dialing queue status / schedule retries
    // ALSO: Handle missed callback policy with backoff retries
    if (leadId && campaignId) {
      try {
        const { data: queueEntry, error: queueLookupError } = await supabase
          .from('dialing_queues')
          .select('id, attempts, max_attempts, status, priority')
          .eq('lead_id', leadId)
          .eq('campaign_id', campaignId)
          .in('status', ['calling'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queueLookupError) throw queueLookupError;

        // Fetch current lead to check if this was a callback attempt
        const { data: currentLeadStatus } = await supabase
          .from('leads')
          .select('status, next_callback_at, notes')
          .eq('id', leadId)
          .maybeSingle();
        
        // Determine if this was a callback attempt (priority >= 10 or lead status is callback)
        const wasCallbackAttempt = (queueEntry?.priority && queueEntry.priority >= 10) || 
                                    currentLeadStatus?.status === 'callback';

        if (queueEntry) {
          const attempts = (queueEntry.attempts || 0) + 1; // Increment because this call just finished
          const maxAttempts = queueEntry.max_attempts || 3;
          const retryEligibleOutcomes = ['no_answer', 'voicemail', 'busy', 'failed', 'unknown'];
          
          // Special handling for callback attempts
          if (wasCallbackAttempt && retryEligibleOutcomes.includes(outcome)) {
            console.log(`[Retell Webhook] Missed callback attempt ${attempts}/${maxAttempts} for lead ${leadId}`);
            
            if (attempts >= maxAttempts) {
              // Callback attempts exhausted - resume campaign
              console.log(`[Retell Webhook] Callback attempts exhausted for lead ${leadId} - resuming campaign`);
              
              // Clear callback state on lead
              const existingNotes = currentLeadStatus?.notes || '';
              const exhaustedNote = `\n\n[CALLBACK EXHAUSTED] ${new Date().toLocaleString()}: ${maxAttempts} callback attempts, no answer. Returned to campaign.`;
              
              await supabase
                .from('leads')
                .update({
                  next_callback_at: null,
                  status: 'no_answer',
                  notes: existingNotes + exhaustedNote,
                })
                .eq('id', leadId);
              
              // Resume any paused workflow
              await supabase
                .from('lead_workflow_progress')
                .update({
                  status: 'active',
                  next_action_at: new Date().toISOString(),
                  removal_reason: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('lead_id', leadId)
                .eq('status', 'paused');
              
              // Mark queue as failed
              await supabase
                .from('dialing_queues')
                .update({
                  status: 'failed',
                  attempts: attempts,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', queueEntry.id);
              
              console.log(`[Retell Webhook] Lead ${leadId} returned to campaign after callback exhaustion`);
            } else {
              // Retry callback with backoff: attempt 1 = +5 min, attempt 2 = +15 min
              const backoffMinutes = attempts === 1 ? 5 : 15;
              const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);
              
              await supabase
                .from('dialing_queues')
                .update({
                  status: 'pending',
                  scheduled_at: nextAttempt.toISOString(),
                  attempts: attempts,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', queueEntry.id);
              
              // Also update the lead's next_callback_at for visibility
              await supabase
                .from('leads')
                .update({ next_callback_at: nextAttempt.toISOString() })
                .eq('id', leadId);
              
              console.log(`[Retell Webhook] Callback retry ${attempts}/${maxAttempts} scheduled in ${backoffMinutes} minutes for lead ${leadId}`);
            }
          } else {
            // Standard (non-callback) retry logic
            const shouldRetry = retryEligibleOutcomes.includes(outcome) && attempts < maxAttempts;

            if (shouldRetry) {
              await supabase
                .from('dialing_queues')
                .update({
                  status: 'pending',
                  scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                  attempts: attempts,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', queueEntry.id);

              console.log(`[Retell Webhook] Scheduled retry for lead ${leadId}: ${attempts}/${maxAttempts} in 30 minutes`);
            } else {
              await supabase
                .from('dialing_queues')
                .update({
                  status: retryEligibleOutcomes.includes(outcome) ? 'failed' : 'completed',
                  attempts: attempts,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', queueEntry.id);

              console.log(`[Retell Webhook] Dialing queue marked ${retryEligibleOutcomes.includes(outcome) ? 'failed' : 'completed'} for lead ${leadId}`);
            }
          }
        }
      } catch (queueError: any) {
        console.error('[Retell Webhook] Dialing queue update error:', queueError);
      }
    }

    // 3. Update lead status based on disposition
    if (leadId) {
      console.log('[Retell Webhook] Updating lead status...');
      
      // Always fetch current lead for notes
      const { data: currentLead } = await supabase
        .from('leads')
        .select('notes, first_name')
        .eq('id', leadId)
        .maybeSingle();
      
      const leadUpdate: Record<string, any> = {
        last_contacted_at: new Date().toISOString(),
        status: mapDispositionToLeadStatus(outcome),
      };

      // Build structured call note for EVERY call
      const callNote = buildCallNote(outcome, dispositionResult, durationSeconds, currentLead?.first_name, vmDetection);
      const existingNotes = currentLead?.notes || '';
      leadUpdate.notes = (existingNotes + '\n\n' + callNote).trim();

      // If callback requested, extract time from transcript and schedule
      if (outcome === 'callback_requested' || outcome === 'callback') {
        const callbackMinutes = extractCallbackTimeFromTranscript(formattedTranscript);
        const callbackTime = new Date(Date.now() + callbackMinutes * 60 * 1000);
        leadUpdate.next_callback_at = callbackTime.toISOString();
        leadUpdate.status = 'callback';
        console.log(`[Retell Webhook] Callback scheduled in ${callbackMinutes} minutes at ${callbackTime.toISOString()}`);
        
        // Queue callback in dialing queue if we have a campaign - use UPSERT to handle duplicates
        if (campaignId) {
          try {
            // Use upsert to update existing entry or create new one - avoids duplicate key errors
            const { error: queueUpsertError } = await supabase
              .from('dialing_queues')
              .upsert({
                campaign_id: campaignId,
                lead_id: leadId,
                phone_number: call.to_number || '',
                status: 'pending',
                scheduled_at: callbackTime.toISOString(),
                priority: 10, // High priority for callbacks
                max_attempts: 3,
                attempts: 0,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'campaign_id,lead_id',
                ignoreDuplicates: false, // We want to update existing
              });
            
            if (queueUpsertError) {
              console.error('[Retell Webhook] Failed to upsert callback to queue:', queueUpsertError);
            } else {
              console.log(`[Retell Webhook] Successfully upserted callback for ${leadId} at ${callbackTime.toISOString()}`);
            }
          } catch (queueError) {
            console.error('[Retell Webhook] Failed to add callback to dialing queue:', queueError);
          }
        }
        
        // CRITICAL: Remove lead from active workflow so they don't get called again before callback
        try {
          await supabase
            .from('lead_workflow_progress')
            .update({ 
              status: 'paused', 
              removal_reason: 'Callback scheduled',
              updated_at: new Date().toISOString()
            })
            .eq('lead_id', leadId)
            .eq('status', 'active');
          console.log(`[Retell Webhook] Paused workflow for lead ${leadId} due to callback`);
        } catch (workflowPauseError) {
          console.error('[Retell Webhook] Failed to pause workflow:', workflowPauseError);
        }
        
        // Also add to scheduled_follow_ups for UI visibility
        try {
          await supabase.from('scheduled_follow_ups').insert({
            user_id: userId,
            lead_id: leadId,
            action_type: 'callback',
            scheduled_at: callbackTime.toISOString(),
            status: 'pending',
            notes: `Callback requested during call - ${dispositionResult?.summary || 'No details'}`,
          });
          console.log(`[Retell Webhook] Added callback to scheduled_follow_ups for lead ${leadId}`);
        } catch (followUpError) {
          console.error('[Retell Webhook] Failed to add to scheduled_follow_ups:', followUpError);
        }
        
        // Send auto-confirmation SMS to the lead
        try {
          const formattedTime = callbackTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          
          // Get an SMS-capable from number
          const { data: fromNumber } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          
          if (fromNumber?.number && call.to_number) {
            const leadName = currentLead?.first_name ? ` ${currentLead.first_name}` : '';
            const confirmationMessage = `Hi${leadName}! Just confirming - we'll call you back at ${formattedTime}. Looking forward to speaking with you!`;
            
            await supabase.functions.invoke('sms-messaging', {
              body: {
                action: 'send_sms',
                to: call.to_number,
                from: fromNumber.number,
                body: confirmationMessage,
                lead_id: leadId,
              }
            });
            
            console.log(`[Retell Webhook] Sent callback confirmation SMS to ${call.to_number}`);
          } else {
            console.log('[Retell Webhook] Could not send confirmation SMS - no from number available');
          }
        } catch (smsError) {
          console.error('[Retell Webhook] Failed to send confirmation SMS:', smsError);
        }
      }

      // If DNC, mark as do not call
      if (outcome === 'dnc' || outcome === 'do_not_call') {
        leadUpdate.do_not_call = true;
      }

      await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', leadId);

      // 4. Trigger disposition router for automated actions
      console.log('[Retell Webhook] Triggering disposition router...');
      try {
        const dispositionResponse = await supabase.functions.invoke('disposition-router', {
          body: {
            action: 'process_disposition',
            leadId,
            userId,
            dispositionName: outcome,
            callOutcome: outcome,
            transcript: formattedTranscript,
          },
        });
        console.log('[Retell Webhook] Disposition router response:', dispositionResponse.data);
      } catch (routerError: any) {
        console.error('[Retell Webhook] Disposition router error:', routerError);
        if (userId) {
          await logFailedOperation(supabase, userId, 'disposition_routing', {
            leadId,
            outcome,
            callId: call.call_id,
            error: routerError.message,
          });
        }
      }

      // 5. Update nudge tracking
      if (userId) {
        try {
          await updateNudgeTracking(supabase, leadId, userId, outcome);
        } catch (nudgeError: any) {
          console.error('[Retell Webhook] Nudge tracking error:', nudgeError);
        }

        // 6. Update pipeline position
        try {
          await updatePipelinePosition(supabase, leadId, userId, outcome);
        } catch (pipelineError: any) {
          console.error('[Retell Webhook] Pipeline position error:', pipelineError);
        }

        // 7. CRITICAL: Handle workflow based on disposition type
        // Terminal dispositions should STOP workflow, not advance
        // IMPORTANT: These must be valid DB outcomes (from call_logs outcome constraint):
        // interested, not_interested, callback, callback_requested, converted, do_not_call, 
        // contacted, appointment_set, dnc, completed, voicemail, no_answer, busy, failed, unknown
        const TERMINAL_DISPOSITIONS = [
          'callback_requested', 'callback', 'appointment_set', 
          'converted', 'not_interested', 'dnc', 'do_not_call', 'failed'
        ];
        
        // Dispositions that should remove lead from campaigns
        // Using valid DB outcome values only
        const CAMPAIGN_REMOVAL_DISPOSITIONS = [
          'not_interested', 'dnc', 'do_not_call', 'failed',
          'appointment_set', 'converted'
        ];
        
        if (TERMINAL_DISPOSITIONS.includes(outcome)) {
          // STOP the workflow for terminal dispositions
          try {
            await stopWorkflowForTerminalDisposition(supabase, leadId, outcome);
          } catch (stopError: any) {
            console.error('[Retell Webhook] Workflow stop error:', stopError);
          }
          
          // Remove from campaigns for removal-eligible dispositions
          if (CAMPAIGN_REMOVAL_DISPOSITIONS.includes(outcome)) {
            try {
              await removeFromCampaignsOnTerminal(supabase, leadId, outcome);
            } catch (removeError: any) {
              console.error('[Retell Webhook] Campaign removal error:', removeError);
            }
          }
          
          console.log(`[Retell Webhook] Terminal disposition "${outcome}" - workflow stopped, campaign removed`);
        } else {
          // Advance workflow to next step for non-terminal outcomes
          try {
            await advanceWorkflowAfterCall(supabase, leadId, userId, outcome);
          } catch (workflowError: any) {
            console.error('[Retell Webhook] Workflow advance error:', workflowError);
            await logFailedOperation(supabase, userId, 'workflow_advance', {
              leadId,
              outcome,
              error: workflowError.message,
            });
          }
        }

        // 8. Sync to Go High Level if configured
        try {
          await syncToGoHighLevel(supabase, leadId, userId, outcome, formattedTranscript, durationSeconds, call);
        } catch (ghlError: any) {
          console.error('[Retell Webhook] GHL sync error:', ghlError);
          await logFailedOperation(supabase, userId, 'ghl_sync', {
            leadId,
            outcome,
            error: ghlError.message,
          });
        }
      }
    }

    // ========================================================================
    // CREDIT SYSTEM: Post-call cost finalization
    // ========================================================================
    const webhookOrganizationId = metadata?.organization_id || callLog?.organization_id;

    if (webhookOrganizationId && durationSeconds > 0) {
      try {
        console.log(`[Retell Webhook] Finalizing credit cost for org ${webhookOrganizationId}, duration ${durationSeconds}s`);

        // Fetch actual cost from Retell API if available
        let retellActualCostCents: number | null = null;
        const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

        if (retellApiKey) {
          try {
            const callDetailsResponse = await fetch(
              `https://api.retellai.com/v2/get-call/${call.call_id}`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${retellApiKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );

            if (callDetailsResponse.ok) {
              const callDetails = await callDetailsResponse.json();

              // Retell provides cost_breakdown or call_cost with detailed costs
              if (callDetails.call_cost?.combined_cost) {
                retellActualCostCents = Math.round(callDetails.call_cost.combined_cost);
                console.log(`[Retell Webhook] Actual Retell cost: ${retellActualCostCents}c`);
              } else if (callDetails.cost_breakdown) {
                // Sum up all cost components
                const breakdown = callDetails.cost_breakdown;
                retellActualCostCents = Math.round(
                  (breakdown.llm_cost || 0) +
                  (breakdown.stt_cost || 0) +
                  (breakdown.tts_cost || 0) +
                  (breakdown.telephony_cost || 0)
                );
                console.log(`[Retell Webhook] Calculated Retell cost from breakdown: ${retellActualCostCents}c`);
              }

              // Update call_logs with actual cost data
              if (callLog?.id) {
                await supabase
                  .from('call_logs')
                  .update({
                    retell_cost_cents: retellActualCostCents,
                    cost_breakdown: callDetails.cost_breakdown || callDetails.call_cost || null,
                    token_usage: callDetails.llm_token_usage || null
                  })
                  .eq('id', callLog.id);
              }
            }
          } catch (costFetchError) {
            console.error('[Retell Webhook] Error fetching Retell cost:', costFetchError);
            // Continue with estimated cost
          }
        }

        // Finalize the cost (releases reservation and deducts actual)
        const { data: finalizeResult, error: finalizeError } = await supabase
          .rpc('finalize_call_cost', {
            p_organization_id: webhookOrganizationId,
            p_call_log_id: callLog?.id || null,
            p_retell_call_id: call.call_id,
            p_actual_minutes: Math.ceil((durationSeconds / 60) * 10) / 10, // Round to 0.1 min
            p_retell_cost_cents: retellActualCostCents,
            p_idempotency_key: `finalize_${call.call_id}`
          });

        if (finalizeError) {
          console.error('[Retell Webhook] Credit finalization error:', finalizeError);
        } else if (finalizeResult?.[0]) {
          const result = finalizeResult[0];
          if (result.success) {
            console.log(`[Retell Webhook] Credits finalized: ${result.amount_deducted_cents}c deducted, balance: ${result.new_balance_cents}c, margin: ${result.margin_cents}c`);

            // Check for low balance alert
            const { data: credits } = await supabase
              .from('organization_credits')
              .select('low_balance_threshold_cents, auto_recharge_enabled, auto_recharge_trigger_cents, last_low_balance_alert_at')
              .eq('organization_id', webhookOrganizationId)
              .single();

            if (credits && result.new_balance_cents <= (credits.low_balance_threshold_cents || 1000)) {
              // Check if we should send alert (only once per 24h)
              const shouldAlert = !credits.last_low_balance_alert_at ||
                (Date.now() - new Date(credits.last_low_balance_alert_at).getTime()) > 24 * 60 * 60 * 1000;

              if (shouldAlert) {
                console.log(`[Retell Webhook] LOW BALANCE ALERT: ${result.new_balance_cents}c remaining`);

                // Create system alert
                await supabase.from('system_alerts').insert({
                  user_id: userId,
                  alert_type: 'low_credit_balance',
                  severity: 'warning',
                  title: 'Low Credit Balance',
                  message: `Your credit balance is low ($${(result.new_balance_cents / 100).toFixed(2)}). Add credits to continue making calls.`,
                  metadata: {
                    organization_id: webhookOrganizationId,
                    balance_cents: result.new_balance_cents,
                    threshold_cents: credits.low_balance_threshold_cents
                  }
                });

                // Update last alert timestamp
                await supabase
                  .from('organization_credits')
                  .update({ last_low_balance_alert_at: new Date().toISOString() })
                  .eq('organization_id', webhookOrganizationId);
              }

              // Check for auto-recharge
              if (credits.auto_recharge_enabled &&
                  result.new_balance_cents <= (credits.auto_recharge_trigger_cents || 500)) {
                console.log(`[Retell Webhook] Auto-recharge triggered for org ${webhookOrganizationId}`);
                // AUTO-RECHARGE: Stripe integration pending (Phase 5)
                // When implemented, this will:
                // 1. Check organization has valid stripe_payment_method_id
                // 2. Invoke Stripe API to charge auto_recharge_amount_cents
                // 3. Call add_credits() on success
                // 4. Create system alert on failure
                // For now, we just log the trigger - manual top-up required
              }
            }
          } else {
            console.warn('[Retell Webhook] Credit finalization returned error:', result.error_message);
          }
        }
      } catch (creditError: any) {
        console.error('[Retell Webhook] Credit processing error:', creditError);
        // Don't fail the webhook - log for manual reconciliation
        if (userId) {
          await supabase.from('system_alerts').insert({
            user_id: userId,
            alert_type: 'credit_deduction_failed',
            severity: 'warning',
            title: 'Credit Deduction Failed',
            message: `Failed to deduct credits for call ${call.call_id}: ${creditError.message}`,
            metadata: {
              call_id: call.call_id,
              organization_id: webhookOrganizationId,
              duration_seconds: durationSeconds,
              error: creditError.message
            }
          });
        }
      }
    }
    // ========================================================================

    // 7. Update phone number usage stats (with auto-reset if date changed)
    if (call.from_number) {
      const { data: phoneData } = await supabase
        .from('phone_numbers')
        .select('id')
        .eq('number', call.from_number)
        .maybeSingle();

      if (phoneData?.id) {
        await supabase.rpc('increment_daily_calls_with_reset', { phone_number_id: phoneData.id });
      }
    }

    console.log('[Retell Webhook] Processing complete for call:', call.call_id);

    return new Response(JSON.stringify({
      received: true,
      processed: true,
      callId: call.call_id,
      disposition: outcome,
      leadId,
      voicemailDetection: {
        isVoicemail: vmDetection.isVoicemail,
        confidence: vmDetection.confidence,
        matchedPatterns: vmDetection.matchedPatterns.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Webhook] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper Functions

function formatTranscript(
  transcriptObject: Array<{ role: string; content: string }>,
  rawTranscript?: string
): string {
  if (transcriptObject && transcriptObject.length > 0) {
    return transcriptObject
      .map(entry => `${entry.role === 'agent' ? 'AI' : 'Lead'}: ${entry.content}`)
      .join('\n');
  }
  return rawTranscript || '';
}

function mapCallStatusToOutcome(
  status: string,
  disconnectionReason?: string,
  durationSeconds?: number
): string {
  // Very short calls are likely no answers or machine
  if (durationSeconds && durationSeconds < 10) {
    return 'no_answer';
  }

  switch (status) {
    case 'ended':
      if (disconnectionReason === 'machine_detected') return 'voicemail';
      if (disconnectionReason === 'dial_no_answer') return 'no_answer';
      if (disconnectionReason === 'dial_busy') return 'busy';
      if (disconnectionReason === 'dial_failed') return 'failed';
      return 'completed';
    case 'error':
      return 'failed';
    default:
      return 'unknown';
  }
}

function mapRetellAnalysisToDisposition(
  analysis: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, any>;
  },
  transcript?: string
): { disposition: string; confidence: number; summary: string } {
  const sentiment = analysis.user_sentiment?.toLowerCase() || 'neutral';
  const successful = analysis.call_successful;
  const customData = analysis.custom_analysis_data || {};

  // Check for specific disposition markers in custom data
  if (customData.disposition) {
    return {
      disposition: customData.disposition,
      confidence: 0.9,
      summary: analysis.call_summary || '',
    };
  }

  // Check transcript for callback patterns FIRST
  const transcriptLower = (transcript || analysis.call_summary || '').toLowerCase();
  const callbackPatterns = [
    /call\s*(me\s*)?(back|later|again)/i,
    /try\s*(me\s*)?(again|later|back)/i,
    /not\s*a\s*good\s*time/i,
    /busy\s*(right\s*now|at\s*the\s*moment)/i,
    /can\s*you\s*(call|try)\s*(back|later|again)/i,
    /in\s*(a\s*few|10|15|20|30|an?\s*hour|\d+)\s*(minute|min|hour)/i,
    /give\s*me\s*(a\s*few|10|15|20|30|\d+)\s*(minute|min|hour)/i,
    /tomorrow|next\s*week|morning|afternoon|evening/i,
    /call\s*back\s*(in|at|around|later)/i,
    /i('m|\s*am)\s*(busy|in\s*a\s*meeting)/i,
  ];

  for (const pattern of callbackPatterns) {
    if (pattern.test(transcriptLower)) {
      return {
        disposition: 'callback_requested',
        confidence: 0.85,
        summary: analysis.call_summary || 'Lead requested callback',
      };
    }
  }

  // Check for appointment set
  const appointmentPatterns = [
    /appointment\s*(set|booked|scheduled|confirmed)/i,
    /see\s+you\s+(on|at|tomorrow)/i,
    /looking\s+forward\s+to\s+(meeting|seeing|speaking)/i,
    /confirmed\s+for/i,
    /scheduled\s+(for|at)/i,
  ];

  for (const pattern of appointmentPatterns) {
    if (pattern.test(transcriptLower)) {
      return {
        disposition: 'appointment_set',
        confidence: 0.9,
        summary: analysis.call_summary || 'Appointment scheduled',
      };
    }
  }

  // Map sentiment to disposition
  if (sentiment === 'positive' && successful) {
    return {
      disposition: 'interested',
      confidence: 0.8,
      summary: analysis.call_summary || 'Positive call outcome',
    };
  }

  if (sentiment === 'negative') {
    // Check for DNC phrases
    const dncPatterns = [
      /don('t|t)\s*call\s*(me\s*)?(again|back|anymore)/i,
      /stop\s*calling/i,
      /remove\s*me/i,
      /do\s*not\s*call/i,
      /leave\s*me\s*alone/i,
    ];

    for (const pattern of dncPatterns) {
      if (pattern.test(transcriptLower)) {
        return {
          disposition: 'dnc',
          confidence: 0.95,
          summary: analysis.call_summary || 'Lead requested DNC',
        };
      }
    }

    return {
      disposition: 'not_interested',
      confidence: 0.75,
      summary: analysis.call_summary || 'Negative sentiment detected',
    };
  }

  // Default to contacted if we got through
  return {
    disposition: successful ? 'contacted' : 'no_answer',
    confidence: 0.6,
    summary: analysis.call_summary || '',
  };
}

function mapDispositionToLeadStatus(disposition: string): string {
  const statusMap: Record<string, string> = {
    'appointment_set': 'appointment',
    'appointment_booked': 'appointment',
    'callback_requested': 'callback',
    'callback': 'callback',
    'interested': 'qualified',
    'not_interested': 'not_interested',
    'dnc': 'dnc',
    'do_not_call': 'dnc',
    'wrong_number': 'invalid',
    'voicemail': 'contacted',
    'no_answer': 'contacted',
    'busy': 'contacted',
    'contacted': 'contacted',
    'converted': 'won',
  };
  
  return statusMap[disposition] || 'contacted';
}

function buildCallNote(
  outcome: string,
  dispositionResult: any,
  durationSeconds: number,
  firstName?: string,
  vmDetection?: VoicemailDetectionResult
): string {
  const timestamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  let note = `📞 Call at ${timestamp} (${Math.round(durationSeconds / 60)}m ${durationSeconds % 60}s)\n`;
  note += `Outcome: ${outcome.replace(/_/g, ' ').toUpperCase()}`;
  
  if (vmDetection?.isVoicemail) {
    note += ` (VM detected: ${vmDetection.confidence.toFixed(0)}% confidence)`;
  }
  
  if (dispositionResult?.summary) {
    note += `\nSummary: ${dispositionResult.summary}`;
  }
  
  return note;
}

// Convert spelled-out numbers to digits for callback time extraction
function wordToNumber(text: string): string {
  const wordNumbers: Record<string, string> = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
    'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
    'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
    'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18',
    'nineteen': '19', 'twenty': '20', 'thirty': '30', 'forty': '40',
    'forty-five': '45', 'forty five': '45', 'fifty': '50', 'sixty': '60'
  };
  
  let result = text.toLowerCase();
  
  // Replace word numbers with digits
  for (const [word, num] of Object.entries(wordNumbers)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), num);
  }
  
  // Handle compound numbers like "twenty five" -> "25"
  result = result.replace(/(\d{2})\s+(\d)(?!\d)/g, (_, tens, ones) => {
    return String(parseInt(tens) + parseInt(ones));
  });
  
  return result;
}

function extractCallbackTimeFromTranscript(transcript: string): number {
  // CRITICAL: Convert word numbers to digits first (e.g., "four minutes" -> "4 minutes")
  const normalizedTranscript = wordToNumber(transcript);
  const transcriptLower = normalizedTranscript.toLowerCase();
  
  // Log the normalized transcript for debugging
  const lastChunk = transcriptLower.substring(Math.max(0, transcriptLower.length - 300));
  console.log('[Retell Webhook] Normalized transcript for callback time extraction:', lastChunk);
  
  // Check for numeric extractions FIRST (now catches both "4 minutes" and converted "four minutes")
  const numericMinutes = transcriptLower.match(/(\d+)\s*minutes?/i);
  if (numericMinutes && numericMinutes[1]) {
    const mins = parseInt(numericMinutes[1], 10);
    if (mins > 0 && mins < 1000) {
      console.log(`[Retell Webhook] Extracted callback time: ${mins} minutes from numeric pattern`);
      return mins;
    }
  }

  const numericHours = transcriptLower.match(/(\d+)\s*hours?/i);
  if (numericHours && numericHours[1]) {
    const hours = parseInt(numericHours[1], 10);
    if (hours > 0 && hours < 48) {
      console.log(`[Retell Webhook] Extracted callback time: ${hours} hours = ${hours * 60} minutes`);
      return hours * 60;
    }
  }

  // Check fuzzy patterns
  const timePatterns: { pattern: RegExp; minutes: number }[] = [
    { pattern: /half\s*an?\s*hour/i, minutes: 30 },
    { pattern: /an?\s*hour/i, minutes: 60 },
    { pattern: /a\s*few\s*minutes/i, minutes: 15 },
    { pattern: /couple\s*(of\s*)?minutes/i, minutes: 5 },
    { pattern: /tomorrow/i, minutes: 24 * 60 },
    { pattern: /next\s*week/i, minutes: 7 * 24 * 60 },
    { pattern: /this\s*afternoon/i, minutes: 4 * 60 },
    { pattern: /this\s*evening/i, minutes: 6 * 60 },
    { pattern: /tonight/i, minutes: 6 * 60 },
    { pattern: /in\s*the\s*morning/i, minutes: 18 * 60 },
    { pattern: /later\s*today/i, minutes: 120 },
  ];

  for (const { pattern, minutes } of timePatterns) {
    if (pattern.test(transcriptLower)) {
      console.log(`[Retell Webhook] Matched fuzzy pattern, callback time: ${minutes} minutes`);
      return minutes;
    }
  }

  // Default to 2 hours if no specific time mentioned
  console.log('[Retell Webhook] No callback time found in transcript, defaulting to 120 minutes');
  return 120;
}

async function analyzeTranscriptWithAI(
  supabase: any,
  params: { transcript: string; callId?: string; userId: string }
): Promise<{ disposition: string; confidence: number; summary: string } | null> {
  try {
    const response = await supabase.functions.invoke('analyze-call-transcript', {
      body: {
        transcript: params.transcript,
        callId: params.callId,
        userId: params.userId,
      },
    });

    if (response.error) {
      throw new Error(response.error.message || 'AI analysis failed');
    }

    return response.data;
  } catch (error) {
    console.error('[Retell Webhook] AI analysis error:', error);
    return null;
  }
}

async function updateNudgeTracking(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  const engaged = ['appointment_set', 'callback_requested', 'interested', 'contacted'].includes(outcome);
  
  await supabase.from('lead_nudge_tracking').upsert({
    lead_id: leadId,
    user_id: userId,
    last_ai_contact_at: new Date().toISOString(),
    is_engaged: engaged,
    sequence_paused: outcome === 'callback_requested' || outcome === 'appointment_set',
    pause_reason: outcome === 'callback_requested' ? 'callback_scheduled' : 
                  outcome === 'appointment_set' ? 'appointment_booked' : null,
  }, {
    onConflict: 'lead_id',
  });
}

async function updatePipelinePosition(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  // Map outcomes to pipeline stages - comprehensive disposition coverage
  const stageMapping: Record<string, string> = {
    // Positive outcomes (green)
    'appointment_set': 'Appointment Set',
    'appointment_booked': 'Appointment Set',
    'hot_lead': 'Hot Leads',
    'interested': 'Interested',
    'converted': 'Converted',
    
    // Callbacks/Follow-up (amber) - Use "Callback Scheduled" to match user's existing board
    'callback_requested': 'Callback Scheduled',
    'callback': 'Callback Scheduled',
    'follow_up': 'Follow Up',
    'potential_prospect': 'Prospects',
    
    // Neutral/Contact attempts (gray)
    'contacted': 'Contacted',
    'voicemail': 'Contacted',
    'not_connected': 'Not Contacted',
    'dropped_call': 'Not Contacted',
    'dial_tree_workflow': 'In Progress',
    'no_answer': 'Not Contacted',
    'busy': 'Not Contacted',
    'failed': 'Not Contacted',
    
    // Negative/Disqualified (red)
    'not_interested': 'Not Interested',
    'already_has_solar': 'Disqualified',
    'renter': 'Disqualified',
    'wrong_number': 'Invalid',
    'dnc': 'DNC',
    'do_not_call': 'DNC',
  };

  const stageName = stageMapping[outcome];
  if (!stageName) {
    console.log(`[Retell Webhook] No pipeline stage mapping for outcome: ${outcome}`);
    return;
  }

  // BULLETPROOF: Ensure the pipeline board exists, create if missing
  try {
    const board = await ensurePipelineBoardLocal(supabase, userId, stageName);
    
    console.log(`[Retell Webhook] Moving lead ${leadId} to pipeline: ${board.name} (board: ${board.id})`);
    
    const { error: pipelineError } = await supabase.from('lead_pipeline_positions').upsert({
      user_id: userId,
      lead_id: leadId,
      pipeline_board_id: board.id,
      position: 0,
      moved_at: new Date().toISOString(),
      moved_by_user: false,
      notes: `Auto-moved by call outcome: ${outcome}`,
    }, {
      onConflict: 'lead_id,user_id',
    });
    
    if (pipelineError) {
      console.error('[Retell Webhook] Pipeline update failed:', pipelineError);
    } else {
      console.log(`[Retell Webhook] ✅ Lead ${leadId} successfully moved to ${board.name}${board.created ? ' (board auto-created)' : ''}`);
    }
  } catch (error) {
    console.error('[Retell Webhook] Pipeline update error:', error);
  }
}

// BULLETPROOF local helper - ensures pipeline board exists, creates if missing
async function ensurePipelineBoardLocal(
  supabase: any,
  userId: string,
  desiredName: string
): Promise<{ id: string; name: string; created: boolean }> {
  const normalizedName = desiredName.trim();
  
  // Try case-insensitive match first
  const { data: existingBoards } = await supabase
    .from('pipeline_boards')
    .select('id, name, position')
    .eq('user_id', userId);
  
  // Case-insensitive matching with common variations
  const variations = [
    normalizedName.toLowerCase(),
    normalizedName.toLowerCase().replace(/_/g, ' '),
    normalizedName.replace(/([A-Z])/g, ' $1').trim().toLowerCase(),
  ];
  
  for (const board of existingBoards || []) {
    const boardNameLower = board.name.toLowerCase();
    if (variations.includes(boardNameLower) || boardNameLower === normalizedName.toLowerCase()) {
      return { id: board.id, name: board.name, created: false };
    }
  }
  
  // Create the board if not found
  const maxPosition = (existingBoards || []).reduce((max: number, b: any) => 
    Math.max(max, b.position || 0), 0);
  
  const { data: created, error } = await supabase
    .from('pipeline_boards')
    .insert({
      user_id: userId,
      name: normalizedName,
      description: `Auto-created for: ${normalizedName}`,
      position: maxPosition + 1,
      settings: {},
    })
    .select('id, name')
    .single();
  
  if (error) throw error;
  
  console.log(`[Retell Webhook] ✅ Auto-created pipeline board: ${created.name}`);
  return { id: created.id, name: created.name, created: true };
}

// Stop workflow when a terminal disposition is reached
async function stopWorkflowForTerminalDisposition(
  supabase: any,
  leadId: string,
  outcome: string
) {
  const { data: activeProgress } = await supabase
    .from('lead_workflow_progress')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .maybeSingle();
  
  if (activeProgress) {
    const { error } = await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'stopped',
        removal_reason: `Terminal disposition: ${outcome}`,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeProgress.id);
    
    if (error) {
      console.error('[Retell Webhook] Failed to stop workflow:', error);
    } else {
      console.log(`[Retell Webhook] ⛔ Stopped workflow for lead ${leadId} due to: ${outcome}`);
    }
  }
}

// Remove lead from all campaigns AND dialing queues when terminal disposition reached
async function removeFromCampaignsOnTerminal(
  supabase: any,
  leadId: string,
  outcome: string
) {
  // 1. Remove from campaign_leads
  const { error: campaignError, count: campaignCount } = await supabase
    .from('campaign_leads')
    .delete()
    .eq('lead_id', leadId);

  if (campaignError) {
    console.error('[Retell Webhook] Failed to remove lead from campaigns:', campaignError);
  } else if (campaignCount && campaignCount > 0) {
    console.log(`[Retell Webhook] ✅ Removed lead ${leadId} from ${campaignCount} campaign(s) due to: ${outcome}`);
  }

  // 2. CRITICAL: Also remove from dialing_queues to prevent future call attempts
  const { error: queueError, count: queueCount } = await supabase
    .from('dialing_queues')
    .delete()
    .eq('lead_id', leadId)
    .in('status', ['pending', 'calling', 'failed']); // Remove all non-completed queue entries

  if (queueError) {
    console.error('[Retell Webhook] Failed to remove lead from dialing queues:', queueError);
  } else if (queueCount && queueCount > 0) {
    console.log(`[Retell Webhook] ✅ Removed lead ${leadId} from ${queueCount} dialing queue(s) due to: ${outcome}`);
  }
  
  // Log if lead wasn't in any campaigns or queues
  if ((!campaignCount || campaignCount === 0) && (!queueCount || queueCount === 0)) {
    console.log(`[Retell Webhook] Lead ${leadId} was not in any campaigns or queues`);
  }
}

async function advanceWorkflowAfterCall(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  // Find active workflow progress for this lead
  const { data: activeProgress } = await supabase
    .from('lead_workflow_progress')
    .select('id, current_step_id, workflow_id')
    .eq('lead_id', leadId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeProgress) {
    console.log('[Retell Webhook] No active workflow to advance for lead:', leadId);
    return;
  }

  // Get the next step in the workflow
  const { data: currentStep } = await supabase
    .from('workflow_steps')
    .select('step_number, workflow_id')
    .eq('id', activeProgress.current_step_id)
    .maybeSingle();

  if (!currentStep) return;

  const { data: nextStep } = await supabase
    .from('workflow_steps')
    .select('id')
    .eq('workflow_id', currentStep.workflow_id)
    .eq('step_number', currentStep.step_number + 1)
    .maybeSingle();

  if (nextStep) {
    // Move to next step
    const nextActionAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min delay
    await supabase
      .from('lead_workflow_progress')
      .update({
        current_step_id: nextStep.id,
        next_action_at: nextActionAt,
        last_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeProgress.id);
    
    console.log(`[Retell Webhook] Advanced workflow for lead ${leadId} to next step`);
  } else {
    // No more steps - complete the workflow
    await supabase
      .from('lead_workflow_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeProgress.id);
    
    console.log(`[Retell Webhook] Workflow completed for lead ${leadId}`);
  }
}

async function syncToGoHighLevel(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string,
  transcript: string,
  durationSeconds: number,
  call: any
) {
  // Check if GHL sync is enabled
  const { data: ghlSettings } = await supabase
    .from('ghl_sync_settings')
    .select('sync_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (!ghlSettings?.sync_enabled) return;

  // Invoke GHL integration
  await supabase.functions.invoke('ghl-integration', {
    body: {
      action: 'log_call',
      leadId,
      userId,
      outcome,
      transcript,
      durationSeconds,
      callId: call.call_id,
    },
  });
}

async function logFailedOperation(
  supabase: any,
  userId: string,
  operationType: string,
  details: Record<string, any>
) {
  try {
    await supabase.from('system_alerts').insert({
      user_id: userId,
      alert_type: 'failed_operation',
      severity: 'warning',
      message: `Failed ${operationType}`,
      metadata: details,
      acknowledged: false,
    });
  } catch (e) {
    console.error('[Retell Webhook] Failed to log failed operation:', e);
  }
}
