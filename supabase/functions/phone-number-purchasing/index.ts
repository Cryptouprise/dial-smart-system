
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Valid phone number purposes
const VALID_PURPOSES = ['sip_broadcast', 'voice_ai', 'sms', 'inbound', 'programmable_voice'] as const;
type PhoneNumberPurpose = typeof VALID_PURPOSES[number];

// Map purpose to allowed_uses array
const PURPOSE_TO_ALLOWED_USES: Record<PhoneNumberPurpose, string[]> = {
  'sip_broadcast': ['sip_broadcast'],
  'voice_ai': ['voice_ai'],
  'sms': ['sms'],
  'inbound': ['inbound'],
  'programmable_voice': ['programmable_voice', 'sip_broadcast'], // Flexible
};

const PurchaseRequestSchema = z.object({
  areaCode: z.string().regex(/^\d{3}$/, 'Area code must be exactly 3 digits'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Maximum 100 numbers per order'),
  provider: z.enum(['retell', 'telnyx', 'twilio']).default('retell'),
  purpose: z.enum(VALID_PURPOSES).default('voice_ai'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    if (!user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      
      // Validate input
      const validationResult = PurchaseRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid request data',
            details: validationResult.error.issues.map(i => i.message)
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { areaCode, quantity, provider, purpose } = validationResult.data;
      console.log(`Processing order: ${quantity} numbers in area code ${areaCode} for ${purpose}`);

      // Determine allowed_uses and rotation_enabled based on purpose
      const allowedUses = PURPOSE_TO_ALLOWED_USES[purpose];
      const rotationEnabled = purpose === 'sip_broadcast'; // Only SIP broadcast numbers participate in rotation

      // Create order record
      const { data: order, error: orderError } = await supabaseClient
        .from('number_orders')
        .insert({
          user_id: user.id,
          area_code: areaCode,
          quantity,
          provider,
          status: 'processing',
          total_cost: quantity * 2.99, // $2.99 per number
          order_details: {
            requested_at: new Date().toISOString(),
            area_code: areaCode,
            quantity,
            purpose,
            allowed_uses: allowedUses,
            rotation_enabled: rotationEnabled
          }
        })
        .select()
        .maybeSingle();

      if (orderError || !order) {
        console.error('Order creation error:', orderError);
        return new Response(JSON.stringify({ error: 'Failed to create order' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Purchase numbers based on provider
      const numbers: any[] = [];

      // For SIP broadcast, recommend Twilio
      const effectiveProvider = provider === 'retell' && purpose === 'sip_broadcast'
        ? 'twilio' // Auto-switch to Twilio for SIP broadcast if Retell was selected
        : provider;

      console.log(`Using provider: ${effectiveProvider} for purpose: ${purpose}`);

      if (effectiveProvider === 'twilio') {
        // Purchase from Twilio
        const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');

        if (!twilioSid || !twilioToken) {
          console.error('Twilio credentials not configured');
          await supabaseClient
            .from('number_orders')
            .update({ status: 'failed' })
            .eq('id', order.id);

          return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Search for available numbers
        const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&VoiceEnabled=true&Limit=${quantity}`;
        const searchAuth = btoa(`${twilioSid}:${twilioToken}`);

        const searchResponse = await fetch(searchUrl, {
          headers: { 'Authorization': `Basic ${searchAuth}` }
        });

        if (!searchResponse.ok) {
          console.error('Twilio search failed:', await searchResponse.text());
          await supabaseClient
            .from('number_orders')
            .update({ status: 'failed' })
            .eq('id', order.id);

          return new Response(JSON.stringify({
            error: `No phone numbers available in area code ${areaCode}`
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const searchData = await searchResponse.json();
        const availableNumbers = searchData.available_phone_numbers || [];

        if (availableNumbers.length === 0) {
          await supabaseClient
            .from('number_orders')
            .update({ status: 'failed' })
            .eq('id', order.id);

          return new Response(JSON.stringify({
            error: `No phone numbers available in area code ${areaCode}. Try a different area code.`
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Purchase each available number
        for (const avail of availableNumbers) {
          try {
            const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json`;
            const purchaseResponse = await fetch(purchaseUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${searchAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                PhoneNumber: avail.phone_number,
                FriendlyName: `Dial Smart - ${purpose}`
              })
            });

            if (!purchaseResponse.ok) {
              console.error('Twilio purchase failed:', await purchaseResponse.text());
              continue;
            }

            const purchased = await purchaseResponse.json();
            console.log('Purchased number from Twilio:', purchased.phone_number);

            numbers.push({
              number: purchased.phone_number,
              area_code: areaCode,
              status: 'active',
              daily_calls: 0,
              user_id: user.id,
              twilio_sid: purchased.sid,
              allowed_uses: allowedUses,
              rotation_enabled: rotationEnabled,
              provider: 'twilio'
            });
          } catch (error) {
            console.error('Failed to purchase Twilio number:', error);
          }
        }
      } else if (effectiveProvider === 'telnyx') {
        // Purchase from Telnyx
        const telnyxApiKey = Deno.env.get('TELNYX_API_KEY');
        if (!telnyxApiKey) {
          console.error('TELNYX_API_KEY not configured');
          await supabaseClient
            .from('number_orders')
            .update({ status: 'failed' })
            .eq('id', order.id);
          return new Response(JSON.stringify({ error: 'Telnyx credentials not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Step 1: Search available numbers
        const searchParams = new URLSearchParams({
          'filter[country_code]': 'US',
          'filter[national_destination_code]': areaCode,
          'filter[features][]': 'voice',
          'filter[limit]': String(quantity),
        });
        const searchUrl = `https://api.telnyx.com/v2/available_phone_numbers?${searchParams}`;
        const searchRes = await fetch(searchUrl, {
          headers: { 'Authorization': `Bearer ${telnyxApiKey}` },
        });

        if (!searchRes.ok) {
          const errText = await searchRes.text();
          console.error('Telnyx search failed:', errText);
          await supabaseClient.from('number_orders').update({ status: 'failed' }).eq('id', order.id);
          return new Response(JSON.stringify({
            error: `No Telnyx numbers available in area code ${areaCode}`
          }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const searchData = await searchRes.json();
        const availableNumbers = searchData.data || [];

        if (availableNumbers.length === 0) {
          await supabaseClient.from('number_orders').update({ status: 'failed' }).eq('id', order.id);
          return new Response(JSON.stringify({
            error: `No Telnyx numbers available in area code ${areaCode}. Try a different area code.`
          }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Step 2: Create number order to purchase
        const phonesToBuy = availableNumbers.slice(0, quantity).map((n: any) => ({
          phone_number: n.phone_number,
        }));

        const orderRes = await fetch('https://api.telnyx.com/v2/number_orders', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${telnyxApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone_numbers: phonesToBuy }),
        });

        if (!orderRes.ok) {
          const errText = await orderRes.text();
          console.error('Telnyx order failed:', errText);
          await supabaseClient.from('number_orders').update({ status: 'failed' }).eq('id', order.id);
          return new Response(JSON.stringify({ error: `Telnyx purchase error: ${errText}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const orderData = await orderRes.json();
        const telnyxOrder = orderData.data;
        console.log('Telnyx number order created:', telnyxOrder.id, 'status:', telnyxOrder.status);

        // Step 3: Poll for completion (Telnyx orders are async)
        // Wait up to 15 seconds for the order to complete
        let orderComplete = telnyxOrder.status === 'success';
        let finalOrder = telnyxOrder;
        if (!orderComplete) {
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const pollRes = await fetch(`https://api.telnyx.com/v2/number_orders/${telnyxOrder.id}`, {
              headers: { 'Authorization': `Bearer ${telnyxApiKey}` },
            });
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              finalOrder = pollData.data;
              if (finalOrder.status === 'success') { orderComplete = true; break; }
              if (finalOrder.status === 'failed') break;
            }
          }
        }

        if (!orderComplete) {
          console.log('Telnyx order still pending after polling, checking sub-orders...');
        }

        // Step 4: Get the purchased numbers from sub_number_orders or phone_numbers in the order
        const purchasedPhones = (finalOrder.phone_numbers || phonesToBuy)
          .filter((p: any) => p.status === 'success' || !p.status || finalOrder.status === 'success');

        for (const pn of purchasedPhones) {
          const phoneNum = pn.phone_number;
          console.log('Telnyx number provisioned:', phoneNum);
          numbers.push({
            number: phoneNum,
            area_code: areaCode,
            status: 'active',
            daily_calls: 0,
            user_id: user.id,
            allowed_uses: allowedUses,
            rotation_enabled: rotationEnabled,
            provider: 'telnyx',
          });
        }
      } else {
        // Purchase from Retell AI (for voice_ai purpose)
        const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
        if (!retellApiKey) {
          console.error('RETELL_AI_API_KEY not configured');
          await supabaseClient
            .from('number_orders')
            .update({ status: 'failed' })
            .eq('id', order.id);
          return new Response(JSON.stringify({ error: 'Retell AI credentials not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        for (let i = 0; i < quantity; i++) {
          try {
            const purchaseResponse = await fetch('https://api.retellai.com/create-phone-number', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${retellApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ area_code: parseInt(areaCode, 10) })
            });

            if (!purchaseResponse.ok) {
              const errorText = await purchaseResponse.text();
              console.error('Retell purchase failed:', errorText);
              let errorMessage = `Retell API error: ${purchaseResponse.status}`;
              try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.message || errorJson.error_message || errorMessage;
              } catch { /* Use default */ }
              throw new Error(errorMessage);
            }

            const retellNumber = await purchaseResponse.json();
            console.log('Purchased number from Retell:', retellNumber);

            numbers.push({
              number: retellNumber.phone_number,
              area_code: areaCode,
              status: 'active',
              daily_calls: 0,
              user_id: user.id,
              retell_phone_id: retellNumber.phone_number_id,
              allowed_uses: allowedUses,
              rotation_enabled: rotationEnabled,
              provider: 'retell'
            });
          } catch (error) {
            console.error(`Failed to purchase number ${i + 1}:`, error);
          }
        }
      }

      if (numbers.length === 0) {
        await supabaseClient
          .from('number_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);

        return new Response(JSON.stringify({ 
          error: 'No phone numbers available in this area code. Please try a different area code.' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Insert numbers into database
      const { error: numbersError } = await supabaseClient
        .from('phone_numbers')
        .insert(numbers);

      if (numbersError) {
        console.error('Numbers insertion error:', numbersError);
        // Update order status to failed
        await supabaseClient
          .from('number_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);

        return new Response(JSON.stringify({ error: 'Failed to provision numbers' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update order status to completed
      await supabaseClient
        .from('number_orders')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', order.id);

      console.log(`Successfully provisioned ${quantity} numbers`);

      return new Response(JSON.stringify({
        success: true,
        order_id: order.id,
        numbers_provisioned: quantity,
        numbers: numbers
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (req.method === 'GET') {
      // Get order history
      const { data: orders, error } = await supabaseClient
        .from('number_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Orders fetch error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch orders' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ orders }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Error in phone-number-purchasing:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An error occurred processing your phone number purchase',
        code: 'PURCHASE_ERROR'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});