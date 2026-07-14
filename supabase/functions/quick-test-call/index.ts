const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * The legacy Twilio test-call implementation originated calls outside the
 * canonical contact-safety, billing, and provider reconciliation boundary.
 * Keep the endpoint closed until Twilio voice is integrated into that same
 * contract. Retell company-number tests remain available through
 * outbound-calling.
 */
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    error_code: 'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED',
    error: 'Twilio test calls are disabled until they use the canonical provider boundary.',
  }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
