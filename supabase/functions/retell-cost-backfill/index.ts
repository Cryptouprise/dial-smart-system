import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing auth');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const retellKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!retellKey) {
      return new Response(JSON.stringify({ error: 'RETELL_AI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Parse optional params
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 100;
    const offset = body.offset || 0;

    // Get calls that have retell_call_id but no cost
    const { data: calls, error: fetchErr } = await supabase
      .from('call_logs')
      .select('id, retell_call_id, duration_seconds')
      .not('retell_call_id', 'is', null)
      .or('retell_cost_cents.is.null,retell_cost_cents.eq.0')
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (fetchErr) throw fetchErr;

    if (!calls || calls.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No more calls to backfill', 
        processed: 0, 
        offset,
        done: true 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const call of calls) {
      try {
        // Retell GET call endpoint
        const resp = await fetch(`https://api.retellai.com/v2/get-call/${call.retell_call_id}`, {
          headers: { 'Authorization': `Bearer ${retellKey}` },
        });

        if (!resp.ok) {
          if (resp.status === 404) {
            skipped++;
            continue;
          }
          const errText = await resp.text();
          errors.push(`${call.retell_call_id}: ${resp.status} ${errText.substring(0, 100)}`);
          failed++;
          continue;
        }

        const retellData = await resp.json();

        // Retell returns cost in dollars as a float
        const costDollars = retellData.cost || retellData.call_cost || 0;
        const costCents = Math.round(costDollars * 100);
        const durationMs = retellData.duration_ms || retellData.call_duration_ms || 0;
        const durationSec = Math.round(durationMs / 1000);

        // Build update payload
        const updatePayload: Record<string, any> = {
          retell_cost_cents: costCents,
        };

        // Also fix duration if we have better data from Retell
        if (durationSec > 0 && (!call.duration_seconds || call.duration_seconds === 0)) {
          updatePayload.duration_seconds = durationSec;
        }

        // Build cost breakdown
        if (retellData.cost_breakdown || retellData.llm_cost || retellData.tts_cost) {
          updatePayload.cost_breakdown = {
            total_cost: costDollars,
            llm_cost: retellData.llm_cost || retellData.cost_breakdown?.llm_cost || null,
            tts_cost: retellData.tts_cost || retellData.cost_breakdown?.tts_cost || null,
            stt_cost: retellData.stt_cost || retellData.cost_breakdown?.stt_cost || null,
            telephony_cost: retellData.telephony_cost || retellData.cost_breakdown?.telephony_cost || null,
          };
        }

        // Token usage
        if (retellData.token_usage || retellData.prompt_tokens) {
          updatePayload.token_usage = {
            prompt_tokens: retellData.prompt_tokens || retellData.token_usage?.prompt_tokens || null,
            completion_tokens: retellData.completion_tokens || retellData.token_usage?.completion_tokens || null,
            total_tokens: retellData.total_tokens || retellData.token_usage?.total_tokens || null,
          };
        }

        const { error: updateErr } = await supabase
          .from('call_logs')
          .update(updatePayload)
          .eq('id', call.id);

        if (updateErr) {
          errors.push(`DB update ${call.id}: ${updateErr.message}`);
          failed++;
        } else {
          updated++;
        }

        // Rate limit: Retell allows ~10 req/s, stay safe at ~5/s
        await new Promise(r => setTimeout(r, 200));

      } catch (e) {
        errors.push(`${call.retell_call_id}: ${e.message}`);
        failed++;
      }
    }

    const remaining = calls.length === batchSize;

    return new Response(JSON.stringify({
      message: `Backfill batch complete`,
      processed: calls.length,
      updated,
      failed,
      skipped,
      offset,
      next_offset: remaining ? offset + batchSize : null,
      done: !remaining,
      errors: errors.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
