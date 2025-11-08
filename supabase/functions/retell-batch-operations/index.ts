import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchOperationsRequest {
  action: 'create-batch-call' | 'create-batch-test';
  agentId?: string;
  phoneNumbers?: string[];
  fromNumber?: string;
  metadata?: Record<string, any>;
  retellLlmDynamicVariables?: Record<string, any>;
  dropCallIfMachineDetected?: boolean;
  maxCallDurationMs?: number;
  startTime?: string;
  testScenarios?: Array<{
    scenario_name: string;
    user_messages: string[];
    expected_outcomes?: string[];
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: BatchOperationsRequest = await req.json();
    const { action } = request;

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    console.log(`[Retell Batch Operations] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create-batch-call': {
        if (!request.agentId || !request.phoneNumbers || !request.fromNumber) {
          throw new Error('Agent ID, phone numbers, and from number are required');
        }

        const payload: any = {
          agent_id: request.agentId,
          phone_numbers: request.phoneNumbers,
          from_number: request.fromNumber,
        };

        if (request.metadata) payload.metadata = request.metadata;
        if (request.retellLlmDynamicVariables) payload.retell_llm_dynamic_variables = request.retellLlmDynamicVariables;
        if (request.dropCallIfMachineDetected !== undefined) payload.drop_call_if_machine_detected = request.dropCallIfMachineDetected;
        if (request.maxCallDurationMs) payload.max_call_duration_ms = request.maxCallDurationMs;
        if (request.startTime) payload.start_time = request.startTime;

        console.log('[Retell Batch] Creating batch call');

        response = await fetch(`${baseUrl}/create-batch-call`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      case 'create-batch-test': {
        if (!request.agentId || !request.testScenarios) {
          throw new Error('Agent ID and test scenarios are required');
        }

        const payload = {
          agent_id: request.agentId,
          test_scenarios: request.testScenarios,
        };

        console.log('[Retell Batch] Creating batch test');

        response = await fetch(`${baseUrl}/create-batch-test`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        break;
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell Batch Operations] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Retell Batch Operations] Success`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Batch Operations] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
