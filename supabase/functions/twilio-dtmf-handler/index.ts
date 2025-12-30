import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// DTMF handler for Twilio voice broadcast webhooks
// This handles key presses during broadcast calls and updates queue status
// When transferring (press 1), fires internal webhook with lead data

serve(async (req) => {
  const url = new URL(req.url);
  const transferNumber = url.searchParams.get('transfer') || '';
  const queueItemId = url.searchParams.get('queue_item_id') || '';
  const broadcastId = url.searchParams.get('broadcast_id') || '';
  const retellAgentId = url.searchParams.get('retell_agent_id') || '';
  
  console.log(`DTMF Handler - Method: ${req.method}, URL: ${req.url}`);
  console.log(`Params - transfer: ${transferNumber}, queue_item_id: ${queueItemId}, broadcast_id: ${broadcastId}, retell_agent_id: ${retellAgentId}`);
  
  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Configuration error. Goodbye.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    let digits = '';
    let from = '';
    let to = '';
    let callSid = '';
    
    // Twilio sends application/x-www-form-urlencoded
    const contentType = req.headers.get('content-type') || '';
    console.log('Content-Type:', contentType);
    
    if (contentType.includes('form')) {
      const formData = await req.formData();
      digits = formData.get('Digits')?.toString() || '';
      from = formData.get('From')?.toString() || '';
      to = formData.get('To')?.toString() || '';
      callSid = formData.get('CallSid')?.toString() || '';
      console.log(`Form data - Digits: ${digits}, From: ${from}, To: ${to}, CallSid: ${callSid}`);
    } else {
      // Try to parse as text and extract digits
      const body = await req.text();
      console.log('Raw body:', body);
      const match = body.match(/Digits=(\d+)/);
      if (match) digits = match[1];
    }
    
    console.log(`DTMF received: digits=${digits}, transfer=${transferNumber}`);

    let twiml = '';
    let queueStatus = 'completed';
    let dtmfPressed = digits;
    
    // Look up lead by phone number (the "To" number is the lead's phone)
    // IMPORTANT: multiple leads can match the same phone in different formats (+1..., 1..., etc.)
    // so we must NOT use maybeSingle() here.
    let leadData: any = null;
    let userId: string | null = null;

    // Resolve user_id from broadcast (if provided)
    if (broadcastId) {
      const { data: broadcast, error: broadcastError } = await supabase
        .from('voice_broadcasts')
        .select('user_id')
        .eq('id', broadcastId)
        .maybeSingle();

      if (broadcastError) {
        console.error('Error looking up broadcast owner:', broadcastError);
      }

      if (broadcast?.user_id) userId = broadcast.user_id;
    }

    // Resolve user_id from our outbound caller ID number ("from" is our Twilio number)
    if (!userId && from) {
      const digitsOnly = from.replace(/\D/g, '');
      const last10 = digitsOnly.slice(-10);
      const fromFormats = [
        from,
        digitsOnly,
        `+${digitsOnly}`,
        `+1${last10}`,
        `1${last10}`,
        last10,
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      const phoneOrQuery = fromFormats.map((f) => `number.eq.${f}`).join(',');

      const { data: phoneOwner, error: phoneOwnerError } = await supabase
        .from('phone_numbers')
        .select('user_id')
        .or(phoneOrQuery)
        .limit(1)
        .maybeSingle();

      if (phoneOwnerError) {
        console.error('Error looking up phone owner:', phoneOwnerError);
      }

      if (phoneOwner?.user_id) {
        userId = phoneOwner.user_id;
        console.log(`Resolved userId from from-number owner: ${userId}`);
      }
    }

    // Resolve lead (prefer leads with a name when duplicates exist)
    if (to) {
      const digitsOnly = to.replace(/\D/g, '');
      const last10 = digitsOnly.slice(-10);
      const toFormats = [
        to,
        digitsOnly,
        `+${digitsOnly}`,
        `+1${last10}`,
        `1${last10}`,
        last10,
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      const base = supabase
        .from('leads')
        .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, address, city, state, zip_code, user_id, updated_at')
        .in('phone_number', toFormats)
        .order('updated_at', { ascending: false })
        .limit(10);

      const { data: leads, error: leadsError } = userId ? await base.eq('user_id', userId) : await base;

      if (leadsError) {
        console.error('Lead lookup error:', leadsError);
      } else if (leads && leads.length > 0) {
        const best =
          leads.find((l: any) => String(l?.first_name || '').trim() !== '') ||
          leads.find((l: any) => String(l?.last_name || '').trim() !== '') ||
          leads[0];

        leadData = best;
        if (!userId && best?.user_id) userId = best.user_id;

        console.log(
          `Found lead candidates=${leads.length}; using lead=${best?.id} (${String(best?.first_name || '').trim()} ${String(best?.last_name || '').trim()})`
        );
      }
    }
    if (digits === '1') {
      // Check if we have a transfer number in URL params
      if (transferNumber && transferNumber.trim() !== '') {
        console.log(`Transferring call to ${transferNumber}`);
        console.log(`Lead phone (to): ${to}, Our number (from): ${from}, Transfer target: ${transferNumber}`);
        queueStatus = 'transferred';
        
        // ALWAYS store transfer context so retell-inbound-webhook can look up the lead
        // The key insight: "to" is the lead's phone (who we called), "from" is our Twilio number
        // When we transfer to Retell, the caller ID will be our Twilio number, not the lead's
        // So we store context keyed by the transfer target number (Retell's inbound number)
        const firstName = String(leadData?.first_name || '');
        const lastName = String(leadData?.last_name || '');
        const email = String(leadData?.email || '');
        const company = String(leadData?.company || '');
        const leadSource = String(leadData?.lead_source || '');
        const notes = String(leadData?.notes || '');
        
        if (userId) {
          const { error: ctxError } = await supabase.from('retell_transfer_context').insert({
            user_id: userId,
            from_number: to, // Lead's phone number (who we originally called)
            to_number: transferNumber, // The Retell inbound number we're transferring to
            lead_id: leadData?.id || null,
            lead_snapshot: {
              first_name: firstName,
              last_name: lastName,
              email: email,
              company: company,
              lead_source: leadSource,
              notes: notes,
              tags: leadData?.tags || [],
              custom_fields: leadData?.custom_fields || {},
              phone_number: to, // Store the lead's actual phone
              address: String(leadData?.address || ''),
              city: String(leadData?.city || ''),
              state: String(leadData?.state || ''),
              zip_code: String(leadData?.zip_code || ''),
            },
            source: 'broadcast_press_1',
          });
          
          if (ctxError) {
            console.error('Error storing transfer context:', ctxError);
          } else {
            console.log(`Stored transfer context: lead ${leadData?.id}, lead_phone=${to}, transfer_to=${transferNumber}`);
          }
        } else {
          console.warn('No userId available, cannot store transfer context');
        }
        
        // Fire internal webhook with transfer data
        await fireTransferWebhook(supabase, {
          event: 'transfer_initiated',
          callSid,
          fromNumber: from,
          toNumber: to,
          transferNumber,
          broadcastId,
          queueItemId,
          leadId: leadData?.id,
          leadData: leadData ? {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`.trim(),
            email: email,
            company: company,
            lead_source: leadSource,
            notes: notes,
            tags: leadData?.tags,
            custom_fields: leadData?.custom_fields,
          } : null,
          userId,
          timestamp: new Date().toISOString(),
        });
        
        // Check if this is a Retell agent transfer
        // NOTE: even if retellAgentId is empty, we still wrote transfer context above so the Retell inbound webhook can greet with the lead name.
        if (retellAgentId) {
          // Transfer to Retell AI agent with dynamic variables
          const retellResult = await transferToRetellAgent(
            supabase,
            retellAgentId,
            transferNumber,
            to,
            leadData,
            { broadcastId, queueItemId, callSid, userId }
          );
          
          if (retellResult.success) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you to our AI assistant now.</Say>
  <Pause length="1"/>
  <Dial timeout="60">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
          } else {
            // Fall back to regular transfer
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
          }
        } else {
          // Regular phone transfer
          twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>${transferNumber}</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>`;
        }
      } else {
        // No transfer number configured - mark as answered/interested
        console.log('No transfer number configured, marking as answered');
        queueStatus = 'answered';
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for your interest. A representative will contact you shortly. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }
    } else if (digits === '2') {
      queueStatus = 'callback';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We will call you back soon. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else if (digits === '3') {
      queueStatus = 'dnc';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You have been removed from our list. Goodbye.</Say>
  <Hangup/>
</Response>`;
    } else {
      queueStatus = 'completed';
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Goodbye.</Say>
  <Hangup/>
</Response>`;
    }

    // Update broadcast queue item status
    if (queueItemId) {
      console.log(`Updating queue item ${queueItemId} with status: ${queueStatus}, dtmf: ${dtmfPressed}`);
      
      const { error: updateError } = await supabase
        .from('broadcast_queue')
        .update({ 
          status: queueStatus,
          dtmf_pressed: dtmfPressed,
          updated_at: new Date().toISOString()
        })
        .eq('id', queueItemId);
      
      if (updateError) {
        console.error('Error updating queue item:', updateError);
      } else {
        console.log('Queue item updated successfully');
      }
      
      // Update broadcast stats
      if (broadcastId) {
        console.log(`Updating broadcast ${broadcastId} stats`);
        
        // Get current broadcast
        const { data: broadcast, error: broadcastError } = await supabase
          .from('voice_broadcasts')
          .select('calls_answered, transfers_completed, callbacks_scheduled, dnc_requests')
          .eq('id', broadcastId)
          .maybeSingle();
        
        if (!broadcastError && broadcast) {
          const updates: Record<string, number> = {};
          
          // Any DTMF press means the call was answered
          if (queueStatus === 'answered' || queueStatus === 'transferred' || queueStatus === 'callback' || queueStatus === 'dnc') {
            updates.calls_answered = (broadcast.calls_answered || 0) + 1;
          }
          if (queueStatus === 'transferred') {
            updates.transfers_completed = (broadcast.transfers_completed || 0) + 1;
          }
          if (queueStatus === 'callback') {
            updates.callbacks_scheduled = (broadcast.callbacks_scheduled || 0) + 1;
          }
          if (queueStatus === 'dnc') {
            updates.dnc_requests = (broadcast.dnc_requests || 0) + 1;
          }
          
          console.log('Updating broadcast with:', updates);
          
          if (Object.keys(updates).length > 0) {
            const { error: updateBroadcastError } = await supabase
              .from('voice_broadcasts')
              .update(updates)
              .eq('id', broadcastId);
              
            if (updateBroadcastError) {
              console.error('Error updating broadcast stats:', updateBroadcastError);
            } else {
              console.log('Broadcast stats updated successfully');
            }
          }
        }
      }
      
      // Handle DNC - add to DNC list
      if (queueStatus === 'dnc' && to) {
        const { data: queueItem } = await supabase
          .from('broadcast_queue')
          .select('lead_id, broadcast:voice_broadcasts(user_id)')
          .eq('id', queueItemId)
          .maybeSingle();
        
        const broadcastData = queueItem?.broadcast as any;
        const broadcast = Array.isArray(broadcastData) ? broadcastData[0] : broadcastData;
        if (broadcast?.user_id && queueItem) {
          // Add to DNC list
          await supabase
            .from('dnc_list')
            .upsert({
              user_id: broadcast.user_id,
              phone_number: to.replace(/\D/g, ''),
              reason: 'Opted out via voice broadcast DTMF',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
          
          // Update lead if exists
          if (queueItem.lead_id) {
            await supabase
              .from('leads')
              .update({ do_not_call: true, status: 'dnc' })
              .eq('id', queueItem.lead_id);
          }
        }
      }
      
      // Handle callback scheduling
      if (queueStatus === 'callback') {
        const { data: queueItem } = await supabase
          .from('broadcast_queue')
          .select('lead_id, broadcast:voice_broadcasts(user_id)')
          .eq('id', queueItemId)
          .maybeSingle();
        
        if (queueItem?.lead_id) {
          // Schedule callback for next business day at 10 AM
          const nextCallback = new Date();
          nextCallback.setDate(nextCallback.getDate() + 1);
          nextCallback.setHours(10, 0, 0, 0);
          
          await supabase
            .from('leads')
            .update({ 
              next_callback_at: nextCallback.toISOString(),
              status: 'callback'
            })
            .eq('id', queueItem.lead_id);
          
          // Also update the queue item with callback time
          await supabase
            .from('broadcast_queue')
            .update({ callback_scheduled_at: nextCallback.toISOString() })
            .eq('id', queueItemId);
        }
      }
    }

    console.log('Returning TwiML response');
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
    
  } catch (error: any) {
    console.error('DTMF handler error:', error.message, error.stack);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred. Goodbye.</Say>
  <Hangup/>
</Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
});

// Fire internal webhook when transfer is initiated
async function fireTransferWebhook(
  supabase: any,
  payload: {
    event: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    transferNumber: string;
    broadcastId: string;
    queueItemId: string;
    leadId?: string;
    leadData?: any;
    userId?: string | null;
    timestamp: string;
  }
) {
  try {
    console.log('Firing internal transfer webhook with payload:', JSON.stringify(payload, null, 2));
    
    // Store transfer event in database for tracking (best-effort)
    // IMPORTANT: call_logs has strict enum-like CHECK constraints; keep status/outcome within allowed values.
    const { error } = await supabase
      .from('call_logs')
      .insert({
        user_id: payload.userId,
        lead_id: payload.leadId,
        phone_number: payload.toNumber,
        caller_id: payload.fromNumber,
        status: 'completed',
        outcome: null,
        notes: `Voice broadcast transfer - Lead: ${payload.leadData?.full_name || 'Unknown'}, Transfer to: ${payload.transferNumber}`,
      });
    
    if (error) {
      console.error('Error logging transfer:', error);
    }
    
    console.log('Transfer webhook fired successfully');
  } catch (error: any) {
    console.error('Error firing transfer webhook:', error.message);
  }
}

// Transfer call to Retell AI agent with dynamic variables
async function transferToRetellAgent(
  supabase: any,
  agentId: string,
  fromNumber: string,
  toNumber: string,
  leadData: any,
  metadata: { broadcastId: string; queueItemId: string; callSid: string; userId?: string | null }
): Promise<{ success: boolean; callId?: string; error?: string }> {
  try {
    const retellKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!retellKey) {
      console.error('RETELL_AI_API_KEY not configured');
      return { success: false, error: 'Retell API key not configured' };
    }
    
    // Build dynamic variables from lead data
    const firstName = String(leadData?.first_name || '');
    const lastName = String(leadData?.last_name || '');
    const fullName = `${firstName} ${lastName}`.trim() || 'there';
    const email = String(leadData?.email || '');
    const company = String(leadData?.company || '');
    const leadSource = String(leadData?.lead_source || '');
    const notes = String(leadData?.notes || '');
    const tags = Array.isArray(leadData?.tags) ? leadData.tags.join(', ') : '';
    const phone = String(leadData?.phone_number || toNumber || '');

    // Address fields
    const address = String(leadData?.address || '');
    const city = String(leadData?.city || '');
    const state = String(leadData?.state || '');
    const zipCode = String(leadData?.zip_code || '');
    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

    const dynamicVariables: Record<string, string> = {
      // Standard variables
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      name: fullName,
      email: email,
      company: company,
      lead_source: leadSource,
      notes: notes,
      tags: tags,
      phone: phone,
      phone_number: phone,

      // Address variables
      address: address,
      city: city,
      state: state,
      zip_code: zipCode,
      zipCode: zipCode,
      zip: zipCode,
      full_address: fullAddress,
      fullAddress: fullAddress,

      // GoHighLevel-style contact.* variables
      'contact.first_name': firstName,
      'contact.firstName': firstName,
      'contact.last_name': lastName,
      'contact.lastName': lastName,
      'contact.full_name': fullName,
      'contact.fullName': fullName,
      'contact.name': fullName,
      'contact.email': email,
      'contact.company': company,
      'contact.companyName': company,
      'contact.phone': phone,
      'contact.phoneNumber': phone,
      'contact.phone_number': phone,
      'contact.source': leadSource,
      'contact.leadSource': leadSource,
      'contact.lead_source': leadSource,
      'contact.notes': notes,
      'contact.tags': tags,
      'contact.address': address,
      'contact.city': city,
      'contact.state': state,
      'contact.zip_code': zipCode,
      'contact.zipCode': zipCode,
      'contact.zip': zipCode,
      'contact.full_address': fullAddress,
      'contact.fullAddress': fullAddress,

      // Alternative formats some systems use
      'customer.first_name': firstName,
      'customer.last_name': lastName,
      'customer.name': fullName,
      'customer.email': email,
      'customer.phone': phone,
      'customer.company': company,
      'customer.address': address,
      'customer.city': city,
      'customer.state': state,
      'customer.zip_code': zipCode,
      'customer.full_address': fullAddress,

      // Lead prefix
      'lead.first_name': firstName,
      'lead.last_name': lastName,
      'lead.name': fullName,
      'lead.email': email,
      'lead.phone': phone,
      'lead.company': company,
      'lead.address': address,
      'lead.city': city,
      'lead.state': state,
      'lead.zip_code': zipCode,
      'lead.full_address': fullAddress,
    };

    // Include custom fields as additional variables with multiple alias prefixes
    if (typeof leadData?.custom_fields === 'object' && leadData.custom_fields !== null) {
      for (const [rawKey, rawVal] of Object.entries(leadData.custom_fields as Record<string, unknown>)) {
        const key = String(rawKey || '').trim();
        if (!key) continue;

        const value =
          rawVal === null || rawVal === undefined
            ? ''
            : typeof rawVal === 'string'
              ? rawVal
              : (typeof rawVal === 'number' || typeof rawVal === 'boolean')
                ? String(rawVal)
                : JSON.stringify(rawVal);

        const snakeKey = key
          .replace(/[^\w]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase();

        dynamicVariables[key] = value;
        if (snakeKey) dynamicVariables[snakeKey] = value;

        dynamicVariables[`contact.${key}`] = value;
        if (snakeKey) {
          dynamicVariables[`contact.${snakeKey}`] = value;
          dynamicVariables[`lead.${snakeKey}`] = value;
          dynamicVariables[`customer.${snakeKey}`] = value;
        }
      }
    }
    
    console.log('Initiating Retell transfer with dynamic variables:', Object.keys(dynamicVariables));

    // Write transfer context so retell-inbound-webhook can lookup the lead even when caller ID is our Twilio number
    if (metadata.userId && leadData?.id) {
      await supabase.from('retell_transfer_context').insert({
        user_id: metadata.userId,
        from_number: fromNumber,
        to_number: toNumber,
        lead_id: leadData.id,
        lead_snapshot: {
          first_name: firstName,
          last_name: lastName,
          email: email,
          company: company,
          lead_source: leadSource,
          notes: notes,
          tags: leadData?.tags || [],
          custom_fields: leadData?.custom_fields || {},
          phone_number: String(leadData?.phone_number || ''),
          address: String(leadData?.address || ''),
          city: String(leadData?.city || ''),
          state: String(leadData?.state || ''),
          zip_code: String(leadData?.zip_code || ''),
        },
        source: 'broadcast_press_1',
      });
      console.log('[transferToRetellAgent] Stored retell_transfer_context for lead', leadData.id);
    }
    
    // Create Retell call for transfer
    const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${retellKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: fromNumber,
        to_number: toNumber,
        agent_id: agentId,
        retell_llm_dynamic_variables: dynamicVariables,
        metadata: {
          broadcast_id: metadata.broadcastId,
          queue_item_id: metadata.queueItemId,
          original_call_sid: metadata.callSid,
          user_id: metadata.userId,
          lead_id: leadData?.id,
          transfer_type: 'broadcast_press_1',
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Retell transfer API error:', errorText);
      return { success: false, error: errorText };
    }
    
    const result = await response.json();
    console.log('Retell transfer call created:', result.call_id);
    
    return { success: true, callId: result.call_id };
  } catch (error: any) {
    console.error('Error transferring to Retell:', error.message);
    return { success: false, error: error.message };
  }
}
