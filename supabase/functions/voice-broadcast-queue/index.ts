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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, broadcastId, leadIds, phoneNumbers, itemIds } = await req.json();

    // Handle health_check BEFORE any validation that requires broadcastId
    if (action === 'health_check') {
      console.log('[Voice Broadcast Queue] Health check requested');
      return new Response(
        JSON.stringify({
          success: true,
          healthy: true,
          timestamp: new Date().toISOString(),
          function: 'voice-broadcast-queue',
          capabilities: ['add_leads', 'add_numbers', 'clear_queue', 'reset_queue', 'get_stats', 'remove_items', 'cleanup_stuck_calls', 'retry_failed'],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // E.164 phone number normalization helper
    const normalizePhone = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    };

    console.log(`Voice broadcast queue action: ${action} for broadcast ${broadcastId}`);

    // Verify broadcast ownership (only needed for non-health_check actions)
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .maybeSingle();

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

        // Add to queue with normalized phone numbers
        const queueItems = newLeads.map(lead => ({
          broadcast_id: broadcastId,
          lead_id: lead.id,
          phone_number: normalizePhone(lead.phone_number),
          lead_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
          status: 'pending',
          max_attempts: broadcast.max_attempts || 1,
        }));

        const { error: insertError } = await supabase
          .from('broadcast_queue')
          .insert(queueItems);

        if (insertError) throw insertError;

        // Sync broadcast total_leads count with actual queue count
        const { count: actualQueueCount } = await supabase
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId);

        await supabase
          .from('voice_broadcasts')
          .update({ total_leads: actualQueueCount || 0 })
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

        // Normalize phone numbers to E.164 format
        const queueItems = newNumbers.map(number => ({
          broadcast_id: broadcastId,
          phone_number: normalizePhone(number),
          status: 'pending',
          max_attempts: broadcast.max_attempts || 1,
        }));

        const { error: insertError } = await supabase
          .from('broadcast_queue')
          .insert(queueItems);

        if (insertError) throw insertError;

        // Sync broadcast total_leads count with actual queue count
        const { count: actualQueueCount } = await supabase
          .from('broadcast_queue')
          .select('*', { count: 'exact', head: true })
          .eq('broadcast_id', broadcastId);

        await supabase
          .from('voice_broadcasts')
          .update({ total_leads: actualQueueCount || 0 })
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

      case 'reset_queue': {
        // Reset all completed/processed queue items back to pending
        const { data: resetData, error: resetError } = await supabase
          .from('broadcast_queue')
          .update({ 
            status: 'pending', 
            dtmf_pressed: null,
            attempts: 0,
            updated_at: new Date().toISOString()
          })
          .eq('broadcast_id', broadcastId)
          // include "calling" so stuck calls can be reset
          .in('status', ['pending', 'calling', 'completed', 'transferred', 'callback', 'dnc', 'answered', 'failed', 'in_progress', 'busy', 'no_answer'])
          .select();

        if (resetError) throw resetError;

        // Reset broadcast stats
        await supabase
          .from('voice_broadcasts')
          .update({
            calls_made: 0,
            calls_answered: 0,
            transfers_completed: 0,
            callbacks_scheduled: 0,
            dnc_requests: 0,
            status: 'draft'
          })
          .eq('id', broadcastId);

        console.log(`Reset ${resetData?.length || 0} queue items to pending for broadcast ${broadcastId}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            reset_count: resetData?.length || 0,
            message: `${resetData?.length || 0} items reset to pending` 
          }),
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

      case 'remove_items': {
        // itemIds is already parsed from the initial request body at the top
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
          throw new Error('No item IDs provided');
        }

        // Only allow removing items that belong to this broadcast
        const { data: removed, error: removeError } = await supabase
          .from('broadcast_queue')
          .delete()
          .eq('broadcast_id', broadcastId)
          .in('id', itemIds)
          .select('id');

        if (removeError) throw removeError;

        // Update total_leads count
        const removedCount = removed?.length || 0;
        if (removedCount > 0) {
          await supabase
            .from('voice_broadcasts')
            .update({ total_leads: Math.max(0, (broadcast.total_leads || 0) - removedCount) })
            .eq('id', broadcastId);
        }

        console.log(`Removed ${removedCount} items from broadcast ${broadcastId}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            removed: removedCount,
            message: `${removedCount} item(s) removed from queue`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'cleanup_stuck_calls': {
        // Find items stuck in 'calling' status for more than 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        
        const { data: stuckItems, error: stuckError } = await supabase
          .from('broadcast_queue')
          .select('id, attempts, max_attempts')
          .eq('broadcast_id', broadcastId)
          .eq('status', 'calling')
          .lt('updated_at', fiveMinutesAgo);

        if (stuckError) throw stuckError;

        if (!stuckItems || stuckItems.length === 0) {
          return new Response(
            JSON.stringify({ success: true, cleaned: 0, message: 'No stuck calls found' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Reset stuck items - if max attempts reached, mark as failed, otherwise pending
        let resetToPending = 0;
        let markedFailed = 0;

        for (const item of stuckItems) {
          const newAttempts = (item.attempts || 0);
          const maxAttempts = item.max_attempts || 1;
          const newStatus = newAttempts >= maxAttempts ? 'failed' : 'pending';
          
          await supabase
            .from('broadcast_queue')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id);

          if (newStatus === 'failed') {
            markedFailed++;
          } else {
            resetToPending++;
          }
        }

        console.log(`Cleaned up ${stuckItems.length} stuck calls: ${resetToPending} reset, ${markedFailed} failed`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            cleaned: stuckItems.length,
            reset_to_pending: resetToPending,
            marked_failed: markedFailed,
            message: `Cleaned ${stuckItems.length} stuck call(s)`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'retry_failed': {
        // Reset all failed items back to pending
        const { data: failedItems, error: failedError } = await supabase
          .from('broadcast_queue')
          .update({ 
            status: 'pending',
            attempts: 0,
            updated_at: new Date().toISOString()
          })
          .eq('broadcast_id', broadcastId)
          .eq('status', 'failed')
          .select();

        if (failedError) throw failedError;

        console.log(`Reset ${failedItems?.length || 0} failed items to pending`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            retried: failedItems?.length || 0,
            message: `${failedItems?.length || 0} failed item(s) reset for retry`
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
