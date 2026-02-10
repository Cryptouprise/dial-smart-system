/**
 * AI Autonomous Engine - Server-Side Brain
 *
 * Runs every 5 minutes via pg_cron. Replaces all browser-side autonomous hooks.
 *
 * Responsibilities:
 * 1. Check goals vs progress → decide what actions to take
 * 2. Optimize calling times based on learned data
 * 3. Adjust pacing based on error/answer rates
 * 4. Re-score leads server-side
 * 5. Execute approved actions from ai_action_queue
 * 6. Queue new actions based on current state
 * 7. Save operational memories after significant events
 * 8. Expire stale pending actions
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutonomousSettings {
  enabled: boolean;
  autonomy_level: 'full_auto' | 'approval_required' | 'suggestions_only';
  auto_execute_recommendations: boolean;
  max_daily_autonomous_actions: number;
  daily_goal_appointments: number;
  daily_goal_calls: number;
  daily_goal_conversations: number;
  auto_optimize_calling_times: boolean;
  auto_adjust_pacing: boolean;
  auto_prioritize_leads: boolean;
  last_engine_run: string | null;
  engine_interval_minutes: number;
}

interface EngineResult {
  user_id: string;
  actions_queued: number;
  actions_executed: number;
  actions_expired: number;
  leads_rescored: number;
  windows_recalculated: number;
  pacing_adjusted: boolean;
  memories_saved: number;
  journey_processed: number;
  journey_actions: number;
  journey_stage_changes: number;
  decisions: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Goal Assessment
// ---------------------------------------------------------------------------

async function assessGoalProgress(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<{
  calls_today: number;
  appointments_today: number;
  conversations_today: number;
  calls_gap: number;
  appointments_gap: number;
  conversations_gap: number;
  on_track: boolean;
}> {
  const today = new Date().toISOString().split('T')[0];

  const { count: callsToday } = await supabase
    .from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`);

  const { count: appointmentsToday } = await supabase
    .from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('outcome', 'appointment_set')
    .gte('created_at', `${today}T00:00:00`);

  const { count: conversationsToday } = await supabase
    .from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('outcome', ['completed', 'answered', 'appointment_set'])
    .gte('created_at', `${today}T00:00:00`);

  const calls = callsToday || 0;
  const appts = appointmentsToday || 0;
  const convos = conversationsToday || 0;

  const callsGap = Math.max(0, settings.daily_goal_calls - calls);
  const apptsGap = Math.max(0, settings.daily_goal_appointments - appts);
  const convosGap = Math.max(0, settings.daily_goal_conversations - convos);

  // Consider "on track" if within 80% pace for current hour
  const currentHour = new Date().getHours();
  const hoursLeft = Math.max(1, 17 - currentHour); // Assume 9-5 window
  const hoursElapsed = Math.max(1, currentHour - 9);
  const expectedPace = settings.daily_goal_calls > 0
    ? (calls / hoursElapsed) * (hoursElapsed + hoursLeft)
    : calls;

  return {
    calls_today: calls,
    appointments_today: appts,
    conversations_today: convos,
    calls_gap: callsGap,
    appointments_gap: apptsGap,
    conversations_gap: convosGap,
    on_track: expectedPace >= settings.daily_goal_calls * 0.8,
  };
}

// ---------------------------------------------------------------------------
// Lead Scoring (Server-Side)
// ---------------------------------------------------------------------------

async function rescoreLeads(
  supabase: any,
  userId: string
): Promise<number> {
  // Get leads that need scoring (new or not scored in 24h)
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, status, last_contacted_at, created_at, tags, notes')
    .eq('user_id', userId)
    .eq('do_not_call', false)
    .in('status', ['new', 'contacted', 'qualified', 'callback'])
    .limit(200);

  if (error || !leads) return 0;

  // Phase 6: Load calibrated scoring weights (or use defaults)
  let weights = { engagement: 0.30, recency: 0.25, answer_rate: 0.25, status: 0.20 };
  try {
    const { data: userWeights } = await supabase
      .from('lead_scoring_weights')
      .select('engagement_weight, recency_weight, answer_rate_weight, status_weight')
      .eq('user_id', userId)
      .maybeSingle();
    if (userWeights) {
      weights = {
        engagement: userWeights.engagement_weight,
        recency: userWeights.recency_weight,
        answer_rate: userWeights.answer_rate_weight,
        status: userWeights.status_weight,
      };
    }
  } catch { /* use defaults */ }

  let scored = 0;

  for (const lead of leads) {
    // Engagement score: based on call history
    const { count: totalCalls } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id);

    const { count: answeredCalls } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .in('outcome', ['completed', 'answered', 'appointment_set']);

    const { count: smsCount } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .eq('direction', 'inbound');

    // Calculate component scores (0-100)
    const engagementScore = Math.min(100,
      ((answeredCalls || 0) * 30) + ((smsCount || 0) * 20)
    );

    const daysSinceContact = lead.last_contacted_at
      ? (Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const recencyScore = daysSinceContact < 1 ? 100
      : daysSinceContact < 3 ? 80
      : daysSinceContact < 7 ? 60
      : daysSinceContact < 14 ? 40
      : daysSinceContact < 30 ? 20
      : 10;

    const answerRate = (totalCalls || 0) > 0
      ? ((answeredCalls || 0) / (totalCalls || 1)) * 100
      : 50; // Default for uncalled leads

    // Status bonus
    const statusScore = lead.status === 'qualified' ? 90
      : lead.status === 'callback' ? 85
      : lead.status === 'contacted' ? 50
      : 30;

    // Weighted final score (using calibrated weights from Phase 6)
    const finalScore = (
      engagementScore * weights.engagement +
      recencyScore * weights.recency +
      answerRate * weights.answer_rate +
      statusScore * weights.status
    );

    // Update the lead's priority_score
    await supabase
      .from('leads')
      .update({ priority_score: Math.round(finalScore * 100) / 100 })
      .eq('id', lead.id);

    scored++;
  }

  return scored;
}

// ---------------------------------------------------------------------------
// Pacing Analysis
// ---------------------------------------------------------------------------

async function analyzePacing(
  supabase: any,
  userId: string
): Promise<{ should_adjust: boolean; recommendation: string; new_pace?: number; current_pace?: number; error_rate?: number; answer_rate?: number }> {
  // Get last hour of call data
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recentCalls } = await supabase
    .from('call_logs')
    .select('status, outcome, created_at')
    .eq('user_id', userId)
    .gte('created_at', oneHourAgo);

  if (!recentCalls || recentCalls.length < 10) {
    return { should_adjust: false, recommendation: 'Not enough data (need 10+ calls in last hour)' };
  }

  const total = recentCalls.length;
  const failed = recentCalls.filter((c: any) => c.outcome === 'failed' || c.status === 'failed').length;
  const answered = recentCalls.filter((c: any) =>
    ['completed', 'answered', 'appointment_set'].includes(c.outcome)
  ).length;

  const errorRate = failed / total;
  const answerRate = answered / total;

  // Get current pacing setting
  const { data: dialerSettings } = await supabase
    .from('advanced_dialer_settings')
    .select('calls_per_minute')
    .eq('user_id', userId)
    .maybeSingle();

  const currentPace = dialerSettings?.calls_per_minute || 50;

  if (errorRate > 0.25) {
    const newPace = Math.max(10, Math.floor(currentPace * 0.5));
    return {
      should_adjust: true,
      recommendation: `Error rate ${(errorRate * 100).toFixed(1)}% -- slowing from ${currentPace} to ${newPace}/min`,
      new_pace: newPace, current_pace: currentPace, error_rate: errorRate, answer_rate: answerRate,
    };
  }

  if (errorRate > 0.10) {
    const newPace = Math.max(10, Math.floor(currentPace * 0.75));
    return {
      should_adjust: true,
      recommendation: `Error rate ${(errorRate * 100).toFixed(1)}% -- reducing from ${currentPace} to ${newPace}/min`,
      new_pace: newPace, current_pace: currentPace, error_rate: errorRate, answer_rate: answerRate,
    };
  }

  if (errorRate < 0.03 && answerRate > 0.15 && currentPace < 100) {
    const newPace = Math.min(100, Math.floor(currentPace * 1.25));
    return {
      should_adjust: true,
      recommendation: `Low errors (${(errorRate * 100).toFixed(1)}%), good answers (${(answerRate * 100).toFixed(1)}%) -- increasing from ${currentPace} to ${newPace}/min`,
      new_pace: newPace, current_pace: currentPace, error_rate: errorRate, answer_rate: answerRate,
    };
  }

  return { should_adjust: false, recommendation: `Pacing stable at ${currentPace}/min`, current_pace: currentPace, error_rate: errorRate, answer_rate: answerRate };
}

// ---------------------------------------------------------------------------
// Action Queue Processing
// ---------------------------------------------------------------------------

