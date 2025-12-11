import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, broadcastId, leadIds, phoneNumbers } = await req.json();

    console.log(`Voice broadcast queue action: ${action} for broadcast ${broadcastId}`);

    // Verify broadcast ownership
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .single();

    if (broadcastError || !broadcast) {
      throw new Error('Broadcast not found or access denied');
    }

    switch (action) {
      case 'add_leads': {
        if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
          throw new Error('No leads provided');
        }

        // Fetch leads
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, phone_number, first_name, last_name')
          .in('id', leadIds)
          .eq('user_id', user.id)
          .eq('do_not_call', false);

        if (leadsError) throw leadsError;

        if (!leads || leads.length === 0) {
          throw new Error('No valid leads found');
        }

        // Check for existing queue entries (including completed/processed ones - prevent re-adding)
        const { data: existingQueue } = await supabase
          .from('broadcast_queue')
          .select('lead_id, status')
          .eq('broadcast_id', broadcastId)
          .in('lead_id', leadIds);

        const existingLeadIds = new Set(existingQueue?.map(q => q.lead_id) || []);
        const processedStatuses = ['completed', 'transferred', 'callback', 'dnc', 'answered', 'failed'];
        const processedLeadIds = new Set(
          existingQueue?.filter(q => processedStatuses.includes(q.status)).map(q => q.lead_id) || []
        );

        // Filter out already queued leads (any status - prevents re-running same leads)
        const newLeads = leads.filter(l => !existingLeadIds.has(l.id));

        if (newLeads.length === 0) {
          const alreadyProcessed = processedLeadIds.size;
          return new Response(
            JSON.stringify({ 
              success: true, 
              added: 0, 
              message: alreadyProcessed > 0 
                ? `All ${leadIds.length} leads already processed in this broadcast` 
                : 'All leads already in queue'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Add to queue
        const queueItems = newLeads.map(lead => ({
          broadcast_id: broadcastId,
          lead_id: lead.id,
          phone_number: lead.phone_number,
          lead_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
          status: 'pending',
          max_attempts: broadcast.max_attempts || 1,
        }));

        const { error: insertError } = await supabase
          .from('broadcast_queue')
          .insert(queueItems);

        if (insertError) throw insertError;

        // Update broadcast total leads count
        await supabase
          .from('voice_broadcasts')
          .update({ total_leads: broadcast.total_leads + newLeads.length })
          .eq('id', broadcastId);

        console.log(`Added ${newLeads.length} leads to broadcast queue`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            added: newLeads.length,
            skipped: leads.length - newLeads.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'add_numbers': {
        if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
          throw new Error('No phone numbers provided');
        }

        // Check DNC list
        const { data: dncNumbers } = await supabase
          .from('dnc_list')
          .select('phone_number')
          .eq('user_id', user.id)
          .in('phone_number', phoneNumbers);

        const dncSet = new Set(dncNumbers?.map(d => d.phone_number) || []);
        const validNumbers = phoneNumbers.filter(n => !dncSet.has(n));

        if (validNumbers.length === 0) {
          throw new Error('All numbers are on the DNC list');
        }

        // Check for existing entries
        const { data: existingQueue } = await supabase
          .from('broadcast_queue')
          .select('phone_number')
          .eq('broadcast_id', broadcastId)
          .in('phone_number', validNumbers);

        const existingNumbers = new Set(existingQueue?.map(q => q.phone_number) || []);
        const newNumbers = validNumbers.filter(n => !existingNumbers.has(n));

        if (newNumbers.length === 0) {
          return new Response(
            JSON.stringify({ success: true, added: 0, message: 'All numbers already in queue' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const queueItems = newNumbers.map(number => ({
          broadcast_id: broadcastId,
          phone_number: number,
          status: 'pending',
          max_attempts: broadcast.max_attempts || 1,
        }));

        const { error: insertError } = await supabase
          .from('broadcast_queue')
          .insert(queueItems);

        if (insertError) throw insertError;

        // Update broadcast total leads count
        await supabase
          .from('voice_broadcasts')
          .update({ total_leads: broadcast.total_leads + newNumbers.length })
          .eq('id', broadcastId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            added: newNumbers.length,
            dnc_filtered: phoneNumbers.length - validNumbers.length,
            skipped: validNumbers.length - newNumbers.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'clear_queue': {
        const { error: deleteError } = await supabase
          .from('broadcast_queue')
          .delete()
          .eq('broadcast_id', broadcastId)
          .eq('status', 'pending');

        if (deleteError) throw deleteError;

        return new Response(
          JSON.stringify({ success: true, message: 'Pending queue items cleared' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get_stats': {
        const { data: stats, error: statsError } = await supabase
          .from('broadcast_queue')
          .select('status')
          .eq('broadcast_id', broadcastId);

        if (statsError) throw statsError;

        const statusCounts = (stats || []).reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return new Response(
          JSON.stringify({ 
            success: true, 
            total: stats?.length || 0,
            ...statusCounts,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Voice broadcast queue error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
