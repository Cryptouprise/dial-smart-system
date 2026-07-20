// deno-lint-ignore no-import-prefix -- deployed Supabase Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- deployed Edge runtime uses the pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteEmailMailgunEventInput,
  type EliteEmailMailgunEventStore,
  handleEliteEmailMailgunEventRequest,
  importEliteEmailMailgunHmacKey,
  parseEliteEmailMailgunEventConfiguration,
} from "./handler.ts";

type Runtime = Parameters<typeof handleEliteEmailMailgunEventRequest>[1];
let runtimePromise: Promise<Runtime> | null = null;

function unavailable(): Response {
  return new Response(
    JSON.stringify({
      accepted: false,
      error_code: "ELITE_EMAIL_MAILGUN_EVENTS_DISABLED",
    }),
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function buildRuntime(): Promise<Runtime> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const mailgunSigningKey =
    Deno.env.get("ELITE_EMAIL_MAILGUN_WEBHOOK_SIGNING_KEY") || "";
  const identifierKey =
    Deno.env.get("ELITE_EMAIL_MAILGUN_EVENTS_IDENTIFIER_HMAC_KEY") || "";
  if (!url || !serviceRoleKey) {
    throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_DATABASE_NOT_CONFIGURED");
  }
  const configuration = parseEliteEmailMailgunEventConfiguration((name) =>
    Deno.env.get(name)
  );
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "dial-smart-elite-email-mailgun-events/1.0" },
    },
  });
  const store: EliteEmailMailgunEventStore = {
    async record(input: EliteEmailMailgunEventInput) {
      const { data, error } = await supabase.rpc(
        "record_elite_email_mailgun_event_receipt",
        {
          p_release_id: input.release_id,
          p_organization_id: input.organization_id,
          p_user_id: input.user_id,
          p_campaign_id: input.campaign_id,
          p_provider_account_reference: input.provider_account_reference,
          p_sender_domain: input.sender_domain,
          p_receipt_fingerprint: input.receipt_fingerprint,
          p_recipient_fingerprint: input.recipient_fingerprint,
          p_provider_token_fingerprint: input.provider_token_fingerprint,
          p_event_kind: input.event_kind,
          p_occurred_at: input.occurred_at,
          p_correlation_status: input.correlation_status,
          p_operator_attention_required: input.operator_attention_required,
          p_suppression_review_required: input.suppression_review_required,
          p_human_review_required: input.human_review_required,
        },
      );
      if (
        error || !Array.isArray(data) || data.length !== 1 ||
        typeof data[0]?.recorded !== "boolean" ||
        typeof data[0]?.result_code !== "string"
      ) {
        throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_RECEIPT_RPC_FAILED");
      }
      return data[0] as { recorded: boolean; result_code: string };
    },
  };
  return {
    store,
    signingKey: await importEliteEmailMailgunHmacKey(mailgunSigningKey),
    identifierKey: await importEliteEmailMailgunHmacKey(identifierKey),
    configuration,
  };
}

serve(async (request) => {
  try {
    runtimePromise ||= buildRuntime();
    return await handleEliteEmailMailgunEventRequest(
      request,
      await runtimePromise,
    );
  } catch {
    runtimePromise = null;
    return unavailable();
  }
});
