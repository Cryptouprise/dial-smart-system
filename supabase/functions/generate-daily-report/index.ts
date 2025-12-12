/**
 * Generate Daily Report Edge Function
 * 
 * Generates AI-powered daily performance reports with analytics,
 * wins, failures, and recommendations.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailyMetrics {
  totalCalls: number;
  connectedCalls: number;
  answerRate: number;
  avgCallDuration: number;
  appointmentsSet: number;
  callbacksScheduled: number;
  dncAdded: number;
  smsSent: number;
  smsReceived: number;
  outcomeBreakdown: Record<string, number>;
  topPerformingNumbers: any[];
  leadConversions: number;
}

async function fetchDailyMetrics(supabase: any, userId: string, date: string): Promise<DailyMetrics> {
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const [calls, leads, sms, numbers] = await Promise.all([
    supabase.from('call_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay),
    supabase.from('leads')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', startOfDay)
      .lte('updated_at', endOfDay),
    supabase.from('sms_messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay),
    supabase.from('phone_numbers')
      .select('*')
      .eq('user_id', userId)
  ]);

  const callsData = calls.data || [];
  const leadsData = leads.data || [];
  const smsData = sms.data || [];
  const numbersData = numbers.data || [];

  const connectedCalls = callsData.filter((c: any) => 
    c.status === 'completed' || c.outcome === 'connected' || c.outcome === 'appointment_set'
  );

  const outcomeBreakdown = callsData.reduce((acc: any, call: any) => {
    const outcome = call.outcome || call.status || 'unknown';
    acc[outcome] = (acc[outcome] || 0) + 1;
    return acc;
  }, {});

  const totalDuration = callsData.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0);

  // Top performing numbers by connected calls
  const numberPerformance = callsData.reduce((acc: any, call: any) => {
    const num = call.caller_id;
    if (!acc[num]) acc[num] = { number: num, calls: 0, connected: 0 };
    acc[num].calls++;
    if (call.status === 'completed' || call.outcome === 'connected') {
      acc[num].connected++;
    }
    return acc;
  }, {});

  const topPerformingNumbers = Object.values(numberPerformance)
    .sort((a: any, b: any) => b.connected - a.connected)
    .slice(0, 5);

  return {
    totalCalls: callsData.length,
    connectedCalls: connectedCalls.length,
    answerRate: callsData.length > 0 ? Math.round((connectedCalls.length / callsData.length) * 100) : 0,
    avgCallDuration: callsData.length > 0 ? Math.round(totalDuration / callsData.length) : 0,
    appointmentsSet: leadsData.filter((l: any) => l.status === 'appointment_set').length,
    callbacksScheduled: leadsData.filter((l: any) => l.next_callback_at).length,
    dncAdded: leadsData.filter((l: any) => l.do_not_call).length,
    smsSent: smsData.filter((m: any) => m.direction === 'outbound').length,
    smsReceived: smsData.filter((m: any) => m.direction === 'inbound').length,
    outcomeBreakdown,
    topPerformingNumbers,
    leadConversions: leadsData.filter((l: any) => 
      l.status === 'closed_won' || l.status === 'qualified'
    ).length
  };
}

async function generateAIAnalysis(metrics: DailyMetrics, lovableApiKey: string): Promise<any> {
  const prompt = `Analyze this daily call center performance data and provide insights:

METRICS:
- Total Calls: ${metrics.totalCalls}
- Connected Calls: ${metrics.connectedCalls}
- Answer Rate: ${metrics.answerRate}%
- Avg Call Duration: ${metrics.avgCallDuration} seconds
- Appointments Set: ${metrics.appointmentsSet}
- Callbacks Scheduled: ${metrics.callbacksScheduled}
- SMS Sent: ${metrics.smsSent}
- SMS Received: ${metrics.smsReceived}
- Lead Conversions: ${metrics.leadConversions}

CALL OUTCOMES:
${Object.entries(metrics.outcomeBreakdown).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Based on this data, provide:
1. A brief 2-3 sentence summary of the day's performance
2. 2-3 specific WINS (things that went well)
3. 2-3 specific IMPROVEMENTS needed
4. 1-2 FAILURES or issues to address
5. 3 actionable RECOMMENDATIONS for tomorrow
6. A performance score from 1-100

Respond in JSON format:
{
  "summary": "...",
  "wins": ["win1", "win2"],
  "improvements": ["improvement1", "improvement2"],
  "failures": ["failure1"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "performanceScore": 75
}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a call center performance analyst. Provide actionable, data-driven insights. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    console.error('[Daily Report] AI error:', response.status);
    return {
      summary: `Today: ${metrics.totalCalls} calls made, ${metrics.answerRate}% answer rate, ${metrics.appointmentsSet} appointments.`,
      wins: metrics.answerRate > 30 ? ['Good answer rate'] : [],
      improvements: metrics.answerRate < 30 ? ['Improve answer rate'] : [],
      failures: metrics.totalCalls === 0 ? ['No calls made today'] : [],
      recommendations: ['Make more calls', 'Follow up on callbacks', 'Review call scripts'],
      performanceScore: Math.min(100, metrics.answerRate + metrics.appointmentsSet * 10)
    };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[Daily Report] JSON parse error:', e);
  }

  return {
    summary: content.substring(0, 500),
    wins: [],
    improvements: [],
    failures: [],
    recommendations: [],
    performanceScore: 50
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get parameters
    const { userId, date, forceRegenerate } = await req.json().catch(() => ({}));
    
    // Use provided date or yesterday (for scheduled runs)
    const reportDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log(`[Daily Report] Generating report for date: ${reportDate}`);

    // If userId is provided, generate for that user only
    // Otherwise, generate for all users (scheduled job)
    let userIds: string[] = [];
    
    if (userId) {
      userIds = [userId];
    } else {
      // Get all unique user_ids from call_logs
      const { data: users } = await supabase
        .from('call_logs')
        .select('user_id')
        .limit(1000);
      
      userIds = [...new Set((users || []).map((u: any) => u.user_id))];
    }

    console.log(`[Daily Report] Processing ${userIds.length} users`);

    const reports = [];

    for (const uid of userIds) {
      try {
        // Check if report already exists
        if (!forceRegenerate) {
          const { data: existing } = await supabase
            .from('daily_reports')
            .select('id')
            .eq('user_id', uid)
            .eq('report_date', reportDate)
            .eq('report_type', 'daily')
            .single();
          
          if (existing) {
            console.log(`[Daily Report] Report already exists for user ${uid}`);
            continue;
          }
        }

        // Fetch metrics
        const metrics = await fetchDailyMetrics(supabase, uid, reportDate);
        
        // Generate AI analysis
        const analysis = await generateAIAnalysis(metrics, lovableApiKey);

        // Save report
        const { data: report, error } = await supabase
          .from('daily_reports')
          .upsert({
            user_id: uid,
            report_date: reportDate,
            report_type: 'daily',
            total_calls: metrics.totalCalls,
            connected_calls: metrics.connectedCalls,
            answer_rate: metrics.answerRate,
            avg_call_duration: metrics.avgCallDuration,
            appointments_set: metrics.appointmentsSet,
            callbacks_scheduled: metrics.callbacksScheduled,
            dnc_added: metrics.dncAdded,
            sms_sent: metrics.smsSent,
            sms_received: metrics.smsReceived,
            summary: analysis.summary,
            wins: analysis.wins || [],
            improvements: analysis.improvements || [],
            failures: analysis.failures || [],
            recommendations: analysis.recommendations || [],
            performance_score: analysis.performanceScore || 50,
            raw_data: {
              outcomeBreakdown: metrics.outcomeBreakdown,
              topPerformingNumbers: metrics.topPerformingNumbers,
              leadConversions: metrics.leadConversions
            }
          }, { onConflict: 'user_id,report_date,report_type' })
          .select()
          .single();

        if (error) {
          console.error(`[Daily Report] Error saving report for ${uid}:`, error);
        } else {
          reports.push(report);
          console.log(`[Daily Report] Generated report for user ${uid}`);
        }

      } catch (userError) {
        console.error(`[Daily Report] Error processing user ${uid}:`, userError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportsGenerated: reports.length,
        reports 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Daily Report] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
