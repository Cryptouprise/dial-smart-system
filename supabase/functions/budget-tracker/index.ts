import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TwilioUsageRecord {
  category: string;
  count: string;
  price: string;
  usage: string;
}

interface RetellUsageRecord {
  total_minutes: number;
  total_cost: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();
    console.log(`Budget tracker action: ${action}`, params);

    switch (action) {
      case 'fetch_usage':
        return await fetchUsageFromProviders(supabase, user.id, params);
      
      case 'get_spending_summary':
        return await getSpendingSummary(supabase, user.id, params);
      
      case 'check_budget':
        return await checkBudgetAndAlert(supabase, user.id, params);
      
      case 'update_budget_settings':
        return await updateBudgetSettings(supabase, user.id, params);
      
      case 'acknowledge_alert':
        return await acknowledgeAlert(supabase, user.id, params);
      
      case 'toggle_pause':
        return await togglePause(supabase, user.id, params);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: unknown) {
    console.error('Budget tracker error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchUsageFromProviders(supabase: any, userId: string, params: any) {
  const { startDate, endDate } = params;
  const results: any = { twilio: null, retell: null, errors: [] };

  // Get user credentials
  const { data: credentials } = await supabase
    .from('user_credentials')
    .select('service_name, credential_key, credential_value_encrypted')
    .eq('user_id', userId);

  const credMap = new Map();
  credentials?.forEach((c: any) => {
    if (!credMap.has(c.service_name)) credMap.set(c.service_name, {});
    credMap.get(c.service_name)[c.credential_key] = c.credential_value_encrypted;
  });

  // Fetch Twilio usage
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  
  if (twilioAccountSid && twilioAuthToken) {
    try {
      const twilioUsage = await fetchTwilioUsage(
        twilioAccountSid,
        twilioAuthToken,
        startDate,
        endDate
      );
      results.twilio = twilioUsage;
    } catch (error: unknown) {
      console.error('Twilio usage fetch error:', error);
      results.errors.push({ provider: 'twilio', error: (error as Error).message });
    }
  }

  // Fetch Retell usage
  const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
  if (retellApiKey) {
    try {
      const retellUsage = await fetchRetellUsage(retellApiKey, startDate, endDate);
      results.retell = retellUsage;
    } catch (error: unknown) {
      console.error('Retell usage fetch error:', error);
      results.errors.push({ provider: 'retell', error: (error as Error).message });
    }
  }

  // Update spending summaries
  await updateSpendingSummaries(supabase, userId, results, startDate);

  return new Response(
    JSON.stringify({ success: true, usage: results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function fetchTwilioUsage(accountSid: string, authToken: string, startDate: string, endDate: string) {
  const auth = btoa(`${accountSid}:${authToken}`);
  
  // Fetch voice usage
  const voiceUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records.json?Category=calls&StartDate=${startDate}&EndDate=${endDate}`;
  const voiceResponse = await fetch(voiceUrl, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  
  if (!voiceResponse.ok) {
    throw new Error(`Twilio API error: ${voiceResponse.statusText}`);
  }
  
  const voiceData = await voiceResponse.json();
  
  // Fetch SMS usage
  const smsUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records.json?Category=sms&StartDate=${startDate}&EndDate=${endDate}`;
  const smsResponse = await fetch(smsUrl, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  
  const smsData = await smsResponse.json();
  
  // Calculate totals
  let totalVoiceCost = 0;
  let totalSmsCost = 0;
  let totalMinutes = 0;
  let totalSmsCount = 0;
  
  voiceData.usage_records?.forEach((record: TwilioUsageRecord) => {
    totalVoiceCost += parseFloat(record.price || '0');
    totalMinutes += parseFloat(record.usage || '0');
  });
  
  smsData.usage_records?.forEach((record: TwilioUsageRecord) => {
    totalSmsCost += parseFloat(record.price || '0');
    totalSmsCount += parseInt(record.count || '0');
  });
  
  return {
    voice: {
      cost: totalVoiceCost,
      minutes: totalMinutes,
      records: voiceData.usage_records
    },
    sms: {
      cost: totalSmsCost,
      count: totalSmsCount,
      records: smsData.usage_records
    },
    totalCost: totalVoiceCost + totalSmsCost
  };
}

async function fetchRetellUsage(apiKey: string, startDate: string, endDate: string) {
  // Retell API for usage/billing
  const response = await fetch('https://api.retellai.com/v2/list-calls', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter_criteria: {
        start_timestamp: new Date(startDate).getTime(),
        end_timestamp: new Date(endDate).getTime()
      },
      limit: 1000
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Retell API error: ${errorText}`);
  }

  const data = await response.json();
  
  // Calculate costs - Retell charges per minute
  let totalMinutes = 0;
  let totalCost = 0;
  const RETELL_COST_PER_MINUTE = 0.07; // Approximate Retell cost per minute
  
  data.calls?.forEach((call: any) => {
    const durationMinutes = (call.end_timestamp - call.start_timestamp) / 60000;
    totalMinutes += durationMinutes;
    totalCost += durationMinutes * RETELL_COST_PER_MINUTE;
  });
  
  return {
    totalMinutes,
    totalCost,
    callCount: data.calls?.length || 0,
    calls: data.calls
  };
}

async function updateSpendingSummaries(supabase: any, userId: string, usage: any, date: string) {
  const summaryDate = date || new Date().toISOString().split('T')[0];
  
  const twilioTotal = usage.twilio?.totalCost || 0;
  const retellTotal = usage.retell?.totalCost || 0;
  
  // Upsert global summary (no campaign_id)
  await supabase
    .from('spending_summaries')
    .upsert({
      user_id: userId,
      campaign_id: null,
      summary_date: summaryDate,
      twilio_cost: twilioTotal,
      retell_cost: retellTotal,
      total_cost: twilioTotal + retellTotal,
      call_count: (usage.retell?.callCount || 0),
      sms_count: (usage.twilio?.sms?.count || 0),
      total_duration_seconds: Math.round((usage.retell?.totalMinutes || 0) * 60)
    }, {
      onConflict: 'user_id,campaign_id,summary_date'
    });
}

async function getSpendingSummary(supabase: any, userId: string, params: any) {
  const { period, campaignId, startDate, endDate } = params;
  
  let query = supabase
    .from('spending_summaries')
    .select('*')
    .eq('user_id', userId);
  
  if (campaignId) {
    query = query.eq('campaign_id', campaignId);
  }
  
  if (period === 'daily') {
    query = query.eq('summary_date', new Date().toISOString().split('T')[0]);
  } else if (period === 'monthly') {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    query = query.gte('summary_date', firstOfMonth.toISOString().split('T')[0]);
  } else if (startDate && endDate) {
    query = query.gte('summary_date', startDate).lte('summary_date', endDate);
  }
  
  const { data, error } = await query.order('summary_date', { ascending: false });
  
  if (error) throw error;
  
  // Aggregate totals
  const totals = {
    twilio: 0,
    retell: 0,
    elevenlabs: 0,
    total: 0,
    callCount: 0,
    smsCount: 0,
    durationSeconds: 0
  };
  
  data?.forEach((summary: any) => {
    totals.twilio += parseFloat(summary.twilio_cost || 0);
    totals.retell += parseFloat(summary.retell_cost || 0);
    totals.elevenlabs += parseFloat(summary.elevenlabs_cost || 0);
    totals.total += parseFloat(summary.total_cost || 0);
    totals.callCount += summary.call_count || 0;
    totals.smsCount += summary.sms_count || 0;
    totals.durationSeconds += summary.total_duration_seconds || 0;
  });
  
  return new Response(
    JSON.stringify({ success: true, summaries: data, totals }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function checkBudgetAndAlert(supabase: any, userId: string, params: any) {
  const { campaignId } = params;
  
  // Get budget settings
  const { data: budgetSettings } = await supabase
    .from('budget_settings')
    .select('*')
    .eq('user_id', userId)
    .is('campaign_id', campaignId || null)
    .maybeSingle();
  
  if (!budgetSettings) {
    return new Response(
      JSON.stringify({ success: true, withinBudget: true, message: 'No budget set' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  // Get current spending
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  
  // Daily spending
  const { data: dailySummary } = await supabase
    .from('spending_summaries')
    .select('total_cost')
    .eq('user_id', userId)
    .is('campaign_id', campaignId || null)
    .eq('summary_date', today)
    .maybeSingle();
  
  // Monthly spending
  const { data: monthlySummaries } = await supabase
    .from('spending_summaries')
    .select('total_cost')
    .eq('user_id', userId)
    .is('campaign_id', campaignId || null)
    .gte('summary_date', firstOfMonth.toISOString().split('T')[0]);
  
  const dailySpent = parseFloat(dailySummary?.total_cost || 0);
  const monthlySpent = monthlySummaries?.reduce((sum: number, s: any) => sum + parseFloat(s.total_cost || 0), 0) || 0;
  
  const alerts: any[] = [];
  let shouldPause = false;
  
  // Check daily limit
  if (budgetSettings.daily_limit) {
    const dailyPercent = (dailySpent / budgetSettings.daily_limit) * 100;
    
    if (dailyPercent >= 100) {
      shouldPause = budgetSettings.auto_pause_enabled;
      alerts.push({
        type: 'daily_exceeded',
        percent: dailyPercent,
        spent: dailySpent,
        limit: budgetSettings.daily_limit
      });
    } else if (dailyPercent >= budgetSettings.alert_threshold_percent) {
      alerts.push({
        type: 'daily_warning',
        percent: dailyPercent,
        spent: dailySpent,
        limit: budgetSettings.daily_limit
      });
    }
  }
  
  // Check monthly limit
  if (budgetSettings.monthly_limit) {
    const monthlyPercent = (monthlySpent / budgetSettings.monthly_limit) * 100;
    
    if (monthlyPercent >= 100) {
      shouldPause = budgetSettings.auto_pause_enabled;
      alerts.push({
        type: 'monthly_exceeded',
        percent: monthlyPercent,
        spent: monthlySpent,
        limit: budgetSettings.monthly_limit
      });
    } else if (monthlyPercent >= budgetSettings.alert_threshold_percent) {
      alerts.push({
        type: 'monthly_warning',
        percent: monthlyPercent,
        spent: monthlySpent,
        limit: budgetSettings.monthly_limit
      });
    }
  }
  
  // Create alerts in database
  for (const alert of alerts) {
    await supabase.from('budget_alerts').insert({
      user_id: userId,
      budget_setting_id: budgetSettings.id,
      alert_type: alert.type,
      threshold_percent: Math.round(alert.percent),
      amount_spent: alert.spent,
      budget_limit: alert.limit,
      message: `Budget ${alert.type.includes('exceeded') ? 'exceeded' : 'warning'}: ${alert.percent.toFixed(1)}% of ${alert.type.includes('daily') ? 'daily' : 'monthly'} limit used ($${alert.spent.toFixed(2)} / $${alert.limit.toFixed(2)})`
    });
  }
  
  // Auto-pause if needed
  if (shouldPause && !budgetSettings.is_paused) {
    await supabase
      .from('budget_settings')
      .update({
        is_paused: true,
        paused_at: new Date().toISOString(),
        pause_reason: 'Budget limit exceeded'
      })
      .eq('id', budgetSettings.id);
    
    // Also pause associated campaigns
    if (campaignId) {
      await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId);
    }
  }
  
  return new Response(
    JSON.stringify({
      success: true,
      withinBudget: !shouldPause,
      dailySpent,
      monthlySpent,
      dailyLimit: budgetSettings.daily_limit,
      monthlyLimit: budgetSettings.monthly_limit,
      alerts,
      isPaused: shouldPause || budgetSettings.is_paused
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function updateBudgetSettings(supabase: any, userId: string, params: any) {
  const { campaignId, dailyLimit, monthlyLimit, alertThreshold, autoPause } = params;
  
  const { data, error } = await supabase
    .from('budget_settings')
    .upsert({
      user_id: userId,
      campaign_id: campaignId || null,
      daily_limit: dailyLimit,
      monthly_limit: monthlyLimit,
      alert_threshold_percent: alertThreshold || 80,
      auto_pause_enabled: autoPause !== false
    }, {
      onConflict: 'user_id,campaign_id'
    })
    .select()
    .maybeSingle();
  
  if (error) throw error;
  
  return new Response(
    JSON.stringify({ success: true, settings: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function acknowledgeAlert(supabase: any, userId: string, params: any) {
  const { alertId, alertAction } = params;
  
  const { error } = await supabase
    .from('budget_alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      action_taken: alertAction
    })
    .eq('id', alertId)
    .eq('user_id', userId);
  
  if (error) throw error;
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function togglePause(supabase: any, userId: string, params: any) {
  const { budgetSettingId, pause, campaignId } = params;
  
  // Update budget settings
  await supabase
    .from('budget_settings')
    .update({
      is_paused: pause,
      paused_at: pause ? new Date().toISOString() : null,
      pause_reason: pause ? 'Manually paused' : null
    })
    .eq('id', budgetSettingId)
    .eq('user_id', userId);
  
  // Also update campaign status if provided
  if (campaignId) {
    await supabase
      .from('campaigns')
      .update({ status: pause ? 'paused' : 'active' })
      .eq('id', campaignId)
      .eq('user_id', userId);
  }
  
  return new Response(
    JSON.stringify({ success: true, isPaused: pause }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
