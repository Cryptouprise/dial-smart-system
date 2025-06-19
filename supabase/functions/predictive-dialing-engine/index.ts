
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DialingRequest {
  campaignId: string;
  action: 'start' | 'stop' | 'status';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    if (req.method === 'POST') {
      const { campaignId, action }: DialingRequest = await req.json();

      console.log(`Dialing engine action: ${action} for campaign ${campaignId}`);

      if (action === 'start') {
        // Get campaign details
        const { data: campaign, error: campaignError } = await supabaseClient
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .eq('user_id', user.id)
          .single();

        if (campaignError || !campaign) {
          return new Response(JSON.stringify({ error: 'Campaign not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get leads for this campaign
        const { data: campaignLeads, error: leadsError } = await supabaseClient
          .from('campaign_leads')
          .select(`
            lead_id,
            leads (*)
          `)
          .eq('campaign_id', campaignId);

        if (leadsError) {
          console.error('Leads fetch error:', leadsError);
          return new Response(JSON.stringify({ error: 'Failed to fetch leads' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Create dialing queue entries
        const queueEntries = campaignLeads?.map(cl => ({
          campaign_id: campaignId,
          lead_id: cl.lead_id,
          phone_number: cl.leads?.phone_number || '',
          priority: cl.leads?.priority || 1,
          max_attempts: campaign.max_attempts || 3,
          scheduled_at: new Date().toISOString()
        })) || [];

        if (queueEntries.length > 0) {
          const { error: queueError } = await supabaseClient
            .from('dialing_queues')
            .insert(queueEntries);

          if (queueError) {
            console.error('Queue creation error:', queueError);
            return new Response(JSON.stringify({ error: 'Failed to create dialing queue' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }

        // Update campaign status
        await supabaseClient
          .from('campaigns')
          .update({ status: 'active' })
          .eq('id', campaignId);

        console.log(`Dialing started for campaign ${campaignId} with ${queueEntries.length} leads`);

        return new Response(JSON.stringify({
          success: true,
          message: 'Dialing started',
          leads_queued: queueEntries.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'stop') {
        // Update campaign status
        await supabaseClient
          .from('campaigns')
          .update({ status: 'paused' })
          .eq('id', campaignId);

        // Update pending queue entries
        await supabaseClient
          .from('dialing_queues')
          .update({ status: 'paused' })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending');

        return new Response(JSON.stringify({
          success: true,
          message: 'Dialing stopped'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (action === 'status') {
        // Get current dialing status
        const { data: queueStats } = await supabaseClient
          .from('dialing_queues')
          .select('status')
          .eq('campaign_id', campaignId);

        const stats = queueStats?.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        return new Response(JSON.stringify({
          campaign_id: campaignId,
          queue_stats: stats
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (req.method === 'GET') {
      // Get active dialing queues
      const { data: queues, error } = await supabaseClient
        .from('dialing_queues')
        .select(`
          *,
          campaigns (*),
          leads (*)
        `)
        .in('status', ['pending', 'calling'])
        .order('priority', { ascending: false })
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Queue fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch queue' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ queues }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
