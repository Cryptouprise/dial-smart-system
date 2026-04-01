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
  manage_lead_journeys?: boolean;
  journey_max_daily_touches?: number;
  enable_daily_planning?: boolean;
  enable_strategic_insights?: boolean;
  auto_create_rules_from_insights?: boolean;
  insight_confidence_threshold?: number;
  briefing_frequency?: string;
  daily_budget_cents?: number;
  enable_script_ab_testing?: boolean;
  perpetual_followup_enabled?: boolean;
  perpetual_max_days?: number;
  perpetual_min_gap_days?: number;
  perpetual_max_gap_days?: number;
  perpetual_channels?: string[];
  perpetual_stop_on?: string[];
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
  battle_plan_generated: boolean;
  insights_discovered: number;
  rules_created: number;
  briefing_generated: boolean;
  strategies_analyzed: number;
  strategies_executed: number;
  perpetual_touches: number;
  sms_variants_optimized: number;
  messages_tracked: number;
  leads_scored: number;
  churn_risks_detected: number;
  model_trained: boolean;
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
    let finalScore = (
      engagementScore * weights.engagement +
      recencyScore * weights.recency +
      answerRate * weights.answer_rate +
      statusScore * weights.status
    );

    // INTENT ENRICHMENT: Multiply score by intent signals
    try {
      const { data: intent } = await supabase
        .from('lead_intent_signals')
        .select('intent_timeline, budget_mentioned, is_decision_maker, buying_signals, objections')
        .eq('lead_id', lead.id)
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (intent) {
        let intentMultiplier = 1.0;

        // Timeline urgency
        if (intent.intent_timeline === 'immediate' || intent.intent_timeline === 'this_week') {
          intentMultiplier *= 2.0;
        } else if (intent.intent_timeline === 'this_month') {
          intentMultiplier *= 1.5;
        } else if (intent.intent_timeline === 'exploring') {
          intentMultiplier *= 1.1;
        }

        // Budget signals
        if (intent.budget_mentioned) intentMultiplier *= 1.3;

        // Decision maker
        if (intent.is_decision_maker) intentMultiplier *= 1.2;

        // Buying signals count
        const buyingSignals = intent.buying_signals || [];
        if (buyingSignals.length >= 3) intentMultiplier *= 1.4;
        else if (buyingSignals.length >= 1) intentMultiplier *= 1.15;

        // Objection penalty (mild - objections mean engagement, not disinterest)
        const objections = intent.objections || [];
        if (objections.length >= 3) intentMultiplier *= 0.85;

        finalScore = Math.min(100, Math.round(finalScore * intentMultiplier));
      }
    } catch (e) {
      // Intent enrichment is non-blocking
    }

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
          const { lead_id, phone_number, message, variant_id } = action.action_params;
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

          // Track SMS variant stats if a variant was used
          if (variant_id) {
            try {
              await supabase.rpc('update_sms_variant_stats', { p_variant_id: variant_id });
              await supabase.from('sms_variant_assignments').insert({
                variant_id,
                lead_id,
                message_sent: message,
              });
            } catch { /* variant tracking non-critical */ }
          }
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
          const { lead_id, phone_number, prompt, lead_name, variant_id: aiVariantId } = action.action_params;
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

          // Track SMS variant stats if a variant was used
          if (aiVariantId) {
            try {
              await supabase.rpc('update_sms_variant_stats', { p_variant_id: aiVariantId });
              await supabase.from('sms_variant_assignments').insert({
                variant_id: aiVariantId,
                lead_id,
                message_sent: prompt,
              });
            } catch { /* variant tracking non-critical */ }
          }
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
): Promise<{ processed: number; actions_queued: number; stage_changes: number; perpetual_touches: number; decisions: string[] }> {
  const result = { processed: 0, actions_queued: 0, stage_changes: 0, perpetual_touches: 0, decisions: [] as string[] };

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

    // --- PERPETUAL FOLLOW-UP: If no playbook rule matched and perpetual is enabled ---
    let matchedRule = true; // track whether a playbook rule was found
    if (stageRules.length === 0) {
      matchedRule = false;

      // Check perpetual follow-up eligibility
      const perpetualEnabled = (settings as any).perpetual_followup_enabled;
      if (perpetualEnabled && newStage !== 'closed_won' && newStage !== 'closed_lost') {
        const stopDispositions: string[] = (settings as any).perpetual_stop_on || ['dnc', 'not_interested', 'unsubscribe'];
        const shouldStop = lastDisposition && stopDispositions.includes(lastDisposition);

        if (!shouldStop) {
          // Check if lead is in an active workflow — skip perpetual if so
          const { data: activeWorkflow } = await supabase
            .from('lead_workflow_progress')
            .select('id')
            .eq('lead_id', lead.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

          if (activeWorkflow) {
            // Lead is in active workflow, skip perpetual touch
            continue;
          }

          const minGap = (settings as any).perpetual_min_gap_days || 7;
          const maxGap = (settings as any).perpetual_max_gap_days || 30;
          const maxDays = (settings as any).perpetual_max_days || 365;
          const touchCount = journey.perpetual_touch_count || 0;

          // Adaptive gap: starts at minGap, grows toward maxGap as touches increase
          const adaptiveGap = Math.min(maxGap, minGap + (touchCount * 3));

          const daysInJourney = journey.first_contact_at
            ? (now.getTime() - new Date(journey.first_contact_at).getTime()) / (1000 * 60 * 60 * 24)
            : 0;

          if (daysSinceTouch >= adaptiveGap && (maxDays === 0 || daysInJourney <= maxDays)) {
            const channels: string[] = (settings as any).perpetual_channels || ['sms', 'call'];

            // Use lead's preferred channel if known, otherwise alternate
            const preferredChannel = (journey as any).preferred_channel;
            let channel: string;
            if (preferredChannel && channels.includes(preferredChannel)) {
              channel = preferredChannel;
            } else {
              const channelIndex = touchCount % channels.length;
              channel = channels[channelIndex];
            }

            // Respect calling hours for call touches
            const currentHour = now.getHours();
            if (channel === 'call' && (currentHour < 9 || currentHour >= 21)) {
              // Outside calling hours — schedule for next day at 10am instead
              const nextDay = new Date(now);
              nextDay.setDate(nextDay.getDate() + 1);
              nextDay.setHours(10, 0, 0, 0);
              await supabase.from('lead_journey_state').update({
                perpetual_next_touch_at: nextDay.toISOString(),
              }).eq('id', journey.id);
              continue;
            }

            const actionType = channel === 'call' ? 'journey_call' : 'journey_ai_sms';

            const perpetualParams = channel === 'call'
              ? { lead_id: lead.id, phone_number: lead.phone_number }
              : {
                  lead_id: lead.id,
                  phone_number: lead.phone_number,
                  prompt: `Write a brief, value-driven follow-up SMS for ${lead.first_name || 'there'}. This is touch #${touchCount + 1} over time. Be helpful and casual, not salesy. Under 160 chars.`,
                  lead_name: lead.first_name || 'there',
                };

            await queueJourneyAction(supabase, userId, lead, journey, settings, {
              action_type: actionType,
              params: perpetualParams,
              priority: 8, // Lower priority than explicit playbook rules
              reasoning: `[PERPETUAL] Touch #${touchCount + 1} via ${channel} (adaptive gap: ${adaptiveGap}d, actual gap: ${Math.round(daysSinceTouch)}d, stage: ${newStage})`,
              rule_name: 'perpetual_followup',
              next_action_at: null,
            });

            // Update perpetual tracking on journey state
            await supabase.from('lead_journey_state').update({
              perpetual_touch_count: touchCount + 1,
              perpetual_last_touch_at: now.toISOString(),
              perpetual_next_touch_at: new Date(now.getTime() + adaptiveGap * 24 * 60 * 60 * 1000).toISOString(),
              next_action_channel_rotation: (journey.next_action_channel_rotation || 0) + 1,
            }).eq('id', journey.id);

            result.actions_queued++;
            result.perpetual_touches++;
            touchesRemaining--;
          }
        }
      }
      // No playbook rule and no perpetual touch — skip this lead
      continue;
    }

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

        // SMS copy A/B testing: check for variants on this playbook rule
        let selectedVariantId: string | null = null;
        try {
          const { data: variant } = await supabase.rpc('select_sms_variant', {
            p_user_id: userId,
            p_context_type: 'playbook_rule',
            p_context_id: bestRule.id,
          });
          if (variant && variant.length > 0) {
            message = variant[0].message_template;
            selectedVariantId = variant[0].variant_id;
          }
        } catch { /* no variants configured, use default */ }

        message = message.replace(/\{\{first_name\}\}/g, name);
        message = message.replace(/\{\{days_since_touch\}\}/g, String(Math.round(daysSinceTouch)));
        actionParams = {
          lead_id: lead.id,
          phone_number: lead.phone_number,
          message,
          variant_id: selectedVariantId,
        };
        break;
      }

      case 'ai_sms':
      case 'nurture_sms': {
        actionType = 'journey_ai_sms';

        // SMS copy A/B testing: check for variants on this playbook rule
        let smsPrompt = config.prompt || `Write a friendly follow-up SMS for ${name}. Under 160 chars.`;
        let selectedVariantId: string | null = null;
        try {
          const { data: variant } = await supabase.rpc('select_sms_variant', {
            p_user_id: userId,
            p_context_type: 'playbook_rule',
            p_context_id: bestRule.id,
          });
          if (variant && variant.length > 0) {
            // If the variant has a template, use it directly as an SMS (not AI-generated)
            // This allows A/B testing fixed copy vs AI copy
            smsPrompt = variant[0].message_template;
            selectedVariantId = variant[0].variant_id;
          }
        } catch { /* no variants configured, use default */ }

        actionParams = {
          lead_id: lead.id,
          phone_number: lead.phone_number,
          prompt: smsPrompt,
          lead_name: name,
          variant_id: selectedVariantId,
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
  if (result.perpetual_touches > 0) {
    result.decisions.push(`[PERPETUAL] ${result.perpetual_touches} perpetual follow-up touches queued`);
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
// 9/10 FEATURE: Campaign Resource Allocator — Daily War Room
// Plans the entire day: "Given 12 numbers, $400 budget, 200 callbacks,
// 50 hot leads, 3000 untouched — here's how Tuesday should go."
// ---------------------------------------------------------------------------

async function planDay(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<{ generated: boolean; decisions: string[] }> {
  const decisions: string[] = [];
  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  // Only generate plan once per day, early in the morning (or first run of the day)
  const { data: existingPlan } = await supabase
    .from('daily_battle_plans')
    .select('id, plan_status')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .maybeSingle();

  if (existingPlan && existingPlan.plan_status !== 'draft') {
    // Plan already active/completed. Check adherence at end of day.
    if (currentHour >= 17 && existingPlan.plan_status === 'active') {
      await scorePlanAdherence(supabase, userId, existingPlan.id, today);
      decisions.push('[PLANNER] End-of-day: scored plan adherence');
    }
    return { generated: false, decisions };
  }

  // --- GATHER RESOURCE INVENTORY ---

  // Phone numbers
  const [activeNums, healthyNums] = await Promise.all([
    supabase.from('phone_numbers').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('status', 'active'),
    supabase.from('number_health_metrics').select('phone_number, health_score')
      .eq('user_id', userId).gte('health_score', 50),
  ]);
  const totalNumbers = activeNums.count || 0;
  const healthyNumbers = healthyNums.data?.length || 0;
  const restingNumbers = totalNumbers - healthyNumbers;

  // Lead inventory by journey stage
  const { data: stageData } = await supabase
    .from('lead_journey_state')
    .select('journey_stage')
    .eq('user_id', userId)
    .not('journey_stage', 'in', '("closed_won","closed_lost")');

  const stageCounts: Record<string, number> = {};
  (stageData || []).forEach((s: any) => {
    stageCounts[s.journey_stage] = (stageCounts[s.journey_stage] || 0) + 1;
  });

  const callbacks = stageCounts['callback_set'] || 0;
  const hotLeads = stageCounts['hot'] || 0;
  const engaged = stageCounts['engaged'] || 0;
  const stalled = stageCounts['stalled'] || 0;
  const fresh = stageCounts['fresh'] || 0;
  const nurturing = stageCounts['nurturing'] || 0;
  const attempting = stageCounts['attempting'] || 0;
  const dormant = stageCounts['dormant'] || 0;

  // Budget (from settings or default)
  const dailyBudget = (settings as any).daily_budget_cents || 50000;

  // Yesterday's performance (for context)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: yesterdaySnapshot } = await supabase
    .from('funnel_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('snapshot_date', yesterday)
    .maybeSingle();

  // Optimal calling windows
  const { data: callingWindows } = await supabase
    .from('optimal_calling_windows')
    .select('hour_of_day, day_of_week, score, total_calls')
    .eq('user_id', userId)
    .eq('day_of_week', new Date().getDay())
    .gt('total_calls', 5)
    .order('score', { ascending: false });

  // Recent playbook performance
  const { data: topRules } = await supabase
    .from('playbook_performance')
    .select('rule_name, response_rate, appointment_rate, performance_score')
    .eq('user_id', userId)
    .gt('times_fired', 10)
    .order('performance_score', { ascending: false })
    .limit(5);

  // --- GENERATE THE BATTLE PLAN VIA LLM ---

  let callLLMJson: any;
  try {
    const mod = await import('../_shared/openrouter.ts');
    callLLMJson = mod.callLLMJson;
  } catch {
    // No LLM available — generate a rule-based plan
    return generateRuleBasedPlan(supabase, userId, today, {
      totalNumbers, healthyNumbers, restingNumbers, dailyBudget,
      callbacks, hotLeads, engaged, stalled, fresh, nurturing, attempting, dormant,
    });
  }

  const startMs = Date.now();

  const { data: plan } = await callLLMJson({
    messages: [
      {
        role: 'system',
        content: `You are a campaign operations strategist for an AI voice dialer system. Your job is to create a daily battle plan that maximizes appointments while minimizing cost.

Rules:
- Callbacks are SACRED. They get exact-time execution and the healthiest phone numbers.
- Hot leads get prime-time slots (10am-12pm, 2pm-4pm) and healthy numbers.
- Engaged leads get mid-priority slots.
- Cold/fresh leads fill remaining capacity.
- Stalled leads get reactivation attempts during off-peak hours.
- Never exceed daily budget. Each call costs ~7 cents. Each SMS costs ~1 cent.
- Rest unhealthy numbers (health < 50). Never use numbers with health < 20.
- Adjust pace by time block: start slower, ramp up mid-morning, ease off evening.
- If yesterday's cost/appointment was high, shift budget toward warm leads.

Return JSON:
{
  "executive_summary": "One paragraph. What's the play today?",
  "priority_order": ["callbacks","hot","engaged","stalled","fresh"],
  "budget_allocation": {
    "callbacks_pct": 15,
    "hot_pct": 30,
    "engaged_pct": 25,
    "cold_pct": 20,
    "reactivation_pct": 10
  },
  "number_allocation": {
    "hot_leads": 5,
    "cold_leads": 4,
    "reactivation": 3
  },
  "time_blocks": [
    {"hour": 9, "focus": "callbacks + hot leads", "pace": 30, "channel": "call"},
    {"hour": 10, "focus": "hot leads + engaged", "pace": 50, "channel": "call"},
    {"hour": 11, "focus": "engaged + cold", "pace": 50, "channel": "call"},
    {"hour": 12, "focus": "SMS follow-ups for morning no-answers", "pace": 0, "channel": "sms"},
    {"hour": 13, "focus": "stalled reactivation", "pace": 30, "channel": "sms"},
    {"hour": 14, "focus": "hot leads round 2 + engaged", "pace": 45, "channel": "call"},
    {"hour": 15, "focus": "cold leads", "pace": 50, "channel": "call"},
    {"hour": 16, "focus": "follow-up calls on morning conversations", "pace": 30, "channel": "call"},
    {"hour": 17, "focus": "wind down - SMS nurture", "pace": 0, "channel": "sms"}
  ],
  "risk_factors": ["string"],
  "expected_outcomes": {
    "appointments": 5,
    "conversations": 40,
    "total_calls": 800,
    "total_sms": 50,
    "estimated_cost_cents": 6000
  },
  "key_tactics": ["tactic1", "tactic2"]
}`
      },
      {
        role: 'user',
        content: `Plan today (${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}).

RESOURCES:
- Phone numbers: ${totalNumbers} total, ${healthyNumbers} healthy, ${restingNumbers} resting
- Daily budget: $${(dailyBudget / 100).toFixed(2)}

LEAD INVENTORY:
- Callbacks pending: ${callbacks}
- Hot leads: ${hotLeads}
- Engaged: ${engaged}
- Stalled: ${stalled}
- Fresh/untouched: ${fresh}
- Nurturing: ${nurturing}
- Attempting (tried, no answer): ${attempting}
- Dormant (30+ days silent): ${dormant}

${yesterdaySnapshot ? `YESTERDAY'S RESULTS:
- Calls: ${yesterdaySnapshot.calls_made}
- Appointments: ${yesterdaySnapshot.appointments_booked}
- Cost per appointment: $${((yesterdaySnapshot.cost_per_appointment_cents || 0) / 100).toFixed(2)}
- Conversion rate: ${((yesterdaySnapshot.overall_conversion_rate || 0) * 100).toFixed(1)}%
- Hot leads: ${yesterdaySnapshot.hot_count}, Stalled: ${yesterdaySnapshot.stalled_count}` : 'No data from yesterday.'}

${callingWindows?.length ? `BEST TIME SLOTS TODAY (from historical data):
${callingWindows.slice(0, 5).map((w: any) => `- ${w.hour_of_day}:00 — score ${w.score.toFixed(2)} (${w.total_calls} calls)`).join('\n')}` : 'No historical calling data yet.'}

${topRules?.length ? `TOP PERFORMING PLAYBOOK RULES:
${topRules.map((r: any) => `- "${r.rule_name}": ${(r.response_rate * 100).toFixed(1)}% response, ${(r.appointment_rate * 100).toFixed(1)}% appointment`).join('\n')}` : ''}

Generate the battle plan.`
      },
    ],
    tier: 'premium',
    temperature: 0.4,
    max_tokens: 3000,
  });

  const genTimeMs = Date.now() - startMs;

  // Save the plan
  const budgetAlloc = plan.budget_allocation || {};
  const numAlloc = plan.number_allocation || {};
  const paceByHour: Record<number, number> = {};
  (plan.time_blocks || []).forEach((b: any) => { paceByHour[b.hour] = b.pace || 0; });

  await supabase.from('daily_battle_plans').upsert({
    user_id: userId,
    plan_date: today,
    total_phone_numbers: totalNumbers,
    healthy_numbers: healthyNumbers,
    resting_numbers: restingNumbers,
    estimated_budget_cents: dailyBudget,
    callbacks_pending: callbacks,
    hot_leads: hotLeads,
    engaged_leads: engaged,
    stalled_leads: stalled,
    fresh_leads: fresh,
    nurturing_leads: nurturing,
    budget_for_callbacks_pct: budgetAlloc.callbacks_pct || 15,
    budget_for_hot_pct: budgetAlloc.hot_pct || 30,
    budget_for_engaged_pct: budgetAlloc.engaged_pct || 25,
    budget_for_cold_pct: budgetAlloc.cold_pct || 20,
    budget_for_reactivation_pct: budgetAlloc.reactivation_pct || 10,
    numbers_for_hot_leads: numAlloc.hot_leads || Math.ceil(healthyNumbers * 0.4),
    numbers_for_cold_leads: numAlloc.cold_leads || Math.ceil(healthyNumbers * 0.35),
    numbers_for_reactivation: numAlloc.reactivation || Math.ceil(healthyNumbers * 0.25),
    morning_pace: paceByHour[10] || paceByHour[9] || 30,
    midday_pace: paceByHour[12] || paceByHour[11] || 50,
    afternoon_pace: paceByHour[14] || paceByHour[15] || 40,
    evening_pace: paceByHour[17] || paceByHour[16] || 20,
    executive_summary: plan.executive_summary,
    priority_order: plan.priority_order || ['callbacks', 'hot', 'engaged', 'stalled', 'fresh'],
    time_blocks: plan.time_blocks || [],
    risk_factors: plan.risk_factors || [],
    expected_outcomes: plan.expected_outcomes || {},
    plan_status: 'active',
    model_used: 'openrouter/premium',
    generation_time_ms: genTimeMs,
  }, { onConflict: 'user_id,plan_date' });

  decisions.push(`[PLANNER] Daily battle plan generated in ${genTimeMs}ms. Priority: ${(plan.priority_order || []).join(' → ')}. Expected: ${plan.expected_outcomes?.appointments || '?'} appointments, ~$${((plan.expected_outcomes?.estimated_cost_cents || 0) / 100).toFixed(2)} spend.`);

  if (plan.risk_factors?.length > 0) {
    decisions.push(`[PLANNER] Risk factors: ${plan.risk_factors.join('; ')}`);
  }

  return { generated: true, decisions };
}

// Rule-based fallback when LLM is unavailable
async function generateRuleBasedPlan(
  supabase: any,
  userId: string,
  today: string,
  inventory: {
    totalNumbers: number; healthyNumbers: number; restingNumbers: number;
    dailyBudget: number; callbacks: number; hotLeads: number;
    engaged: number; stalled: number; fresh: number; nurturing: number;
    attempting: number; dormant: number;
  }
): Promise<{ generated: boolean; decisions: string[] }> {
  const decisions: string[] = [];
  const totalActive = inventory.callbacks + inventory.hotLeads + inventory.engaged +
    inventory.stalled + inventory.fresh + inventory.nurturing + inventory.attempting;

  // Simple allocation: callbacks first, then hot, then by volume
  const callbackPct = totalActive > 0 ? Math.min(20, Math.round((inventory.callbacks / totalActive) * 100) + 10) : 15;
  const hotPct = totalActive > 0 ? Math.min(35, Math.round((inventory.hotLeads / totalActive) * 100) + 15) : 25;
  const engagedPct = Math.min(25, 100 - callbackPct - hotPct - 20);
  const coldPct = Math.max(10, 100 - callbackPct - hotPct - engagedPct - 10);
  const reactivationPct = Math.max(5, 100 - callbackPct - hotPct - engagedPct - coldPct);

  await supabase.from('daily_battle_plans').upsert({
    user_id: userId,
    plan_date: today,
    total_phone_numbers: inventory.totalNumbers,
    healthy_numbers: inventory.healthyNumbers,
    resting_numbers: inventory.restingNumbers,
    estimated_budget_cents: inventory.dailyBudget,
    callbacks_pending: inventory.callbacks,
    hot_leads: inventory.hotLeads,
    engaged_leads: inventory.engaged,
    stalled_leads: inventory.stalled,
    fresh_leads: inventory.fresh,
    nurturing_leads: inventory.nurturing,
    budget_for_callbacks_pct: callbackPct,
    budget_for_hot_pct: hotPct,
    budget_for_engaged_pct: engagedPct,
    budget_for_cold_pct: coldPct,
    budget_for_reactivation_pct: reactivationPct,
    numbers_for_hot_leads: Math.ceil(inventory.healthyNumbers * 0.4),
    numbers_for_cold_leads: Math.ceil(inventory.healthyNumbers * 0.35),
    numbers_for_reactivation: Math.ceil(inventory.healthyNumbers * 0.25),
    morning_pace: 30,
    midday_pace: 50,
    afternoon_pace: 40,
    evening_pace: 20,
    executive_summary: `Rule-based plan: ${inventory.callbacks} callbacks, ${inventory.hotLeads} hot leads prioritized. ${inventory.healthyNumbers}/${inventory.totalNumbers} numbers healthy.`,
    priority_order: ['callbacks', 'hot', 'engaged', 'stalled', 'fresh'],
    time_blocks: [],
    risk_factors: inventory.restingNumbers > inventory.healthyNumbers ? ['More numbers resting than active'] : [],
    expected_outcomes: {},
    plan_status: 'active',
    model_used: 'rule_based',
    generation_time_ms: 0,
  }, { onConflict: 'user_id,plan_date' });

  decisions.push(`[PLANNER] Rule-based plan generated (LLM unavailable). Callbacks: ${callbackPct}%, Hot: ${hotPct}%, Engaged: ${engagedPct}%, Cold: ${coldPct}%`);
  return { generated: true, decisions };
}

// Score how well the day followed the plan
async function scorePlanAdherence(
  supabase: any,
  userId: string,
  planId: string,
  today: string
): Promise<void> {
  const { data: plan } = await supabase
    .from('daily_battle_plans')
    .select('expected_outcomes')
    .eq('id', planId)
    .single();

  if (!plan?.expected_outcomes) return;

  const expected = plan.expected_outcomes;

  // Get actual outcomes
  const [callsRes, apptsRes, smsRes] = await Promise.all([
    supabase.from('call_logs').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('call_logs').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('outcome', 'appointment_set').gte('created_at', `${today}T00:00:00`),
    supabase.from('sms_messages').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('direction', 'outbound').gte('created_at', `${today}T00:00:00`),
  ]);

  const actual = {
    total_calls: callsRes.count || 0,
    appointments: apptsRes.count || 0,
    total_sms: smsRes.count || 0,
    estimated_cost_cents: (callsRes.count || 0) * 7 + (smsRes.count || 0) * 1,
  };

  // Score: average of how close each metric got to expected
  const metrics = ['appointments', 'total_calls', 'total_sms'];
  let totalScore = 0;
  let scoreCount = 0;
  for (const m of metrics) {
    const exp = expected[m] || 0;
    const act = (actual as any)[m] || 0;
    if (exp > 0) {
      totalScore += Math.min(100, (act / exp) * 100);
      scoreCount++;
    }
  }
  const adherence = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 50;

  await supabase.from('daily_battle_plans').update({
    plan_status: 'completed',
    adherence_score: adherence,
    actual_outcomes: actual,
    completed_at: new Date().toISOString(),
  }).eq('id', planId);
}

// ---------------------------------------------------------------------------
// Statistical Significance Testing Utilities
// ---------------------------------------------------------------------------

/**
 * Chi-square test for 2x2 contingency table.
 * Returns approximate p-value.
 * a = group1 success, b = group1 failure, c = group2 success, d = group2 failure
 */
function chiSquare2x2(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  if (n === 0) return 1.0;

  // Yates' continuity correction
  const chi2 = (n * Math.pow(Math.abs(a * d - b * c) - n / 2, 2)) /
    ((a + b) * (c + d) * (a + c) * (b + d));

  if (chi2 < 0.001) return 1.0;
  if (chi2 > 10) return 0.001;

  // Approximate p-value: p ≈ exp(-0.5 * chi2) for 1 df
  return Math.max(0.001, Math.min(1.0, Math.exp(-0.5 * chi2)));
}

/**
 * Calculate confidence from p-value and sample size.
 * Returns 0-1 confidence score with proper statistical basis.
 */
function statisticalConfidence(pValue: number, sampleSize: number, minSamples: number = 30): number {
  if (sampleSize < minSamples) return 0; // Not enough data

  // Confidence = 1 - p_value, but penalize small samples
  const samplePenalty = Math.min(1.0, sampleSize / (minSamples * 3));
  return Math.round((1 - pValue) * samplePenalty * 100) / 100;
}

/**
 * Wilson score interval for proportion confidence.
 * Better than simple p/n for small samples.
 */
function wilsonScore(successes: number, total: number, z: number = 1.96): { lower: number; upper: number; center: number } {
  if (total === 0) return { lower: 0, upper: 0, center: 0 };

  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    center
  };
}

// ---------------------------------------------------------------------------
// 10/10 FEATURE: Strategic Pattern Detective
// Discovers patterns humans would never see in the data.
// "Leads from source X who get SMS within 2 min book at 4x rate"
// "Thursday afternoon converts 3x Monday morning"
// "3rd attempt after 48h gap converts better than after 24h"
// ---------------------------------------------------------------------------

async function detectStrategicPatterns(
  supabase: any,
  userId: string,
  settings: AutonomousSettings
): Promise<{ insights_discovered: number; rules_created: number; decisions: string[] }> {
  const decisions: string[] = [];
  let insightsDiscovered = 0;
  let rulesCreated = 0;

  // Only run once per day (expensive LLM + DB queries)
  const todayStr = new Date().toISOString().split('T')[0];
  const { count: insightsToday } = await supabase.from('strategic_insights')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', `${todayStr}T00:00:00`);

  if ((insightsToday || 0) > 0) return { insights_discovered: 0, rules_created: 0, decisions };

  // Need enough data for statistical significance
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: totalCalls } = await supabase.from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo);

  if ((totalCalls || 0) < 100) {
    decisions.push('[PATTERNS] Need 100+ calls in last 30 days for pattern detection. Current: ' + (totalCalls || 0));
    return { insights_discovered: 0, rules_created: 0, decisions };
  }

  // --- PATTERN 1: Day-of-week × Hour-of-day conversion patterns ---
  const timingInsight = await detectTimingPatterns(supabase, userId, thirtyDaysAgo);
  if (timingInsight) {
    await saveInsight(supabase, userId, timingInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${timingInsight.title}`);
  }

  // --- PATTERN 2: Attempt gap timing patterns ---
  const gapInsight = await detectAttemptGapPatterns(supabase, userId, thirtyDaysAgo);
  if (gapInsight) {
    await saveInsight(supabase, userId, gapInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${gapInsight.title}`);
  }

  // --- PATTERN 3: Channel sequence patterns ---
  const sequenceInsight = await detectSequencePatterns(supabase, userId, thirtyDaysAgo);
  if (sequenceInsight) {
    await saveInsight(supabase, userId, sequenceInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${sequenceInsight.title}`);
  }

  // --- PATTERN 4: Lead source × outcome correlation ---
  const sourceInsight = await detectSourcePatterns(supabase, userId, thirtyDaysAgo);
  if (sourceInsight) {
    await saveInsight(supabase, userId, sourceInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${sourceInsight.title}`);
  }

  // --- PATTERN 5: Value decay — how fast leads lose value ---
  const decayInsight = await detectDecayPatterns(supabase, userId, thirtyDaysAgo);
  if (decayInsight) {
    await saveInsight(supabase, userId, decayInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${decayInsight.title}`);
  }

  // --- PATTERN 6: Number effectiveness patterns ---
  const numberInsight = await detectNumberPatterns(supabase, userId, thirtyDaysAgo);
  if (numberInsight) {
    await saveInsight(supabase, userId, numberInsight);
    insightsDiscovered++;
    decisions.push(`[PATTERNS] ${numberInsight.title}`);
  }

  // --- LLM STRATEGIC ANALYSIS (premium tier) ---
  // Feed all raw pattern data to the premium LLM for cross-dimensional insight
  if (insightsDiscovered >= 2) {
    const crossInsight = await runCrossDimensionalAnalysis(supabase, userId, thirtyDaysAgo);
    if (crossInsight) {
      for (const ins of crossInsight.insights) {
        await saveInsight(supabase, userId, ins);
        insightsDiscovered++;
        decisions.push(`[PATTERNS/LLM] ${ins.title}`);
      }
    }
  }

  // --- AUTO-CREATE RULES from high-confidence insights ---
  if ((settings as any).auto_create_rules_from_insights) {
    const confidenceThreshold = (settings as any).insight_confidence_threshold || 0.75;
    const { data: actionableInsights } = await supabase.from('strategic_insights')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', confidenceThreshold)
      .eq('auto_rule_created', false)
      .eq('status', 'new')
      .gte('sample_size', 30)
      .limit(3);

    for (const insight of (actionableInsights || [])) {
      const created = await createRuleFromInsight(supabase, userId, insight);
      if (created) {
        rulesCreated++;
        decisions.push(`[PATTERNS] Auto-created rule from insight: "${insight.title}"`);
      }
      // Auto-apply insight to existing playbook rules
      if (settings.auto_create_rules_from_insights) {
        const applyResult = await applyInsightToPlaybook(supabase, userId, insight);
        if (applyResult.applied) {
          console.log(`[Insights] Auto-applied: ${applyResult.change_type} - ${applyResult.details}`);
        }
      }
    }
  }

  // --- GENERATE BRIEFING ---
  if (insightsDiscovered > 0) {
    await generateBriefing(supabase, userId, 'daily', todayStr);
    decisions.push(`[BRIEFING] Daily strategic briefing generated with ${insightsDiscovered} new insights`);
  }

  return { insights_discovered: insightsDiscovered, rules_created: rulesCreated, decisions };
}

// --- Pattern Detection Sub-Functions ---

interface InsightCandidate {
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  sample_size: number;
  effect_magnitude: number;
  baseline_rate: number;
  observed_rate: number;
  dimensions: Record<string, any>;
  recommended_action: string;
  data_basis: Record<string, any>;
}

async function detectTimingPatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // Get conversion rates by day-of-week × hour
  const { data: calls } = await supabase
    .from('call_logs')
    .select('outcome, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(5000);

  if (!calls || calls.length < 100) return null;

  const slots: Record<string, { total: number; positive: number; appointments: number }> = {};

  for (const call of calls) {
    const dt = new Date(call.created_at);
    const key = `${dt.getDay()}_${dt.getHours()}`;
    if (!slots[key]) slots[key] = { total: 0, positive: 0, appointments: 0 };
    slots[key].total++;
    if (['completed', 'answered', 'appointment_set', 'interested', 'callback'].includes(call.outcome)) {
      slots[key].positive++;
    }
    if (call.outcome === 'appointment_set') slots[key].appointments++;
  }

  // Find the best and worst slots (minimum 10 calls per slot)
  const slotEntries = Object.entries(slots)
    .filter(([, v]) => v.total >= 10)
    .map(([key, v]) => ({
      key,
      day: Number(key.split('_')[0]),
      hour: Number(key.split('_')[1]),
      rate: v.positive / v.total,
      apptRate: v.appointments / v.total,
      total: v.total,
    }));

  if (slotEntries.length < 4) return null;

  slotEntries.sort((a, b) => b.rate - a.rate);
  const best = slotEntries[0];
  const worst = slotEntries[slotEntries.length - 1];

  const overallRate = calls.filter((c: any) =>
    ['completed', 'answered', 'appointment_set', 'interested', 'callback'].includes(c.outcome)
  ).length / calls.length;

  // Only report if the difference is meaningful (> 2x)
  if (worst.rate === 0 || best.rate / worst.rate < 2) return null;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const magnitude = best.rate / Math.max(0.001, worst.rate);

  return {
    insight_type: 'timing_pattern',
    title: `${dayNames[best.day]} at ${best.hour}:00 converts ${magnitude.toFixed(1)}x better than ${dayNames[worst.day]} at ${worst.hour}:00`,
    description: `Best slot: ${dayNames[best.day]} ${best.hour}:00 (${(best.rate * 100).toFixed(1)}% connect rate, ${best.total} calls). Worst slot: ${dayNames[worst.day]} ${worst.hour}:00 (${(worst.rate * 100).toFixed(1)}%, ${worst.total} calls). Baseline: ${(overallRate * 100).toFixed(1)}%.`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        Math.round(best.rate * best.total), best.total - Math.round(best.rate * best.total),
        Math.round(worst.rate * worst.total), worst.total - Math.round(worst.rate * worst.total)
      ),
      best.total + worst.total
    ),
    sample_size: calls.length,
    effect_magnitude: magnitude,
    baseline_rate: overallRate,
    observed_rate: best.rate,
    dimensions: { best_day: dayNames[best.day], best_hour: best.hour, worst_day: dayNames[worst.day], worst_hour: worst.hour },
    recommended_action: `Shift volume toward ${dayNames[best.day]} ${best.hour}:00 and reduce ${dayNames[worst.day]} ${worst.hour}:00. Expected lift: ${((magnitude - 1) * 100).toFixed(0)}%.`,
    data_basis: { top_3_slots: slotEntries.slice(0, 3), bottom_3_slots: slotEntries.slice(-3), total_analyzed: calls.length },
  };
}

async function detectAttemptGapPatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // Find leads with multiple call attempts and see which gap timing converts best
  const { data: leads } = await supabase
    .from('lead_journey_state')
    .select('lead_id, call_attempts, calls_answered')
    .eq('user_id', userId)
    .gt('call_attempts', 1)
    .limit(500);

  if (!leads || leads.length < 30) return null;

  const gapBuckets: Record<string, { total: number; converted: number }> = {
    '<2h': { total: 0, converted: 0 },
    '2-6h': { total: 0, converted: 0 },
    '6-24h': { total: 0, converted: 0 },
    '24-48h': { total: 0, converted: 0 },
    '48-72h': { total: 0, converted: 0 },
    '>72h': { total: 0, converted: 0 },
  };

  for (const lead of leads.slice(0, 200)) {
    const { data: callHistory } = await supabase
      .from('call_logs')
      .select('outcome, created_at')
      .eq('lead_id', lead.lead_id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (!callHistory || callHistory.length < 2) continue;

    // Look at gaps between consecutive attempts
    for (let i = 1; i < callHistory.length; i++) {
      const gap = (new Date(callHistory[i].created_at).getTime() - new Date(callHistory[i - 1].created_at).getTime()) / (1000 * 60 * 60);
      const converted = ['completed', 'answered', 'appointment_set', 'interested', 'callback'].includes(callHistory[i].outcome);
      const bucket = gap < 2 ? '<2h' : gap < 6 ? '2-6h' : gap < 24 ? '6-24h' : gap < 48 ? '24-48h' : gap < 72 ? '48-72h' : '>72h';
      gapBuckets[bucket].total++;
      if (converted) gapBuckets[bucket].converted++;
    }
  }

  const bucketEntries = Object.entries(gapBuckets)
    .filter(([, v]) => v.total >= 10)
    .map(([gap, v]) => ({ gap, rate: v.converted / v.total, total: v.total }));

  if (bucketEntries.length < 3) return null;

  bucketEntries.sort((a, b) => b.rate - a.rate);
  const best = bucketEntries[0];
  const worst = bucketEntries[bucketEntries.length - 1];

  if (worst.rate === 0 || best.rate / worst.rate < 1.5) return null;

  const overallRate = bucketEntries.reduce((s, b) => s + b.rate * b.total, 0) /
    bucketEntries.reduce((s, b) => s + b.total, 0);

  return {
    insight_type: 'attempt_gap_pattern',
    title: `${best.gap} gap between attempts converts ${(best.rate / Math.max(0.001, worst.rate)).toFixed(1)}x better than ${worst.gap}`,
    description: `Best retry gap: ${best.gap} (${(best.rate * 100).toFixed(1)}% convert, n=${best.total}). Worst: ${worst.gap} (${(worst.rate * 100).toFixed(1)}%, n=${worst.total}). Baseline: ${(overallRate * 100).toFixed(1)}%.`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        Math.round(best.rate * best.total), best.total - Math.round(best.rate * best.total),
        Math.round(worst.rate * worst.total), worst.total - Math.round(worst.rate * worst.total)
      ),
      best.total + worst.total
    ),
    sample_size: bucketEntries.reduce((s, b) => s + b.total, 0),
    effect_magnitude: best.rate / Math.max(0.001, worst.rate),
    baseline_rate: overallRate,
    observed_rate: best.rate,
    dimensions: { best_gap: best.gap, worst_gap: worst.gap },
    recommended_action: `Set retry delay to match ${best.gap} window. Current playbook rules should use ~${best.gap === '<2h' ? '1' : best.gap === '2-6h' ? '4' : best.gap === '6-24h' ? '12' : best.gap === '24-48h' ? '36' : '60'} hour delays.`,
    data_basis: { gap_analysis: bucketEntries },
  };
}

async function detectSequencePatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // Analyze: does SMS-before-call vs call-only affect outcomes?
  const { data: leadsWithSms } = await supabase
    .from('lead_journey_state')
    .select('lead_id, sms_sent, sms_received, call_attempts, calls_answered')
    .eq('user_id', userId)
    .gt('call_attempts', 0)
    .limit(500);

  if (!leadsWithSms || leadsWithSms.length < 50) return null;

  const withSms = leadsWithSms.filter((l: any) => l.sms_sent > 0);
  const withoutSms = leadsWithSms.filter((l: any) => l.sms_sent === 0);

  if (withSms.length < 20 || withoutSms.length < 20) return null;

  const smsAnswerRate = withSms.reduce((s: number, l: any) => s + (l.calls_answered > 0 ? 1 : 0), 0) / withSms.length;
  const noSmsAnswerRate = withoutSms.reduce((s: number, l: any) => s + (l.calls_answered > 0 ? 1 : 0), 0) / withoutSms.length;

  if (noSmsAnswerRate === 0 || smsAnswerRate / noSmsAnswerRate < 1.3) return null;

  const magnitude = smsAnswerRate / Math.max(0.001, noSmsAnswerRate);

  return {
    insight_type: 'sequence_pattern',
    title: `Leads who received SMS before calls answer ${magnitude.toFixed(1)}x more often`,
    description: `Leads with SMS touchpoints: ${(smsAnswerRate * 100).toFixed(1)}% answer rate (n=${withSms.length}). Call-only leads: ${(noSmsAnswerRate * 100).toFixed(1)}% (n=${withoutSms.length}).`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        Math.round(smsAnswerRate * withSms.length), withSms.length - Math.round(smsAnswerRate * withSms.length),
        Math.round(noSmsAnswerRate * withoutSms.length), withoutSms.length - Math.round(noSmsAnswerRate * withoutSms.length)
      ),
      withSms.length + withoutSms.length
    ),
    sample_size: leadsWithSms.length,
    effect_magnitude: magnitude,
    baseline_rate: noSmsAnswerRate,
    observed_rate: smsAnswerRate,
    dimensions: { with_sms: withSms.length, without_sms: withoutSms.length },
    recommended_action: `Enable SMS-before-call sequence for all leads. Send a brief text 2-5 minutes before calling. Expected lift: +${((magnitude - 1) * 100).toFixed(0)}% answer rate.`,
    data_basis: { sms_answer_rate: smsAnswerRate, no_sms_answer_rate: noSmsAnswerRate },
  };
}

async function detectSourcePatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // Which lead sources produce the best conversion?
  const { data: leadsBySource } = await supabase
    .from('leads')
    .select('id, source')
    .eq('user_id', userId)
    .not('source', 'is', null)
    .limit(2000);

  if (!leadsBySource || leadsBySource.length < 50) return null;

  const sourceGroups: Record<string, string[]> = {};
  for (const lead of leadsBySource) {
    const src = (lead.source || 'unknown').toLowerCase().trim();
    if (!sourceGroups[src]) sourceGroups[src] = [];
    sourceGroups[src].push(lead.id);
  }

  const sourceStats: Array<{ source: string; total: number; appointmentRate: number; answerRate: number }> = [];

  for (const [source, leadIds] of Object.entries(sourceGroups)) {
    if (leadIds.length < 10) continue;

    const { count: totalCalls } = await supabase.from('call_logs')
      .select('*', { count: 'exact', head: true })
      .in('lead_id', leadIds.slice(0, 100))
      .eq('user_id', userId);

    const { count: answered } = await supabase.from('call_logs')
      .select('*', { count: 'exact', head: true })
      .in('lead_id', leadIds.slice(0, 100))
      .eq('user_id', userId)
      .in('outcome', ['completed', 'answered', 'appointment_set', 'interested', 'callback']);

    const { count: appointments } = await supabase.from('call_logs')
      .select('*', { count: 'exact', head: true })
      .in('lead_id', leadIds.slice(0, 100))
      .eq('user_id', userId)
      .eq('outcome', 'appointment_set');

    if ((totalCalls || 0) < 10) continue;

    sourceStats.push({
      source,
      total: leadIds.length,
      appointmentRate: (appointments || 0) / (totalCalls || 1),
      answerRate: (answered || 0) / (totalCalls || 1),
    });
  }

  if (sourceStats.length < 2) return null;

  sourceStats.sort((a, b) => b.appointmentRate - a.appointmentRate);
  const best = sourceStats[0];
  const worst = sourceStats[sourceStats.length - 1];

  const overallApptRate = sourceStats.reduce((s, ss) => s + ss.appointmentRate * ss.total, 0) /
    sourceStats.reduce((s, ss) => s + ss.total, 0);

  if (worst.appointmentRate === 0 && best.appointmentRate === 0) return null;
  const magnitude = best.appointmentRate / Math.max(0.001, worst.appointmentRate || overallApptRate);
  if (magnitude < 1.5) return null;

  return {
    insight_type: 'source_channel_correlation',
    title: `"${best.source}" leads convert ${magnitude.toFixed(1)}x better than "${worst.source}"`,
    description: `Best source: "${best.source}" (${(best.appointmentRate * 100).toFixed(1)}% appointment rate, ${best.total} leads). Worst: "${worst.source}" (${(worst.appointmentRate * 100).toFixed(1)}%, ${worst.total} leads).`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        Math.round(best.appointmentRate * best.total), best.total - Math.round(best.appointmentRate * best.total),
        Math.round(worst.appointmentRate * worst.total), worst.total - Math.round(worst.appointmentRate * worst.total)
      ),
      best.total + worst.total
    ),
    sample_size: sourceStats.reduce((s, ss) => s + ss.total, 0),
    effect_magnitude: magnitude,
    baseline_rate: overallApptRate,
    observed_rate: best.appointmentRate,
    dimensions: { best_source: best.source, worst_source: worst.source, all_sources: sourceStats.map(s => s.source) },
    recommended_action: `Prioritize "${best.source}" leads. Consider reducing spend on "${worst.source}" or testing different approach for that source.`,
    data_basis: { source_stats: sourceStats },
  };
}

async function detectDecayPatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // How fast does lead value decay with no contact?
  const { data: journeyLeads } = await supabase
    .from('lead_journey_state')
    .select('lead_id, interest_level, total_touches, last_touch_at, journey_stage, calls_answered')
    .eq('user_id', userId)
    .gt('total_touches', 0)
    .limit(500);

  if (!journeyLeads || journeyLeads.length < 50) return null;

  // Group by days since last touch
  const decayBuckets: Record<string, { count: number; avgInterest: number; positiveOutcomes: number }> = {
    'same_day': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
    '1-2d': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
    '3-7d': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
    '8-14d': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
    '15-30d': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
    '>30d': { count: 0, avgInterest: 0, positiveOutcomes: 0 },
  };

  const now = Date.now();
  for (const lead of journeyLeads) {
    if (!lead.last_touch_at) continue;
    const daysSince = (now - new Date(lead.last_touch_at).getTime()) / (1000 * 60 * 60 * 24);
    const bucket = daysSince < 1 ? 'same_day' : daysSince < 3 ? '1-2d' : daysSince < 8 ? '3-7d' :
      daysSince < 15 ? '8-14d' : daysSince < 31 ? '15-30d' : '>30d';
    decayBuckets[bucket].count++;
    decayBuckets[bucket].avgInterest += lead.interest_level || 5;
    if (['hot', 'engaged', 'booked', 'callback_set'].includes(lead.journey_stage)) {
      decayBuckets[bucket].positiveOutcomes++;
    }
  }

  // Calculate averages
  for (const bucket of Object.values(decayBuckets)) {
    if (bucket.count > 0) bucket.avgInterest /= bucket.count;
  }

  const entries = Object.entries(decayBuckets).filter(([, v]) => v.count >= 5);
  if (entries.length < 3) return null;

  const freshRate = decayBuckets['same_day'].count > 0
    ? decayBuckets['same_day'].positiveOutcomes / decayBuckets['same_day'].count : 0;
  const staleRate = decayBuckets['>30d'].count > 0
    ? decayBuckets['>30d'].positiveOutcomes / decayBuckets['>30d'].count : 0;

  if (freshRate <= staleRate) return null;

  // Find the "half-life" — when does positive outcome rate drop below 50% of fresh rate?
  let halfLifeBucket = '>30d';
  for (const [bucket, data] of entries) {
    const rate = data.count > 0 ? data.positiveOutcomes / data.count : 0;
    if (rate < freshRate * 0.5) {
      halfLifeBucket = bucket;
      break;
    }
  }

  return {
    insight_type: 'decay_pattern',
    title: `Lead value drops 50% after ${halfLifeBucket} of no contact`,
    description: `Same-day follow-up: ${(freshRate * 100).toFixed(1)}% positive outcome rate. After ${halfLifeBucket}: rate drops below half. Leads contacted 30+ days later: ${(staleRate * 100).toFixed(1)}%.`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        decayBuckets['same_day'].positiveOutcomes, decayBuckets['same_day'].count - decayBuckets['same_day'].positiveOutcomes,
        decayBuckets['>30d'].positiveOutcomes, decayBuckets['>30d'].count - decayBuckets['>30d'].positiveOutcomes
      ),
      decayBuckets['same_day'].count + decayBuckets['>30d'].count
    ),
    sample_size: journeyLeads.length,
    effect_magnitude: freshRate / Math.max(0.001, staleRate),
    baseline_rate: staleRate,
    observed_rate: freshRate,
    dimensions: { half_life: halfLifeBucket, decay_curve: entries.map(([k, v]) => ({ bucket: k, rate: v.count > 0 ? v.positiveOutcomes / v.count : 0 })) },
    recommended_action: `Never let a lead go more than ${halfLifeBucket} without contact. Set maximum gap alerts in journey engine.`,
    data_basis: { decay_buckets: entries.map(([k, v]) => ({ bucket: k, ...v })) },
  };
}

async function detectNumberPatterns(
  supabase: any, userId: string, since: string
): Promise<InsightCandidate | null> {
  // Which phone numbers/area codes get the best answer rates?
  const { data: numberStats } = await supabase
    .from('number_health_metrics')
    .select('phone_number, answer_rate_7d, answer_rate_30d, calls_last_7d, health_score')
    .eq('user_id', userId)
    .gt('calls_last_7d', 20);

  if (!numberStats || numberStats.length < 3) return null;

  // Group by area code
  const areaCodeStats: Record<string, { numbers: number; totalCalls: number; avgAnswerRate: number; avgHealth: number }> = {};

  for (const num of numberStats) {
    const areaCode = num.phone_number?.replace(/[^0-9]/g, '').slice(1, 4) || 'unknown';
    if (!areaCodeStats[areaCode]) areaCodeStats[areaCode] = { numbers: 0, totalCalls: 0, avgAnswerRate: 0, avgHealth: 0 };
    areaCodeStats[areaCode].numbers++;
    areaCodeStats[areaCode].totalCalls += num.calls_last_7d;
    areaCodeStats[areaCode].avgAnswerRate += num.answer_rate_7d || 0;
    areaCodeStats[areaCode].avgHealth += num.health_score || 50;
  }

  for (const ac of Object.values(areaCodeStats)) {
    if (ac.numbers > 0) {
      ac.avgAnswerRate /= ac.numbers;
      ac.avgHealth /= ac.numbers;
    }
  }

  const acEntries = Object.entries(areaCodeStats).filter(([, v]) => v.numbers >= 2);
  if (acEntries.length < 2) return null;

  acEntries.sort((a, b) => b[1].avgAnswerRate - a[1].avgAnswerRate);
  const bestAc = acEntries[0];
  const worstAc = acEntries[acEntries.length - 1];

  if (worstAc[1].avgAnswerRate === 0 || bestAc[1].avgAnswerRate / worstAc[1].avgAnswerRate < 1.5) return null;

  return {
    insight_type: 'number_effectiveness',
    title: `Area code ${bestAc[0]} gets ${(bestAc[1].avgAnswerRate / Math.max(0.001, worstAc[1].avgAnswerRate)).toFixed(1)}x higher answer rate than ${worstAc[0]}`,
    description: `Area code ${bestAc[0]}: ${(bestAc[1].avgAnswerRate * 100).toFixed(1)}% answer rate (${bestAc[1].numbers} numbers). Area code ${worstAc[0]}: ${(worstAc[1].avgAnswerRate * 100).toFixed(1)}% (${worstAc[1].numbers} numbers).`,
    confidence: statisticalConfidence(
      chiSquare2x2(
        Math.round(bestAc[1].avgAnswerRate * bestAc[1].totalCalls), bestAc[1].totalCalls - Math.round(bestAc[1].avgAnswerRate * bestAc[1].totalCalls),
        Math.round(worstAc[1].avgAnswerRate * worstAc[1].totalCalls), worstAc[1].totalCalls - Math.round(worstAc[1].avgAnswerRate * worstAc[1].totalCalls)
      ),
      bestAc[1].totalCalls + worstAc[1].totalCalls
    ),
    sample_size: numberStats.length,
    effect_magnitude: bestAc[1].avgAnswerRate / Math.max(0.001, worstAc[1].avgAnswerRate),
    baseline_rate: worstAc[1].avgAnswerRate,
    observed_rate: bestAc[1].avgAnswerRate,
    dimensions: { best_area_code: bestAc[0], worst_area_code: worstAc[0] },
    recommended_action: `When buying new numbers, prefer area code ${bestAc[0]}. Assign ${bestAc[0]} numbers to high-value leads.`,
    data_basis: { area_code_stats: Object.fromEntries(acEntries) },
  };
}

async function runCrossDimensionalAnalysis(
  supabase: any, userId: string, since: string
): Promise<{ insights: InsightCandidate[] } | null> {
  let callLLMJson: any;
  try {
    const mod = await import('../_shared/openrouter.ts');
    callLLMJson = mod.callLLMJson;
  } catch {
    return null;
  }

  // Gather summary data for LLM analysis
  const [funnelTrend, recentInsights, topPerformers] = await Promise.all([
    supabase.from('funnel_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('snapshot_date', { ascending: false })
      .limit(14),
    supabase.from('strategic_insights')
      .select('insight_type, title, confidence, effect_magnitude')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('playbook_performance')
      .select('rule_name, response_rate, appointment_rate, times_fired')
      .eq('user_id', userId)
      .gt('times_fired', 10)
      .order('performance_score', { ascending: false })
      .limit(10),
  ]);

  const { data: analysis } = await callLLMJson({
    messages: [
      {
        role: 'system',
        content: `You are a world-class campaign strategist analyzing voice AI dialer data. Your job is to find non-obvious cross-dimensional patterns that humans would miss.

Look for:
1. Correlations between seemingly unrelated metrics
2. Counter-intuitive findings ("calling LESS on Mondays actually increases weekly conversion")
3. Compounding effects ("this rule + this timing + this source = 5x conversion")
4. Resource optimization opportunities ("you could get same results with 40% less spend")
5. Emerging trends in the funnel data (things getting better or worse over time)

Return JSON:
{
  "insights": [
    {
      "insight_type": "cross_campaign",
      "title": "Short, punchy headline",
      "description": "Detailed explanation with numbers",
      "confidence": 0.7,
      "effect_magnitude": 2.5,
      "recommended_action": "Specific, actionable recommendation",
      "dimensions": {}
    }
  ]
}`
      },
      {
        role: 'user',
        content: `Analyze this campaign data for hidden patterns:

FUNNEL TREND (last ${funnelTrend.data?.length || 0} days):
${JSON.stringify(funnelTrend.data?.slice(0, 7) || [], null, 1)}

RECENTLY DISCOVERED PATTERNS:
${JSON.stringify(recentInsights.data || [], null, 1)}

TOP PERFORMING RULES:
${JSON.stringify(topPerformers.data || [], null, 1)}

Find 1-3 cross-dimensional insights that aren't obvious from any single metric.`
      },
    ],
    tier: 'premium',
    temperature: 0.5,
    max_tokens: 2000,
  });

  if (!analysis?.insights?.length) return null;

  return {
    insights: analysis.insights.slice(0, 3).map((ins: any) => ({
      insight_type: ins.insight_type || 'cross_campaign',
      title: ins.title || 'Cross-dimensional pattern detected',
      description: ins.description || '',
      confidence: Math.min(0.85, ins.confidence || 0.6), // LLM insights get slight confidence cap
      sample_size: funnelTrend.data?.length || 0,
      effect_magnitude: ins.effect_magnitude || 1.5,
      baseline_rate: 0,
      observed_rate: 0,
      dimensions: ins.dimensions || {},
      recommended_action: ins.recommended_action || '',
      data_basis: { source: 'cross_dimensional_llm', model: 'premium' },
    })),
  };
}

async function saveInsight(
  supabase: any, userId: string, insight: InsightCandidate
): Promise<string> {
  const { data } = await supabase.from('strategic_insights').insert({
    user_id: userId,
    insight_type: insight.insight_type,
    title: insight.title,
    description: insight.description,
    confidence: insight.confidence,
    sample_size: insight.sample_size,
    effect_magnitude: insight.effect_magnitude,
    baseline_rate: insight.baseline_rate,
    observed_rate: insight.observed_rate,
    dimensions: insight.dimensions,
    recommended_action: insight.recommended_action,
    data_basis: insight.data_basis,
    model_used: insight.data_basis?.source === 'cross_dimensional_llm' ? 'openrouter/premium' : 'statistical',
    status: 'new',
  }).select('id').single();

  return data?.id;
}

async function createRuleFromInsight(
  supabase: any, userId: string, insight: any
): Promise<boolean> {
  // Only create rules from certain insight types
  if (insight.insight_type === 'timing_pattern' && insight.dimensions?.best_hour != null) {
    // Create a timing-preference rule
    const ruleConfig = {
      type: 'preferred_calling_hour',
      hour: insight.dimensions.best_hour,
      day: insight.dimensions.best_day,
      boost_priority: Math.round(insight.effect_magnitude * 5),
    };

    await supabase.from('insight_generated_rules').insert({
      user_id: userId,
      insight_id: insight.id,
      rule_type: 'timing_override',
      rule_config: ruleConfig,
      status: 'proposed',
    });

    await supabase.from('strategic_insights').update({
      auto_rule_created: true,
      status: 'applied',
    }).eq('id', insight.id);

    return true;
  }

  if (insight.insight_type === 'attempt_gap_pattern' && insight.dimensions?.best_gap) {
    // Map gap string to hours
    const gapMap: Record<string, number> = {
      '<2h': 1, '2-6h': 4, '6-24h': 12, '24-48h': 36, '48-72h': 60, '>72h': 96,
    };
    const delayHours = gapMap[insight.dimensions.best_gap] || 24;

    const ruleConfig = {
      type: 'retry_delay_optimization',
      optimal_delay_hours: delayHours,
      insight_gap: insight.dimensions.best_gap,
    };

    await supabase.from('insight_generated_rules').insert({
      user_id: userId,
      insight_id: insight.id,
      rule_type: 'playbook_rule',
      rule_config: ruleConfig,
      status: 'proposed',
    });

    await supabase.from('strategic_insights').update({
      auto_rule_created: true,
      status: 'applied',
    }).eq('id', insight.id);

    return true;
  }

  if (insight.insight_type === 'sequence_pattern') {
    const ruleConfig = {
      type: 'sms_before_call',
      enabled: true,
      sms_delay_minutes: 3,
      expected_lift: insight.effect_magnitude,
    };

    await supabase.from('insight_generated_rules').insert({
      user_id: userId,
      insight_id: insight.id,
      rule_type: 'channel_preference',
      rule_config: ruleConfig,
      status: 'proposed',
    });

    await supabase.from('strategic_insights').update({
      auto_rule_created: true,
      status: 'applied',
    }).eq('id', insight.id);

    return true;
  }

  return false;
}

function parseGapToHours(gap: string): number | null {
  if (!gap) return null;
  const g = gap.toLowerCase().trim();
  if (g.includes('0-2h') || g.includes('<2h')) return 1;
  if (g.includes('1-2h')) return 1.5;
  if (g.includes('2-4h')) return 3;
  if (g.includes('4-8h')) return 6;
  if (g.includes('8-24h') || g.includes('same day')) return 16;
  if (g.includes('24-48h') || g.includes('next day')) return 36;
  if (g.includes('48-72h')) return 60;
  if (g.includes('72-168h') || g.includes('1 week') || g.includes('7 day')) return 120;
  // Fallback: extract first number
  const match = g.match(/(\d+)/);
  if (match) return parseInt(match[1]);
  console.warn(`[Insight] Could not parse gap "${gap}" to hours`);
  return null;
}

async function applyInsightToPlaybook(
  supabase: any, userId: string, insight: any
): Promise<{ applied: boolean; change_type: string; details: string }> {
  try {
    const insightType = insight.insight_type;

    if (insightType === 'attempt_gap_pattern' && insight.dimensions?.best_gap) {
      // Update retry rules' delay_hours to match the best gap
      const bestGapHours = parseGapToHours(insight.dimensions.best_gap);
      if (!bestGapHours) return { applied: false, change_type: 'none', details: 'Could not parse gap' };

      const { data: retryRules } = await supabase
        .from('followup_playbook')
        .select('id, rule_name, delay_hours')
        .eq('user_id', userId)
        .in('journey_stage', ['attempting', 'engaged'])
        .eq('action_type', 'call')
        .eq('enabled', true);

      for (const rule of (retryRules || [])) {
        if (Math.abs(rule.delay_hours - bestGapHours) > 2) {
          // Log the change
          await supabase.from('playbook_optimization_log').insert({
            user_id: userId,
            optimization_type: 'timing_adjusted',
            rule_name: rule.rule_name,
            before_value: { delay_hours: rule.delay_hours },
            after_value: { delay_hours: bestGapHours },
            reasoning: insight.recommended_action,
            data_basis: { sample_size: insight.sample_size, confidence: insight.confidence },
          });

          await supabase.from('followup_playbook')
            .update({ delay_hours: bestGapHours })
            .eq('id', rule.id);
        }
      }
      return { applied: true, change_type: 'timing_adjusted', details: `Updated retry delay to ${bestGapHours}h` };
    }

    if (insightType === 'timing_pattern' && insight.dimensions?.best_day && insight.dimensions?.best_hour) {
      // Update preferred_hour on matching rules
      const { data: rules } = await supabase
        .from('followup_playbook')
        .select('id, rule_name, preferred_hour')
        .eq('user_id', userId)
        .eq('respect_calling_windows', true)
        .eq('enabled', true);

      const bestHour = insight.dimensions.best_hour;
      for (const rule of (rules || [])) {
        if (rule.preferred_hour !== bestHour) {
          await supabase.from('playbook_optimization_log').insert({
            user_id: userId,
            optimization_type: 'timing_adjusted',
            rule_name: rule.rule_name,
            before_value: { preferred_hour: rule.preferred_hour },
            after_value: { preferred_hour: bestHour },
            reasoning: `Pattern: hour ${bestHour} converts ${insight.effect_magnitude}x better`,
            data_basis: { sample_size: insight.sample_size, confidence: insight.confidence },
          });

          await supabase.from('followup_playbook')
            .update({ preferred_hour: bestHour })
            .eq('id', rule.id);
        }
      }
      return { applied: true, change_type: 'timing_adjusted', details: `Set preferred hour to ${bestHour}` };
    }

    if (insightType === 'sequence_pattern' && insight.dimensions?.best_sequence) {
      // If SMS-before-call works better, create/enable that rule
      if (insight.dimensions.best_sequence === 'sms_then_call') {
        const { data: existing } = await supabase
          .from('followup_playbook')
          .select('id')
          .eq('user_id', userId)
          .eq('rule_name', 'sms_before_call_insight')
          .maybeSingle();

        if (!existing) {
          await supabase.from('followup_playbook').insert({
            user_id: userId,
            rule_name: 'sms_before_call_insight',
            description: 'AI insight: SMS before call increases answer rate',
            journey_stage: 'attempting',
            action_type: 'sms',
            action_config: { content: 'Hey {{first_name}}, going to try giving you a call shortly about {{lead_source}}. Talk soon!' },
            delay_hours: 0,
            priority: 8,
            enabled: true,
          });
          return { applied: true, change_type: 'rule_created', details: 'Created SMS-before-call rule' };
        }
      }
    }

    return { applied: false, change_type: 'none', details: 'No applicable action for this insight type' };
  } catch (e: any) {
    console.error('[Insight Apply] Error:', e.message);
    return { applied: false, change_type: 'error', details: e.message };
  }
}

async function generateBriefing(
  supabase: any, userId: string, type: 'daily' | 'weekly', dateStr: string
): Promise<void> {
  // Get recent insights
  const lookback = type === 'daily' ? 1 : 7;
  const sinceDate = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000).toISOString();

  const [insightsRes, funnelRes, perfRes] = await Promise.all([
    supabase.from('strategic_insights')
      .select('id, insight_type, title, confidence, effect_magnitude, recommended_action')
      .eq('user_id', userId).gte('created_at', sinceDate)
      .order('confidence', { ascending: false }).limit(10),
    supabase.from('funnel_snapshots')
      .select('*').eq('user_id', userId)
      .order('snapshot_date', { ascending: false }).limit(lookback + 1),
    supabase.from('playbook_performance')
      .select('rule_name, performance_score, response_rate, appointment_rate')
      .eq('user_id', userId).gt('times_fired', 5)
      .order('performance_score', { ascending: false }).limit(5),
  ]);

  const insights = insightsRes.data || [];
  const funnelDays = funnelRes.data || [];

  // Compute period comparison
  const current = funnelDays[0];
  const previous = funnelDays.length > 1 ? funnelDays[funnelDays.length - 1] : null;

  const wins: string[] = [];
  const concerns: string[] = [];
  const recommendations: string[] = [];

  if (current && previous) {
    if ((current.appointments_booked || 0) > (previous.appointments_booked || 0)) {
      wins.push(`Appointments up: ${current.appointments_booked} vs ${previous.appointments_booked}`);
    }
    if ((current.overall_conversion_rate || 0) > (previous.overall_conversion_rate || 0)) {
      wins.push(`Conversion rate improved to ${((current.overall_conversion_rate || 0) * 100).toFixed(1)}%`);
    }
    if ((current.cost_per_appointment_cents || 0) > (previous.cost_per_appointment_cents || 0) * 1.15) {
      concerns.push(`Cost per appointment up ${((current.cost_per_appointment_cents || 0) / 100).toFixed(2)} vs $${((previous.cost_per_appointment_cents || 0) / 100).toFixed(2)}`);
    }
    if ((current.stalled_count || 0) > (previous.stalled_count || 0) * 1.2) {
      concerns.push(`Stalled leads increasing: ${current.stalled_count} (was ${previous.stalled_count})`);
    }
  }

  for (const ins of insights.slice(0, 3)) {
    recommendations.push(ins.recommended_action || ins.title);
  }

  const topInsight = insights.length > 0 ? insights[0] : null;

  const headline = wins.length > concerns.length
    ? 'Momentum building — key metrics trending up'
    : concerns.length > 0
      ? 'Attention needed — some metrics slipping'
      : 'Steady performance — looking for optimization opportunities';

  const summary = `${type === 'daily' ? 'Today' : 'This week'}: ${current?.calls_made || 0} calls, ${current?.appointments_booked || 0} appointments, ${insights.length} new patterns discovered. ${wins.length > 0 ? wins[0] + '.' : ''} ${concerns.length > 0 ? concerns[0] + '.' : ''}`;

  await supabase.from('strategic_briefings').upsert({
    user_id: userId,
    briefing_type: type,
    briefing_date: dateStr,
    headline,
    executive_summary: summary,
    metrics_comparison: current && previous ? {
      calls: { current: current.calls_made, previous: previous.calls_made },
      appointments: { current: current.appointments_booked, previous: previous.appointments_booked },
      conversion_rate: { current: current.overall_conversion_rate, previous: previous.overall_conversion_rate },
      cost_per_appointment: { current: current.cost_per_appointment_cents, previous: previous.cost_per_appointment_cents },
    } : {},
    wins,
    concerns,
    recommendations,
    new_insights_count: insights.length,
    top_insight_id: topInsight?.id,
    action_items: recommendations.map((r: string, i: number) => ({
      action: r,
      priority: i === 0 ? 'high' : 'medium',
    })),
    model_used: 'statistical',
    period_start: type === 'daily' ? dateStr : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    period_end: dateStr,
  }, { onConflict: 'user_id,briefing_type,briefing_date' });
}

