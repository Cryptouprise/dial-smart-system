/**
 * Nudge Scheduler Edge Function
 * 
 * Automatically follows up with leads who haven't responded after AI contact.
 * This solves the "lead went silent" problem by:
 * 1. Checking for leads with past next_nudge_at times
 * 2. Sending follow-up SMS via AI
 * 3. Rescheduling the next nudge with exponential backoff
 * 
 * Should be called via pg_cron every 5-15 minutes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Nudge intervals in hours (exponential backoff)
const NUDGE_INTERVALS = [24, 48, 72, 120, 168]; // 1 day, 2 days, 3 days, 5 days, 7 days
const MAX_NUDGES = 5; // Stop after 5 follow-ups

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();

    console.log('[Nudge Scheduler] Starting nudge check at', now.toISOString());

    // Find leads that need follow-up:
    // - next_nudge_at is in the past
    // - sequence is not paused
    // - nudge_count is below max
    // - last_lead_response_at is older than last_ai_contact_at (lead went silent)
    const { data: dueNudges, error: fetchError } = await supabase
      .from('lead_nudge_tracking')
      .select(`
        *,
        leads!lead_nudge_tracking_lead_id_fkey (
          id,
          phone_number,
          first_name,
          last_name,
          status,
          user_id,
          do_not_call
        )
      `)
      .lte('next_nudge_at', now.toISOString())
      .eq('sequence_paused', false)
      .lt('nudge_count', MAX_NUDGES)
      .not('leads', 'is', null);

    if (fetchError) {
      console.error('[Nudge Scheduler] Error fetching due nudges:', fetchError);
      throw fetchError;
    }

    console.log(`[Nudge Scheduler] Found ${dueNudges?.length || 0} leads due for follow-up`);

    const results: Array<{ leadId: string; success: boolean; action?: string; error?: string }> = [];

    for (const nudge of dueNudges || []) {
      const lead = nudge.leads;
      
      // Skip if lead is DNC or invalid
      if (!lead || lead.do_not_call) {
        console.log(`[Nudge Scheduler] Skipping lead ${nudge.lead_id} - DNC or invalid`);
        await supabase
          .from('lead_nudge_tracking')
          .update({ sequence_paused: true, pause_reason: 'dnc_or_invalid' })
          .eq('id', nudge.id);
        continue;
      }

      // Check if lead actually went silent (no response after our last contact)
      const lastAiContact = nudge.last_ai_contact_at ? new Date(nudge.last_ai_contact_at) : null;
      const lastLeadResponse = nudge.last_lead_response_at ? new Date(nudge.last_lead_response_at) : null;

      // If lead responded after our last contact, they're engaged - reschedule
      if (lastLeadResponse && lastAiContact && lastLeadResponse > lastAiContact) {
        console.log(`[Nudge Scheduler] Lead ${lead.id} responded - rescheduling`);
        const nextNudge = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await supabase
          .from('lead_nudge_tracking')
          .update({ 
            next_nudge_at: nextNudge.toISOString(),
            is_engaged: true 
          })
          .eq('id', nudge.id);
        results.push({ leadId: lead.id, success: true, action: 'rescheduled_engaged' });
        continue;
      }

      try {
        // Get user's AI SMS settings
        const { data: settings } = await supabase
          .from('ai_sms_settings')
          .select('*')
          .eq('user_id', lead.user_id)
          .maybeSingle();

        if (!settings?.enabled) {
          console.log(`[Nudge Scheduler] AI SMS disabled for user ${lead.user_id}`);
          results.push({ leadId: lead.id, success: false, error: 'ai_sms_disabled' });
          continue;
        }

        // Get a from number for this user
        const { data: phoneNumbers } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('user_id', lead.user_id)
          .eq('status', 'active')
          .limit(1);

        const fromNumber = phoneNumbers?.[0]?.number;
        if (!fromNumber) {
          console.log(`[Nudge Scheduler] No from number for user ${lead.user_id}`);
          results.push({ leadId: lead.id, success: false, error: 'no_from_number' });
          continue;
        }

        // Get conversation for this lead
        const { data: conversation } = await supabase
          .from('sms_conversations')
          .select('id')
          .eq('user_id', lead.user_id)
          .eq('contact_phone', lead.phone_number)
          .maybeSingle();

        // Generate follow-up prompt based on nudge count
        const nudgeCount = nudge.nudge_count || 0;
        const followUpPrompts = [
          `This is a friendly follow-up. The lead "${lead.first_name || 'there'}" hasn't responded. Send a brief, non-pushy message checking in.`,
          `Second follow-up for ${lead.first_name || 'the lead'}. Keep it short and friendly, maybe ask if they had any questions.`,
          `Third follow-up. Be warm but give them an easy out - ask if they're still interested or if now isn't a good time.`,
          `Fourth follow-up. Gentle reminder that you're still here to help if they need anything.`,
          `Final follow-up. Let them know you'll stop reaching out but they can always text back when ready.`,
        ];

        const prompt = followUpPrompts[Math.min(nudgeCount, followUpPrompts.length - 1)];

        // Generate AI follow-up message
        if (!lovableApiKey) {
          console.error('[Nudge Scheduler] LOVABLE_API_KEY not configured');
          results.push({ leadId: lead.id, success: false, error: 'no_api_key' });
          continue;
        }

        const systemPrompt = `You are a friendly AI SMS assistant following up with a lead who hasn't responded.
${settings.custom_instructions || settings.ai_personality || 'Keep it brief, professional, and not pushy.'}

LEAD INFO:
- Name: ${lead.first_name || 'there'}
- Follow-up attempt: ${nudgeCount + 1} of ${MAX_NUDGES}

Generate a SHORT follow-up SMS (under 160 characters). Be natural, don't sound robotic.
${nudgeCount >= 4 ? 'This is the final follow-up - mention you wont bother them again but theyre welcome to reach out.' : ''}`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('[Nudge Scheduler] AI generation failed:', errorText);
          results.push({ leadId: lead.id, success: false, error: 'ai_failed' });
          continue;
        }

        const aiData = await aiResponse.json();
        let generatedMessage = aiData.choices?.[0]?.message?.content?.trim();

        if (!generatedMessage) {
          results.push({ leadId: lead.id, success: false, error: 'no_message_generated' });
          continue;
        }

        // Clean up any repeated text
        generatedMessage = cleanRepeatedText(generatedMessage);

        console.log(`[Nudge Scheduler] Sending follow-up to ${lead.phone_number}: ${generatedMessage.substring(0, 50)}...`);

        // Send via Twilio
        const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

        if (!twilioAccountSid || !twilioAuthToken) {
          console.error('[Nudge Scheduler] Twilio credentials not configured');
          results.push({ leadId: lead.id, success: false, error: 'no_twilio_creds' });
          continue;
        }

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        const twilioResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromNumber,
            To: lead.phone_number,
            Body: generatedMessage,
          }).toString(),
        });

        const twilioData = await twilioResponse.json();

        if (!twilioResponse.ok) {
          console.error('[Nudge Scheduler] Twilio send failed:', twilioData);
          results.push({ leadId: lead.id, success: false, error: twilioData.message || 'twilio_failed' });
          continue;
        }

        console.log('[Nudge Scheduler] Message sent:', twilioData.sid);

        // Store the message
        let conversationId = conversation?.id;
        if (!conversationId) {
          const { data: newConv } = await supabase
            .from('sms_conversations')
            .insert({
              user_id: lead.user_id,
              contact_phone: lead.phone_number,
              contact_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null,
              last_message_at: new Date().toISOString(),
            })
            .select('id')
            .maybeSingle();
          conversationId = newConv?.id;
        }

        await supabase
          .from('sms_messages')
          .insert({
            user_id: lead.user_id,
            conversation_id: conversationId,
            lead_id: lead.id,
            to_number: lead.phone_number,
            from_number: fromNumber,
            body: generatedMessage,
            direction: 'outbound',
            status: 'sent',
            is_ai_generated: true,
            provider_type: 'twilio',
            provider_message_id: twilioData.sid,
            sent_at: new Date().toISOString(),
            metadata: { nudge_number: nudgeCount + 1 },
          });

        // Update nudge tracking
        const newNudgeCount = nudgeCount + 1;
        const intervalHours = NUDGE_INTERVALS[Math.min(newNudgeCount, NUDGE_INTERVALS.length - 1)];
        const nextNudgeAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

        await supabase
          .from('lead_nudge_tracking')
          .update({
            last_ai_contact_at: new Date().toISOString(),
            nudge_count: newNudgeCount,
            next_nudge_at: newNudgeCount >= MAX_NUDGES ? null : nextNudgeAt.toISOString(),
            is_engaged: false,
            sequence_paused: newNudgeCount >= MAX_NUDGES,
            pause_reason: newNudgeCount >= MAX_NUDGES ? 'max_nudges_reached' : null,
          })
          .eq('id', nudge.id);

        // Update conversation timestamp
        if (conversationId) {
          await supabase
            .from('sms_conversations')
            .update({ 
              last_message_at: new Date().toISOString(),
              last_from_number: fromNumber,
            })
            .eq('id', conversationId);
        }

        results.push({ leadId: lead.id, success: true, action: `nudge_${newNudgeCount}_sent` });

      } catch (error: any) {
        console.error(`[Nudge Scheduler] Error processing lead ${lead.id}:`, error);
        results.push({ leadId: lead.id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Nudge Scheduler] Completed. ${successCount}/${results.length} nudges sent.`);

    return new Response(JSON.stringify({
      success: true,
      total_checked: dueNudges?.length || 0,
      nudges_sent: successCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Nudge Scheduler] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to clean repeated text patterns
function cleanRepeatedText(text: string): string {
  if (!text || text.length < 50) return text;
  
  const lines = text.split(/\n+/);
  
  if (lines.length <= 2) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length > 3) {
      const uniqueSentences: string[] = [];
      const seenNormalized = new Set<string>();
      
      for (const sentence of sentences) {
        const normalized = sentence.toLowerCase().trim();
        if (normalized.length > 10 && !seenNormalized.has(normalized)) {
          seenNormalized.add(normalized);
          uniqueSentences.push(sentence);
        } else if (normalized.length <= 10) {
          uniqueSentences.push(sentence);
        }
      }
      
      if (uniqueSentences.length < sentences.length) {
        return uniqueSentences.join(' ').trim();
      }
    }
    return text;
  }
  
  const uniqueLines: string[] = [];
  const seenNormalized = new Set<string>();
  
  for (const line of lines) {
    const normalized = line.toLowerCase().trim();
    if (normalized.length > 20 && seenNormalized.has(normalized)) {
      continue;
    }
    if (normalized.length > 20) {
      seenNormalized.add(normalized);
    }
    uniqueLines.push(line);
  }
  
  if (uniqueLines.length < lines.length) {
    return uniqueLines.join('\n').trim();
  }
  
  return text;
}
