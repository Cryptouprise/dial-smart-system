import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, leadId, userId, eventType, eventOutcome, metadata } = await req.json();

    if (action === 'record_event') {
      // Record a new reachability event
      const now = new Date();
      const { error: eventError } = await supabase
        .from('reachability_events')
        .insert({
          user_id: userId,
          lead_id: leadId,
          event_type: eventType,
          event_outcome: eventOutcome,
          contact_time: now.toTimeString().split(' ')[0],
          contact_day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
          metadata: metadata || {},
        });

      if (eventError) {
        console.error('Error recording event:', eventError);
        throw eventError;
      }

      // Recalculate score for this lead
      await recalculateScore(supabase, userId, leadId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'recalculate_all') {
      // Recalculate scores for all leads
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', userId);

      if (leadsError) throw leadsError;

      for (const lead of leads || []) {
        await recalculateScore(supabase, userId, lead.id);
      }

      return new Response(JSON.stringify({ success: true, processed: leads?.length || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_insights') {
      // Get AI insights for a lead
      const { data: score } = await supabase
        .from('lead_reachability_scores')
        .select('*')
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .maybeSingle();

      const { data: events } = await supabase
        .from('reachability_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ score, events }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Unknown action');
  } catch (error) {
    console.error('Error in reachability-scoring:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function recalculateScore(supabase: any, userId: string, leadId: string) {
  // Get all events for this lead
  const { data: events } = await supabase
    .from('reachability_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (!events || events.length === 0) {
    // No events, set default score
    await supabase
      .from('lead_reachability_scores')
      .upsert({
        user_id: userId,
        lead_id: leadId,
        reachability_score: 50,
        confidence_level: 10,
        score_factors: { reason: 'No contact attempts yet' },
      }, { onConflict: 'user_id,lead_id' });
    return;
  }

  // Calculate metrics
  const callAttempts = events.filter((e: any) => e.event_type === 'call_attempt').length;
  const callsConnected = events.filter((e: any) => e.event_type === 'call_connected' || e.event_outcome === 'success').length;
  const voicemails = events.filter((e: any) => e.event_outcome === 'voicemail').length;
  const smsSent = events.filter((e: any) => e.event_type === 'sms_sent').length;
  const smsReplies = events.filter((e: any) => e.event_type === 'sms_reply').length;
  const emailsSent = events.filter((e: any) => e.event_type === 'email_sent').length;
  const emailsOpened = events.filter((e: any) => e.event_type === 'email_opened').length;

  // Calculate base score (0-100)
  let score = 50; // Start neutral

  // Call success rate impact (weight: 40%)
  if (callAttempts > 0) {
    const callSuccessRate = callsConnected / callAttempts;
    score += (callSuccessRate - 0.3) * 40; // 30% is baseline, above adds points, below subtracts
  }

  // SMS response rate impact (weight: 30%)
  if (smsSent > 0) {
    const smsResponseRate = smsReplies / smsSent;
    score += (smsResponseRate - 0.1) * 30; // 10% is baseline
  }

  // Email engagement impact (weight: 20%)
  if (emailsSent > 0) {
    const emailOpenRate = emailsOpened / emailsSent;
    score += (emailOpenRate - 0.2) * 20; // 20% is baseline
  }

  // Recent activity bonus/penalty (weight: 10%)
  const lastEvent = events[0];
  const daysSinceLastContact = (Date.now() - new Date(lastEvent.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLastContact < 1) score += 5;
  else if (daysSinceLastContact > 7) score -= 5;
  else if (daysSinceLastContact > 30) score -= 15;

  // Many failed attempts penalty
  const failedAttempts = callAttempts - callsConnected;
  if (failedAttempts > 5) score -= 10;
  if (failedAttempts > 10) score -= 15;

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Calculate confidence (more data = higher confidence)
  const totalEvents = events.length;
  const confidence = Math.min(100, 10 + totalEvents * 5);

  // Find best contact patterns
  const contactTimes: { [key: string]: number } = {};
  const contactDays: { [key: string]: number } = {};
  const successfulEvents = events.filter((e: any) => e.event_outcome === 'success' || e.event_type === 'call_connected');
  
  successfulEvents.forEach((e: any) => {
    if (e.contact_time) {
      const hour = e.contact_time.split(':')[0];
      contactTimes[hour] = (contactTimes[hour] || 0) + 1;
    }
    if (e.contact_day) {
      contactDays[e.contact_day] = (contactDays[e.contact_day] || 0) + 1;
    }
  });

  const bestTime = Object.entries(contactTimes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const bestDay = Object.entries(contactDays).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Determine preferred channel
  let preferredChannel = 'call';
  if (smsSent > 0 && smsReplies / smsSent > callsConnected / Math.max(callAttempts, 1)) {
    preferredChannel = 'sms';
  }

  // Generate AI notes
  let aiNotes = '';
  if (score < 20) {
    aiNotes = 'Very low reachability. Consider removing from active campaigns or trying alternative contact methods.';
  } else if (score < 40) {
    aiNotes = 'Below average reachability. May need different approach or timing.';
  } else if (score > 80) {
    aiNotes = 'Highly reachable lead. Prioritize for campaigns.';
  } else if (score > 60) {
    aiNotes = 'Good reachability. Continue current approach.';
  }

  if (bestTime) aiNotes += ` Best contact time appears to be around ${bestTime}:00.`;
  if (bestDay) aiNotes += ` Most responsive on ${bestDay}s.`;

  // Upsert the score
  await supabase
    .from('lead_reachability_scores')
    .upsert({
      user_id: userId,
      lead_id: leadId,
      reachability_score: Math.round(score),
      confidence_level: confidence,
      total_call_attempts: callAttempts,
      successful_calls: callsConnected,
      voicemails_left: voicemails,
      sms_sent: smsSent,
      sms_replies: smsReplies,
      emails_sent: emailsSent,
      emails_opened: emailsOpened,
      last_successful_contact: successfulEvents[0]?.created_at || null,
      best_contact_time: bestTime ? `${bestTime}:00` : null,
      best_contact_day: bestDay || null,
      preferred_channel: preferredChannel,
      score_factors: {
        callSuccessRate: callAttempts > 0 ? (callsConnected / callAttempts * 100).toFixed(1) + '%' : 'N/A',
        smsResponseRate: smsSent > 0 ? (smsReplies / smsSent * 100).toFixed(1) + '%' : 'N/A',
        emailOpenRate: emailsSent > 0 ? (emailsOpened / emailsSent * 100).toFixed(1) + '%' : 'N/A',
        totalAttempts: callAttempts + smsSent + emailsSent,
        daysSinceLastContact: Math.round(daysSinceLastContact),
      },
      ai_notes: aiNotes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lead_id' });
}