// ---------------------------------------------------------------------------
// SMS Copy A/B Testing Optimizer
// Analyzes underperforming SMS variants and generates AI-improved alternatives
// ---------------------------------------------------------------------------

async function optimizeSmsCopy(
  supabase: any,
  userId: string
): Promise<{ decisions: string[]; variants_created: number }> {
  const decisions: string[] = [];
  let variantsCreated = 0;

  try {
    // 1. Find variants with 50+ sends that are underperforming (reply_rate < 5%)
    const { data: underperformers } = await supabase
      .from('sms_copy_variants')
      .select('id, context_type, context_id, variant_label, message_template, times_sent, reply_rate, positive_rate, appointment_rate, is_control')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('times_sent', 50)
      .lt('reply_rate', 0.05);

    if (!underperformers || underperformers.length === 0) {
      return { decisions, variants_created: 0 };
    }

    for (const variant of underperformers) {
      // 2. Check how many variants already exist for this context (cap at 4)
      const { count: existingCount } = await supabase
        .from('sms_copy_variants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('context_type', variant.context_type)
        .eq('context_id', variant.context_id)
        .eq('is_active', true);

      if ((existingCount || 0) >= 4) {
        decisions.push(`[SMS A/B] Variant "${variant.variant_label}" underperforming (${(variant.reply_rate * 100).toFixed(1)}% reply rate) but already at 4-variant cap for context ${variant.context_id}`);
        continue;
      }

      // 3. Generate an AI-improved version via LLM
      let newMessage: string | null = null;
      let aiReasoning = '';
      try {
        const mod = await import('../_shared/openrouter.ts');
        const callLLMJson = mod.callLLMJson;

        const { data: improvement } = await callLLMJson<{ improved_message?: string; reasoning?: string }>({
          messages: [
            { role: 'system', content: 'You are an SMS copywriting expert. You optimize SMS messages for higher reply rates. Keep messages under 160 characters. Be conversational, not salesy.' },
            { role: 'user', content: `This SMS template has a ${(variant.reply_rate * 100).toFixed(1)}% reply rate after ${variant.times_sent} sends. Improve it to get more replies.

Current message: "${variant.message_template}"

Stats: ${variant.times_sent} sent, ${(variant.reply_rate * 100).toFixed(1)}% reply rate, ${(variant.positive_rate * 100).toFixed(1)}% positive rate, ${(variant.appointment_rate * 100).toFixed(1)}% appointment rate.

Return JSON: { "improved_message": "your improved SMS text under 160 chars", "reasoning": "why this should perform better" }` },
          ],
          tier: 'fast',
          temperature: 0.8,
        });

        if (improvement?.improved_message) {
          newMessage = improvement.improved_message;
          aiReasoning = improvement.reasoning || 'AI-generated improvement of underperforming copy';
        }
      } catch {
        // LLM unavailable — generate a simple variation by restructuring
        // Swap to a question-based format which typically gets higher reply rates
        const original = variant.message_template;
        if (!original.includes('?')) {
          newMessage = original.replace(/\.\s*$/, '? What do you think?').slice(0, 160);
          aiReasoning = 'Fallback: converted statement to question (questions get ~20% higher reply rates)';
        }
      }

      if (!newMessage) continue;

      // 4. Determine next variant label (A -> B -> C -> D)
      const labels = ['A', 'B', 'C', 'D'];
      const nextLabel = labels[(existingCount || 1)] || `V${(existingCount || 1) + 1}`;

      // 5. Create the new variant
      const { error: insertError } = await supabase.from('sms_copy_variants').insert({
        user_id: userId,
        context_type: variant.context_type,
        context_id: variant.context_id,
        variant_label: nextLabel,
        message_template: newMessage,
        traffic_weight: 50, // Start at equal weight with UCB1 to explore
        is_control: false,
        is_active: true,
        ai_generated: true,
        ai_reasoning: aiReasoning,
        parent_variant_id: variant.id,
      });

      if (!insertError) {
        variantsCreated++;
        decisions.push(`[SMS A/B] Created variant "${nextLabel}" to challenge "${variant.variant_label}" (${(variant.reply_rate * 100).toFixed(1)}% reply rate, ${variant.times_sent} sends). Reason: ${aiReasoning}`);
      }
    }
  } catch (err: any) {
    decisions.push(`[SMS A/B] Error during optimization: ${err.message}`);
  }

  return { decisions, variants_created: variantsCreated };
}

// ---------------------------------------------------------------------------
// Message Effectiveness Tracking
// Uses chi-square significance testing to identify proven winner messages
// ---------------------------------------------------------------------------

async function trackMessageEffectiveness(supabase: any, userId: string): Promise<number> {
  // Get SMS variant data grouped by content hash + stage
  const { data: variants } = await supabase
    .from('sms_copy_variants')
    .select('id, message_template, context_type, times_sent, replies_received, positive_replies, led_to_appointment, opt_outs')
    .eq('user_id', userId)
    .gte('times_sent', 20);

  if (!variants?.length) return 0;

  let tracked = 0;

  // Get overall baseline rates
  const totalSent = variants.reduce((s: number, v: any) => s + v.times_sent, 0);
  const totalReplies = variants.reduce((s: number, v: any) => s + v.replies_received, 0);
  const baselineReplyRate = totalSent > 0 ? totalReplies / totalSent : 0;

  for (const variant of variants) {
    if (variant.times_sent < 20) continue;

    const replyRate = variant.replies_received / variant.times_sent;
    const positiveRate = variant.positive_replies / variant.times_sent;
    const apptRate = variant.led_to_appointment / variant.times_sent;

    // Chi-square: is this variant significantly different from baseline?
    const otherSent = totalSent - variant.times_sent;
    const otherReplies = totalReplies - variant.replies_received;
    const pValue = chiSquare2x2(
      variant.replies_received, variant.times_sent - variant.replies_received,
      otherReplies, otherSent - otherReplies
    );

    const confidence = statisticalConfidence(pValue, variant.times_sent);
    const isSignificant = pValue < 0.05 && variant.times_sent >= 50;

    // Effectiveness score
    const effectivenessScore = (variant.positive_replies * 2 + variant.led_to_appointment * 5 - variant.opt_outs * 3) / variant.times_sent;

    // Simple hash for dedup
    const messageHash = variant.message_template.substring(0, 50).replace(/\W/g, '').toLowerCase();

    await supabase.from('message_effectiveness').upsert({
      user_id: userId,
      message_type: 'sms',
      message_content: variant.message_template,
      message_hash: messageHash,
      effective_for_stage: variant.context_type,
      times_sent: variant.times_sent,
      replies: variant.replies_received,
      positive_replies: variant.positive_replies,
      appointments: variant.led_to_appointment,
      opt_outs: variant.opt_outs,
      effectiveness_score: Math.round(effectivenessScore * 10000) / 10000,
      is_significant: isSignificant,
      p_value: Math.round(pValue * 100000) / 100000,
      confidence_level: confidence,
      sample_size_needed: isSignificant ? 0 : Math.max(0, 50 - variant.times_sent),
      calculated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,message_hash,effective_for_stage' });

    tracked++;
  }

  return tracked;
}

// ---------------------------------------------------------------------------
// AI Strategy Planner — Goal-driven workflow/playbook/pipeline generation
// ---------------------------------------------------------------------------

interface StrategyPlan {
  reasoning: string;
  pipelines: Array<{ name: string; stages: string[] }>;
  workflows: Array<{
    name: string;
    purpose: string;
    template_id?: string;
    target_leads: { status: string; min_count: number };
    steps?: Array<{ step_number: number; step_type: string; step_config: Record<string, unknown>; delay_hours?: number }> | null;
  }>;
  playbook_rules: Array<{
    rule_name: string;
    journey_stage: string;
    action_type: string;
    delay_hours: number;
    priority: number;
    action_config: Record<string, unknown>;
  }>;
  estimated_conversion_rate: number;
  estimated_daily_calls: number;
  estimated_appointments_per_day: number;
}

/**
 * Analyze pending campaign strategies — query leads, call LLM, produce a proposed plan.
 */
async function planCampaignStrategy(
  supabase: any,
  userId: string
): Promise<{ analyzed: number; decisions: string[] }> {
  const decisions: string[] = [];
  let analyzed = 0;

  try {
    // 1. Check for pending strategies in 'analyzing' status
    const { data: pendingStrategies, error: fetchErr } = await supabase
      .from('ai_campaign_strategies')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'analyzing')
      .order('created_at', { ascending: true })
      .limit(3);

    if (fetchErr || !pendingStrategies || pendingStrategies.length === 0) {
      return { analyzed: 0, decisions };
    }

    for (const strategy of pendingStrategies) {
      try {
        console.log(`[StrategyPlanner] Analyzing strategy ${strategy.id}: ${strategy.goal_description}`);

        // 2. Analyze leads — counts by status, source, tags, recency
        const [leadsRes, statusRes, sourceRes, dispositionRes, templatesRes] = await Promise.all([
          supabase.from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId),
          supabase.from('leads')
            .select('status')
            .eq('user_id', userId),
          supabase.from('leads')
            .select('lead_source')
            .eq('user_id', userId),
          supabase.from('call_logs')
            .select('disposition')
            .eq('user_id', userId)
            .not('disposition', 'is', null)
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.from('sequence_templates')
            .select('id, name, description, category, estimated_touchpoints, estimated_days_to_complete')
            .or(`is_system_template.eq.true,user_id.eq.${userId}`),
        ]);

        const totalLeads = leadsRes.count || 0;

        // Compute status distribution
        const statusDist: Record<string, number> = {};
        for (const lead of (statusRes.data || [])) {
          const s = lead.status || 'unknown';
          statusDist[s] = (statusDist[s] || 0) + 1;
        }

        // Compute source distribution
        const sourceDist: Record<string, number> = {};
        for (const lead of (sourceRes.data || [])) {
          const s = lead.lead_source || 'unknown';
          sourceDist[s] = (sourceDist[s] || 0) + 1;
        }

        // Compute disposition distribution from call logs
        const dispDist: Record<string, number> = {};
        for (const log of (dispositionRes.data || [])) {
          const d = log.disposition || 'unknown';
          dispDist[d] = (dispDist[d] || 0) + 1;
        }

        // Compute average lead age (rough: midpoint between oldest lead and now)
        const { data: ageData } = await supabase
          .from('leads')
          .select('created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1);

        const oldestLead = ageData?.[0]?.created_at;
        const avgDaysOld = oldestLead
          ? Math.round((Date.now() - new Date(oldestLead).getTime()) / (1000 * 60 * 60 * 24) / 2)
          : 0;

        // Format template names for prompt
        const templates = (templatesRes.data || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          touchpoints: t.estimated_touchpoints,
          days: t.estimated_days_to_complete,
        }));

        // 3. Call LLM to generate strategy
        let callLLMJsonFn: any;
        try {
          const mod = await import('../_shared/openrouter.ts');
          callLLMJsonFn = mod.callLLMJson;
        } catch {
          console.warn('[StrategyPlanner] OpenRouter not available, falling back to rule-based strategy');
          const fallbackPlan = buildRuleBasedStrategy(strategy.goal_type, totalLeads, statusDist, templates);
          await supabase
            .from('ai_campaign_strategies')
            .update({
              status: 'proposed',
              analysis: {
                lead_count: totalLeads,
                status_distribution: statusDist,
                source_distribution: sourceDist,
                disposition_distribution: dispDist,
                avg_days_old: avgDaysOld,
                ...fallbackPlan,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', strategy.id);

          analyzed++;
          decisions.push(`[STRATEGY] Analyzed strategy "${strategy.goal_description}" with rule-based planner (${totalLeads} leads). Status: proposed.`);
          continue;
        }

        const systemPrompt = `You are an elite sales strategist AI. Analyze this lead data and create an execution plan.

GOAL: ${strategy.goal_description}
GOAL TYPE: ${strategy.goal_type}

LEAD DATA:
- Total leads: ${totalLeads}
- By status: ${JSON.stringify(statusDist)}
- By source: ${JSON.stringify(sourceDist)}
- Average age: ${avgDaysOld} days
- Previous call outcomes: ${JSON.stringify(dispDist)}

AVAILABLE SEQUENCE TEMPLATES:
${templates.map((t: any) => `- ${t.name} (${t.category}): ${t.description} [id: ${t.id}, ${t.touchpoints} touches over ${t.days} days]`).join('\n')}

Create a comprehensive strategy. Return JSON with this exact structure:
{
  "reasoning": "2-3 sentences explaining your strategic approach",
  "pipelines": [
    { "name": "string - pipeline board name", "stages": ["stage1", "stage2", "stage3"] }
  ],
  "workflows": [
    {
      "name": "workflow name",
      "purpose": "what this workflow does",
      "template_id": "UUID of sequence template to use, or null for custom",
      "target_leads": { "status": "new|contacted|callback|stalled", "min_count": 0 },
      "steps": null
    }
  ],
  "playbook_rules": [
    {
      "rule_name": "descriptive_snake_case_name",
      "journey_stage": "fresh|attempting|engaged|hot|nurturing|stalled|dormant",
      "action_type": "call|sms|ai_sms|wait",
      "delay_hours": 0,
      "priority": 1,
      "action_config": {}
    }
  ],
  "estimated_conversion_rate": 0.05,
  "estimated_daily_calls": 100,
  "estimated_appointments_per_day": 5
}

Rules:
- Use template_id when an existing template matches the need. Set steps to null when using a template.
- Only include custom steps array when no template fits.
- Playbook rules should complement (not duplicate) the default playbook rules.
- Be realistic with conversion estimates based on the lead data quality.
- Create 1-2 pipelines max, 1-3 workflows, and 3-8 playbook rules.`;

        const { data: plan } = await callLLMJsonFn({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Generate the strategy now.' },
          ],
          tier: 'balanced',
          temperature: 0.4,
          max_tokens: 3000,
        }) as { data: StrategyPlan };

        if (!plan || !plan.reasoning) {
          throw new Error('LLM returned invalid strategy plan');
        }

        // Update strategy with analysis results — status becomes 'proposed'
        await supabase
          .from('ai_campaign_strategies')
          .update({
            status: 'proposed',
            analysis: {
              lead_count: totalLeads,
              status_distribution: statusDist,
              source_distribution: sourceDist,
              disposition_distribution: dispDist,
              avg_days_old: avgDaysOld,
              reasoning: plan.reasoning,
              recommended_pipelines: plan.pipelines || [],
              recommended_workflows: plan.workflows || [],
              recommended_playbook_rules: plan.playbook_rules || [],
              estimated_conversion_rate: plan.estimated_conversion_rate || 0,
              estimated_daily_calls: plan.estimated_daily_calls || 0,
              estimated_appointments_per_day: plan.estimated_appointments_per_day || 0,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', strategy.id);

        analyzed++;
        decisions.push(
          `[STRATEGY] Analyzed strategy "${strategy.goal_description}" via LLM (${totalLeads} leads). ` +
          `Plan: ${(plan.pipelines || []).length} pipelines, ${(plan.workflows || []).length} workflows, ` +
          `${(plan.playbook_rules || []).length} playbook rules. Status: proposed.`
        );

      } catch (stratErr: any) {
        console.error(`[StrategyPlanner] Error analyzing strategy ${strategy.id}:`, stratErr);
        await supabase
          .from('ai_campaign_strategies')
          .update({
            status: 'rejected',
            analysis: { error: stratErr.message },
            updated_at: new Date().toISOString(),
          })
          .eq('id', strategy.id);
        decisions.push(`[STRATEGY] Failed to analyze strategy ${strategy.id}: ${stratErr.message}`);
      }
    }
  } catch (err: any) {
    console.error('[StrategyPlanner] Fatal error:', err);
    decisions.push(`[STRATEGY] Fatal error: ${err.message}`);
  }

  return { analyzed, decisions };
}

/**
 * Rule-based fallback strategy when LLM is unavailable.
 */
function buildRuleBasedStrategy(
  goalType: string,
  totalLeads: number,
  statusDist: Record<string, number>,
  templates: Array<{ id: string; name: string; category: string }>
): {
  reasoning: string;
  recommended_pipelines: any[];
  recommended_workflows: any[];
  recommended_playbook_rules: any[];
  estimated_conversion_rate: number;
  estimated_daily_calls: number;
  estimated_appointments_per_day: number;
} {
  const newLeads = statusDist['new'] || statusDist['New'] || 0;
  const contactedLeads = statusDist['contacted'] || statusDist['Contacted'] || 0;

  const templateMap: Record<string, string[]> = {
    appointment_setting: ['speed_to_lead', 'appointment_setting', 'appointment_confirmation'],
    lead_qualification: ['speed_to_lead', 'nurture_drip'],
    database_reactivation: ['database_reactivation', 'win_back'],
    solar_sales: ['speed_to_lead', 'appointment_setting', 'nurture_drip'],
    home_services: ['speed_to_lead', 'appointment_setting'],
    real_estate: ['speed_to_lead', 'nurture_drip'],
    insurance_sales: ['speed_to_lead', 'nurture_drip', 'appointment_setting'],
    debt_collection: ['collections'],
    custom: ['speed_to_lead', 'nurture_drip'],
  };

  const desiredCategories = templateMap[goalType] || templateMap['custom'];
  const matchedTemplates = templates.filter((t: any) => desiredCategories.includes(t.category));

  const workflows = matchedTemplates.slice(0, 3).map((t: any) => ({
    name: `${goalType} - ${t.name}`,
    purpose: `Auto-generated from ${t.name} template`,
    template_id: t.id,
    target_leads: { status: 'new', min_count: 0 },
    steps: null,
  }));

  const readableGoal = goalType.replace(/_/g, ' ');
  const playbook_rules = [
    {
      rule_name: `${goalType}_immediate_call`,
      journey_stage: 'fresh',
      action_type: 'call',
      delay_hours: 0.08,
      priority: 1,
      action_config: { urgency: 'immediate', source: 'strategy_planner' },
    },
    {
      rule_name: `${goalType}_sms_after_miss`,
      journey_stage: 'attempting',
      action_type: 'ai_sms',
      delay_hours: 0.5,
      priority: 2,
      action_config: { prompt: `Follow up on missed call about ${readableGoal}. Be helpful and brief.`, source: 'strategy_planner' },
    },
    {
      rule_name: `${goalType}_stalled_reengagement`,
      journey_stage: 'stalled',
      action_type: 'ai_sms',
      delay_hours: 72,
      priority: 3,
      action_config: { prompt: `Re-engage a stalled lead about ${readableGoal}. Use curiosity, not pressure.`, source: 'strategy_planner' },
    },
  ];

  return {
    reasoning: `Rule-based strategy for ${readableGoal} with ${totalLeads} leads (${newLeads} new, ${contactedLeads} contacted). Using ${matchedTemplates.length} matching templates and 3 playbook rules.`,
    recommended_pipelines: [{
      name: `${readableGoal.replace(/\b\w/g, c => c.toUpperCase())} Pipeline`,
      stages: ['New Lead', 'Contacted', 'Interested', 'Appointment Set', 'Closed Won', 'Closed Lost'],
    }],
    recommended_workflows: workflows,
    recommended_playbook_rules: playbook_rules,
    estimated_conversion_rate: 0.03,
    estimated_daily_calls: Math.min(totalLeads, 200),
    estimated_appointments_per_day: Math.round(Math.min(totalLeads, 200) * 0.03),
  };
}

/**
 * Execute approved strategies — create pipelines, workflows, playbook rules in the database.
 */
async function executeCampaignStrategy(
  supabase: any,
  userId: string
): Promise<{ executed: number; decisions: string[] }> {
  const decisions: string[] = [];
  let executed = 0;

  try {
    const { data: approvedStrategies, error: fetchErr } = await supabase
      .from('ai_campaign_strategies')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: true })
      .limit(3);

    if (fetchErr || !approvedStrategies || approvedStrategies.length === 0) {
      return { executed: 0, decisions };
    }

    for (const strategy of approvedStrategies) {
      try {
        console.log(`[StrategyExecutor] Executing strategy ${strategy.id}: ${strategy.goal_description}`);

        const analysis = strategy.analysis || {};
        const recommendedPipelines = analysis.recommended_pipelines || [];
        const recommendedWorkflows = analysis.recommended_workflows || [];
        const recommendedRules = analysis.recommended_playbook_rules || [];

        const createdPipelines: any[] = [];
        const createdWorkflows: any[] = [];
        const createdRules: any[] = [];

        // --- Create pipeline boards (each stage is a board entry with a position) ---
        for (const pipeline of recommendedPipelines) {
          try {
            const stages = pipeline.stages || [];
            const pipelineEntries: any[] = [];

            for (let i = 0; i < stages.length; i++) {
              const { data: board, error: boardErr } = await supabase
                .from('pipeline_boards')
                .insert({
                  user_id: userId,
                  name: stages[i],
                  description: `${pipeline.name} — Stage ${i + 1}`,
                  position: i,
                  settings: { pipeline_group: pipeline.name, strategy_id: strategy.id },
                })
                .select('id, name')
                .single();

              if (boardErr) {
                console.warn(`[StrategyExecutor] Failed to create pipeline stage "${stages[i]}":`, boardErr.message);
              } else {
                pipelineEntries.push({ id: board.id, name: board.name, position: i });
              }
            }

            if (pipelineEntries.length > 0) {
              createdPipelines.push({
                name: pipeline.name,
                stages: pipelineEntries.map((e: any) => e.name),
                board_ids: pipelineEntries.map((e: any) => e.id),
              });
            }
          } catch (pipeErr: any) {
            console.warn(`[StrategyExecutor] Pipeline creation error:`, pipeErr.message);
          }
        }

        // --- Create workflows with steps (from template or custom) ---
        for (const wf of recommendedWorkflows) {
          try {
            const wfType = wf.purpose?.includes('follow') ? 'follow_up'
              : wf.purpose?.includes('appointment') ? 'appointment_reminder'
              : 'mixed';

            const { data: workflow, error: wfErr } = await supabase
              .from('campaign_workflows')
              .insert({
                user_id: userId,
                name: wf.name,
                description: wf.purpose,
                workflow_type: wfType,
                active: true,
                settings: { strategy_id: strategy.id, template_id: wf.template_id || null },
              })
              .select('id, name')
              .single();

            if (wfErr) {
              console.warn(`[StrategyExecutor] Failed to create workflow "${wf.name}":`, wfErr.message);
              continue;
            }

            // Resolve steps: prefer template, fall back to custom steps
            let steps: any[] = [];
            if (wf.template_id) {
              const { data: template } = await supabase
                .from('sequence_templates')
                .select('steps, times_used')
                .eq('id', wf.template_id)
                .single();

              if (template?.steps) {
                steps = Array.isArray(template.steps) ? template.steps : [];
              }

              // Increment template usage counter
              await supabase
                .from('sequence_templates')
                .update({ times_used: (template?.times_used || 0) + 1 })
                .eq('id', wf.template_id)
                .catch(() => {});
            } else if (wf.steps && Array.isArray(wf.steps)) {
              steps = wf.steps;
            }

            // Insert workflow steps
            let stepsCreated = 0;
            for (const step of steps) {
              const { error: stepErr } = await supabase
                .from('workflow_steps')
                .insert({
                  workflow_id: workflow.id,
                  step_number: step.step_number || (stepsCreated + 1),
                  step_type: step.step_type || 'wait',
                  step_config: step.step_config || {},
                  true_branch_step: step.true_branch_step || null,
                  false_branch_step: step.false_branch_step || null,
                  branch_conditions: step.branch_conditions || [],
                  loop_back_to_step: step.loop_back_to_step || null,
                  max_loop_count: step.max_loop_count || 0,
                });

              if (!stepErr) stepsCreated++;
            }

            createdWorkflows.push({
              workflow_id: workflow.id,
              name: workflow.name,
              purpose: wf.purpose,
              step_count: stepsCreated,
            });
          } catch (wfCreateErr: any) {
            console.warn(`[StrategyExecutor] Workflow creation error:`, wfCreateErr.message);
          }
        }

        // --- Create playbook rules (insert directly, catch duplicates gracefully) ---
        for (const rule of recommendedRules) {
          try {
            const { data: newRule, error: ruleErr } = await supabase
              .from('followup_playbook')
              .insert({
                user_id: userId,
                rule_name: rule.rule_name,
                description: `Auto-generated by strategy planner for: ${strategy.goal_description}`,
                journey_stage: rule.journey_stage,
                action_type: rule.action_type,
                delay_hours: rule.delay_hours || 0,
                priority: rule.priority || 5,
                action_config: { ...(rule.action_config || {}), strategy_id: strategy.id },
                enabled: true,
                is_system_default: false,
              })
              .select('id, rule_name')
              .single();

            if (ruleErr) {
              console.warn(`[StrategyExecutor] Rule '${rule.rule_name}' creation failed (may exist): ${ruleErr.message}`);
              continue;
            }

            createdRules.push({
              rule_id: newRule.id,
              rule_name: newRule.rule_name,
              stage: rule.journey_stage,
              action_type: rule.action_type,
            });
          } catch (ruleCreateErr: any) {
            console.warn(`[StrategyExecutor] Playbook rule creation error:`, ruleCreateErr.message);
          }
        }

        // --- Update strategy record with created resources, mark active ---
        const totalAttempted = (recommendedPipelines?.length || 0) + (recommendedWorkflows?.length || 0) + (recommendedRules?.length || 0);
        const totalCreated = createdPipelines.length + createdWorkflows.length + createdRules.length;
        const hasFailures = totalCreated < totalAttempted;

        await supabase
          .from('ai_campaign_strategies')
          .update({
            status: 'active',
            created_pipelines: createdPipelines,
            created_workflows: createdWorkflows,
            created_playbook_rules: createdRules,
            analysis: {
              ...analysis,
              execution_warnings: hasFailures ? `Created ${totalCreated}/${totalAttempted} resources` : null
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', strategy.id);

        executed++;
        decisions.push(
          `[STRATEGY EXECUTED] "${strategy.goal_description}": ` +
          `${createdPipelines.length} pipelines (${createdPipelines.reduce((s: number, p: any) => s + (p.stages?.length || 0), 0)} stages), ` +
          `${createdWorkflows.length} workflows (${createdWorkflows.reduce((s: number, w: any) => s + (w.step_count || 0), 0)} steps), ` +
          `${createdRules.length} playbook rules.` +
          (hasFailures ? ` WARNING: ${totalAttempted - totalCreated} resource(s) failed to create.` : '') +
          ` Status: active.`
        );

        console.log(`[StrategyExecutor] Strategy ${strategy.id} executed successfully`);

      } catch (execErr: any) {
        console.error(`[StrategyExecutor] Error executing strategy ${strategy.id}:`, execErr);
        decisions.push(`[STRATEGY] Failed to execute strategy ${strategy.id}: ${execErr.message}`);
      }
    }
  } catch (err: any) {
    console.error('[StrategyExecutor] Fatal error:', err);
    decisions.push(`[STRATEGY] Fatal error: ${err.message}`);
  }

  return { executed, decisions };
}

// ---------------------------------------------------------------------------
// Predictive ML: Train Logistic Regression Conversion Model
// ---------------------------------------------------------------------------

async function trainConversionModel(
  supabase: any,
  userId: string
): Promise<{ trained: boolean; accuracy: number; auc: number; decisions: string[] }> {
  const decisions: string[] = [];

  try {
    // Check if we already have a recent model (< 7 days old)
    const { data: existingModel } = await supabase
      .from('ml_models')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('model_type', 'lead_conversion')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingModel) {
      const modelAge = Date.now() - new Date(existingModel.created_at).getTime();
      if (modelAge < 7 * 24 * 60 * 60 * 1000) {
        return { trained: false, accuracy: 0, auc: 0, decisions: ['[ML] Conversion model is fresh (<7 days). Skipping retrain.'] };
      }
    }

    // Query last 500 calls with outcomes, joined with leads and journey state
    const { data: callData, error: callError } = await supabase
      .from('call_logs')
      .select(`
        id, outcome, duration, created_at,
        leads!inner(id, status, lead_source, created_at),
        lead_journey_state(current_stage, total_calls, engagement_score, interest_level, sentiment_score, days_in_stage)
      `)
      .eq('user_id', userId)
      .not('outcome', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (callError) {
      decisions.push(`[ML] Failed to query training data: ${callError.message}`);
      return { trained: false, accuracy: 0, auc: 0, decisions };
    }

    if (!callData || callData.length < 50) {
      decisions.push(`[ML] Insufficient training data (${callData?.length || 0}/50 minimum). Skipping.`);
      return { trained: false, accuracy: 0, auc: 0, decisions };
    }

    // Check for intent signals in bulk
    const leadIds = callData
      .map((c: any) => c.leads?.id)
      .filter(Boolean);

    const { data: intentSignals } = await supabase
      .from('lead_intent_signals')
      .select('lead_id, has_timeline, is_decision_maker')
      .in('lead_id', leadIds.slice(0, 500));

    const intentMap = new Map<string, { has_timeline: boolean; is_decision_maker: boolean }>();
    for (const sig of (intentSignals || [])) {
      intentMap.set(sig.lead_id, sig);
    }

    // Feature extraction
    const positiveOutcomes = new Set(['appointment_set', 'interested', 'converted']);
    const featureNames = [
      'recency_days', 'total_calls', 'interest_level', 'engagement_score',
      'has_intent_timeline', 'is_decision_maker', 'sentiment_score',
      'source_encoded', 'days_in_stage',
    ];

    // Source encoding map (simple ordinal)
    const sourceEncoding: Record<string, number> = {
      'referral': 1.0, 'facebook': 0.8, 'google': 0.7, 'website': 0.5,
      'cold_list': 0.3, 'purchased': 0.2, 'unknown': 0.1,
    };

    const trainingData: Array<{ features: Record<string, number>; label: number }> = [];

    for (const call of callData) {
      const lead = call.leads;
      const journey = Array.isArray(call.lead_journey_state)
        ? call.lead_journey_state[0]
        : call.lead_journey_state;
      if (!lead) continue;

      const leadCreated = new Date(lead.created_at).getTime();
      const callCreated = new Date(call.created_at).getTime();
      const recencyDays = Math.max(0, (callCreated - leadCreated) / (1000 * 60 * 60 * 24));

      const intent = intentMap.get(lead.id);

      const features: Record<string, number> = {
        recency_days: Math.min(recencyDays / 90, 1), // Normalize to 0-1 (cap at 90 days)
        total_calls: Math.min((journey?.total_calls || 0) / 10, 1),
        interest_level: Math.min((journey?.interest_level || 0) / 100, 1),
        engagement_score: Math.min((journey?.engagement_score || 0) / 100, 1),
        has_intent_timeline: intent?.has_timeline ? 1 : 0,
        is_decision_maker: intent?.is_decision_maker ? 1 : 0,
        sentiment_score: Math.max(-1, Math.min(1, journey?.sentiment_score || 0)),
        source_encoded: sourceEncoding[lead.lead_source?.toLowerCase()] || 0.1,
        days_in_stage: Math.min((journey?.days_in_stage || 0) / 30, 1),
      };

      const label = positiveOutcomes.has(call.outcome) ? 1 : 0;
      trainingData.push({ features, label });
    }

    // Check minimum class balance
    const positiveCount = trainingData.filter(s => s.label === 1).length;
    const negativeCount = trainingData.filter(s => s.label === 0).length;

    if (positiveCount < 25 || negativeCount < 25) {
      decisions.push(`[ML] Class imbalance: ${positiveCount} positive, ${negativeCount} negative (need 25 each). Skipping.`);
      return { trained: false, accuracy: 0, auc: 0, decisions };
    }

    // Shuffle and split data 80/20 for train/test
    const shuffled = [...trainingData].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * 0.8);
    const trainSet = shuffled.slice(0, splitIdx);
    const testSet = shuffled.slice(splitIdx);

    // Logistic regression via gradient descent with convergence checking
    const coefficients: Record<string, number> = { intercept: 0 };
    for (const f of featureNames) {
      coefficients[f] = 0;
    }
    const learningRate = 0.01;
    const MAX_ITERATIONS = 100;
    const CONVERGENCE_THRESHOLD = 0.0001;
    let prevLoss = Infinity;
    let iterationsRun = 0;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let totalLoss = 0;

      for (const sample of trainSet) {
        let logit = coefficients.intercept;
        for (const f of featureNames) {
          logit += (coefficients[f] || 0) * (sample.features[f] || 0);
        }
        const predicted = 1 / (1 + Math.exp(-logit));
        const error = sample.label - predicted;

        coefficients.intercept += learningRate * error;
        for (const f of featureNames) {
          coefficients[f] += learningRate * error * (sample.features[f] || 0);
        }

        // Track loss (binary cross-entropy)
        const clampedPred = Math.max(0.0001, Math.min(0.9999, predicted));
        totalLoss += -(sample.label * Math.log(clampedPred) + (1 - sample.label) * Math.log(1 - clampedPred));
      }

      totalLoss /= trainSet.length;
      iterationsRun = iter + 1;

      // Check convergence
      if (Math.abs(prevLoss - totalLoss) < CONVERGENCE_THRESHOLD) {
        console.log(`[ML] Converged after ${iterationsRun} iterations (loss: ${totalLoss.toFixed(6)})`);
        break;
      }
      prevLoss = totalLoss;
    }

    // Calculate accuracy on held-out test set
    let correct = 0;
    const predictions: Array<{ predicted: number; actual: number }> = [];

    for (const sample of testSet) {
      let logit = coefficients.intercept;
      for (const f of featureNames) {
        logit += (coefficients[f] || 0) * (sample.features[f] || 0);
      }
      const predicted = 1 / (1 + Math.exp(-logit));
      predictions.push({ predicted, actual: sample.label });

      if ((predicted >= 0.5 && sample.label === 1) || (predicted < 0.5 && sample.label === 0)) {
        correct++;
      }
    }
    const accuracy = testSet.length > 0 ? correct / testSet.length : 0;

    // AUC approximation: sort by predicted desc, count concordant pairs
    predictions.sort((a, b) => b.predicted - a.predicted);
    let concordant = 0;
    let discordant = 0;
    for (let i = 0; i < predictions.length; i++) {
      for (let j = i + 1; j < predictions.length; j++) {
        if (predictions[i].actual > predictions[j].actual) {
          concordant++;
        } else if (predictions[i].actual < predictions[j].actual) {
          discordant++;
        }
      }
    }
    const auc = concordant + discordant > 0
      ? concordant / (concordant + discordant)
      : 0.5;

    // Deactivate previous models
    await supabase
      .from('ml_models')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('model_type', 'lead_conversion');

    // Store new model
    const featureCoefficients: Record<string, number> = {};
    for (const f of featureNames) {
      featureCoefficients[f] = coefficients[f];
    }

    await supabase.from('ml_models').insert({
      user_id: userId,
      model_type: 'lead_conversion',
      model_version: new Date().toISOString().split('T')[0],
      is_active: true,
      coefficients: {
        intercept: coefficients.intercept,
        features: featureCoefficients,
        training_metadata: {
          iterations: iterationsRun,
          final_loss: prevLoss,
          train_samples: trainSet.length,
          test_samples: testSet.length,
        },
      },
      feature_names: featureNames,
      training_samples: trainingData.length,
      positive_samples: positiveCount,
      negative_samples: negativeCount,
      accuracy,
      auc,
      metadata: {
        source_encoding: sourceEncoding,
        learning_rate: learningRate,
        iterations: iterationsRun,
        max_iterations: MAX_ITERATIONS,
        convergence_threshold: CONVERGENCE_THRESHOLD,
        converged: iterationsRun < MAX_ITERATIONS,
      },
    });

    decisions.push(
      `[ML] Conversion model trained: ${trainingData.length} samples (${positiveCount}+/${negativeCount}-), ` +
      `train/test split: ${trainSet.length}/${testSet.length}, ` +
      `${iterationsRun < MAX_ITERATIONS ? `converged at iter ${iterationsRun}` : `ran full ${MAX_ITERATIONS} iters`}, ` +
      `accuracy=${(accuracy * 100).toFixed(1)}%, AUC=${auc.toFixed(3)}. ` +
      `Top features: ${featureNames.filter(f => Math.abs(coefficients[f]) > 0.1).map(f => `${f}=${coefficients[f].toFixed(3)}`).join(', ')}`
    );

    console.log(`[ML] Model trained: ${iterationsRun} iterations, accuracy=${accuracy.toFixed(3)}, AUC=${auc.toFixed(3)}, samples=${trainingData.length} (${positiveCount} pos / ${negativeCount} neg)`);

    return { trained: true, accuracy, auc, decisions };
  } catch (err: any) {
    decisions.push(`[ML] Model training failed: ${err.message}`);
    console.error('[ML] trainConversionModel error:', err);
    return { trained: false, accuracy: 0, auc: 0, decisions };
  }
}

// ---------------------------------------------------------------------------
// Predictive ML: Score All Active Leads with Conversion Predictions
// ---------------------------------------------------------------------------

async function predictLeadConversion(
  supabase: any,
  userId: string,
  leads?: any[]
): Promise<{ scored: number; decisions: string[] }> {
  const decisions: string[] = [];

  try {
    // Load active model
    const { data: model } = await supabase
      .from('ml_models')
      .select('id, coefficients, feature_names, metadata')
      .eq('user_id', userId)
      .eq('model_type', 'lead_conversion')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!model) {
      decisions.push('[ML] No active conversion model found. Skipping lead scoring.');
      return { scored: 0, decisions };
    }

    const intercept = model.coefficients?.intercept || 0;
    const featureCoefficients = model.coefficients?.features || {};
    const sourceEncoding = model.metadata?.source_encoding || {};

    // Load active leads if not provided
    let activeLeads = leads;
    if (!activeLeads) {
      const { data: fetchedLeads } = await supabase
        .from('leads')
        .select(`
          id, status, lead_source, created_at,
          lead_journey_state(current_stage, total_calls, engagement_score, interest_level, sentiment_score, days_in_stage, total_cost_cents)
        `)
        .eq('user_id', userId)
        .not('status', 'in', '("closed","dnc","unsubscribed")')
        .limit(2000);

      activeLeads = fetchedLeads || [];
    }

    const safeLeads = activeLeads ?? [];
    if (safeLeads.length === 0) {
      return { scored: 0, decisions: ['[ML] No active leads to score.'] };
    }

    // Load intent signals
    const leadIds = safeLeads.map((l: any) => l.id);
    const { data: intentSignals } = await supabase
      .from('lead_intent_signals')
      .select('lead_id, has_timeline, is_decision_maker')
      .in('lead_id', leadIds.slice(0, 2000));

    const intentMap = new Map<string, { has_timeline: boolean; is_decision_maker: boolean }>();
    for (const sig of (intentSignals || [])) {
      intentMap.set(sig.lead_id, sig);
    }

    // Load disposition values for expected value calculation
    const { data: dispValues } = await supabase
      .from('disposition_values')
      .select('disposition, conversion_probability')
      .eq('user_id', userId);

    // Average conversion value (use highest positive disposition as reference)
    const avgConversionValueCents = 5000; // Default $50 per conversion
    const topConversionProb = dispValues?.length
      ? Math.max(...dispValues.map((d: any) => d.conversion_probability || 0))
      : 0.5;

    // Score each lead
    const predictions: Array<{
      lead_id: string;
      probability: number;
      segment: string;
      expected_value_cents: number;
      features: Record<string, number>;
    }> = [];

    for (const lead of safeLeads) {
      const journey = Array.isArray(lead.lead_journey_state)
        ? lead.lead_journey_state[0]
        : lead.lead_journey_state;

      const leadCreated = new Date(lead.created_at).getTime();
      const recencyDays = Math.max(0, (Date.now() - leadCreated) / (1000 * 60 * 60 * 24));
      const intent = intentMap.get(lead.id);

      const features: Record<string, number> = {
        recency_days: Math.min(recencyDays / 90, 1),
        total_calls: Math.min((journey?.total_calls || 0) / 10, 1),
        interest_level: Math.min((journey?.interest_level || 0) / 100, 1),
        engagement_score: Math.min((journey?.engagement_score || 0) / 100, 1),
        has_intent_timeline: intent?.has_timeline ? 1 : 0,
        is_decision_maker: intent?.is_decision_maker ? 1 : 0,
        sentiment_score: Math.max(-1, Math.min(1, journey?.sentiment_score || 0)),
        source_encoded: sourceEncoding[lead.lead_source?.toLowerCase()] || 0.1,
        days_in_stage: Math.min((journey?.days_in_stage || 0) / 30, 1),
      };

      // Compute logit
      let logit = intercept;
      for (const [feat, coeff] of Object.entries(featureCoefficients)) {
        logit += (coeff as number) * (features[feat] || 0);
      }
      const probability = 1 / (1 + Math.exp(-logit));

      // Segment assignment
      let segment: string;
      if (probability > 0.7) segment = 'high_value';
      else if (probability > 0.4) segment = 'nurture';
      else if (probability > 0.2) segment = 'at_risk';
      else segment = 'low_priority';

      // Expected value = probability * conversion value - cost invested so far
      const costSoFar = journey?.total_cost_cents || 0;
      const expectedValue = Math.round(probability * avgConversionValueCents * topConversionProb - costSoFar);

      predictions.push({
        lead_id: lead.id,
        probability,
        segment,
        expected_value_cents: expectedValue,
        features,
      });
    }

    // Upsert predictions in batches
    const batchSize = 100;
    let upserted = 0;

    for (let i = 0; i < predictions.length; i += batchSize) {
      const batch = predictions.slice(i, i + batchSize).map(p => ({
        user_id: userId,
        lead_id: p.lead_id,
        model_id: model.id,
        conversion_probability: p.probability,
        segment: p.segment,
        expected_value_cents: p.expected_value_cents,
        feature_snapshot: p.features,
        predicted_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('lead_predictions')
        .upsert(batch, { onConflict: 'user_id,lead_id' });

      if (!upsertError) {
        upserted += batch.length;
      }
    }

    // Summarize segments
    const segmentCounts: Record<string, number> = {};
    for (const p of predictions) {
      segmentCounts[p.segment] = (segmentCounts[p.segment] || 0) + 1;
    }

    decisions.push(
      `[ML] Scored ${upserted} leads: ` +
      Object.entries(segmentCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([seg, count]) => `${seg}=${count}`)
        .join(', ') +
      `. Avg probability: ${(predictions.reduce((s, p) => s + p.probability, 0) / predictions.length * 100).toFixed(1)}%`
    );

    console.log(`[ML] Scored ${upserted} leads for user ${userId}`);

    return { scored: upserted, decisions };
  } catch (err: any) {
    decisions.push(`[ML] Lead scoring failed: ${err.message}`);
    console.error('[ML] predictLeadConversion error:', err);
    return { scored: 0, decisions };
  }
}

// ---------------------------------------------------------------------------
// Predictive ML: Detect Churn Risk - Leads About to Be Lost
// ---------------------------------------------------------------------------

async function detectChurnRisk(
  supabase: any,
  userId: string
): Promise<{ detected: number; actions_queued: number; decisions: string[] }> {
  const decisions: string[] = [];
  let actionsQueued = 0;

  try {
    // Query leads with declining engagement or long gaps since touch
    const { data: atRiskLeads, error: queryError } = await supabase
      .from('lead_journey_state')
      .select(`
        lead_id, current_stage, interest_level, sentiment_score,
        total_calls, total_sms, last_response_at, last_touch_at,
        consecutive_no_answers, missed_callbacks, engagement_score,
        preferred_channel, days_in_stage
      `)
      .eq('user_id', userId)
      .not('current_stage', 'in', '("closed","booked","dnc","dormant")');

    if (queryError) {
      decisions.push(`[CHURN] Query error: ${queryError.message}`);
      return { detected: 0, actions_queued: 0, decisions };
    }

    if (!atRiskLeads || atRiskLeads.length === 0) {
      return { detected: 0, actions_queued: 0, decisions: ['[CHURN] No active leads to monitor.'] };
    }

    const now = Date.now();
    const churnEvents: Array<{
      lead_id: string;
      risk_score: number;
      risk_level: string;
      risk_factors: string[];
    }> = [];

    for (const lead of atRiskLeads) {
      let riskScore = 0;
      const riskFactors: string[] = [];

      // Factor 1: Days since last response (0-0.4 risk)
      const daysSinceResponse = lead.last_response_at
        ? (now - new Date(lead.last_response_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;

      if (daysSinceResponse > 30) {
        riskScore += 0.4;
        riskFactors.push(`no_response_${Math.round(daysSinceResponse)}d`);
      } else if (daysSinceResponse > 14) {
        riskScore += 0.25;
        riskFactors.push(`stale_response_${Math.round(daysSinceResponse)}d`);
      } else if (daysSinceResponse > 7) {
        riskScore += 0.1;
        riskFactors.push(`aging_response_${Math.round(daysSinceResponse)}d`);
      }

      // Factor 2: Days since last touch (0-0.2 risk)
      const daysSinceTouch = lead.last_touch_at
        ? (now - new Date(lead.last_touch_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;

      if (daysSinceTouch > 7) {
        riskScore += 0.2;
        riskFactors.push(`no_touch_${Math.round(daysSinceTouch)}d`);
      }

      // Factor 3: Declining sentiment (+0.2 risk)
      if (lead.sentiment_score !== null && lead.sentiment_score < -0.2) {
        riskScore += 0.2;
        riskFactors.push(`negative_sentiment_${lead.sentiment_score.toFixed(2)}`);
      }

      // Factor 4: Missed callbacks (+0.3 per miss, capped at 0.6)
      const missedCallbacks = lead.missed_callbacks || 0;
      if (missedCallbacks > 0) {
        riskScore += Math.min(0.3 * missedCallbacks, 0.6);
        riskFactors.push(`missed_callbacks_${missedCallbacks}`);
      }

      // Factor 5: Consecutive no-answers (+0.1 per, capped at 0.5)
      const consecutiveNA = lead.consecutive_no_answers || 0;
      if (consecutiveNA > 0) {
        riskScore += Math.min(0.1 * consecutiveNA, 0.5);
        riskFactors.push(`consecutive_na_${consecutiveNA}`);
      }

      // Factor 6: High attempts with no positive response
      const totalAttempts = (lead.total_calls || 0) + (lead.total_sms || 0);
      if (totalAttempts >= 5 && (lead.interest_level || 0) < 20) {
        riskScore += 0.15;
        riskFactors.push(`${totalAttempts}_attempts_low_interest`);
      }

      // Clamp risk score to 0-1
      riskScore = Math.min(1, Math.max(0, riskScore));

      // Only track meaningful risk
      if (riskScore < 0.3) continue;

      // Risk level
      let riskLevel: string;
      if (riskScore > 0.8) riskLevel = 'critical';
      else if (riskScore > 0.6) riskLevel = 'high';
      else if (riskScore > 0.4) riskLevel = 'medium';
      else riskLevel = 'low';

      churnEvents.push({
        lead_id: lead.lead_id,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
      });

      // For critical and high risk: auto-queue reengagement
      if (riskLevel === 'critical' || riskLevel === 'high') {
        // Prevent duplicate reengagement actions - check if one already exists recently
        const { data: existingAction } = await supabase
          .from('ai_action_queue')
          .select('id')
          .eq('user_id', userId)
          .eq('action_type', 'journey_ai_sms')
          .eq('source', 'churn_detection')
          .in('status', ['pending', 'approved', 'executing'])
          .filter('action_params->>lead_id', 'eq', lead.lead_id)
          .limit(1)
          .maybeSingle();

        if (existingAction) {
          // Already has a pending reengagement action, skip
          continue;
        }

        const channel = lead.preferred_channel || 'sms';
        const urgencyNote = riskLevel === 'critical'
          ? 'CRITICAL: This lead is about to be lost. Send a re-engagement message with value proposition.'
          : 'HIGH RISK: Lead going cold. Send a warm check-in or value-add message.';

        await supabase.from('ai_action_queue').insert({
          user_id: userId,
          action_type: channel === 'sms' ? 'journey_ai_sms' : 'journey_call',
          action_params: {
            lead_id: lead.lead_id,
            reason: 'churn_risk_reengagement',
            risk_level: riskLevel,
            risk_score: riskScore,
            risk_factors: riskFactors,
            message_context: urgencyNote,
          },
          priority: riskLevel === 'critical' ? 90 : 75,
          status: 'pending',
          requires_approval: true,
          reasoning: `${riskLevel.toUpperCase()} churn risk (${(riskScore * 100).toFixed(0)}%): ${riskFactors.join(', ')}`,
          source: 'churn_detection',
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });

        actionsQueued++;
      }
    }

    // Insert churn risk events in batches
    if (churnEvents.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < churnEvents.length; i += batchSize) {
        const batch = churnEvents.slice(i, i + batchSize).map(e => ({
          user_id: userId,
          lead_id: e.lead_id,
          risk_score: e.risk_score,
          risk_level: e.risk_level,
          risk_factors: e.risk_factors,
          detected_at: new Date().toISOString(),
        }));

        await supabase.from('churn_risk_events').insert(batch);
      }
    }

    // Summarize by risk level
    const levelCounts: Record<string, number> = {};
    for (const e of churnEvents) {
      levelCounts[e.risk_level] = (levelCounts[e.risk_level] || 0) + 1;
    }

    if (churnEvents.length > 0) {
      decisions.push(
        `[CHURN] Detected ${churnEvents.length} at-risk leads: ` +
        Object.entries(levelCounts)
          .sort(([a], [b]) => {
            const order = ['critical', 'high', 'medium', 'low'];
            return order.indexOf(a) - order.indexOf(b);
          })
          .map(([level, count]) => `${level}=${count}`)
          .join(', ') +
        `. Queued ${actionsQueued} reengagement actions.`
      );
    }

    console.log(`[CHURN] Detected ${churnEvents.length} churn risks for user ${userId}, queued ${actionsQueued} actions`);

    return { detected: churnEvents.length, actions_queued: actionsQueued, decisions };
  } catch (err: any) {
    decisions.push(`[CHURN] Detection failed: ${err.message}`);
    console.error('[CHURN] detectChurnRisk error:', err);
    return { detected: 0, actions_queued: 0, decisions };
  }
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
    battle_plan_generated: false,
    insights_discovered: 0,
    rules_created: 0,
    briefing_generated: false,
    strategies_analyzed: 0,
    strategies_executed: 0,
    perpetual_touches: 0,
    sms_variants_optimized: 0,
    leads_scored: 0,
    churn_risks_detected: 0,
    model_trained: false,
    messages_tracked: 0,
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
        result.perpetual_touches = journeyResult.perpetual_touches;
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

    // 15b. SMS Copy A/B Testing Optimizer — auto-improve underperforming SMS variants
    if ((settings as any).manage_lead_journeys) {
      try {
        const smsCopyResult = await optimizeSmsCopy(supabase, userId);
        result.sms_variants_optimized = smsCopyResult.variants_created;
        result.decisions.push(...smsCopyResult.decisions);
      } catch (smsOptErr: any) {
        result.errors.push(`SMS copy optimization: ${smsOptErr.message}`);
      }
    }

    // 15c. Message Effectiveness Tracking — statistical significance testing
    if ((settings as any).manage_lead_journeys) {
      try {
        const messagesTracked = await trackMessageEffectiveness(supabase, userId);
        result.messages_tracked = messagesTracked;
        if (messagesTracked > 0) {
          result.decisions.push(`[MSG EFFECTIVENESS] Tracked ${messagesTracked} message variants with statistical significance testing`);
        }
      } catch (msgTrackErr: any) {
        result.errors.push(`Message effectiveness tracking: ${msgTrackErr.message}`);
      }
    }

    // 15d. Predictive ML: Train conversion model (weekly)
    if ((settings as any).manage_lead_journeys) {
      try {
        const trainResult = await trainConversionModel(supabase, userId);
        result.model_trained = trainResult.trained;
        result.decisions.push(...trainResult.decisions);
      } catch (trainErr: any) {
        result.errors.push(`ML model training: ${trainErr.message}`);
      }
    }

    // 15e. Predictive ML: Score all leads with conversion predictions (daily)
    if ((settings as any).manage_lead_journeys) {
      try {
        // Only run daily — check if we scored today already
        const today = new Date().toISOString().split('T')[0];
        const { count: scoredToday } = await supabase
          .from('lead_predictions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('predicted_at', `${today}T00:00:00`);

        if (!scoredToday || scoredToday === 0) {
          const scoreResult = await predictLeadConversion(supabase, userId);
          result.leads_scored = scoreResult.scored;
          result.decisions.push(...scoreResult.decisions);
        } else {
          result.decisions.push(`[ML] Leads already scored today (${scoredToday} predictions). Skipping.`);
        }
      } catch (scoreErr: any) {
        result.errors.push(`ML lead scoring: ${scoreErr.message}`);
      }
    }

    // 15f. Predictive ML: Detect churn risks (every run)
    if ((settings as any).manage_lead_journeys) {
      try {
        const churnResult = await detectChurnRisk(supabase, userId);
        result.churn_risks_detected = churnResult.detected;
        result.actions_queued += churnResult.actions_queued;
        result.decisions.push(...churnResult.decisions);
      } catch (churnErr: any) {
        result.errors.push(`Churn detection: ${churnErr.message}`);
      }
    }

    // 16. Campaign Resource Allocator — Daily War Room (9/10 feature)
    if ((settings as any).enable_daily_planning) {
      try {
        const planResult = await planDay(supabase, userId, settings);
        result.battle_plan_generated = planResult.generated;
        result.decisions.push(...planResult.decisions);
      } catch (planErr: any) {
        result.errors.push(`Daily planner: ${planErr.message}`);
      }
    }

    // 17. Strategic Pattern Detective (10/10 feature)
    if ((settings as any).enable_strategic_insights) {
      try {
        const patternResult = await detectStrategicPatterns(supabase, userId, settings);
        result.insights_discovered = patternResult.insights_discovered;
        result.rules_created = patternResult.rules_created;
        result.briefing_generated = patternResult.insights_discovered > 0;
        result.decisions.push(...patternResult.decisions);
      } catch (patternErr: any) {
        result.errors.push(`Pattern detective: ${patternErr.message}`);
      }
    }

    // 18. Execute approved campaign strategies (create pipelines/workflows/rules)
    try {
      const execResult = await executeCampaignStrategy(supabase, userId);
      result.strategies_executed = execResult.executed;
      result.decisions.push(...execResult.decisions);
    } catch (execStratErr: any) {
      result.errors.push(`Strategy execution: ${execStratErr.message}`);
    }

    // 19. Analyze pending campaign strategies (LLM-powered goal planning)
    try {
      const planResult = await planCampaignStrategy(supabase, userId);
      result.strategies_analyzed = planResult.analyzed;
      result.decisions.push(...planResult.decisions);
    } catch (planStratErr: any) {
      result.errors.push(`Strategy planning: ${planStratErr.message}`);
    }

    // 20. Save operational memory
    result.memories_saved = await saveRunMemory(supabase, userId, result);

    // 21. Update last_engine_run timestamp
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
        `plan=${userResult.battle_plan_generated ? 'generated' : 'skipped'}, ` +
        `insights=${userResult.insights_discovered}, rules=${userResult.rules_created}, ` +
        `perpetual=${userResult.perpetual_touches}, sms_variants=${userResult.sms_variants_optimized}, ` +
        `ml_model=${userResult.model_trained ? 'trained' : 'skipped'}, ml_scored=${userResult.leads_scored}, churn=${userResult.churn_risks_detected}, ` +
        `strategies=${userResult.strategies_analyzed}analyzed/${userResult.strategies_executed}executed, ` +
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