async function executeApprovedActions(
  supabase: any,
  userId: string,
  maxActions: number
): Promise<{ executed: number; errors: string[] }> {
  const errors: string[] = [];

  // Get approved actions waiting for execution
  const { data: actions } = await supabase
    .from('ai_action_queue')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(maxActions);

  if (!actions || actions.length === 0) return { executed: 0, errors };

  let executed = 0;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  for (const action of actions) {
    // Mark as executing
    await supabase
      .from('ai_action_queue')
      .update({ status: 'executing', executed_at: new Date().toISOString() })
      .eq('id', action.id);

    try {
      let result: any;

      switch (action.action_type) {
        case 'queue_leads_for_calling': {
          // Queue high-priority leads into dialing_queues
          const { campaign_id, lead_ids, count } = action.action_params;
          if (campaign_id && lead_ids?.length > 0) {
            const entries = lead_ids.slice(0, count || 30).map((lid: string) => ({
              campaign_id,
              lead_id: lid,
              status: 'pending',
              scheduled_at: new Date().toISOString(),
              priority: action.priority,
            }));
            const { error } = await supabase.from('dialing_queues').upsert(entries, {
              onConflict: 'campaign_id,lead_id',
              ignoreDuplicates: true,
            });
            result = error ? { error: error.message } : { queued: entries.length };
          }
          break;
        }

        case 'send_followup_sms': {
          // Send SMS via edge function
          const { lead_id, phone_number, message } = action.action_params;
          const resp = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'send',
              to: phone_number,
              message,
              lead_id,
              user_id: userId,
            }),
          });
          result = await resp.json();
          break;
        }

        case 'adjust_pacing': {
          const { new_pace } = action.action_params;
          await supabase
            .from('advanced_dialer_settings')
            .upsert({
              user_id: userId,
              calls_per_minute: new_pace,
            }, { onConflict: 'user_id' });
          result = { adjusted_to: new_pace };
          break;
        }

        case 'quarantine_number': {
          const { phone_number, reason } = action.action_params;
          await supabase
            .from('phone_numbers')
            .update({
              status: 'quarantined',
              is_spam: true,
              quarantine_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq('phone_number', phone_number)
            .eq('user_id', userId);
          result = { quarantined: phone_number, reason };
          break;
        }

        case 'update_lead_status': {
          const { lead_id, new_status, reason } = action.action_params;
          await supabase
            .from('leads')
            .update({ status: new_status, notes: reason })
            .eq('id', lead_id)
            .eq('user_id', userId);
          result = { updated: lead_id, status: new_status };
          break;
        }

        case 'journey_call': {
          // Queue a call for a specific lead via outbound-calling
          const { lead_id, phone_number } = action.action_params;
          const resp = await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'make_call',
              lead_id,
              phone_number,
              user_id: userId,
              source: 'journey_engine',
            }),
          });
          result = await resp.json();
          // Update lead's last_contacted_at
          await supabase.from('leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', lead_id);
          break;
        }

        case 'journey_ai_sms': {
          // Send AI-generated SMS via ai-sms-processor
          const { lead_id, phone_number, prompt, lead_name } = action.action_params;
          const resp = await fetch(`${supabaseUrl}/functions/v1/ai-sms-processor`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'generate_and_send',
              lead_id,
              phone_number,
              user_id: userId,
              prompt: prompt,
              context: { lead_name, source: 'journey_engine' },
            }),
          });
          result = await resp.json();
          break;
        }

        default:
          result = { skipped: true, reason: `Unknown action type: ${action.action_type}` };
      }

      // Mark completed
      await supabase
        .from('ai_action_queue')
        .update({ status: 'completed', result })
        .eq('id', action.id);
      executed++;

    } catch (err: any) {
      errors.push(`Action ${action.id} (${action.action_type}): ${err.message}`);
      await supabase
        .from('ai_action_queue')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', action.id);
    }
  }

  return { executed, errors };
}

// ---------------------------------------------------------------------------
// Decision Making - The Core Brain
// ---------------------------------------------------------------------------

