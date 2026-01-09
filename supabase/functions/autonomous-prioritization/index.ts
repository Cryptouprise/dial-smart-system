import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadScoreResult {
  leadId: string;
  priorityScore: number;
  engagementScore: number;
  recencyScore: number;
  sentimentScore: number;
  bestContactTime?: string;
  factors: Record<string, number>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, leadIds, settings } = await req.json();

    switch (action) {
      case 'batch_score': {
        // Score multiple leads
        const leads = leadIds || [];
        const scores: LeadScoreResult[] = [];

        for (const leadId of leads) {
          const score = await calculateLeadScore(supabase, user.id, leadId, settings);
          if (score) scores.push(score);
        }

        // Sort by priority score
        scores.sort((a, b) => b.priorityScore - a.priorityScore);

        return new Response(JSON.stringify({ 
          success: true, 
          scores,
          count: scores.length 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'score_all': {
        // Score all active leads
        const { data: leads } = await supabase
          .from('leads')
          .select('id')
          .eq('user_id', user.id)
          .eq('do_not_call', false)
          .in('status', ['new', 'contacted', 'callback', 'warm'])
          .limit(500); // Limit for performance

        const allLeadIds = (leads || []).map(l => l.id);
        const scores: LeadScoreResult[] = [];

        for (const leadId of allLeadIds) {
          const score = await calculateLeadScore(supabase, user.id, leadId, settings);
          if (score) scores.push(score);
        }

        scores.sort((a, b) => b.priorityScore - a.priorityScore);

        // Update priorities in database
        for (let i = 0; i < scores.length; i++) {
          const priority = Math.ceil((1 - i / scores.length) * 10);
          await supabase
            .from('leads')
            .update({ priority })
            .eq('id', scores[i].leadId);
        }

        return new Response(JSON.stringify({ 
          success: true, 
          scores: scores.slice(0, 50), // Return top 50
          totalScored: scores.length 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_queue': {
        // Get prioritized call queue
        const { data: priorityScores } = await supabase
          .from('lead_priority_scores')
          .select('*, leads!inner(id, first_name, last_name, phone_number, status)')
          .eq('user_id', user.id)
          .order('priority_score', { ascending: false })
          .limit(settings?.limit || 20);

        const queue = (priorityScores || []).map((p: any) => ({
          leadId: p.lead_id,
          leadName: `${p.leads?.first_name || ''} ${p.leads?.last_name || ''}`.trim() || 'Unknown',
          phoneNumber: p.leads?.phone_number,
          status: p.leads?.status,
          priorityScore: p.priority_score,
          bestContactTime: p.best_contact_time,
          engagementScore: p.engagement_score,
        }));

        return new Response(JSON.stringify({ 
          success: true, 
          queue 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Autonomous prioritization error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function calculateLeadScore(
  supabase: any,
  userId: string,
  leadId: string,
  settings?: any
): Promise<LeadScoreResult | null> {
  try {
    // Fetch lead data - use maybeSingle to avoid crash when lead doesn't exist
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error(`[Prioritization] Error fetching lead ${leadId}:`, leadError);
      return null;
    }
    if (!lead) return null;

    // Fetch SMS history
    const { data: smsHistory } = await supabase
      .from('sms_messages')
      .select('direction')
      .eq('lead_id', leadId)
      .limit(20);

    // Fetch call history
    const { data: callHistory } = await supabase
      .from('call_logs')
      .select('status, outcome, created_at')
      .eq('lead_id', leadId)
      .limit(10);

    // Calculate scores
    const inboundSms = (smsHistory || []).filter((s: any) => s.direction === 'inbound').length;
    const outboundSms = (smsHistory || []).filter((s: any) => s.direction === 'outbound').length;
    const responseRate = outboundSms > 0 ? (inboundSms / outboundSms) * 100 : 0;
    const engagementScore = Math.min(100, responseRate + (inboundSms * 10));

    // Recency score
    let recencyScore = 50;
    if (lead.last_contacted_at) {
      const lastContact = new Date(lead.last_contacted_at);
      const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
      recencyScore = Math.max(0, 100 - (daysSince * 5));
    }

    // Sentiment score
    const positiveOutcomes = (callHistory || []).filter((c: any) => 
      ['interested', 'callback', 'appointment'].includes(c.outcome || '')
    ).length;
    const negativeOutcomes = (callHistory || []).filter((c: any) => 
      ['not_interested', 'dnc', 'wrong_number'].includes(c.outcome || '')
    ).length;
    const totalCalls = (callHistory || []).length;
    const sentimentScore = totalCalls > 0 
      ? 50 + ((positiveOutcomes - negativeOutcomes) / totalCalls) * 50 
      : 50;

    // Answer rate
    const answeredCalls = (callHistory || []).filter((c: any) => c.status === 'completed').length;
    const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 50;

    // Best contact time
    const answeredTimes = (callHistory || [])
      .filter((c: any) => c.status === 'completed')
      .map((c: any) => new Date(c.created_at).getHours());
    
    let bestContactTime: string | undefined;
    if (answeredTimes.length > 0) {
      const hourCounts: Record<number, number> = {};
      answeredTimes.forEach((hour: number) => {
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (bestHour) {
        const h = parseInt(bestHour);
        bestContactTime = `${h.toString().padStart(2, '0')}:00-${(h + 1).toString().padStart(2, '0')}:00`;
      }
    }

    // Weighted priority score
    const weights = settings?.weights || { engagement: 0.3, recency: 0.25, sentiment: 0.2, response: 0.25 };
    const priorityScore = 
      (engagementScore * weights.engagement) +
      (recencyScore * weights.recency) +
      (sentimentScore * weights.sentiment) +
      (answerRate * weights.response);

    const score: LeadScoreResult = {
      leadId,
      priorityScore: Math.round(priorityScore * 10) / 10,
      engagementScore: Math.round(engagementScore * 10) / 10,
      recencyScore: Math.round(recencyScore * 10) / 10,
      sentimentScore: Math.round(sentimentScore * 10) / 10,
      bestContactTime,
      factors: {
        engagement: engagementScore,
        recency: recencyScore,
        sentiment: sentimentScore,
        answerRate,
        inboundSms,
        outboundSms,
        totalCalls,
        answeredCalls
      }
    };

    // Save to database
    await supabase
      .from('lead_priority_scores')
      .upsert({
        user_id: userId,
        lead_id: leadId,
        priority_score: score.priorityScore,
        engagement_score: score.engagementScore,
        recency_score: score.recencyScore,
        sentiment_score: score.sentimentScore,
        best_contact_time: score.bestContactTime,
        factors: score.factors,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,lead_id' });

    return score;
  } catch (error) {
    console.error(`Error scoring lead ${leadId}:`, error);
    return null;
  }
}
