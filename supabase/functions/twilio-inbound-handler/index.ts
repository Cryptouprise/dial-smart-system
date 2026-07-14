import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Launch containment: never parse or act on an inbound provider request
  // until its Twilio signature, receiving-number ownership, organization, IVR
  // state, and durable event receipt are all proven.
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
    {
      status: 503,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-store',
      },
    },
  );
});
