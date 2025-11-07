import { serve } from "std/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const retellApiKey = Deno.env.get("RETELL_AI_API_KEY");

  if (!retellApiKey) {
    return new Response(JSON.stringify({ ok: false, error: "RETELL_AI_API_KEY not configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    // Lightweight validation: attempt an authenticated GET to a Retell endpoint.
    // If Retell has a /v2/health or /v2/ping endpoint, use that. Fallback to basic agent list check.
    const testUrl = "https://api.retellai.com/v2/agents";
    const resp = await fetch(testUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${retellApiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: "Retell API responded with error", status: resp.status, details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, message: "Retell credentials valid" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("retell-credentials-check error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Network or unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});