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

    // 9. Phase 6: Calibrate lead scoring weights (weekly)
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

    // 12. Save operational memory
    result.memories_saved = await saveRunMemory(supabase, userId, result);

    // 13. Update last_engine_run timestamp
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
