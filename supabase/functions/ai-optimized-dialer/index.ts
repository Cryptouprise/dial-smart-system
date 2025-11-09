import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizationRequest {
  action: 'calculate_optimal_rate' | 'prioritize_leads' | 'predict_best_time' | 'get_insights';
  campaignId?: string;
  leadId?: string;
  timeZone?: string;
}

interface LeadScore {
  leadId: string;
  score: number;
  factors: {
    historicalAnswerRate: number;
    timingOptimality: number;
    previousContactSuccess: number;
    leadPriority: number;
    callAttemptCount: number;
  };
  recommendedTime?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, campaignId, leadId, timeZone }: OptimizationRequest = await req.json();
    console.log(`[AI Dialer] Processing ${action} for user ${user.id}`);

    switch (action) {
      case 'calculate_optimal_rate': {
        if (!campaignId) {
          throw new Error('Campaign ID is required');
        }

        // Get historical data for the campaign
        const { data: callLogs, error: logsError } = await supabase
          .from('call_logs')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (logsError) throw logsError;

        // Calculate answer rate
        const totalCalls = callLogs?.length || 0;
        const answeredCalls = callLogs?.filter(log => 
          log.status === 'answered' || log.status === 'completed'
        ).length || 0;
        
        const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0.25; // Default 25%

        // Calculate average call duration
        const callDurations = callLogs
          ?.filter(log => log.duration_seconds > 0)
          .map(log => log.duration_seconds) || [];
        
        const avgCallDuration = callDurations.length > 0
          ? callDurations.reduce((a, b) => a + b, 0) / callDurations.length
          : 180; // Default 3 minutes

        // Get number of available agents (simplified - could be enhanced)
        const availableAgents = 1; // TODO: Get from actual agent availability

        // Calculate optimal calls per minute using predictive dialing formula
        // Formula: (agents * 60) / (avg_call_duration + wrap_up_time) * (1 / answer_rate) * aggressiveness
        const wrapUpTime = 30; // 30 seconds wrap-up time
        const aggressiveness = 1.2; // 1.2 = slightly aggressive
        
        const optimalRate = Math.ceil(
          (availableAgents * 60) / (avgCallDuration + wrapUpTime) * (1 / answerRate) * aggressiveness
        );

        // Ensure rate is within reasonable bounds (1-20 CPM)
        const finalRate = Math.max(1, Math.min(20, optimalRate));

        console.log(`[AI Dialer] Optimal rate calculated:`, {
          answerRate,
          avgCallDuration,
          optimalRate: finalRate,
          totalCallsAnalyzed: totalCalls
        });

        return new Response(JSON.stringify({
          optimal_calls_per_minute: finalRate,
          answer_rate: answerRate,
          avg_call_duration: avgCallDuration,
          confidence: totalCalls >= 50 ? 'high' : totalCalls >= 20 ? 'medium' : 'low',
          recommendation: `Based on ${totalCalls} historical calls, we recommend ${finalRate} calls per minute`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'prioritize_leads': {
        if (!campaignId) {
          throw new Error('Campaign ID is required');
        }

        // Get all leads for the campaign
        const { data: campaignLeads, error: leadsError } = await supabase
          .from('campaign_leads')
          .select(`
            lead_id,
            leads (
              id,
              phone_number,
              priority,
              status,
              last_contacted_at,
              created_at
            )
          `)
          .eq('campaign_id', campaignId);

        if (leadsError) throw leadsError;

        // Get call history for each lead
        const leadScores: LeadScore[] = [];

        for (const cl of campaignLeads || []) {
          if (!cl.leads) continue;
          
          const lead = cl.leads;
          
          // Get call history for this lead
          const { data: leadCalls } = await supabase
            .from('call_logs')
            .select('*')
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false });

          const totalAttempts = leadCalls?.length || 0;
          const answeredAttempts = leadCalls?.filter(c => 
            c.status === 'answered' || c.status === 'completed'
          ).length || 0;
          
          const historicalAnswerRate = totalAttempts > 0 
            ? answeredAttempts / totalAttempts 
            : 0.5; // Default neutral score

          // Calculate time-based score (best times are 10am-12pm and 4pm-6pm)
          const now = new Date();
          const hour = now.getHours();
          let timingOptimality = 0.5; // Default
          
          if ((hour >= 10 && hour < 12) || (hour >= 16 && hour < 18)) {
            timingOptimality = 1.0; // Peak time
          } else if ((hour >= 9 && hour < 10) || (hour >= 12 && hour < 16) || (hour >= 18 && hour < 19)) {
            timingOptimality = 0.7; // Good time
          } else {
            timingOptimality = 0.3; // Not ideal
          }

          // Previous contact success score
          const lastCall = leadCalls?.[0];
          let previousContactSuccess = 0.5;
          
          if (lastCall) {
            if (lastCall.outcome === 'interested' || lastCall.outcome === 'callback') {
              previousContactSuccess = 1.0;
            } else if (lastCall.outcome === 'not_interested' || lastCall.outcome === 'do_not_call') {
              previousContactSuccess = 0.0;
            }
          }

          // Normalize lead priority (1-5 scale to 0-1)
          const leadPriority = (lead.priority || 1) / 5;

          // Penalize for too many attempts
          const attemptPenalty = Math.max(0, 1 - (totalAttempts * 0.1));

          // Calculate composite score
          const score = (
            historicalAnswerRate * 0.3 +
            timingOptimality * 0.25 +
            previousContactSuccess * 0.2 +
            leadPriority * 0.15 +
            attemptPenalty * 0.1
          );

          leadScores.push({
            leadId: lead.id,
            score,
            factors: {
              historicalAnswerRate,
              timingOptimality,
              previousContactSuccess,
              leadPriority,
              callAttemptCount: totalAttempts
            }
          });
        }

        // Sort by score descending
        leadScores.sort((a, b) => b.score - a.score);

        console.log(`[AI Dialer] Prioritized ${leadScores.length} leads`);

        return new Response(JSON.stringify({
          prioritized_leads: leadScores,
          total_leads: leadScores.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'predict_best_time': {
        if (!leadId) {
          throw new Error('Lead ID is required');
        }

        // Get call history for the lead
        const { data: leadCalls, error: callsError } = await supabase
          .from('call_logs')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false });

        if (callsError) throw callsError;

        // Analyze successful calls by hour
        const hourStats: Record<number, { attempts: number; successes: number }> = {};

        for (let i = 0; i < 24; i++) {
          hourStats[i] = { attempts: 0, successes: 0 };
        }

        leadCalls?.forEach(call => {
          const hour = new Date(call.created_at).getHours();
          hourStats[hour].attempts++;
          
          if (call.status === 'answered' || call.status === 'completed') {
            hourStats[hour].successes++;
          }
        });

        // Find best hours
        const hourSuccessRates = Object.entries(hourStats)
          .map(([hour, stats]) => ({
            hour: parseInt(hour),
            successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
            attempts: stats.attempts
          }))
          .filter(h => h.attempts > 0)
          .sort((a, b) => b.successRate - a.successRate);

        // If no history, use general best practice times
        const defaultBestHours = [10, 11, 16, 17, 14, 15];
        const bestHours = hourSuccessRates.length > 0 
          ? hourSuccessRates.slice(0, 3).map(h => h.hour)
          : defaultBestHours;

        // Calculate next best time
        const now = new Date();
        const currentHour = now.getHours();
        
        let nextBestHour = bestHours[0];
        for (const hour of bestHours) {
          if (hour > currentHour) {
            nextBestHour = hour;
            break;
          }
        }

        const nextBestTime = new Date();
        nextBestTime.setHours(nextBestHour, 0, 0, 0);
        if (nextBestHour <= currentHour) {
          nextBestTime.setDate(nextBestTime.getDate() + 1);
        }

        console.log(`[AI Dialer] Best time predicted for lead ${leadId}:`, nextBestHour);

        return new Response(JSON.stringify({
          next_best_time: nextBestTime.toISOString(),
          best_hours: bestHours,
          confidence: hourSuccessRates.length >= 5 ? 'high' : 'low',
          historical_data: hourSuccessRates
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_insights': {
        if (!campaignId) {
          throw new Error('Campaign ID is required');
        }

        // Get comprehensive analytics
        const { data: callLogs, error: logsError } = await supabase
          .from('call_logs')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false })
          .limit(500);

        if (logsError) throw logsError;

        // Calculate various metrics
        const totalCalls = callLogs?.length || 0;
        const answeredCalls = callLogs?.filter(c => c.status === 'answered' || c.status === 'completed').length || 0;
        const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;

        // Time-based analysis
        const hourlyStats: Record<number, { calls: number; answered: number }> = {};
        for (let i = 0; i < 24; i++) {
          hourlyStats[i] = { calls: 0, answered: 0 };
        }

        callLogs?.forEach(call => {
          const hour = new Date(call.created_at).getHours();
          hourlyStats[hour].calls++;
          if (call.status === 'answered' || call.status === 'completed') {
            hourlyStats[hour].answered++;
          }
        });

        const bestHours = Object.entries(hourlyStats)
          .filter(([_, stats]) => stats.calls >= 5) // Minimum sample size
          .map(([hour, stats]) => ({
            hour: parseInt(hour),
            answerRate: (stats.answered / stats.calls) * 100,
            callVolume: stats.calls
          }))
          .sort((a, b) => b.answerRate - a.answerRate)
          .slice(0, 5);

        // Day of week analysis
        const dayStats: Record<number, { calls: number; answered: number }> = {};
        for (let i = 0; i < 7; i++) {
          dayStats[i] = { calls: 0, answered: 0 };
        }

        callLogs?.forEach(call => {
          const day = new Date(call.created_at).getDay();
          dayStats[day].calls++;
          if (call.status === 'answered' || call.status === 'completed') {
            dayStats[day].answered++;
          }
        });

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const bestDays = Object.entries(dayStats)
          .filter(([_, stats]) => stats.calls >= 5)
          .map(([day, stats]) => ({
            day: dayNames[parseInt(day)],
            dayNumber: parseInt(day),
            answerRate: (stats.answered / stats.calls) * 100,
            callVolume: stats.calls
          }))
          .sort((a, b) => b.answerRate - a.answerRate)
          .slice(0, 3);

        // Outcome analysis
        const outcomeStats: Record<string, number> = {};
        callLogs?.forEach(call => {
          if (call.outcome) {
            outcomeStats[call.outcome] = (outcomeStats[call.outcome] || 0) + 1;
          }
        });

        console.log(`[AI Dialer] Generated insights for campaign ${campaignId}`);

        return new Response(JSON.stringify({
          summary: {
            total_calls: totalCalls,
            answered_calls: answeredCalls,
            answer_rate: answerRate.toFixed(2),
            data_quality: totalCalls >= 100 ? 'high' : totalCalls >= 30 ? 'medium' : 'low'
          },
          timing_insights: {
            best_hours: bestHours,
            best_days: bestDays
          },
          outcome_distribution: outcomeStats,
          recommendations: [
            bestHours.length > 0 
              ? `Focus calling between ${bestHours[0].hour}:00-${bestHours[0].hour + 1}:00 (${bestHours[0].answerRate.toFixed(1)}% answer rate)`
              : 'Collect more data to identify optimal calling hours',
            answerRate > 30 
              ? 'Your answer rate is above average - maintain current strategy'
              : 'Consider adjusting calling times or improving caller ID reputation',
            totalCalls < 50 
              ? 'Continue collecting data for more accurate predictions'
              : 'Sufficient data collected - AI optimization is reliable'
          ]
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[AI Dialer] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
