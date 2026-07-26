// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteSolarSupervisedTelnyxReplyStore,
  handleEliteSolarSupervisedTelnyxInboundRequest,
  parseEliteSolarSupervisedTelnyxInboundConfiguration,
} from "./handler.ts";

let runtime:
  | Promise<{
    store: EliteSolarSupervisedTelnyxReplyStore;
    configuration: Awaited<
      ReturnType<typeof parseEliteSolarSupervisedTelnyxInboundConfiguration>
    >;
  }>
  | null = null;

function buildRuntime() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("SUPERVISED_TEST_DATABASE_NOT_CONFIGURED");
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "dial-smart-elite-solar-telnyx-inbound/1" },
    },
  });
  const store: EliteSolarSupervisedTelnyxReplyStore = {
    async recordReply(input) {
      const { data, error } = await client.rpc(
        "record_elite_solar_supervised_test_reply",
        {
          p_provider: "telnyx",
          p_provider_event_id: input.providerEventId,
          p_provider_message_id: input.providerMessageId,
          p_payload_sha256: input.payloadSha256,
          p_occurred_at: input.occurredAt,
          p_from_e164: input.fromE164,
          p_to_e164: input.toE164,
          p_message_text: input.messageText,
          p_messaging_profile_id: input.messagingProfileId,
        },
      );
      if (
        error || !Array.isArray(data) || data.length !== 1 ||
        typeof data[0]?.recorded !== "boolean" ||
        typeof data[0]?.result_code !== "string"
      ) throw new Error("SUPERVISED_TEST_REPLY_RPC_FAILED");
      return { recorded: data[0].recorded, resultCode: data[0].result_code };
    },
  };
  return parseEliteSolarSupervisedTelnyxInboundConfiguration(
    (name) => Deno.env.get(name),
  ).then((configuration) => ({ store, configuration }));
}

serve(async (request) => {
  try {
    runtime ||= buildRuntime();
    return await handleEliteSolarSupervisedTelnyxInboundRequest(request, {
      ...await runtime,
    });
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        accepted: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TELNYX_INBOUND_UNAVAILABLE",
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
});
