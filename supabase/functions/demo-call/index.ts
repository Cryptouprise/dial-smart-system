const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Public anonymous calling is intentionally disabled. The former demo path
 * could dial arbitrary destinations directly through Retell, outside tenant,
 * DNC, hours, billing, idempotency, and reconciliation controls. A future demo
 * must create a consented contact inside a dedicated tenant and invoke the
 * canonical outbound-calling boundary like every other physical call.
 */
Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    error_code: 'PUBLIC_DEMO_CALLS_DISABLED',
    error: 'Public demo calls are disabled until the consented canonical call flow is deployed.',
  }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
