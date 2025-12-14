/**
 * Automation Scheduler Edge Function
 * Processes campaign automation rules and queues calls based on time windows
 * Should be called via pg_cron every minute
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationRule {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  rule_type: string;
  enabled: boolean;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  days_of_week: string[] | null;
  time_windows: Array<{ start: string; end: string }> | null;
  priority: number;
}

function getCurrentDayOfWeek(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

function isWithinTimeWindow(timeWindows: Array<{ start: string; end: string }> | null): boolean {
  if (!timeWindows || timeWindows.length === 0) return true;
  
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  
  return timeWindows.some(window => {
    return currentTime >= window.start && currentTime <= window.end;
  });
}

async function processRule(supabase: any, rule: AutomationRule) {
  console.log(`[Scheduler] Processing rule: ${rule.name}`);
  
  const currentDay = getCurrentDayOfWeek();
  
  // Check if today is an active day
  if (rule.days_of_week && !rule.days_of_week.includes(currentDay)) {
    console.log(`[Scheduler] Rule ${rule.name} not active on ${currentDay}`);
    return { processed: 0, skipped: true, reason: 'not_active_day' };
  }
  
  // Check if within time window
  if (!isWithinTimeWindow(rule.time_windows)) {
    console.log(`[Scheduler] Rule ${rule.name} outside time window`);
    return { processed: 0, skipped: true, reason: 'outside_time_window' };
  }
  
  // Get leads to process based on rule type and conditions
  let leadsQuery = supabase
    .from('leads')
    .select('id, phone_number, status, last_contacted_at')
    .eq('user_id', rule.user_id)
    .eq('do_not_call', false)
    .in('status', ['new', 'contacted', 'callback']);
  
  // Apply campaign filter if set
  if (rule.campaign_id) {
    const { data: campaignLeads } = await supabase
      .from('campaign_leads')
      .select('lead_id')
      .eq('campaign_id', rule.campaign_id);
    
    if (campaignLeads && campaignLeads.length > 0) {
      const leadIds = campaignLeads.map((cl: any) => cl.lead_id);
      leadsQuery = leadsQuery.in('id', leadIds);
    }
  }
  
  const { data: leads, error: leadsError } = await leadsQuery.limit(50);
  
  if (leadsError) {
    console.error(`[Scheduler] Error fetching leads:`, leadsError);
    return { processed: 0, error: leadsError.message };
  }
  
  if (!leads || leads.length === 0) {
    console.log(`[Scheduler] No leads to process for rule ${rule.name}`);
    return { processed: 0, skipped: true, reason: 'no_leads' };
  }
  
  // Apply conditions
  const maxCallsPerDay = rule.actions?.max_calls_per_day || 3;
  const noAnswerThreshold = rule.conditions?.no_answer_count || 10;
  
  let processed = 0;
  
  for (const lead of leads) {
    // Check call count for today
    const today = new Date().toISOString().split('T')[0];
    const { count: todayCalls } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .gte('created_at', `${today}T00:00:00`);
    
    if ((todayCalls || 0) >= maxCallsPerDay) {
      console.log(`[Scheduler] Lead ${lead.id} already called ${todayCalls} times today`);
      continue;
    }
    
    // Check total no-answer count
    const { count: noAnswerCount } = await supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .eq('outcome', 'no_answer');
    
    if ((noAnswerCount || 0) >= noAnswerThreshold) {
      console.log(`[Scheduler] Lead ${lead.id} exceeded no-answer threshold`);
      continue;
    }
    
    // Queue the call
    const campaignId = rule.campaign_id;
    if (campaignId) {
      // Check if already in queue
      const { data: existing } = await supabase
        .from('dialing_queues')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .maybeSingle();
      
      if (existing) {
        console.log(`[Scheduler] Lead ${lead.id} already in queue`);
        continue;
      }
      
      const { error: queueError } = await supabase
        .from('dialing_queues')
        .insert({
          campaign_id: campaignId,
          lead_id: lead.id,
          phone_number: lead.phone_number,
          priority: rule.priority || 1,
          status: 'pending',
          scheduled_at: new Date().toISOString(),
        });
      
      if (!queueError) {
        processed++;
      } else {
        console.error(`[Scheduler] Error queuing lead ${lead.id}:`, queueError);
      }
    }
  }
  
  console.log(`[Scheduler] Rule ${rule.name} processed ${processed} leads`);
  return { processed, skipped: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Scheduler] Starting automation run at', new Date().toISOString());

    // FIRST: Execute any pending workflow steps
    console.log('[Scheduler] Executing pending workflow steps...');
    let workflowResults = { processed: 0, results: [] as any[] };
    try {
      const workflowResponse = await fetch(`${supabaseUrl}/functions/v1/workflow-executor`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'execute_pending' }),
      });
      
      if (workflowResponse.ok) {
        workflowResults = await workflowResponse.json();
        console.log(`[Scheduler] Workflow executor processed ${workflowResults.processed || 0} steps`);
      } else {
        console.error('[Scheduler] Workflow executor error:', workflowResponse.status, await workflowResponse.text());
      }
    } catch (workflowError: any) {
      console.error('[Scheduler] Failed to call workflow-executor:', workflowError.message);
    }

    // THEN: Fetch all enabled automation rules
    const { data: rules, error: rulesError } = await supabase
      .from('campaign_automation_rules')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (rulesError) throw rulesError;

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No active automation rules',
        workflow_steps_processed: workflowResults.processed || 0,
        processed: 0 
      }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`[Scheduler] Found ${rules.length} active rules`);

    const results: Array<{ rule: string; result: any }> = [];

    for (const rule of rules) {
      try {
        const result = await processRule(supabase, rule as AutomationRule);
        results.push({ rule: rule.name, result });
      } catch (e: any) {
        console.error(`[Scheduler] Error processing rule ${rule.name}:`, e);
        results.push({ rule: rule.name, result: { error: e.message } });
      }
    }

    const totalProcessed = results.reduce((sum, r) => sum + (r.result.processed || 0), 0);

    console.log(`[Scheduler] Completed. Total leads processed: ${totalProcessed}`);

    return new Response(JSON.stringify({ 
      message: 'Automation run completed',
      workflow_steps_processed: workflowResults.processed || 0,
      rules_processed: rules.length,
      leads_queued: totalProcessed,
      results
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (error: any) {
    console.error('[Scheduler] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
