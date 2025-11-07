import { serve } from "std/server";
import { encode as base64Encode } from "std/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Retell-Signature, X-Retell-Shared-Secret"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({ ok: false, error: "Twilio credentials not configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Optional security: require Retell provide a shared secret header to prevent random callers
  const inboundSecret = Deno.env.get("RETELL_INBOUND_SECRET");
  if (inboundSecret) {
    const incoming = req.headers.get("x-retell-shared-secret") || "";
    if (incoming !== inboundSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  try {
    // Forward the body as-is. If Retell posts JSON, we forward JSON. If it posts form data we also forward raw.
    const bodyText = await req.text();

    const creds = `${twilioAccountSid}:${twilioAuthToken}`;
    const b64 = base64Encode(new TextEncoder().encode(creds));

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`;

    const resp = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${b64}`,
        // Forward content type if provided; default to JSON
        "Content-Type": req.headers.get("content-type") || "application/json"
      },
      body: bodyText
    });

    const respText = await resp.text();

    // Log only minimal info; do not log secrets or full bodies
    console.log("twilio-termination-proxy: forwarded to Twilio, status:", resp.status);

    const contentType = resp.headers.get("content-type") || "application/json";
    return new Response(respText, {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": contentType }
    });
  } catch (err: any) {
    console.error("twilio-termination-proxy error:", err?.message || err);
    return new Response(JSON.stringify({ ok: false, error: "Internal forwarding error", details: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
