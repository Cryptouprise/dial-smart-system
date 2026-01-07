import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellPhoneNumberRequest {
  action: 'import' | 'update' | 'delete' | 'list' | 'list_available' | 'purchase' | 'sync';
  phoneNumber?: string;
  terminationUri?: string;
  agentId?: string;
  nickname?: string;
  areaCode?: string;
  inboundWebhookUrl?: string;
  userId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, phoneNumber, terminationUri, agentId, nickname, areaCode, inboundWebhookUrl, userId }: RetellPhoneNumberRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[retell-phone-management] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'import':
        if (!phoneNumber || !terminationUri) {
          throw new Error('Phone number and termination URI are required for import');
        }
        
        response = await fetch(`${baseUrl}/import-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from_number: phoneNumber,
            termination_uri: terminationUri,
          }),
        });
        break;

      case 'update':
        if (!phoneNumber) {
          throw new Error('Phone number is required for update');
        }
        
        const updateData: any = {};
        if (agentId) {
          updateData.inbound_agent_id = agentId;
          updateData.outbound_agent_id = agentId;
        }
        if (nickname) updateData.nickname = nickname;
        if (inboundWebhookUrl) updateData.inbound_webhook_url = inboundWebhookUrl;
        
        response = await fetch(`${baseUrl}/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!phoneNumber) {
          throw new Error('Phone number is required for delete');
        }
        
        response = await fetch(`${baseUrl}/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/list-phone-numbers`, {
          method: 'GET',
          headers,
        });
        
        if (response.ok) {
          const numbers = await response.json();
          console.log(`[retell-phone-management] Retell returned ${Array.isArray(numbers) ? numbers.length : 0} phone numbers`);
          console.log(`[retell-phone-management] Numbers: ${JSON.stringify(numbers?.map((n: any) => n.phone_number) || [])}`);
          return new Response(JSON.stringify(numbers), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;

      case 'list_available':
        const searchParams = new URLSearchParams();
        if (areaCode) searchParams.append('area_code', areaCode);
        
        response = await fetch(`${baseUrl}/list-available-phone-numbers?${searchParams}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'purchase':
        if (!phoneNumber) {
          throw new Error('Phone number is required for purchase');
        }
        
        response = await fetch(`${baseUrl}/purchase-phone-number`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phone_number: phoneNumber,
          }),
        });
        break;

      case 'sync':
        // Full sync: fetch from Retell and upsert to database
        if (!userId) {
          throw new Error('userId is required for sync action');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch all numbers from Retell
        const listResponse = await fetch(`${baseUrl}/list-phone-numbers`, {
          method: 'GET',
          headers,
        });

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          throw new Error(`Failed to fetch from Retell: ${errorText}`);
        }

        const retellNumbers = await listResponse.json();
        console.log(`[retell-phone-management] Sync: Retell returned ${retellNumbers.length} numbers`);

        let synced = 0;
        let imported = 0;
        let updated = 0;

        for (const rn of retellNumbers) {
          const phoneNum = rn.phone_number;
          const retellPhoneId = rn.phone_number_id || phoneNum;
          
          // Normalize for comparison (last 10 digits)
          const normalized = phoneNum.replace(/\D/g, '').slice(-10);
          
          // Check if this number exists in our database
          const { data: existing } = await supabase
            .from('phone_numbers')
            .select('id, retell_phone_id')
            .eq('user_id', userId)
            .or(`number.ilike.%${normalized}`)
            .maybeSingle();

          if (existing) {
            // Update if missing retell_phone_id
            if (!existing.retell_phone_id) {
              await supabase
                .from('phone_numbers')
                .update({ retell_phone_id: retellPhoneId })
                .eq('id', existing.id);
              updated++;
              console.log(`[Sync] Updated ${phoneNum} with retell_phone_id`);
            }
            synced++;
          } else {
            // Import new number
            const areaCode = normalized.substring(0, 3);
            const formattedNum = phoneNum.startsWith('+') ? phoneNum : `+1${normalized}`;
            
            const { error: insertError } = await supabase
              .from('phone_numbers')
              .insert({
                user_id: userId,
                number: formattedNum,
                area_code: areaCode,
                provider: 'retell_native',
                status: 'active',
                purpose: 'general_rotation',
                retell_phone_id: retellPhoneId,
                daily_calls: 0,
                external_spam_score: 0,
                is_spam: false
              });

            if (!insertError) {
              imported++;
              console.log(`[Sync] Imported new number ${formattedNum}`);
            } else {
              console.error(`[Sync] Failed to import ${phoneNum}:`, insertError);
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          retellTotal: retellNumbers.length,
          synced,
          imported,
          updated,
          numbers: retellNumbers.map((n: any) => n.phone_number)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response) {
      throw new Error('No response from Retell API');
    }

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Retell AI API error: ${response.status} - ${errorData}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[retell-phone-management] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