async function makeDecisions(
  supabase: any,
  userId: string,
  settings: AutonomousSettings,
  goalProgress: any,
  pacingAnalysis: any
): Promise<Array<{ action_type: string; params: any; priority: number; reasoning: string }>> {
  const decisions: Array<{ action_type: string; params: any; priority: number; reasoning: string }> = [];
  const currentHour = new Date().getHours();

  // Don't make decisions outside calling hours (9am-5pm)
  if (currentHour < 9 || currentHour >= 17) {
    return decisions;
  }

  // --- Decision 1: Should we adjust pacing? ---
  if (settings.auto_adjust_pacing && pacingAnalysis.should_adjust && pacingAnalysis.new_pace) {
    decisions.push({
      action_type: 'adjust_pacing',
      params: { new_pace: pacingAnalysis.new_pace },
      priority: 2,
      reasoning: pacingAnalysis.recommendation,
    });
  }

  // --- Decision 2: Behind on goals? Queue more leads ---
  if (goalProgress.calls_gap > 20 && !goalProgress.on_track) {
    // Find active campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (campaign) {
      // Get top-scored leads not already in queue
      const { data: topLeads } = await supabase
        .from('leads')
        .select('id, phone_number, priority_score')
        .eq('user_id', userId)
        .eq('do_not_call', false)
        .in('status', ['new', 'contacted', 'qualified', 'callback'])
        .order('priority_score', { ascending: false })
        .limit(30);

      if (topLeads && topLeads.length > 0) {
        decisions.push({
          action_type: 'queue_leads_for_calling',
          params: {
            campaign_id: campaign.id,
            lead_ids: topLeads.map((l: any) => l.id),
            count: Math.min(30, goalProgress.calls_gap),
          },
          priority: 3,
          reasoning: `Behind on daily goal by ${goalProgress.calls_gap} calls. Queuing top-scored leads.`,
        });
      }
    }
  }

  // --- Decision 3: Follow up with unanswered leads who have been called ---
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: needsFollowup } = await supabase
    .from('leads')
    .select('id, phone_number, first_name')
    .eq('user_id', userId)
    .eq('status', 'contacted')
    .eq('do_not_call', false)
    .lt('last_contacted_at', twoDaysAgo)
    .is('next_callback_at', null)
    .limit(5);

  if (needsFollowup && needsFollowup.length > 0) {
    for (const lead of needsFollowup.slice(0, 3)) {
      const name = lead.first_name || 'there';
      decisions.push({
        action_type: 'send_followup_sms',
        params: {
          lead_id: lead.id,
          phone_number: lead.phone_number,
          message: `Hey ${name}, just following up on our earlier conversation. Do you have a few minutes to chat today?`,
        },
        priority: 5,
        reasoning: `Lead ${lead.phone_number} was contacted 2+ days ago with no callback scheduled. Sending follow-up SMS.`,
      });
    }
  }

  // --- Decision 4: Quarantine numbers with high spam scores ---
  const { data: spamNumbers } = await supabase
    .from('phone_numbers')
    .select('phone_number, external_spam_score, daily_calls')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gt('external_spam_score', 70)
    .limit(5);

  if (spamNumbers && spamNumbers.length > 0) {
    for (const num of spamNumbers) {
      decisions.push({
        action_type: 'quarantine_number',
        params: {
          phone_number: num.phone_number,
          reason: `Spam score ${num.external_spam_score} exceeds threshold (70)`,
        },
        priority: 2,
        reasoning: `Number ${num.phone_number} has spam score ${num.external_spam_score}. Quarantining to protect caller reputation.`,
      });
    }
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// Memory Saving
// ---------------------------------------------------------------------------

async function saveRunMemory(
  supabase: any,
  userId: string,
  engineResult: EngineResult
): Promise<number> {
  let saved = 0;

  // Save if we made notable decisions
  if (engineResult.decisions.length > 0) {
    await supabase.rpc('save_operational_memory', {
      p_user_id: userId,
      p_memory_type: 'system_state',
      p_subject: `engine_run_${new Date().toISOString().split('T')[0]}`,
      p_content: {
        timestamp: new Date().toISOString(),
        actions_queued: engineResult.actions_queued,
        actions_executed: engineResult.actions_executed,
        leads_rescored: engineResult.leads_rescored,
        decisions: engineResult.decisions,
      },
      p_importance: 3,
    });
    saved++;
  }

  // Save pacing changes as lessons
  if (engineResult.pacing_adjusted) {
    await supabase.rpc('save_operational_memory', {
      p_user_id: userId,
      p_memory_type: 'calling_pattern',
      p_subject: 'pacing_adjustment',
      p_content: {
        timestamp: new Date().toISOString(),
        decisions: engineResult.decisions.filter((d: string) => d.includes('pacing')),
      },
      p_importance: 5,
    });
    saved++;
  }

  return saved;
}

// ---------------------------------------------------------------------------
// Disposition Value Loading
// ---------------------------------------------------------------------------

async function loadDispositionValues(supabase: any, userId: string): Promise<Map<string, any>> {
  // Seed defaults if none exist
  try { await supabase.rpc('seed_disposition_values', { p_user_id: userId }); } catch { /* already seeded */ }

  const { data } = await supabase
    .from('disposition_values')
    .select('*')
    .eq('user_id', userId);

  const map = new Map();
  for (const dv of (data || [])) {
    map.set(dv.disposition_name, dv);
    // Also map common aliases
    map.set(dv.disposition_name.toLowerCase(), dv);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Funnel Intelligence — Portfolio-level thinking
// "Those 42 warm leads are worth more than the next 2,000 cold dials"
// ---------------------------------------------------------------------------

async function analyzeFunnel(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<{ decisions: string[]; snapshot_saved: boolean }> {
  const decisions: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Get stage distribution
  const { data: stages } = await supabase
    .from('lead_journey_state')
    .select('journey_stage')
    .eq('user_id', userId);

  if (!stages || stages.length === 0) return { decisions, snapshot_saved: false };

  const counts: Record<string, number> = {};
  stages.forEach((s: any) => { counts[s.journey_stage] = (counts[s.journey_stage] || 0) + 1; });

  const hotCount = counts['hot'] || 0;
  const callbackCount = counts['callback_set'] || 0;
  const engagedCount = counts['engaged'] || 0;
  const bookedCount = counts['booked'] || 0;
  const stalledCount = counts['stalled'] || 0;
  const freshCount = counts['fresh'] || 0;
  const attemptingCount = counts['attempting'] || 0;

  // High-value leads that should be prioritized over cold calling
  const highValueLeads = hotCount + callbackCount + engagedCount;

  // Get today's activity numbers
  const [callsRes, smsRes, apptsRes] = await Promise.all([
    supabase.from('call_logs').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('direction', 'outbound').gte('created_at', `${today}T00:00:00`),
    supabase.from('call_logs').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('outcome', 'appointment_set').gte('created_at', `${today}T00:00:00`),
  ]);

  const callsMade = callsRes.count || 0;
  const smsSentToday = smsRes.count || 0;
  const apptsToday = apptsRes.count || 0;

  // Calculate cost per appointment (rough estimate: $0.07/min avg call, $0.01/SMS)
  const estCallCost = callsMade * 7; // ~7 cents per call attempt
  const estSmsCost = smsSentToday * 1; // ~1 cent per SMS
  const totalSpend = estCallCost + estSmsCost;
  const costPerAppt = apptsToday > 0 ? Math.round(totalSpend / apptsToday) : 0;

  // Conversion rates
  const { count: conversations } = await supabase.from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', `${today}T00:00:00`)
    .in('outcome', ['completed', 'answered', 'appointment_set', 'interested', 'callback']);

  const convos = conversations || 0;
  const callToConvo = callsMade > 0 ? convos / callsMade : 0;
  const convoToAppt = convos > 0 ? apptsToday / convos : 0;

  // --- PORTFOLIO DECISIONS ---

  // Decision: If we have hot/callback/engaged leads, they should be contacted BEFORE cold leads
  if (highValueLeads > 0) {
    decisions.push(`[FUNNEL] ${highValueLeads} high-value leads (${hotCount} hot, ${callbackCount} callbacks, ${engagedCount} engaged) should be prioritized over ${freshCount} fresh leads`);
  }

  // Decision: Stalled leads are leaking value
  if (stalledCount > 10) {
    decisions.push(`[FUNNEL] ${stalledCount} stalled leads need re-engagement. These were engaged and went silent — higher conversion potential than cold.`);
  }

  // Decision: Fresh leads piling up = not processing fast enough
  if (freshCount > 200 && attemptingCount < freshCount * 0.1) {
    decisions.push(`[FUNNEL] ${freshCount} fresh leads untouched. Speed-to-lead degrading. Consider increasing pace.`);
  }

  // Save daily funnel snapshot
  await supabase.from('funnel_snapshots').upsert({
    user_id: userId,
    snapshot_date: today,
    total_leads: stages.length,
    fresh_count: freshCount,
    attempting_count: attemptingCount,
    engaged_count: engagedCount,
    hot_count: hotCount,
    nurturing_count: counts['nurturing'] || 0,
    stalled_count: stalledCount,
    callback_count: callbackCount,
    booked_count: bookedCount,
    won_count: counts['closed_won'] || 0,
    lost_count: counts['closed_lost'] || 0,
    calls_made: callsMade,
    sms_sent: smsSentToday,
    appointments_booked: apptsToday,
    total_spend_cents: totalSpend,
    cost_per_appointment_cents: costPerAppt,
    cost_per_conversation_cents: convos > 0 ? Math.round(totalSpend / convos) : 0,
    call_to_conversation_rate: callToConvo,
    conversation_to_appointment_rate: convoToAppt,
    overall_conversion_rate: callsMade > 0 ? apptsToday / callsMade : 0,
  }, { onConflict: 'user_id,snapshot_date' });

  return { decisions, snapshot_saved: true };
}

// ---------------------------------------------------------------------------
// Number Health Prediction — Proactive rotation before numbers burn
// ---------------------------------------------------------------------------

async function predictNumberHealth(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<{ decisions: string[]; numbers_rested: number }> {
  const decisions: string[] = [];
  let numbersRested = 0;

  // Recalculate health metrics from call data
  const { data: healthCount } = await supabase.rpc('recalculate_number_health', { p_user_id: userId });

  // Get numbers that need attention
  const { data: unhealthyNumbers } = await supabase
    .from('number_health_metrics')
    .select('*')
    .eq('user_id', userId)
    .lt('health_score', 50)
    .order('health_score', { ascending: true });

  if (!unhealthyNumbers || unhealthyNumbers.length === 0) {
    return { decisions, numbers_rested: 0 };
  }

  for (const num of unhealthyNumbers) {
    // Critical: health < 20, needs immediate rest
    if (num.health_score < 20 && num.recommended_rest_until) {
      // Queue quarantine action
      const autoApprove = settings.autonomy_level === 'full_auto';
      await supabase.from('ai_action_queue').insert({
        user_id: userId,
        action_type: 'quarantine_number',
        action_params: {
          phone_number: num.phone_number,
          reason: `Health score ${num.health_score}/100. Spam risk ${(num.predicted_spam_risk * 100).toFixed(0)}%. ${num.calls_last_24h} calls in 24h, ${((num.answer_rate_24h || 0) * 100).toFixed(1)}% answer rate. Resting until ${num.recommended_rest_until}.`,
        },
        priority: 1,
        status: autoApprove ? 'approved' : 'pending',
        requires_approval: settings.autonomy_level === 'approval_required',
        reasoning: `[NUMBER HEALTH] ${num.phone_number} is burning. Health ${num.health_score}/100, spam risk ${(num.predicted_spam_risk * 100).toFixed(0)}%. Proactive rest to protect caller ID reputation.`,
        source: 'number_health',
        approved_at: autoApprove ? new Date().toISOString() : null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      numbersRested++;
      decisions.push(`[NUMBER HEALTH] ${num.phone_number}: health ${num.health_score}/100, resting until ${new Date(num.recommended_rest_until).toLocaleDateString()}`);
    }
    // Warning: health 20-50, reduce usage
    else if (num.health_score < 50) {
      decisions.push(`[NUMBER HEALTH] ${num.phone_number}: health ${num.health_score}/100, reducing max daily to ${num.max_safe_daily_calls}. Spam risk: ${(num.predicted_spam_risk * 100).toFixed(0)}%`);
      // Update the number's max daily limit
      await supabase.from('phone_numbers')
        .update({ max_daily_calls: num.max_safe_daily_calls })
        .eq('phone_number', num.phone_number)
        .eq('user_id', userId);
    }
  }

  return { decisions, numbers_rested: numbersRested };
}

// ---------------------------------------------------------------------------
// Transcript Intent Extraction — LLM-powered buying signal detection
// Called after calls complete (via webhook or batch)
// ---------------------------------------------------------------------------

async function extractTranscriptIntents(
  supabase: any,
  userId: string
): Promise<{ processed: number; decisions: string[] }> {
  const decisions: string[] = [];

  // Find recent calls with transcripts but no intent signals yet
  const { data: unprocessedCalls } = await supabase
    .from('call_logs')
    .select('id, lead_id, transcript, outcome, duration, sentiment_score')
    .eq('user_id', userId)
    .not('transcript', 'is', null)
    .not('transcript', 'eq', '')
    .gt('duration', 15) // Only process calls > 15 seconds
    .order('created_at', { ascending: false })
    .limit(10);

  if (!unprocessedCalls || unprocessedCalls.length === 0) return { processed: 0, decisions };

  // Filter out calls already analyzed
  const callIds = unprocessedCalls.map((c: any) => c.id);
  const { data: existing } = await supabase
    .from('lead_intent_signals')
    .select('call_id')
    .in('call_id', callIds);

  const existingIds = new Set((existing || []).map((e: any) => e.call_id));
  const toProcess = unprocessedCalls.filter((c: any) => !existingIds.has(c.id));

  if (toProcess.length === 0) return { processed: 0, decisions };

  // Import OpenRouter (dynamic import for Deno)
  let callLLMJson: any;
  try {
    const mod = await import('../_shared/openrouter.ts');
    callLLMJson = mod.callLLMJson;
  } catch {
    // OpenRouter not available, skip intent extraction
    return { processed: 0, decisions: ['[INTENT] OpenRouter module not available, skipping'] };
  }

  let processed = 0;
  for (const call of toProcess.slice(0, 5)) { // Max 5 per run to control costs
    try {
      const { data: intentData } = await callLLMJson({
        messages: [
          {
            role: 'system',
            content: `You are a sales intelligence AI. Analyze this call transcript and extract structured signals.
Return JSON with these exact fields:
{
  "timeline": "immediate|this_week|this_month|exploring|not_now|unknown",
  "budget_mentioned": boolean,
  "budget_range": string or null,
  "is_decision_maker": boolean,
  "decision_maker_name": string or null,
  "buying_signals": ["signal1", "signal2"],
  "objections": ["objection1"],
  "questions_asked": ["question1"],
  "pain_points": ["pain1"],
  "specific_dates_mentioned": ["Tuesday at 2pm", "next week"],
  "competitor_mentions": ["competitor1"],
  "call_interest_score": 1-10,
  "reasoning": "brief explanation"
}
Score 1-3: not interested. 4-6: neutral/exploring. 7-8: interested. 9-10: ready to buy.`
          },
          { role: 'user', content: `Transcript:\n${call.transcript.substring(0, 3000)}` },
        ],
        tier: 'fast',
        temperature: 0.1,
      });

      // Save intent signals
      await supabase.from('lead_intent_signals').insert({
        user_id: userId,
        lead_id: call.lead_id,
        call_id: call.id,
        timeline: intentData.timeline || 'unknown',
        budget_mentioned: intentData.budget_mentioned || false,
        budget_range: intentData.budget_range,
        is_decision_maker: intentData.is_decision_maker ?? true,
        decision_maker_name: intentData.decision_maker_name,
        buying_signals: intentData.buying_signals || [],
        objections: intentData.objections || [],
        questions_asked: intentData.questions_asked || [],
        pain_points: intentData.pain_points || [],
        specific_dates_mentioned: intentData.specific_dates_mentioned || [],
        competitor_mentions: intentData.competitor_mentions || [],
        call_interest_score: Math.min(10, Math.max(1, intentData.call_interest_score || 5)),
        llm_reasoning: intentData.reasoning,
        model_used: 'openrouter/fast',
      });

      // If LLM detected specific dates (e.g. "call me Tuesday at 2pm"), update journey
      if (intentData.specific_dates_mentioned?.length > 0) {
        decisions.push(`[INTENT] Lead ${call.lead_id.substring(0, 8)}: mentioned specific dates: ${intentData.specific_dates_mentioned.join(', ')}`);
      }

      // If high interest detected, boost the lead
      if (intentData.call_interest_score >= 8) {
        await supabase.from('lead_journey_state')
          .update({
            interest_level: intentData.call_interest_score,
            last_positive_signal_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('lead_id', call.lead_id);
        decisions.push(`[INTENT] Lead ${call.lead_id.substring(0, 8)}: HIGH interest (${intentData.call_interest_score}/10) — ${intentData.buying_signals?.join(', ') || 'positive signals detected'}`);
      }

      processed++;
    } catch (err: any) {
      decisions.push(`[INTENT] Error processing call ${call.id.substring(0, 8)}: ${err.message}`);
    }
  }

  if (processed > 0) {
    decisions.push(`[INTENT] Extracted intent signals from ${processed} call transcripts`);
  }

  return { processed, decisions };
}

// ---------------------------------------------------------------------------
// Self-Optimizing Playbook — The 8/10 feature
// Analyzes which playbook rules actually convert and rewrites the losers
// ---------------------------------------------------------------------------

async function optimizePlaybook(
  supabase: any,
  userId: string
): Promise<{ decisions: string[]; optimizations: number }> {
  const decisions: string[] = [];
  let optimizations = 0;

  // 1. Update playbook performance stats from journey events
  const { data: rules } = await supabase
    .from('followup_playbook')
    .select('id, rule_name, journey_stage, action_type, delay_hours')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (!rules || rules.length === 0) return { decisions, optimizations: 0 };

  for (const rule of rules) {
    // Count times this rule fired
    const { count: timesFired } = await supabase.from('journey_event_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('rule_name', rule.rule_name)
      .eq('event_type', 'action_queued')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if ((timesFired || 0) < 10) continue; // Need enough data

    // Count leads that had a positive response within 48h of this rule firing
    const { data: firedEvents } = await supabase.from('journey_event_log')
      .select('lead_id, created_at')
      .eq('user_id', userId)
      .eq('rule_name', rule.rule_name)
      .eq('event_type', 'action_queued')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(100);

    let positiveResponses = 0;
    let appointments = 0;

    for (const event of (firedEvents || []).slice(0, 50)) {
      // Check if lead had a positive signal within 48h
      const windowEnd = new Date(new Date(event.created_at).getTime() + 48 * 60 * 60 * 1000).toISOString();
      const { count: positive } = await supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', event.lead_id)
        .in('outcome', ['completed', 'answered', 'appointment_set', 'interested', 'callback'])
        .gte('created_at', event.created_at)
        .lte('created_at', windowEnd);

      if ((positive || 0) > 0) positiveResponses++;

      const { count: appt } = await supabase.from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('lead_id', event.lead_id)
        .eq('outcome', 'appointment_set')
        .gte('created_at', event.created_at)
        .lte('created_at', windowEnd);

      if ((appt || 0) > 0) appointments++;
    }

    const sampleSize = Math.min(50, firedEvents?.length || 0);
    const responseRate = sampleSize > 0 ? positiveResponses / sampleSize : 0;
    const apptRate = sampleSize > 0 ? appointments / sampleSize : 0;
    const perfScore = responseRate + (apptRate * 3); // Appointments are 3x more valuable

    // Upsert performance record
    await supabase.from('playbook_performance').upsert({
      user_id: userId,
      rule_id: rule.id,
      rule_name: rule.rule_name,
      times_fired: timesFired || 0,
      led_to_positive_response: positiveResponses,
      led_to_appointment: appointments,
      led_to_no_response: sampleSize - positiveResponses,
      response_rate: responseRate,
      appointment_rate: apptRate,
      performance_score: perfScore,
      last_calculated: new Date().toISOString(),
    }, { onConflict: 'user_id,rule_id' });

    // --- SELF-OPTIMIZATION ---
    // If a rule has fired 20+ times with < 2% response rate, it's a loser
    if ((timesFired || 0) >= 20 && responseRate < 0.02) {
      decisions.push(`[OPTIMIZE] Rule "${rule.rule_name}" underperforming: ${(responseRate * 100).toFixed(1)}% response rate over ${timesFired} fires. Consider adjusting.`);

      // Try to auto-adjust timing if the rule has enough data
      // Check if similar rules at different times perform better
      const { data: betterRules } = await supabase
        .from('playbook_performance')
        .select('rule_name, delay_hours:followup_playbook!inner(delay_hours), performance_score')
        .eq('user_id', userId)
        .gt('performance_score', perfScore * 2)
        .limit(1);

      if (betterRules && betterRules.length > 0) {
        decisions.push(`[OPTIMIZE] Rule "${betterRules[0].rule_name}" performs ${((betterRules[0].performance_score / Math.max(0.001, perfScore)) - 1) * 100 | 0}% better. Consider replicating its timing/approach.`);
      }

      optimizations++;
    }

    // If a rule is a star performer (>15% response), log it
    if ((timesFired || 0) >= 15 && responseRate > 0.15) {
      decisions.push(`[OPTIMIZE] Rule "${rule.rule_name}" is a TOP PERFORMER: ${(responseRate * 100).toFixed(1)}% response, ${(apptRate * 100).toFixed(1)}% appointment rate over ${timesFired} fires`);
    }
  }

  // 2. Use LLM to generate optimization recommendations (daily, not every 5 min)
  // Check if we already optimized today
  const todayStr = new Date().toISOString().split('T')[0];
  const { count: optimizedToday } = await supabase.from('playbook_optimization_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${todayStr}T00:00:00`);

  if ((optimizedToday || 0) === 0 && optimizations > 0) {
    // Get all performance data
    const { data: allPerf } = await supabase.from('playbook_performance')
      .select('rule_name, times_fired, response_rate, appointment_rate, performance_score')
      .eq('user_id', userId)
      .gt('times_fired', 5)
      .order('performance_score', { ascending: false });

    if (allPerf && allPerf.length > 3) {
      try {
        let callLLMJson: any;
        const mod = await import('../_shared/openrouter.ts');
        callLLMJson = mod.callLLMJson;

        const { data: recommendations } = await callLLMJson({
          messages: [
            {
              role: 'system',
              content: `You are a sales operations optimization AI. Analyze playbook rule performance data and suggest specific, actionable optimizations.

Return JSON:
{
  "top_performers": ["rule_name"],
  "underperformers": ["rule_name"],
  "recommendations": [
    {
      "rule_name": "rule to change",
      "type": "timing_adjusted|message_rewritten|priority_changed",
      "current": "description of current",
      "suggested": "specific change",
      "reasoning": "why based on data"
    }
  ]
}`
            },
            {
              role: 'user',
              content: `Playbook performance data (last 30 days):\n${JSON.stringify(allPerf, null, 2)}`
            },
          ],
          tier: 'balanced',
          temperature: 0.3,
        });

        // Log the optimization recommendations
        for (const rec of (recommendations.recommendations || []).slice(0, 3)) {
          await supabase.from('playbook_optimization_log').insert({
            user_id: userId,
            optimization_type: rec.type || 'timing_adjusted',
            rule_name: rec.rule_name,
            before_value: { description: rec.current },
            after_value: { suggestion: rec.suggested },
            reasoning: rec.reasoning,
            data_basis: { performance_data: allPerf },
            model_used: 'openrouter/balanced',
          });
          decisions.push(`[OPTIMIZE LLM] ${rec.rule_name}: ${rec.suggested} (${rec.reasoning})`);
          optimizations++;
        }
      } catch (llmErr: any) {
        decisions.push(`[OPTIMIZE] LLM analysis unavailable: ${llmErr.message}`);
      }
    }
  }

  return { decisions, optimizations };
}

// ---------------------------------------------------------------------------
// Lead Journey Intelligence Engine
// The brain that actively manages every lead through their lifecycle.
// ---------------------------------------------------------------------------

async function manageLeadJourneys(
  supabase: any,
  userId: string,
  settings: AutonomousSettings,
  maxDailyTouches: number
): Promise<{ processed: number; actions_queued: number; stage_changes: number; decisions: string[] }> {
  const result = { processed: 0, actions_queued: 0, stage_changes: 0, decisions: [] as string[] };

  // 1. Seed default playbook if user has none
  try {
    await supabase.rpc('seed_default_playbook', { p_user_id: userId });
  } catch { /* already seeded */ }

  // 2. Sync leads into lead_journey_state (create entries for leads without one)
  const { data: untracked } = await supabase
    .from('leads')
    .select('id, status, first_name, phone_number, last_contacted_at, created_at, do_not_call, next_callback_at')
    .eq('user_id', userId)
    .eq('do_not_call', false)
    .not('id', 'in', `(SELECT lead_id FROM lead_journey_state WHERE user_id = '${userId}')`)
    .limit(100);

  if (untracked && untracked.length > 0) {
    const newEntries = untracked.map((lead: any) => ({
      user_id: userId,
      lead_id: lead.id,
      journey_stage: lead.status === 'new' ? 'fresh' : 'attempting',
      first_contact_at: lead.last_contacted_at || null,
      explicit_callback_at: lead.next_callback_at || null,
    }));
    await supabase.from('lead_journey_state').upsert(newEntries, {
      onConflict: 'user_id,lead_id',
      ignoreDuplicates: true,
    });
    result.decisions.push(`[JOURNEY] Synced ${newEntries.length} new leads into journey tracking`);
  }

  // 3. Load all active journey leads (batch processing)
  const { data: journeyLeads } = await supabase
    .from('lead_journey_state')
    .select('*, leads!inner(id, first_name, phone_number, status, do_not_call, last_contacted_at, next_callback_at)')
    .eq('user_id', userId)
    .not('journey_stage', 'in', '("closed_won","closed_lost","dormant")')
    .order('next_action_at', { ascending: true, nullsFirst: false })
    .limit(150);

  if (!journeyLeads || journeyLeads.length === 0) return result;

  // 4. Count today's journey touches (respect daily cap)
  const today = new Date().toISOString().split('T')[0];
  const { count: touchesToday } = await supabase
    .from('journey_event_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', 'action_queued')
    .gte('created_at', `${today}T00:00:00`);

  if ((touchesToday || 0) >= maxDailyTouches) {
    result.decisions.push(`[JOURNEY] Daily touch cap reached (${touchesToday}/${maxDailyTouches})`);
    return result;
  }
  let touchesRemaining = maxDailyTouches - (touchesToday || 0);

  // 5. Load user's playbook rules (sorted by priority) and disposition values
  const { data: rules } = await supabase
    .from('followup_playbook')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (!rules || rules.length === 0) return result;

  // Load disposition value map for interest boosting
  const dispValues = await loadDispositionValues(supabase, userId);

  const now = new Date();
  const currentHour = now.getHours();

  // 6. Process each lead
  for (const journey of journeyLeads) {
    if (touchesRemaining <= 0) break;
    result.processed++;

    const lead = journey.leads;
    if (!lead || lead.do_not_call) continue;

    // --- 6a. Recompute interaction counts from real data ---
    const [callData, smsOutData, smsInData] = await Promise.all([
      supabase
        .from('call_logs')
        .select('outcome, duration, created_at, sentiment_score')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('sms_messages')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('direction', 'outbound')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('sms_messages')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('direction', 'inbound')
        .select('*', { count: 'exact', head: true }),
    ]);

    const calls = callData.data || [];
    const callAttempts = calls.length;
    const callsAnswered = calls.filter((c: any) =>
      ['completed', 'answered', 'appointment_set', 'interested', 'callback'].includes(c.outcome)
    ).length;
    const smsSent = smsOutData.count || 0;
    const smsReceived = smsInData.count || 0;
    const totalTouches = callAttempts + smsSent;

    // Last touch timestamp
    const lastCallAt = calls.length > 0 ? new Date(calls[0].created_at) : null;
    const lastTouchAt = lastCallAt || (journey.last_touch_at ? new Date(journey.last_touch_at) : null);

    // Compute time gaps
    const hoursSinceTouch = lastTouchAt
      ? (now.getTime() - lastTouchAt.getTime()) / (1000 * 60 * 60)
      : 9999;
    const daysSinceTouch = hoursSinceTouch / 24;
    const daysInStage = journey.stage_entered_at
      ? (now.getTime() - new Date(journey.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    // --- 6b. Detect interest signals from recent calls ---
    let interestLevel = journey.interest_level || 5;
    let sentimentTrend = journey.sentiment_trend || 'unknown';
    let lastSentiment = journey.last_sentiment_score;

    if (calls.length > 0) {
      // Check for positive outcomes
      const recentPositive = calls.slice(0, 5).filter((c: any) =>
        ['appointment_set', 'interested', 'callback', 'completed'].includes(c.outcome)
      ).length;
      const recentNegative = calls.slice(0, 5).filter((c: any) =>
        ['not_interested', 'dnc', 'wrong_number'].includes(c.outcome)
      ).length;

      // Long calls are a buying signal
      const avgDuration = calls.reduce((s: number, c: any) => s + (c.duration || 0), 0) / calls.length;
      const longCallBonus = avgDuration > 120 ? 2 : avgDuration > 60 ? 1 : 0;

      // SMS replies are a strong signal
      const smsReplyBonus = smsReceived > 0 ? 2 : 0;

      // Disposition value boost: "talk_to_human" is worth more than "contacted"
      const lastOutcome = calls[0]?.outcome;
      const dispValue = dispValues.get(lastOutcome);
      const dispBonus = dispValue ? Math.floor((dispValue.value_weight - 5) / 2) : 0;

      interestLevel = Math.min(10, Math.max(1,
        5 + (recentPositive * 2) - (recentNegative * 3) + longCallBonus + smsReplyBonus + dispBonus
      ));

      // Sentiment trend
      const sentiments = calls
        .filter((c: any) => c.sentiment_score != null)
        .slice(0, 3)
        .map((c: any) => c.sentiment_score);
      if (sentiments.length >= 2) {
        const avg = sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length;
        lastSentiment = sentiments[0];
        sentimentTrend = sentiments[0] > sentiments[sentiments.length - 1] + 0.1
          ? 'warming'
          : sentiments[0] < sentiments[sentiments.length - 1] - 0.1
            ? 'cooling'
            : 'stable';
      }
    }

    // Detect best hour to call (from answered calls)
    const answeredCalls = calls.filter((c: any) =>
      ['completed', 'answered', 'appointment_set', 'interested', 'callback'].includes(c.outcome)
    );
    let bestHour = journey.best_hour_to_call;
    if (answeredCalls.length > 0) {
      const hourCounts: Record<number, number> = {};
      answeredCalls.forEach((c: any) => {
        const h = new Date(c.created_at).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      });
      bestHour = Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]);
    }

    // Preferred channel (who do they respond to more?)
    let preferredChannel = journey.preferred_channel || 'unknown';
    if (callsAnswered > 0 && smsReceived > 0) {
      preferredChannel = callsAnswered > smsReceived ? 'call' : 'sms';
    } else if (callsAnswered > 0) {
      preferredChannel = 'call';
    } else if (smsReceived > 0) {
      preferredChannel = 'sms';
    }

    // --- 6c. Compute correct journey stage ---
    let newStage = journey.journey_stage;
    const leadStatus = lead.status;
    const lastDisposition = calls.length > 0 ? calls[0].outcome : null;

    // Check if disposition value maps to a specific stage
    const lastDispValue = lastDisposition ? dispValues.get(lastDisposition) : null;
    if (lastDispValue?.maps_to_stage && lastDispValue.requires_immediate_followup) {
      // High-value dispositions override stage computation
      newStage = lastDispValue.maps_to_stage;
    }

    // Explicit callback takes precedence over everything
    const explicitCallback = journey.explicit_callback_at || lead.next_callback_at;
    if (explicitCallback && new Date(explicitCallback) > now) {
      newStage = 'callback_set';
    }
    // Check for appointment/booking
    else if (leadStatus === 'appointment_set' || leadStatus === 'booked' ||
             calls.some((c: any) => c.outcome === 'appointment_set')) {
      newStage = 'booked';
    }
    // Closed states
    else if (leadStatus === 'converted' || leadStatus === 'won' || leadStatus === 'closed_won') {
      newStage = 'closed_won';
    }
    else if (leadStatus === 'dnc' || leadStatus === 'lost' || leadStatus === 'dead' ||
             leadStatus === 'not_interested' || leadStatus === 'closed_lost') {
      newStage = 'closed_lost';
    }
    // Hot: high interest + recent activity
    else if (interestLevel >= 8 && daysSinceTouch < 3) {
      newStage = 'hot';
    }
    // Dormant: 30+ days no activity
    else if (daysSinceTouch > 30 && totalTouches > 0) {
      newStage = 'dormant';
    }
    // Stalled: was engaged but 7+ days silence
    else if (callsAnswered > 0 && daysSinceTouch > 7 && interestLevel < 7) {
      newStage = 'stalled';
    }
    // Nurturing: talked but low interest
    else if (callsAnswered > 0 && interestLevel <= 4) {
      newStage = 'nurturing';
    }
    // Engaged: they answered or replied
    else if (callsAnswered > 0 || smsReceived > 0) {
      newStage = 'engaged';
    }
    // Attempting: we've tried but no answer yet
    else if (callAttempts > 0 || smsSent > 0) {
      newStage = 'attempting';
    }
    // Fresh: never contacted
    else {
      newStage = 'fresh';
    }

    // Log stage change
    const stageChanged = newStage !== journey.journey_stage;
    if (stageChanged) {
      result.stage_changes++;
      await supabase.from('journey_event_log').insert({
        user_id: userId,
        lead_id: lead.id,
        event_type: 'stage_change',
        from_stage: journey.journey_stage,
        to_stage: newStage,
        details: {
          reason: `Auto-computed from ${callAttempts} calls (${callsAnswered} answered), ${smsReceived} SMS replies, interest=${interestLevel}, days_silent=${Math.round(daysSinceTouch)}`,
        },
      });
    }

    // --- 6d. Update journey state (including cost tracking and disposition) ---
    const longestGap = Math.max(journey.longest_gap_days || 0, daysSinceTouch);
    // Estimate cost: ~7 cents per call attempt, ~1 cent per SMS
    const estCallCost = callAttempts * 7;
    const estSmsCost = smsSent * 1;
    // Estimate value based on disposition conversion probability
    const estValue = lastDispValue
      ? Math.round(lastDispValue.conversion_probability * 10000) // cents, assuming $100 deal value
      : Math.round((interestLevel / 10) * 5000);

    await supabase
      .from('lead_journey_state')
      .update({
        journey_stage: newStage,
        total_touches: totalTouches,
        call_attempts: callAttempts,
        calls_answered: callsAnswered,
        sms_sent: smsSent,
        sms_received: smsReceived,
        last_touch_at: lastTouchAt?.toISOString() || journey.last_touch_at,
        last_positive_signal_at: answeredCalls.length > 0 ? answeredCalls[0].created_at : journey.last_positive_signal_at,
        first_contact_at: calls.length > 0 ? calls[calls.length - 1].created_at : journey.first_contact_at,
        interest_level: interestLevel,
        sentiment_trend: sentimentTrend,
        last_sentiment_score: lastSentiment,
        best_hour_to_call: bestHour,
        preferred_channel: preferredChannel,
        days_in_current_stage: Math.floor(stageChanged ? 0 : daysInStage),
        stage_entered_at: stageChanged ? now.toISOString() : journey.stage_entered_at,
        times_stage_changed: stageChanged ? (journey.times_stage_changed || 0) + 1 : journey.times_stage_changed,
        longest_gap_days: longestGap,
        updated_at: now.toISOString(),
        explicit_callback_at: explicitCallback || journey.explicit_callback_at,
        // Cost and ROI tracking
        total_cost_cents: estCallCost + estSmsCost,
        call_cost_cents: estCallCost,
        sms_cost_cents: estSmsCost,
        estimated_value_cents: estValue,
        roi_score: (estCallCost + estSmsCost) > 0
          ? Math.round((estValue / (estCallCost + estSmsCost)) * 100) / 100
          : 0,
        last_disposition: lastDisposition,
      })
      .eq('id', journey.id);

    // --- 6e. Skip action planning for terminal stages ---
    if (['closed_won', 'closed_lost', 'dormant'].includes(newStage)) continue;

    // --- 6f. Check if next_action_at is in the future (already has a pending action) ---
    if (journey.next_action_at && new Date(journey.next_action_at) > now && !stageChanged) continue;

    // --- 6g. CALLBACK_SET: Honor explicit requests exactly ---
    if (newStage === 'callback_set' && explicitCallback) {
      const callbackTime = new Date(explicitCallback);
      const hoursUntilCallback = (callbackTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Send reminder 1 hour before
      if (hoursUntilCallback <= 1.5 && hoursUntilCallback > 0.5) {
        const name = lead.first_name || 'there';
        await queueJourneyAction(supabase, userId, lead, journey, settings, {
          action_type: 'send_followup_sms',
          params: {
            lead_id: lead.id,
            phone_number: lead.phone_number,
            message: `Hi ${name}, just a heads up I'll be calling you shortly as we discussed. Looking forward to chatting!`,
          },
          priority: 1,
          reasoning: `Callback reminder: ${name} requested a callback at ${callbackTime.toLocaleString()}. Sending 1hr advance notice.`,
          rule_name: 'callback_reminder_sms',
          next_action_at: callbackTime.toISOString(),
        });
        result.actions_queued++;
        touchesRemaining--;
        continue;
      }

      // Execute callback at the exact time
      if (hoursUntilCallback <= 0.1 && hoursUntilCallback > -0.5) {
        await queueJourneyAction(supabase, userId, lead, journey, settings, {
          action_type: 'journey_call',
          params: { lead_id: lead.id, phone_number: lead.phone_number },
          priority: 1,
          reasoning: `EXECUTING CALLBACK: ${lead.first_name || 'Lead'} specifically asked to be called now. Honoring their exact request.`,
          rule_name: 'callback_execute',
          next_action_at: null,
        });
        result.actions_queued++;
        touchesRemaining--;
        continue;
      }

      // Not time yet - set next check to 1.5hrs before callback
      const reminderTime = new Date(callbackTime.getTime() - 1.5 * 60 * 60 * 1000);
      await supabase.from('lead_journey_state').update({
        next_action_type: 'confirmation_sms',
        next_action_at: reminderTime.toISOString(),
        next_action_reason: `Waiting for callback at ${callbackTime.toLocaleString()}`,
      }).eq('id', journey.id);
      continue;
    }

    // --- 6h. Match against playbook rules ---
    const leadCampaignType = journey.campaign_type || 'cold_outreach';
    const stageRules = rules.filter((r: any) =>
      r.journey_stage === newStage &&
      totalTouches >= r.min_touches &&
      totalTouches <= r.max_touches &&
      daysInStage >= r.min_days_in_stage &&
      daysInStage <= r.max_days_in_stage &&
      interestLevel >= r.min_interest_level &&
      interestLevel <= r.max_interest_level &&
      // Don't fire rules that require no explicit callback when one exists
      (!r.requires_no_explicit_callback || !explicitCallback) &&
      // Campaign type filter: 'all' matches everything, or must match exactly
      (r.campaign_type === 'all' || !r.campaign_type || r.campaign_type === leadCampaignType)
    );

    if (stageRules.length === 0) continue;

    // Pick the highest-priority matching rule
    const bestRule = stageRules[0]; // Already sorted by priority

    // Check timing: has enough time passed since last touch?
    if (hoursSinceTouch < bestRule.delay_hours) {
      // Schedule the action for when it should fire
      const fireAt = new Date(
        (lastTouchAt ? lastTouchAt.getTime() : now.getTime()) + bestRule.delay_hours * 60 * 60 * 1000
      );
      // Respect calling windows: shift to preferred hour if rule says so
      if (bestRule.respect_calling_windows && (fireAt.getHours() < 9 || fireAt.getHours() >= 21)) {
        fireAt.setHours(bestRule.preferred_hour || 10, 0, 0, 0);
        if (fireAt < now) fireAt.setDate(fireAt.getDate() + 1);
      }
      await supabase.from('lead_journey_state').update({
        next_action_type: bestRule.action_type,
        next_action_at: fireAt.toISOString(),
        next_action_reason: `${bestRule.rule_name}: ${bestRule.description}`,
      }).eq('id', journey.id);
      continue;
    }

    // Respect calling windows for real-time actions
    if (bestRule.respect_calling_windows && (currentHour < 9 || currentHour >= 21)) continue;

    // --- 6i. Build and queue the action ---
    const config = bestRule.action_config || {};
    const name = lead.first_name || 'there';
    let actionType = bestRule.action_type;
    let actionParams: any = {};

    switch (actionType) {
      case 'call':
      case 'reengagement_call':
        actionType = 'journey_call';
        actionParams = { lead_id: lead.id, phone_number: lead.phone_number };
        break;

      case 'sms': {
        actionType = 'send_followup_sms';
        let message = config.template || `Hey ${name}, just following up. Do you have a few minutes to chat?`;
        message = message.replace(/\{\{first_name\}\}/g, name);
        actionParams = { lead_id: lead.id, phone_number: lead.phone_number, message };
        break;
      }

      case 'ai_sms':
      case 'nurture_sms': {
        actionType = 'journey_ai_sms';
        actionParams = {
          lead_id: lead.id,
          phone_number: lead.phone_number,
          prompt: config.prompt || `Write a friendly follow-up SMS for ${name}. Under 160 chars.`,
          lead_name: name,
        };
        break;
      }

      case 'move_stage': {
        const targetStage = config.target_stage;
        if (targetStage) {
          await supabase.from('lead_journey_state').update({
            journey_stage: targetStage,
            stage_entered_at: now.toISOString(),
            times_stage_changed: (journey.times_stage_changed || 0) + 1,
          }).eq('id', journey.id);
          await supabase.from('journey_event_log').insert({
            user_id: userId, lead_id: lead.id, event_type: 'rule_fired',
            from_stage: newStage, to_stage: targetStage, rule_name: bestRule.rule_name,
            details: { reason: bestRule.description },
          });
          result.stage_changes++;
        }
        continue;
      }

      case 'wait':
        // Just update next check time
        await supabase.from('lead_journey_state').update({
          next_action_type: 'wait',
          next_action_at: new Date(now.getTime() + (bestRule.delay_hours || 24) * 60 * 60 * 1000).toISOString(),
          next_action_reason: bestRule.description,
        }).eq('id', journey.id);
        continue;

      default:
        continue;
    }

    // Channel rotation: alternate between call and SMS if preferred channel is unknown
    if (preferredChannel === 'unknown' && journey.next_action_channel_rotation != null) {
      const rotation = journey.next_action_channel_rotation;
      // If last action was call (even rotation), suggest SMS next (and vice versa)
      if (rotation % 2 === 0 && actionType === 'journey_call') {
        // Don't override explicit rule actions, just track rotation
      }
    }

    await queueJourneyAction(supabase, userId, lead, journey, settings, {
      action_type: actionType,
      params: actionParams,
      priority: bestRule.priority,
      reasoning: `[${newStage.toUpperCase()}] ${bestRule.rule_name}: ${bestRule.description} (touches=${totalTouches}, interest=${interestLevel}, ${Math.round(hoursSinceTouch)}h since last)`,
      rule_name: bestRule.rule_name,
      next_action_at: null,
    });
    result.actions_queued++;
    touchesRemaining--;

    // Update channel rotation counter
    await supabase.from('lead_journey_state').update({
      next_action_channel_rotation: (journey.next_action_channel_rotation || 0) + 1,
    }).eq('id', journey.id);
  }

  if (result.stage_changes > 0) {
    result.decisions.push(`[JOURNEY] ${result.stage_changes} leads changed journey stages`);
  }
  if (result.actions_queued > 0) {
    result.decisions.push(`[JOURNEY] ${result.actions_queued} follow-up actions queued for ${result.processed} leads`);
  }

  return result;
}

// Helper: Queue a journey-driven action through the approval system
async function queueJourneyAction(
  supabase: any,
  userId: string,
  lead: any,
  journey: any,
  settings: AutonomousSettings,
  action: {
    action_type: string;
    params: any;
    priority: number;
    reasoning: string;
    rule_name: string;
    next_action_at: string | null;
  }
) {
  const autoApprove = settings.autonomy_level === 'full_auto';

  // Queue to ai_action_queue
  await supabase.from('ai_action_queue').insert({
    user_id: userId,
    action_type: action.action_type,
    action_params: action.params,
    priority: action.priority,
    status: autoApprove ? 'approved' : 'pending',
    requires_approval: settings.autonomy_level === 'approval_required',
    reasoning: action.reasoning,
    source: 'journey_engine',
    approved_at: autoApprove ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  // Log the event
  await supabase.from('journey_event_log').insert({
    user_id: userId,
    lead_id: lead.id,
    event_type: 'action_queued',
    from_stage: journey.journey_stage,
    rule_name: action.rule_name,
    details: {
      action_type: action.action_type,
      params: action.params,
      priority: action.priority,
    },
  });

  // Update journey state next_action tracking
  await supabase.from('lead_journey_state').update({
    next_action_type: action.action_type.replace('journey_', '').replace('send_followup_', ''),
    next_action_at: action.next_action_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    next_action_reason: action.reasoning,
    updated_at: new Date().toISOString(),
  }).eq('id', journey.id);
}

// ---------------------------------------------------------------------------
// Main Engine Loop - Runs per user
// ---------------------------------------------------------------------------

async function runForUser(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<EngineResult> {
  const result: EngineResult = {
    user_id: userId,
    actions_queued: 0,
    actions_executed: 0,
    actions_expired: 0,
    leads_rescored: 0,
    windows_recalculated: 0,
    pacing_adjusted: false,
    memories_saved: 0,
    journey_processed: 0,
    journey_actions: 0,
    journey_stage_changes: 0,
    decisions: [],
    errors: [],
  };

  try {
    // 1. Execute already-approved actions
    const { executed, errors: execErrors } = await executeApprovedActions(supabase, userId, 10);
    result.actions_executed = executed;
    result.errors.push(...execErrors);

    // 2. Expire old pending actions
    const { count: expired } = await supabase
      .from('ai_action_queue')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('*', { count: 'exact', head: true });
    result.actions_expired = expired || 0;

    // 3. Count today's autonomous actions (respect daily cap)
    const today = new Date().toISOString().split('T')[0];
    const { count: todayActions } = await supabase
      .from('ai_action_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['completed', 'executing'])
      .gte('created_at', `${today}T00:00:00`);

    if ((todayActions || 0) >= settings.max_daily_autonomous_actions) {
      result.decisions.push(`Daily cap reached (${todayActions}/${settings.max_daily_autonomous_actions}). No new actions.`);
      return result;
    }

    // 4. Re-score leads (server-side)
    if (settings.auto_prioritize_leads) {
      result.leads_rescored = await rescoreLeads(supabase, userId);
    }

    // 5. Recalculate optimal calling windows
    if (settings.auto_optimize_calling_times) {
      const { data: windowCount } = await supabase.rpc('recalculate_calling_windows', { p_user_id: userId });
      result.windows_recalculated = windowCount || 0;
    }

    // 6. Assess goals
    const goalProgress = await assessGoalProgress(supabase, userId, settings);

    // 7. Analyze pacing
    const pacingAnalysis = await analyzePacing(supabase, userId);

    // 8. Make decisions
    if (settings.autonomy_level !== 'suggestions_only') {
      const decisions = await makeDecisions(supabase, userId, settings, goalProgress, pacingAnalysis);

      for (const decision of decisions) {
        // Respect daily cap
        if ((todayActions || 0) + result.actions_queued >= settings.max_daily_autonomous_actions) {
          result.decisions.push('Daily cap would be exceeded. Stopping new actions.');
          break;
        }

        const requiresApproval = settings.autonomy_level === 'approval_required';

        // In full_auto mode, auto-approve safe actions
        const autoApprove = settings.autonomy_level === 'full_auto';

        await supabase.from('ai_action_queue').insert({
          user_id: userId,
          action_type: decision.action_type,
          action_params: decision.params,
          priority: decision.priority,
          status: autoApprove ? 'approved' : 'pending',
          requires_approval: requiresApproval,
          reasoning: decision.reasoning,
          source: 'autonomous_engine',
          approved_at: autoApprove ? new Date().toISOString() : null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        result.actions_queued++;
        result.decisions.push(
          `[${autoApprove ? 'AUTO' : 'PENDING'}] ${decision.action_type}: ${decision.reasoning}`
        );
      }

      // Check if pacing was adjusted
      result.pacing_adjusted = decisions.some(d => d.action_type === 'adjust_pacing');
    }

    // 9. Lead Journey Intelligence - the follow-up brain
    if ((settings as any).manage_lead_journeys) {
      try {
        const maxTouches = (settings as any).journey_max_daily_touches || 200;
        const journeyResult = await manageLeadJourneys(supabase, userId, settings, maxTouches);
        result.journey_processed = journeyResult.processed;
        result.journey_actions = journeyResult.actions_queued;
        result.journey_stage_changes = journeyResult.stage_changes;
        result.actions_queued += journeyResult.actions_queued;
        result.decisions.push(...journeyResult.decisions);
      } catch (journeyErr: any) {
        result.errors.push(`Journey engine: ${journeyErr.message}`);
      }
    }

    // 10. Phase 6: Calibrate lead scoring weights (weekly) — renumbered from 9
    try {
      const { data: weights } = await supabase
        .from('lead_scoring_weights')
        .select('last_calibrated')
        .eq('user_id', userId)
        .maybeSingle();

      const lastCalibrated = weights?.last_calibrated ? new Date(weights.last_calibrated) : null;
      const needsCalibration = !lastCalibrated || (Date.now() - lastCalibrated.getTime() > 7 * 24 * 60 * 60 * 1000);

      if (needsCalibration) {
        const { data: calibrationResult } = await supabase.rpc('calibrate_lead_scoring_weights', { p_user_id: userId });
        if (calibrationResult?.calibrated) {
          result.decisions.push(`[CALIBRATION] Lead scoring weights updated: ${JSON.stringify(calibrationResult.weights)} (${calibrationResult.sample_size} samples)`);
        }
      }
    } catch (calErr: any) {
      result.errors.push(`Weight calibration: ${calErr.message}`);
    }

    // 10. Phase 7: Rebalance A/B variant traffic weights
    try {
      const { data: activeVariants } = await supabase
        .from('agent_script_variants')
        .select('agent_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (activeVariants && activeVariants.length > 0) {
        // Get unique agent_ids with active variants
        const agentIds = [...new Set(activeVariants.map((v: any) => v.agent_id))];
        for (const agentId of agentIds) {
          const { data: rebalanceResult } = await supabase.rpc('rebalance_variant_weights', {
            p_user_id: userId,
            p_agent_id: agentId,
          });
          if (rebalanceResult?.rebalanced) {
            result.decisions.push(`[A/B TEST] Variant weights rebalanced for agent ${agentId}: ${rebalanceResult.total_calls} total calls`);
          }
        }
      }
    } catch (abErr: any) {
      result.errors.push(`A/B rebalancing: ${abErr.message}`);
    }

    // 11. Phase 8: Write pacing decisions to adaptive_pacing table
    if (result.pacing_adjusted && pacingAnalysis.new_pace) {
      try {
        // Find active broadcasts to apply adaptive pacing
        const { data: activeBroadcasts } = await supabase
          .from('voice_broadcasts')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active');

        for (const bc of (activeBroadcasts || [])) {
          await supabase.from('adaptive_pacing').upsert({
            user_id: userId,
            broadcast_id: bc.id,
            optimal_pace: pacingAnalysis.new_pace,
            last_adjusted: new Date().toISOString(),
            adjustment_reason: pacingAnalysis.recommendation,
          }, { onConflict: 'user_id,broadcast_id' });
        }

        // Log to pacing history
        await supabase.from('pacing_history').insert({
          user_id: userId,
          previous_pace: pacingAnalysis.current_pace || 50,
          new_pace: pacingAnalysis.new_pace,
          reason: pacingAnalysis.recommendation,
          error_rate: pacingAnalysis.error_rate,
          answer_rate: pacingAnalysis.answer_rate,
          trigger: 'autonomous',
        });
      } catch (paceErr: any) {
        result.errors.push(`Pacing write: ${paceErr.message}`);
      }
    }

    // 12. Funnel Intelligence — portfolio-level thinking
    if ((settings as any).manage_lead_journeys) {
      try {
        const funnelResult = await analyzeFunnel(supabase, userId, settings);
        result.decisions.push(...funnelResult.decisions);
      } catch (funnelErr: any) {
        result.errors.push(`Funnel analysis: ${funnelErr.message}`);
      }
    }

    // 13. Number Health Prediction — proactive rotation
    try {
      const healthResult = await predictNumberHealth(supabase, userId, settings);
      result.decisions.push(...healthResult.decisions);
      result.actions_queued += healthResult.numbers_rested;
    } catch (healthErr: any) {
      result.errors.push(`Number health: ${healthErr.message}`);
    }

    // 14. Transcript Intent Extraction — LLM-powered buying signals
    try {
      const intentResult = await extractTranscriptIntents(supabase, userId);
      result.decisions.push(...intentResult.decisions);
    } catch (intentErr: any) {
      result.errors.push(`Intent extraction: ${intentErr.message}`);
    }

    // 15. Self-Optimizing Playbook — rewrite rules from data
    if ((settings as any).manage_lead_journeys) {
      try {
        const optimizeResult = await optimizePlaybook(supabase, userId);
        result.decisions.push(...optimizeResult.decisions);
      } catch (optErr: any) {
        result.errors.push(`Playbook optimization: ${optErr.message}`);
      }
    }

    // 16. Save operational memory
    result.memories_saved = await saveRunMemory(supabase, userId, result);

    // 17. Update last_engine_run timestamp
    await supabase
      .from('autonomous_settings')
      .update({ last_engine_run: new Date().toISOString() })
      .eq('user_id', userId);

  } catch (err: any) {
    result.errors.push(`Fatal: ${err.message}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const startTime = Date.now();

    console.log('[AutonomousEngine] Starting run at', new Date().toISOString());

    // Get all users with autonomous mode enabled
    const { data: enabledSettings, error: settingsError } = await supabase
      .from('autonomous_settings')
      .select('*')
      .eq('enabled', true);

    if (settingsError) throw settingsError;

    if (!enabledSettings || enabledSettings.length === 0) {
      console.log('[AutonomousEngine] No users with autonomous mode enabled');
      return new Response(JSON.stringify({
        message: 'No autonomous users',
        duration_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[AutonomousEngine] Processing ${enabledSettings.length} user(s)`);

    const results: EngineResult[] = [];

    for (const settings of enabledSettings) {
      console.log(`[AutonomousEngine] Processing user ${settings.user_id} (level: ${settings.autonomy_level})`);

      const userResult = await runForUser(supabase, settings.user_id, settings as AutonomousSettings);
      results.push(userResult);

      console.log(`[AutonomousEngine] User ${settings.user_id}: ` +
        `queued=${userResult.actions_queued}, ` +
        `executed=${userResult.actions_executed}, ` +
        `scored=${userResult.leads_rescored}, ` +
        `journey=${userResult.journey_processed}/${userResult.journey_actions} actions/${userResult.journey_stage_changes} stage changes, ` +
        `decisions=${userResult.decisions.length}`
      );
    }

    const totalDuration = Date.now() - startTime;
    const summary = {
      message: 'Autonomous engine run completed',
      users_processed: results.length,
      total_actions_queued: results.reduce((s, r) => s + r.actions_queued, 0),
      total_actions_executed: results.reduce((s, r) => s + r.actions_executed, 0),
      total_leads_rescored: results.reduce((s, r) => s + r.leads_rescored, 0),
      total_decisions: results.reduce((s, r) => s + r.decisions.length, 0),
      duration_ms: totalDuration,
      results,
    };

    console.log(`[AutonomousEngine] Completed in ${totalDuration}ms`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[AutonomousEngine] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
