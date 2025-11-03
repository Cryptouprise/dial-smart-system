import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NumberScore {
  number: any;
  score: number;
  reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Call Dispatcher running for user:', user.id);

    // Get pending calls from queue
    const { data: pendingCalls, error: queueError } = await supabase
      .from('dialing_queues')
      .select(`
        *,
        campaigns (
          id,
          name,
          status,
          calls_per_minute,
          agent_id,
          user_id
        ),
        leads (
          id,
          first_name,
          last_name,
          phone_number
        )
      `)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (queueError) throw queueError;

    // Filter to only user's campaigns
    const userCalls = pendingCalls?.filter(
      call => call.campaigns?.user_id === user.id && call.campaigns?.status === 'active'
    ) || [];

    if (userCalls.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No pending calls to dispatch',
          dispatched: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${userCalls.length} pending calls to dispatch`);

    // Get available phone numbers from pool
    const { data: availableNumbers, error: numbersError } = await supabase
      .from('phone_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .is('quarantine_until', null);

    if (numbersError) throw numbersError;

    if (!availableNumbers || availableNumbers.length === 0) {
      console.log('No available numbers in pool');
      return new Response(
        JSON.stringify({ 
          error: 'No available numbers in pool',
          dispatched: 0 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${availableNumbers.length} available numbers in pool`);

    // Get Retell AI key from user credentials
    const { data: retellCred } = await supabase
      .from('user_credentials')
      .select('credential_value_encrypted')
      .eq('user_id', user.id)
      .eq('service_name', 'retell_ai')
      .eq('credential_key', 'api_key')
      .single();

    if (!retellCred) {
      return new Response(
        JSON.stringify({ error: 'Retell AI credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let dispatchedCount = 0;
    const dispatchResults = [];

    // Process each pending call
    for (const call of userCalls.slice(0, 5)) { // Process max 5 at a time
      try {
        // Select best number using AI
        const selectedNumber = await selectBestNumber(
          availableNumbers,
          call,
          lovableApiKey,
          supabase
        );

        if (!selectedNumber) {
          console.log('No suitable number found for call:', call.id);
          continue;
        }

        console.log(`Selected number ${selectedNumber.number} for call to ${call.leads?.phone_number}`);

        // Mark queue entry as calling
        await supabase
          .from('dialing_queues')
          .update({ status: 'calling' })
          .eq('id', call.id);

        // Initiate the call via outbound-calling function
        const callResponse = await supabase.functions.invoke('outbound-calling', {
          body: {
            action: 'create_call',
            campaignId: call.campaign_id,
            leadId: call.lead_id,
            phoneNumber: call.leads?.phone_number,
            callerId: selectedNumber.number,
            agentId: call.campaigns?.agent_id,
            apiKey: retellCred.credential_value_encrypted
          }
        });

        if (callResponse.error) {
          console.error('Call creation failed:', callResponse.error);
          
          // Mark as failed
          await supabase
            .from('dialing_queues')
            .update({ 
              status: 'failed',
              attempts: call.attempts + 1
            })
            .eq('id', call.id);
          
          continue;
        }

        // Update number usage statistics
        await supabase
          .from('phone_numbers')
          .update({
            daily_calls: selectedNumber.daily_calls + 1,
            last_used: new Date().toISOString()
          })
          .eq('id', selectedNumber.id);

        dispatchedCount++;
        dispatchResults.push({
          queue_id: call.id,
          lead: call.leads?.first_name + ' ' + call.leads?.last_name,
          number_used: selectedNumber.number,
          call_id: callResponse.data?.call_id
        });

        console.log(`Successfully dispatched call ${call.id}`);

        // Remove from available pool to prevent reuse in this batch
        availableNumbers.splice(
          availableNumbers.findIndex(n => n.id === selectedNumber.id),
          1
        );

      } catch (error) {
        console.error('Error dispatching call:', call.id, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched: dispatchedCount,
        results: dispatchResults,
        message: `Successfully dispatched ${dispatchedCount} calls`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in call-dispatcher:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function selectBestNumber(
  availableNumbers: any[],
  call: any,
  lovableApiKey: string | undefined,
  supabase: any
): Promise<any | null> {
  
  if (availableNumbers.length === 0) return null;

  // If AI is not available, use simple selection logic
  if (!lovableApiKey) {
    console.log('Using fallback number selection (no AI)');
    return selectNumberFallback(availableNumbers);
  }

  try {
    // Prepare number data for AI analysis
    const numbersData = availableNumbers.map(n => ({
      id: n.id,
      number: n.number,
      area_code: n.area_code,
      daily_calls: n.daily_calls,
      last_used: n.last_used,
      is_spam: n.is_spam,
      created_at: n.created_at
    }));

    const prompt = `You are an AI system optimizing phone number selection for outbound calling campaigns.

AVAILABLE NUMBERS:
${JSON.stringify(numbersData, null, 2)}

CALL TO BE MADE:
- Lead Phone: ${call.leads?.phone_number}
- Campaign: ${call.campaigns?.name}
- Priority: ${call.priority}

SELECTION CRITERIA (in order of importance):
1. Minimize spam risk - avoid numbers with high daily_calls
2. Area code matching - prefer numbers with same area code as lead if possible
3. Recent usage - avoid recently used numbers (distribute load)
4. Freshness - prefer numbers that haven't been flagged as spam

Analyze these numbers and select the SINGLE BEST number to use for this call.
Return the number's ID and a brief reason for the selection.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert at selecting optimal phone numbers for outbound calling to maximize answer rates and minimize spam detection.' },
          { role: 'user', content: prompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'select_number',
            description: 'Select the best phone number for making the call',
            parameters: {
              type: 'object',
              properties: {
                number_id: { type: 'string', description: 'The ID of the selected number' },
                reason: { type: 'string', description: 'Brief explanation of why this number was chosen' }
              },
              required: ['number_id', 'reason'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'select_number' } }
      })
    });

    if (!aiResponse.ok) {
      console.log('AI request failed, using fallback');
      return selectNumberFallback(availableNumbers);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const selection = JSON.parse(toolCall.function.arguments);
      const selectedNumber = availableNumbers.find(n => n.id === selection.number_id);
      
      if (selectedNumber) {
        console.log(`AI selected number: ${selectedNumber.number} - ${selection.reason}`);
        return selectedNumber;
      }
    }

    // Fallback if AI response is invalid
    return selectNumberFallback(availableNumbers);

  } catch (error) {
    console.error('AI selection error:', error);
    return selectNumberFallback(availableNumbers);
  }
}

function selectNumberFallback(availableNumbers: any[]): any {
  // Simple selection: lowest daily_calls, least recently used
  const sorted = [...availableNumbers].sort((a, b) => {
    // First by daily calls (lower is better)
    if (a.daily_calls !== b.daily_calls) {
      return a.daily_calls - b.daily_calls;
    }
    // Then by last used (older is better)
    const aTime = a.last_used ? new Date(a.last_used).getTime() : 0;
    const bTime = b.last_used ? new Date(b.last_used).getTime() : 0;
    return aTime - bTime;
  });

  console.log(`Fallback selected: ${sorted[0].number} (${sorted[0].daily_calls} calls)`);
  return sorted[0];
}
