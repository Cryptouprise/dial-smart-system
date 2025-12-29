import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/**
 * Inbound Transfer Webhook Handler
 * 
 * This endpoint receives incoming call transfers from external systems like VICIdial
 * with complete client/lead metadata. It creates a transfer record and optionally
 * creates or updates lead records.
 * 
 * Expected webhook payload format:
 * {
 *   "external_call_id": "unique-call-id",
 *   "external_campaign_id": "campaign-123",
 *   "external_list_id": "list-456",
 *   "from_number": "+15551234567",
 *   "to_number": "+15559876543",
 *   "transfer_type": "live",
 *   "client_info": {
 *     "first_name": "John",
 *     "last_name": "Doe",
 *     "email": "john@example.com",
 *     "phone": "+15551234567",
 *     "address": "123 Main St",
 *     "city": "New York",
 *     "state": "NY",
 *     "zip": "10001",
 *     "country": "USA"
 *   },
 *   "transfer_metadata": {
 *     "reason": "Interested in product",
 *     "agent_notes": "Caller asked about pricing",
 *     "disposition": "Hot Lead",
 *     "priority": 10
 *   },
 *   "custom_fields": {
 *     "property_value": "500000",
 *     "loan_amount": "400000",
 *     "any_other_field": "value"
 *   }
 * }
 */

interface InboundTransferPayload {
  external_call_id?: string;
  external_campaign_id?: string;
  external_list_id?: string;
  from_number: string;
  to_number: string;
  transfer_type?: string;
  client_info?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  transfer_metadata?: {
    reason?: string;
    agent_notes?: string;
    disposition?: string;
    priority?: number;
  };
  custom_fields?: Record<string, any>;
  source_system?: string;
}

