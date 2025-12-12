
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AirtableRecord {
  id?: string;
  fields: {
    phone_number: string;
    call_type: string;
    duration?: number;
    status: string;
    timestamp: string;
    caller_id?: string;
    recipient?: string;
    spam_reported?: boolean;
    daily_call_count?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { records, action }: { records: AirtableRecord[], action: 'sync' | 'update' } = await req.json();
    console.log(`Processing ${records.length} Airtable records with action: ${action}`);

    const results = [];

    for (const record of records) {
      try {
        // Process each record and trigger call tracking
        const callData = {
          phone_number: record.fields.phone_number,
          call_type: record.fields.call_type as 'inbound' | 'outbound',
          duration: record.fields.duration,
          status: record.fields.status as 'completed' | 'busy' | 'failed' | 'no-answer',
          timestamp: record.fields.timestamp,
          caller_id: record.fields.caller_id,
          recipient: record.fields.recipient,
          spam_reported: record.fields.spam_reported || false
        };

        // Call the tracking webhook to process this data
        const { data: trackingResult, error: trackingError } = await supabase.functions.invoke('call-tracking-webhook', {
          body: callData
        });

        if (trackingError) {
          console.error('Error processing call tracking:', trackingError);
          results.push({
            record_id: record.id,
            success: false,
            error: trackingError.message
          });
        } else {
          results.push({
            record_id: record.id,
            success: true,
            data: trackingResult
          });
        }

      } catch (error: unknown) {
        console.error('Error processing record:', error);
        results.push({
          record_id: record.id,
          success: false,
          error: (error as Error).message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: records.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Airtable sync error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
