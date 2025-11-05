
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurchaseRequest {
  areaCode: string;
  quantity: number;
  provider?: string;
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
      const { areaCode, quantity, provider = 'telnyx' }: PurchaseRequest = await req.json();

      console.log(`Processing order: ${quantity} numbers in area code ${areaCode}`);

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
            quantity
          }
        })
        .select()
        .single();

      if (orderError) {
        console.error('Order creation error:', orderError);
        return new Response(JSON.stringify({ error: 'Failed to create order' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get Retell AI credentials
      const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
      if (!retellApiKey) {
        console.error('RETELL_AI_API_KEY not configured');
        await supabaseClient
          .from('number_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);
        
        return new Response(JSON.stringify({ error: 'Retell AI credentials not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Purchase numbers from Retell AI
      const numbers = [];
      const retellNumbers = [];
      
      for (let i = 0; i < quantity; i++) {
        try {
          // Purchase from Retell AI
          const purchaseResponse = await fetch('https://api.retellai.com/create-phone-number', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${retellApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              area_code: areaCode,
              // You can optionally assign agents here
              // inbound_agent_id: "agent_id_here",
              // outbound_agent_id: "agent_id_here"
            })
          });

          if (!purchaseResponse.ok) {
            const errorText = await purchaseResponse.text();
            console.error('Retell purchase failed:', errorText);
            throw new Error(`Retell API error: ${purchaseResponse.status}`);
          }

          const retellNumber = await purchaseResponse.json();
          console.log('Purchased number from Retell:', retellNumber);

          retellNumbers.push(retellNumber);
          numbers.push({
            number: retellNumber.phone_number,
            area_code: areaCode,
            status: 'active',
            daily_calls: 0,
            user_id: user.id,
            retell_phone_id: retellNumber.phone_number_id
          });
        } catch (error) {
          console.error(`Failed to purchase number ${i + 1}:`, error);
          // Continue trying other numbers
        }
      }

      if (numbers.length === 0) {
        await supabaseClient
          .from('number_orders')
          .update({ status: 'failed' })
          .eq('id', order.id);

        return new Response(JSON.stringify({ error: 'Failed to purchase any numbers from Retell AI' }), {
          status: 500,
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
    console.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