function validatePayload(payload: any): { valid: boolean; error?: string; data?: InboundTransferPayload } {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  // Required fields
  if (!payload.from_number || typeof payload.from_number !== 'string') {
    return { valid: false, error: 'Missing or invalid from_number' };
  }

  if (!payload.to_number || typeof payload.to_number !== 'string') {
    return { valid: false, error: 'Missing or invalid to_number' };
  }

  // Validate phone number format (E.164 or common formats)
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  const cleanFrom = payload.from_number.replace(/[\s\-\(\)]/g, '');
  const cleanTo = payload.to_number.replace(/[\s\-\(\)]/g, '');

  if (!phoneRegex.test(cleanFrom)) {
    return { valid: false, error: 'Invalid from_number format' };
  }

  if (!phoneRegex.test(cleanTo)) {
    return { valid: false, error: 'Invalid to_number format' };
  }

  // Validate transfer_type if provided
  if (payload.transfer_type && !['live', 'warm', 'cold'].includes(payload.transfer_type)) {
    return { valid: false, error: 'Invalid transfer_type: must be live, warm, or cold' };
  }

  // Validate priority if provided
  if (payload.transfer_metadata?.priority !== undefined) {
    const priority = payload.transfer_metadata.priority;
    if (typeof priority !== 'number' || priority < 0 || priority > 10) {
      return { valid: false, error: 'Invalid priority: must be a number between 0 and 10' };
    }
  }

  return { valid: true, data: payload as InboundTransferPayload };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('INBOUND_TRANSFER_WEBHOOK_SECRET');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    // Optional webhook secret verification
    if (webhookSecret) {
      const providedSecret = req.headers.get('x-webhook-secret');
      if (providedSecret !== webhookSecret) {
        console.error('Invalid webhook secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse and validate payload
    let rawPayload: any;
    try {
      rawPayload = await req.json();
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON payload',
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Received inbound transfer webhook:', JSON.stringify({
      external_call_id: rawPayload.external_call_id,
      from_number: rawPayload.from_number,
      to_number: rawPayload.to_number,
    }));

    const validation = validatePayload(rawPayload);
    if (!validation.valid) {
      console.error('Validation failed:', validation.error);
      return new Response(JSON.stringify({ 
        error: validation.error,
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload = validation.data!;

    // Find user by phone number (the to_number should be a number they own)
    const { data: phoneRecord, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('user_id, id, number')
      .eq('number', payload.to_number)
      .maybeSingle();

    if (phoneError) {
      console.error('Error finding phone number:', phoneError);
    }

    if (!phoneRecord) {
      console.error(`Phone number ${payload.to_number} not found in system`);
      return new Response(JSON.stringify({ 
        error: 'Phone number not configured in system',
        message: `The destination number ${payload.to_number} is not registered. Please add it to your account first.`,
        timestamp: new Date().toISOString()
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = phoneRecord.user_id;

    // Try to find or create lead record
    let leadId: string | null = null;
    
    if (payload.client_info && (payload.client_info.phone || payload.client_info.email)) {
      leadId = await findOrCreateLead(supabase, userId, payload);
    }

    // Create inbound transfer record
    const transferData = {
      user_id: userId,
      external_call_id: payload.external_call_id,
      external_campaign_id: payload.external_campaign_id,
      external_list_id: payload.external_list_id,
      from_number: payload.from_number,
      to_number: payload.to_number,
      transfer_type: payload.transfer_type || 'live',
      lead_id: leadId,
      client_first_name: payload.client_info?.first_name,
      client_last_name: payload.client_info?.last_name,
      client_email: payload.client_info?.email,
      client_phone: payload.client_info?.phone,
      client_address: payload.client_info?.address,
      client_city: payload.client_info?.city,
      client_state: payload.client_info?.state,
      client_zip: payload.client_info?.zip,
      client_country: payload.client_info?.country,
      transfer_reason: payload.transfer_metadata?.reason,
      agent_notes: payload.transfer_metadata?.agent_notes,
      disposition: payload.transfer_metadata?.disposition,
      priority: payload.transfer_metadata?.priority || 0,
      custom_fields: payload.custom_fields || {},
      source_system: payload.source_system || 'vicidial',
      webhook_payload: rawPayload,
      status: 'pending',
    };

    const { data: transfer, error: transferError } = await supabase
      .from('inbound_transfers')
      .insert(transferData)
      .select()
      .single();

    if (transferError) {
      console.error('Error creating transfer record:', transferError);
      throw new Error(`Failed to create transfer record: ${transferError.message}`);
    }

    console.log('Inbound transfer created successfully:', transfer.id);

    // Also create a call log entry for tracking
    await createCallLog(supabase, userId, leadId, payload, transfer.id);

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      transfer_id: transfer.id,
      lead_id: leadId,
      message: 'Inbound transfer received and processed',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Inbound transfer webhook error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function findOrCreateLead(
  supabase: any, 
  userId: string, 
  payload: InboundTransferPayload
): Promise<string | null> {
  const clientInfo = payload.client_info!;
  
  // Try to find existing lead by phone or email
  let existingLead = null;

  if (clientInfo.phone) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', clientInfo.phone)
      .maybeSingle();
    
    existingLead = data;
  }

  if (!existingLead && clientInfo.email) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('email', clientInfo.email)
      .maybeSingle();
    
    existingLead = data;
  }

  if (existingLead) {
    // Update existing lead with new information
    await supabase
      .from('leads')
      .update({
        first_name: clientInfo.first_name || existingLead.first_name,
        last_name: clientInfo.last_name || existingLead.last_name,
        email: clientInfo.email || existingLead.email,
        phone_number: clientInfo.phone || existingLead.phone_number,
        address: clientInfo.address,
        city: clientInfo.city,
        state: clientInfo.state,
        zip: clientInfo.zip,
        country: clientInfo.country,
        status: 'transferred',
        last_contacted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingLead.id);

    console.log('Updated existing lead:', existingLead.id);
    return existingLead.id;
  }

  // Create new lead
  const leadData = {
    user_id: userId,
    first_name: clientInfo.first_name || 'Unknown',
    last_name: clientInfo.last_name || '',
    email: clientInfo.email,
    phone_number: clientInfo.phone || payload.from_number,
    address: clientInfo.address,
    city: clientInfo.city,
    state: clientInfo.state,
    zip: clientInfo.zip,
    country: clientInfo.country,
    status: 'transferred',
    source: `Transfer from ${payload.source_system || 'external system'}`,
    last_contacted_at: new Date().toISOString(),
  };

  const { data: newLead, error: leadError } = await supabase
    .from('leads')
    .insert(leadData)
    .select('id')
    .single();

  if (leadError) {
    console.error('Error creating lead:', leadError);
    return null;
  }

  console.log('Created new lead:', newLead.id);
  return newLead.id;
}

async function createCallLog(
  supabase: any,
  userId: string,
  leadId: string | null,
  payload: InboundTransferPayload,
  transferId: string
) {
  try {
    const callLogData = {
      user_id: userId,
      lead_id: leadId,
      phone_number: payload.from_number,
      caller_id: payload.to_number,
      status: 'pending',
      outcome: 'inbound-transfer',
      notes: `Inbound transfer from ${payload.source_system || 'external system'}${payload.transfer_metadata?.reason ? `: ${payload.transfer_metadata.reason}` : ''}${payload.transfer_metadata?.agent_notes ? `\n\nAgent Notes: ${payload.transfer_metadata.agent_notes}` : ''}`,
      call_type: 'inbound',
      external_call_id: payload.external_call_id,
    };

    const { error } = await supabase
      .from('call_logs')
      .insert(callLogData);

    if (error) {
      console.error('Error creating call log:', error);
    } else {
      console.log('Call log created for transfer:', transferId);
    }
  } catch (error) {
    console.error('Error in createCallLog:', error);
  }
}
