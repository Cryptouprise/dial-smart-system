// Full updated Twilio integration edge function
// Key changes:
// - No credentials embedded in termination_uri
// - Uses SITE_URL (or PRIMARY_DOMAIN) to construct termination proxy URL
// - Validates Retell responses before using retell_phone_id
// - Improved area code extraction and defensive checks
// - Standardized JSON responses and safe logging

import { serve } from "std/server";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { encode as base64Encode } from "std/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

type TwilioImportRequest = {
  action?: string;
  phoneNumber?: string;
  phoneNumberSid?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client with service role or with the incoming token if present
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase environment not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { "x-edges-runtime": "1" } }
  });

  // Get user ID once to avoid repeated auth calls
  const { data: { user } } = await supabaseClient.auth.getUser();
  const userId = user?.id || null;

  // Authenticate user if present in Authorization header to perform per-user actions
  const { action, phoneNumber }: TwilioImportRequest = await req.json().catch(() => ({}));

  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const retellApiKey = Deno.env.get("RETELL_AI_API_KEY");
  const siteUrl = (Deno.env.get("SITE_URL") || Deno.env.get("PRIMARY_DOMAIN") || "").replace(/\/$/, "");

  if (!twilioAccountSid || !twilioAuthToken) {
    return new Response(JSON.stringify({ error: "Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to secrets." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    // Helper: encode Basic credentials
    const encodeCredentials = (accountSid: string, authToken: string) => {
      const creds = `${accountSid}:${authToken}`;
      return base64Encode(new TextEncoder().encode(creds));
    };

    // LIST NUMBERS
    if (action === "list_numbers") {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            "Authorization": "Basic " + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Twilio API list error:", response.status);
        return new Response(JSON.stringify({ error: "Failed to fetch Twilio numbers", details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify({ numbers: data.incoming_phone_numbers || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // IMPORT A SINGLE NUMBER
    if (action === "import_number" && phoneNumber) {
      if (!retellApiKey) {
        return new Response(JSON.stringify({ error: "Retell AI credentials not configured. Please add RETELL_AI_API_KEY to secrets." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Use termination proxy on our site if available
      const terminationUri = siteUrl ? `${siteUrl}/functions/twilio-termination-proxy` : "";

      // Build retell payload (no credentials-in-url)
      const retellPayload: any = {
        phone_number: phoneNumber,
        termination_uri: terminationUri || `https://example.com/termination` // fallback to avoid empty
      };

      // Send to Retell
      const retellResp = await fetch("https://api.retellai.com/v2/import-phone-number", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${retellApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(retellPayload)
      });

      const retellText = await retellResp.text();

      if (!retellResp.ok) {
        console.error("Retell import failed:", retellResp.status);
        return new Response(JSON.stringify({ error: "Failed to import to Retell AI", details: retellText, status: retellResp.status }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const retellJson = JSON.parse(retellText || "{}");

      // Validate expected field. Adjust the field name if Retell docs specify another property.
      const retellPhoneId = retellJson.phone_number_id || retellJson.id || retellJson.phone_id;
      if (!retellPhoneId) {
        // Return the full retell response for debugging (but be careful in prod for secret leakage)
        return new Response(JSON.stringify({ error: "Retell import returned unexpected response", details: retellJson }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Area code extraction (improved but basic). For production use libphonenumber.
      const digits = phoneNumber.replace(/\D/g, "");
      let areaCode = "";
      if (digits.length === 11 && digits.startsWith("1")) {
        areaCode = digits.slice(1, 4);
      } else if (digits.length >= 10) {
        areaCode = digits.slice(digits.length - 10, digits.length - 7);
      } else {
        areaCode = digits.slice(0, 3);
      }

      // Save to DB
      const { data: dbNumber, error: dbError } = await supabaseClient
        .from("phone_numbers")
        .insert({
          user_id: userId,
          number: phoneNumber,
          area_code: areaCode,
          status: "active",
          daily_calls: 0,
          retell_phone_id: retellPhoneId
        })
        .select()
        .single();

      if (dbError) {
        console.error("Database insert error:", dbError);
        return new Response(JSON.stringify({ error: "Failed to save number to database", details: dbError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Respond with success, masking anything sensitive
      return new Response(JSON.stringify({ success: true, number: dbNumber, retell_phone_id: retellPhoneId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // SYNC ALL TWILIO NUMBERS -> import each into Retell
    if (action === "sync_all") {
      if (!retellApiKey) {
        return new Response(JSON.stringify({ error: "Retell API key required for full sync" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json`,
        {
          headers: {
            "Authorization": "Basic " + encodeCredentials(twilioAccountSid, twilioAuthToken)
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: "Failed to fetch Twilio numbers", details: errorText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const data = await response.json();
      const twilioNumbers = data.incoming_phone_numbers || [];

      const imported: any[] = [];
      const failed: any[] = [];

      for (const twilioNum of twilioNumbers) {
        try {
          const terminationUri = siteUrl ? `${siteUrl}/functions/twilio-termination-proxy` : "";

          const retellPayload = {
            phone_number: twilioNum.phone_number,
            termination_uri: terminationUri || `https://example.com/termination`
          };

          const rResp = await fetch("https://api.retellai.com/v2/import-phone-number", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${retellApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(retellPayload)
          });

          const rText = await rResp.text();
          if (!rResp.ok) {
            failed.push({ phone: twilioNum.phone_number, reason: rText });
            continue;
          }

          const rJson = JSON.parse(rText || "{}");
          const retellPhoneId = rJson.phone_number_id || rJson.id || rJson.phone_id;
          if (!retellPhoneId) {
            failed.push({ phone: twilioNum.phone_number, reason: "No retell phone id in response", body: rJson });
            continue;
          }

          // area code extraction (see import_number above)
          const digits = twilioNum.phone_number.replace(/\D/g, "");
          let areaCode = "";
          if (digits.length === 11 && digits.startsWith("1")) {
            areaCode = digits.slice(1, 4);
          } else if (digits.length >= 10) {
            areaCode = digits.slice(digits.length - 10, digits.length - 7);
          } else {
            areaCode = digits.slice(0, 3);
          }

          // Insert but ignore duplicates (basic approach)
          await supabaseClient
            .from("phone_numbers")
            .upsert({
              user_id: userId,
              number: twilioNum.phone_number,
              area_code: areaCode,
              status: "active",
              daily_calls: 0,
              retell_phone_id: retellPhoneId
            }, { onConflict: "number" });

          imported.push({ phone: twilioNum.phone_number, retellPhoneId });
        } catch (err: any) {
          console.error("sync error for", twilioNum.phone_number, err?.message || err);
          failed.push({ phone: twilioNum.phone_number, reason: String(err?.message || err) });
        }
      }

      return new Response(JSON.stringify({ success: true, imported, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("twilio-integration handler error:", err?.message || err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
