// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteSolarSupervisedRetellCallStore,
  handleEliteSolarSupervisedRetellWebhookRequest,
  parseEliteSolarSupervisedRetellWebhookConfiguration,
} from "./handler.ts";

let runtime:
  | Promise<{
    store: EliteSolarSupervisedRetellCallStore;
    configuration: ReturnType<
      typeof parseEliteSolarSupervisedRetellWebhookConfiguration
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
      headers: { "X-Client-Info": "dial-smart-elite-solar-retell-webhook/1" },
    },
  });
  const store: EliteSolarSupervisedRetellCallStore = {
    async recordCallEvent(input) {
      const { data, error } = await client.rpc(
        "record_elite_solar_supervised_test_call_event",
        {
          p_provider_event_key: input.providerEventKey,
          p_provider_call_id: input.providerCallId,
          p_dispatch_id: input.dispatchId,
          p_test_run_id: input.testRunId,
          p_event: input.event,
          p_occurred_at: input.occurredAt,
          p_payload_sha256: input.payloadSha256,
          p_agent_id: input.agentId,
          p_agent_version: input.agentVersion,
        },
      );
      if (
        error || !Array.isArray(data) || data.length !== 1 ||
        typeof data[0]?.recorded !== "boolean" ||
        typeof data[0]?.result_code !== "string"
      ) throw new Error("SUPERVISED_TEST_CALL_EVENT_RPC_FAILED");
      return { recorded: data[0].recorded, resultCode: data[0].result_code };
    },
  };
  return Promise.resolve({
    store,
    configuration: parseEliteSolarSupervisedRetellWebhookConfiguration(
      (name) => Deno.env.get(name),
    ),
  });
}

serve(async (request) => {
  try {
    runtime ||= buildRuntime();
    return await handleEliteSolarSupervisedRetellWebhookRequest(request, {
      ...await runtime,
    });
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        accepted: false,
        error_code: "ELITE_SOLAR_SUPERVISED_RETELL_WEBHOOK_UNAVAILABLE",
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
