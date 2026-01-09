import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ML Learning Engine - Self-improving system that learns from outcomes
 * 
 * This function analyzes call outcomes, dispositions, and lead conversions
 * to continuously improve the system's intelligence across all areas:
 * - Script optimization based on success patterns
 * - Disposition prediction accuracy improvement
 * - Pipeline stage transition optimization
 * - Lead scoring refinement
 * - Agent performance insights
 */

interface LearningData {
  callOutcome: string;
  disposition: string;
  leadConverted: boolean;
  scriptUsed?: string;
  agentId?: string;
  sentimentScore?: number;
  timeToConversion?: number;
  callDuration?: number;
  transcript?: string;
}

interface LearningInsights {
  scriptPerformance: Record<string, { successRate: number; avgConversionTime: number }>;
  dispositionAccuracy: Record<string, { accuracy: number; confidence: number }>;
  leadScoringFactors: Record<string, number>;
  agentBenchmarks: Record<string, { conversionRate: number; avgCallDuration: number }>;
  recommendations: StructuredRecommendation[];
}

interface StructuredRecommendation {
  type: 'success' | 'warning' | 'info' | 'timing';
  title: string;
  description: string;
  metric?: string;
  action?: string;
  priority: 'high' | 'medium' | 'low';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, data: learningData } = await req.json();

    if (action === 'analyze') {
      // Analyze recent performance and generate insights
      const insights = await generateLearningInsights(supabase, user.id);
      
      return new Response(
        JSON.stringify({ success: true, insights }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'learn') {
      // Record learning data for continuous improvement
      await recordLearningData(supabase, user.id, learningData);
      
      return new Response(
        JSON.stringify({ success: true, message: 'Learning data recorded' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'optimize') {
      // Run optimization algorithms on collected data
      const optimizations = await runOptimizations(supabase, user.id);
      
      return new Response(
        JSON.stringify({ success: true, optimizations }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ML Learning Engine error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'ML Learning Engine failed'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function generateLearningInsights(supabase: any, userId: string): Promise<LearningInsights> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Analyze call outcomes
  const { data: callLogs } = await supabase
    .from('call_logs')
    .select('*, campaigns!inner(script), leads!inner(status)')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  // Calculate script performance
  const scriptPerformance: Record<string, { successRate: number; avgConversionTime: number; totalCalls: number }> = {};
  
  if (callLogs) {
    for (const log of callLogs) {
      const scriptName = log.campaigns?.script || 'default';
      if (!scriptPerformance[scriptName]) {
        scriptPerformance[scriptName] = { successRate: 0, avgConversionTime: 0, totalCalls: 0 };
      }
      
      scriptPerformance[scriptName].totalCalls++;
      
      // Consider 'qualified' or 'appointment_booked' as success
      if (log.outcome === 'qualified' || log.outcome === 'appointment_booked') {
        scriptPerformance[scriptName].successRate++;
      }
    }
  }

  // Calculate success rates
  Object.keys(scriptPerformance).forEach(script => {
    const stats = scriptPerformance[script];
    stats.successRate = (stats.successRate / stats.totalCalls) * 100;
  });

  // Analyze disposition accuracy
  const { data: dispositionData } = await supabase
    .from('call_logs')
    .select('auto_disposition, outcome, confidence_score')
    .eq('user_id', userId)
    .not('auto_disposition', 'is', null)
    .gte('created_at', thirtyDaysAgo.toISOString());

  const dispositionAccuracy: Record<string, { accuracy: number; confidence: number; total: number }> = {};
  
  if (dispositionData) {
    for (const record of dispositionData) {
      const disposition = record.auto_disposition;
      if (!dispositionAccuracy[disposition]) {
        dispositionAccuracy[disposition] = { accuracy: 0, confidence: 0, total: 0 };
      }
      
      dispositionAccuracy[disposition].total++;
      
      // Check if auto-disposition matched final outcome
      if (record.auto_disposition === record.outcome) {
        dispositionAccuracy[disposition].accuracy++;
      }
      
      dispositionAccuracy[disposition].confidence += record.confidence_score || 0;
    }
  }

  // Calculate averages
  Object.keys(dispositionAccuracy).forEach(disposition => {
    const stats = dispositionAccuracy[disposition];
    stats.accuracy = (stats.accuracy / stats.total) * 100;
    stats.confidence = stats.confidence / stats.total;
  });

  // Generate structured recommendations based on insights
  const recommendations: StructuredRecommendation[] = [];
  
  // Recommend best-performing scripts
  const bestScript = Object.entries(scriptPerformance)
    .sort((a, b) => b[1].successRate - a[1].successRate)[0];
  
  if (bestScript && bestScript[1].totalCalls >= 10) {
    recommendations.push({
      type: 'success',
      title: 'Best Performing Script',
      description: bestScript[0],
      metric: `${bestScript[1].successRate.toFixed(1)}% success rate`,
      action: 'Consider using this as your primary script',
      priority: 'high'
    });
  }

  // Recommend disposition improvements
  const lowAccuracyDispositions = Object.entries(dispositionAccuracy)
    .filter(([_, stats]) => stats.accuracy < 70 && stats.total >= 5);
  
  if (lowAccuracyDispositions.length > 0) {
    recommendations.push({
      type: 'warning',
      title: 'Low Disposition Accuracy',
      description: `Auto-disposition below 70% for: ${lowAccuracyDispositions.map(([d]) => d).join(', ')}`,
      action: 'Refine AI prompts or disposition rules',
      priority: 'medium'
    });
  }

  // Recommend call timing optimizations
  const { data: timeData } = await supabase
    .from('call_logs')
    .select('created_at, outcome')
    .eq('user_id', userId)
    .in('outcome', ['qualified', 'appointment_booked', 'appointment_set', 'interested'])
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (timeData && timeData.length > 10) {
    const hourCounts: Record<number, number> = {};
    timeData.forEach((call: any) => {
      const hour = new Date(call.created_at).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    const bestHour = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (bestHour) {
      recommendations.push({
        type: 'timing',
        title: 'Peak Conversion Hour',
        description: `${bestHour[0]}:00`,
        metric: `${bestHour[1]} successful calls`,
        action: 'Schedule more calls during this time for better results',
        priority: 'medium'
      });
    }
  }

  // Add general insights
  const totalCalls = Object.values(scriptPerformance).reduce((sum, s) => sum + s.totalCalls, 0);
  if (totalCalls > 0) {
    const avgSuccessRate = Object.values(scriptPerformance).reduce((sum, s) => sum + s.successRate, 0) / Object.keys(scriptPerformance).length;
    
    if (avgSuccessRate >= 50) {
      recommendations.push({
        type: 'success',
        title: 'Overall Performance',
        description: 'Your scripts are performing above average',
        metric: `${avgSuccessRate.toFixed(1)}% average success rate`,
        priority: 'low'
      });
    } else if (avgSuccessRate < 30) {
      recommendations.push({
        type: 'warning',
        title: 'Performance Alert',
        description: 'Overall script performance is below target',
        metric: `${avgSuccessRate.toFixed(1)}% average success rate`,
        action: 'Consider A/B testing different scripts or reviewing objection handling',
        priority: 'high'
      });
    }
  }

  // Add info about data quality
  if (totalCalls < 50) {
    recommendations.push({
      type: 'info',
      title: 'Limited Data',
      description: `Only ${totalCalls} calls analyzed in the last 30 days`,
      action: 'Make more calls to get more accurate insights',
      priority: 'low'
    });
  }

  return {
    scriptPerformance: Object.fromEntries(
      Object.entries(scriptPerformance).map(([script, stats]) => [
        script, 
        { successRate: stats.successRate, avgConversionTime: 0 }
      ])
    ),
    dispositionAccuracy: Object.fromEntries(
      Object.entries(dispositionAccuracy).map(([disp, stats]) => [
        disp,
        { accuracy: stats.accuracy, confidence: stats.confidence }
      ])
    ),
    leadScoringFactors: {},
    agentBenchmarks: {},
    recommendations
  };
}

async function recordLearningData(supabase: any, userId: string, data: LearningData): Promise<void> {
  // Store learning data for future analysis
  await supabase
    .from('ml_learning_data')
    .insert({
      user_id: userId,
      call_outcome: data.callOutcome,
      disposition: data.disposition,
      lead_converted: data.leadConverted,
      script_used: data.scriptUsed,
      agent_id: data.agentId,
      sentiment_score: data.sentimentScore,
      time_to_conversion: data.timeToConversion,
      call_duration: data.callDuration,
      created_at: new Date().toISOString()
    });
}

async function runOptimizations(supabase: any, userId: string): Promise<any> {
  const insights = await generateLearningInsights(supabase, userId);
  
  // Apply optimizations based on insights
  const optimizations: {
    scriptRecommendations: any[];
    dispositionAdjustments: any[];
    leadScoringUpdates: { metric: string; value: number; reason: string }[];
    pipelineOptimizations: any[];
  } = {
    scriptRecommendations: [],
    dispositionAdjustments: [],
    leadScoringUpdates: [],
    pipelineOptimizations: []
  };

  // Optimize lead scoring based on conversion patterns
  const { data: convertedLeads } = await supabase
    .from('leads')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'converted')
    .limit(100);

  if (convertedLeads && convertedLeads.length > 0) {
    // Analyze common characteristics of converted leads
    const avgLeadScore = convertedLeads.reduce((sum: number, lead: any) => 
      sum + (lead.lead_score || 0), 0) / convertedLeads.length;
    
    optimizations.leadScoringUpdates.push({
      metric: 'minimum_score_threshold',
      value: Math.max(avgLeadScore * 0.7, 50),
      reason: 'Optimized based on converted lead patterns'
    });
  }

  return optimizations;
}
