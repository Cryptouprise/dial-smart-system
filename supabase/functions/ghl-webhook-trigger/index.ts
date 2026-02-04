import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Track requests per webhook key
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute per key

function checkRateLimit(webhookKey: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(webhookKey);
  
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(webhookKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Normalize phone number to E.164 format
function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\\d+]/g, '');
  
  // If starts with +, keep it; otherwise add +1 for US numbers
  if (!cleaned.startsWith('+')) {
    // Assume US if 10 digits
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned;
}

// Validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Mask webhook key for logging (show first 6 chars only)
function maskWebhookKey(key: string): string {
  if (!key || key.length < 10) return '***';
  return key.substring(0, 6) + '***';
}

interface WebhookRequest {
  action: string;
  webhook_key: string;
  broadcast_id?: string;
  phone?: string;
  name?: string;
  ghl_contact_id?: string;
  email?: string;
  custom_data?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
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

    // Parse request body
    let body: WebhookRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON payload' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, webhook_key, broadcast_id, phone, name, ghl_contact_id, email, custom_data } = body;

    console.log(`[GHL Webhook] Action: ${action}, Key: ${maskWebhookKey(webhook_key)}`);

    // ========================================
    // Validate webhook_key
    // ========================================
    if (!webhook_key || typeof webhook_key !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Missing or invalid webhook_key' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check rate limit
    if (!checkRateLimit(webhook_key)) {
      console.warn(`[GHL Webhook] Rate limit exceeded for key: ${maskWebhookKey(webhook_key)}`);
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Max 100 requests per minute.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find user by webhook_key
    const { data: syncSettings, error: syncError } = await supabase
      .from('ghl_sync_settings')
      .select('user_id')
      .eq('broadcast_webhook_key', webhook_key)
      .maybeSingle();

    if (syncError) {
      console.error('[GHL Webhook] Error finding webhook key:', syncError);
      return new Response(JSON.stringify({ 
        error: 'Database error' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!syncSettings) {
      console.warn(`[GHL Webhook] Invalid webhook key: ${maskWebhookKey(webhook_key)}`);
      return new Response(JSON.stringify({ 
        error: 'Invalid webhook key' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = syncSettings.user_id;
    console.log(`[GHL Webhook] Authenticated user: ${userId}`);

    // ========================================
    // Handle actions
    // ========================================
    switch (action) {
      case 'add_to_broadcast': {
        // Validate required fields
        if (!broadcast_id) {
          return new Response(JSON.stringify({ 
            error: 'Missing broadcast_id' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!isValidUUID(broadcast_id)) {
          return new Response(JSON.stringify({ 
            error: 'Invalid broadcast_id format. Must be a valid UUID.' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!phone) {
          return new Response(JSON.stringify({ 
            error: 'Missing phone number' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Normalize phone number
        const normalizedPhone = normalizePhone(phone);
        if (normalizedPhone.length < 10) {
          return new Response(JSON.stringify({ 
            error: 'Invalid phone number format' 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log(`[GHL Webhook] Adding ${normalizedPhone} to broadcast ${broadcast_id}`);

        // Verify broadcast exists and belongs to user
        const { data: broadcast, error: broadcastError } = await supabase
          .from('voice_broadcasts')
          .select('id, name, status, user_id')
          .eq('id', broadcast_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (broadcastError) {
          console.error('[GHL Webhook] Error finding broadcast:', broadcastError);
          return new Response(JSON.stringify({ 
            error: 'Database error' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        if (!broadcast) {
          return new Response(JSON.stringify({ 
            error: 'Broadcast not found or access denied' 
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if broadcast is in a valid state to accept new contacts
        if (broadcast.status === 'completed' || broadcast.status === 'cancelled') {
          return new Response(JSON.stringify({ 
            error: `Broadcast is ${broadcast.status} and cannot accept new contacts`,
            broadcast_status: broadcast.status
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check DNC list
        const { data: dncEntry, error: dncError } = await supabase
          .from('dnc_list')
          .select('id')
          .eq('user_id', userId)
          .eq('phone_number', normalizedPhone)
          .maybeSingle();

        if (dncError) {
          console.error('[GHL Webhook] Error checking DNC:', dncError);
        }

        if (dncEntry) {
          console.log(`[GHL Webhook] Phone ${normalizedPhone} is on DNC list, skipping`);
          return new Response(JSON.stringify({ 
            success: false,
            skipped: true,
            reason: 'Phone number is on Do Not Call list'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if phone already in queue for this broadcast
        const { data: existingEntry, error: existingError } = await supabase
          .from('broadcast_queue')
          .select('id, status')
          .eq('broadcast_id', broadcast_id)
          .eq('phone_number', normalizedPhone)
          .maybeSingle();

        if (existingError) {
          console.error('[GHL Webhook] Error checking existing entry:', existingError);
        }

        if (existingEntry) {
          console.log(`[GHL Webhook] Phone ${normalizedPhone} already in queue with status ${existingEntry.status}`);
          return new Response(JSON.stringify({ 
            success: true,
            duplicate: true,
            queue_item_id: existingEntry.id,
            status: existingEntry.status,
            message: 'Contact already in broadcast queue'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Insert into broadcast_queue
        const queueEntry = {
          broadcast_id,
          phone_number: normalizedPhone,
          lead_name: name || null,
          ghl_contact_id: ghl_contact_id || null,
          ghl_callback_status: 'pending',
          status: 'pending',
          attempts: 0,
        };

        const { data: insertedQueue, error: insertError } = await supabase
          .from('broadcast_queue')
          .insert(queueEntry)
          .select('id')
          .single();

        if (insertError) {
          console.error('[GHL Webhook] Error inserting queue entry:', insertError);
          return new Response(JSON.stringify({ 
            error: 'Failed to add contact to queue',
            details: insertError.message
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get queue position
        const { count: position } = await supabase
          .from('broadcast_queue')
          .select('id', { count: 'exact', head: true })
          .eq('broadcast_id', broadcast_id)
          .eq('status', 'pending');

        console.log(`[GHL Webhook] ✅ Added ${normalizedPhone} to queue, position: ${position}`);

        return new Response(JSON.stringify({ 
          success: true,
          queue_item_id: insertedQueue.id,
          position: position || 1,
          broadcast_name: broadcast.name,
          broadcast_status: broadcast.status,
          message: 'Contact added to broadcast queue'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'test': {
        // Simple test endpoint to verify webhook is working
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Webhook is working correctly',
          user_id: userId,
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list_broadcasts': {
        // List active broadcasts for this user
        const { data: broadcasts, error: listError } = await supabase
          .from('voice_broadcasts')
          .select('id, name, status, created_at')
          .eq('user_id', userId)
          .in('status', ['draft', 'active', 'paused', 'scheduled'])
          .order('created_at', { ascending: false })
          .limit(20);

        if (listError) {
          console.error('[GHL Webhook] Error listing broadcasts:', listError);
          return new Response(JSON.stringify({ 
            error: 'Failed to list broadcasts' 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ 
          success: true,
          broadcasts: broadcasts || []
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: `Unknown action: ${action}`,
          valid_actions: ['add_to_broadcast', 'test', 'list_broadcasts']
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error: unknown) {
    console.error('[GHL Webhook] Unhandled error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
