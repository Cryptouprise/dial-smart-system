import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// GHL API rate limiting
const BATCH_SIZE = 50;
const DELAY_BETWEEN_REQUESTS_MS = 200; // 5 requests per second
const MAX_RETRIES = 3;

// Map call outcomes to GHL tags
const OUTCOME_TO_TAG: Record<string, string> = {
  'answered': 'broadcast_answered',
  'voicemail': 'broadcast_voicemail_left',
  'no_answer': 'broadcast_no_answer',
  'busy': 'broadcast_busy',
  'failed': 'broadcast_failed',
  'completed': 'broadcast_completed',
  'transferred': 'broadcast_transferred',
};

interface GHLCredentials {
  access_token: string;
  location_id: string;
}

interface PendingUpdate {
  id: string;
  user_id: string;
  ghl_contact_id: string;
  broadcast_id: string | null;
  broadcast_name: string | null;
  call_outcome: string;
  call_duration_seconds: number | null;
  call_timestamp: string | null;
  dtmf_pressed: string | null;
  callback_requested: boolean;
  callback_time: string | null;
  retry_count: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get GHL credentials for a user
async function getGHLCredentials(supabase: any, userId: string): Promise<GHLCredentials | null> {
  const { data, error } = await supabase
    .from('user_credentials')
    .select('credentials')
    .eq('user_id', userId)
    .eq('provider', 'gohighlevel')
    .maybeSingle();

  if (error || !data?.credentials) {
    console.error(`[GHL Batch] No GHL credentials for user ${userId}`);
    return null;
  }

  const creds = data.credentials;
  if (!creds.access_token || !creds.location_id) {
    console.error(`[GHL Batch] Incomplete GHL credentials for user ${userId}`);
    return null;
  }

  return {
    access_token: creds.access_token,
    location_id: creds.location_id,
  };
}

// Update a GHL contact with broadcast outcome
async function updateGHLContact(
  credentials: GHLCredentials,
  update: PendingUpdate
): Promise<{ success: boolean; error?: string }> {
  const { access_token, location_id } = credentials;
  const contactId = update.ghl_contact_id;

  try {
    // 1. Add tag for the outcome
    const tagToAdd = OUTCOME_TO_TAG[update.call_outcome] || 'broadcast_completed';
    
    const tagResponse = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}/tags`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ tags: [tagToAdd] }),
      }
    );

    if (!tagResponse.ok) {
      const errorText = await tagResponse.text();
      console.error(`[GHL Batch] Failed to add tag: ${errorText}`);
      // Don't fail completely - continue with custom fields
    } else {
      console.log(`[GHL Batch] Added tag ${tagToAdd} to contact ${contactId}`);
    }

    // 2. Update custom fields
    const customFields: Record<string, string> = {
      'last_broadcast_date': update.call_timestamp || new Date().toISOString(),
      'broadcast_outcome': update.call_outcome,
    };

    if (update.broadcast_name) {
      customFields['broadcast_name'] = update.broadcast_name;
    }

    if (update.dtmf_pressed) {
      customFields['broadcast_dtmf_pressed'] = update.dtmf_pressed;
    }

    if (update.callback_requested !== undefined) {
      customFields['broadcast_callback_requested'] = update.callback_requested ? 'true' : 'false';
    }

    if (update.callback_time) {
      customFields['broadcast_callback_time'] = update.callback_time;
    }

    const updateResponse = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ customFields }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[GHL Batch] Failed to update custom fields: ${errorText}`);
      return { success: false, error: `Custom fields update failed: ${errorText}` };
    }

    // 3. Add activity note
    const durationText = update.call_duration_seconds 
      ? `${Math.floor(update.call_duration_seconds / 60)}m ${update.call_duration_seconds % 60}s`
      : 'N/A';

    const noteBody = [
      `🎙️ Voice Broadcast: ${update.broadcast_name || 'Unnamed'}`,
      `📊 Outcome: ${update.call_outcome}`,
      update.dtmf_pressed ? `📱 DTMF Pressed: ${update.dtmf_pressed}` : null,
      update.callback_requested ? `📞 Callback Requested: Yes` : null,
      update.callback_time ? `🕐 Callback Time: ${new Date(update.callback_time).toLocaleString()}` : null,
      `⏱️ Duration: ${durationText}`,
      `📅 Date: ${update.call_timestamp ? new Date(update.call_timestamp).toLocaleString() : 'N/A'}`,
    ].filter(Boolean).join('\n');

    const noteResponse = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}/notes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({ body: noteBody }),
      }
    );

    if (!noteResponse.ok) {
      const errorText = await noteResponse.text();
      console.warn(`[GHL Batch] Failed to add note (non-critical): ${errorText}`);
      // Notes are non-critical, still mark as success
    }

    console.log(`[GHL Batch] ✅ Updated contact ${contactId} with outcome ${update.call_outcome}`);
    return { success: true };

  } catch (error: any) {
    console.error(`[GHL Batch] Error updating contact ${contactId}:`, error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const { action, broadcast_id, user_id } = body;

    console.log(`[GHL Batch] Action: ${action}, Broadcast: ${broadcast_id || 'all'}`);

    switch (action) {
      case 'process_broadcast': {
        // Process all pending updates for a specific broadcast
        if (!broadcast_id) {
          return new Response(JSON.stringify({ error: 'Missing broadcast_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: pendingUpdates, error: fetchError } = await supabase
          .from('ghl_pending_updates')
          .select('*')
          .eq('broadcast_id', broadcast_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(BATCH_SIZE);

        if (fetchError) {
          console.error('[GHL Batch] Error fetching pending updates:', fetchError);
          throw fetchError;
        }

        if (!pendingUpdates || pendingUpdates.length === 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            processed: 0,
            message: 'No pending updates for this broadcast'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[GHL Batch] Processing ${pendingUpdates.length} updates for broadcast ${broadcast_id}`);

        // Group by user_id to batch credential lookups
        const updatesByUser = new Map<string, PendingUpdate[]>();
        for (const update of pendingUpdates) {
          const existing = updatesByUser.get(update.user_id) || [];
          existing.push(update);
          updatesByUser.set(update.user_id, existing);
        }

        let totalProcessed = 0;
        let totalFailed = 0;
        const errors: string[] = [];

        for (const [userId, updates] of updatesByUser) {
          // Get GHL credentials for this user
          const credentials = await getGHLCredentials(supabase, userId);
          
          if (!credentials) {
            // Mark all updates for this user as failed
            await supabase
              .from('ghl_pending_updates')
              .update({
                status: 'failed',
                error_message: 'No GHL credentials configured',
                processed_at: new Date().toISOString(),
              })
              .in('id', updates.map(u => u.id));
            
            totalFailed += updates.length;
            errors.push(`User ${userId}: No GHL credentials`);
            continue;
          }

          // Process each update
          for (const update of updates) {
            const result = await updateGHLContact(credentials, update);
            
            await supabase
              .from('ghl_pending_updates')
              .update({
                status: result.success ? 'sent' : 'failed',
                error_message: result.error || null,
                processed_at: new Date().toISOString(),
                retry_count: update.retry_count + (result.success ? 0 : 1),
              })
              .eq('id', update.id);

            // Also update the broadcast_queue ghl_callback_status
            if (update.queue_item_id) {
              await supabase
                .from('broadcast_queue')
                .update({
                  ghl_callback_status: result.success ? 'sent' : 'failed',
                })
                .eq('id', update.queue_item_id);
            }

            if (result.success) {
              totalProcessed++;
            } else {
              totalFailed++;
              errors.push(`Contact ${update.ghl_contact_id}: ${result.error}`);
            }

            // Rate limiting delay
            await sleep(DELAY_BETWEEN_REQUESTS_MS);
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          processed: totalProcessed,
          failed: totalFailed,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error list
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'process_pending': {
        // Process all pending updates across all users (for scheduled runs)
        const query = supabase
          .from('ghl_pending_updates')
          .select('*')
          .eq('status', 'pending')
          .lt('retry_count', MAX_RETRIES)
          .order('created_at', { ascending: true })
          .limit(BATCH_SIZE);

        if (user_id) {
          query.eq('user_id', user_id);
        }

        const { data: pendingUpdates, error: fetchError } = await query;

        if (fetchError) {
          console.error('[GHL Batch] Error fetching pending updates:', fetchError);
          throw fetchError;
        }

        if (!pendingUpdates || pendingUpdates.length === 0) {
          return new Response(JSON.stringify({ 
            success: true, 
            processed: 0,
            message: 'No pending updates to process'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[GHL Batch] Processing ${pendingUpdates.length} pending updates`);

        // Same processing logic as above
        const updatesByUser = new Map<string, PendingUpdate[]>();
        for (const update of pendingUpdates) {
          const existing = updatesByUser.get(update.user_id) || [];
          existing.push(update);
          updatesByUser.set(update.user_id, existing);
        }

        let totalProcessed = 0;
        let totalFailed = 0;

        for (const [userId, updates] of updatesByUser) {
          const credentials = await getGHLCredentials(supabase, userId);
          
          if (!credentials) {
            await supabase
              .from('ghl_pending_updates')
              .update({
                status: 'failed',
                error_message: 'No GHL credentials configured',
                processed_at: new Date().toISOString(),
              })
              .in('id', updates.map(u => u.id));
            
            totalFailed += updates.length;
            continue;
          }

          for (const update of updates) {
            const result = await updateGHLContact(credentials, update);
            
            await supabase
              .from('ghl_pending_updates')
              .update({
                status: result.success ? 'sent' : 'failed',
                error_message: result.error || null,
                processed_at: new Date().toISOString(),
                retry_count: update.retry_count + (result.success ? 0 : 1),
              })
              .eq('id', update.id);

            if (update.queue_item_id) {
              await supabase
                .from('broadcast_queue')
                .update({
                  ghl_callback_status: result.success ? 'sent' : 'failed',
                })
                .eq('id', update.queue_item_id);
            }

            if (result.success) {
              totalProcessed++;
            } else {
              totalFailed++;
            }

            await sleep(DELAY_BETWEEN_REQUESTS_MS);
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          processed: totalProcessed,
          failed: totalFailed,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get_status': {
        // Get status of pending updates for a broadcast
        if (!broadcast_id) {
          return new Response(JSON.stringify({ error: 'Missing broadcast_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: statusCounts, error: countError } = await supabase
          .from('ghl_pending_updates')
          .select('status')
          .eq('broadcast_id', broadcast_id);

        if (countError) {
          throw countError;
        }

        const counts = {
          pending: 0,
          processing: 0,
          sent: 0,
          failed: 0,
        };

        for (const row of statusCounts || []) {
          if (row.status in counts) {
            counts[row.status as keyof typeof counts]++;
          }
        }

        return new Response(JSON.stringify({ 
          success: true,
          broadcast_id,
          counts,
          total: (statusCounts || []).length,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: `Unknown action: ${action}`,
          valid_actions: ['process_broadcast', 'process_pending', 'get_status']
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error: unknown) {
    console.error('[GHL Batch] Unhandled error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
