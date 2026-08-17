// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type ClaimResult,
  type DispatchFinalization,
  type EliteSolarSupervisedTestDispatchStore,
  handleEliteSolarSupervisedTestDispatchRequest,
  type SupervisedDispatch,
} from "./handler.ts";

function validDispatch(value: unknown): SupervisedDispatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const string = (key: string) =>
    typeof row[key] === "string" ? row[key] : null;
  const nullableString = (key: string) =>
    row[key] === null || typeof row[key] === "string"
      ? row[key] as string | null
      : undefined;
  const nullableVersion = row.retell_agent_version === null ||
      (typeof row.retell_agent_version === "number" &&
        Number.isSafeInteger(row.retell_agent_version))
    ? row.retell_agent_version as number | null
    : undefined;
  const provider = row.provider;
  const channel = row.channel;
  const dispatch = {
    dispatch_id: string("dispatch_id"),
    test_run_id: string("test_run_id"),
    provider: provider === "telnyx" || provider === "retell" ? provider : null,
    channel: channel === "sms" || channel === "voice" ? channel : null,
    idempotency_key: string("idempotency_key"),
    from_e164: string("from_e164"),
    to_e164: string("to_e164"),
    message_body: nullableString("message_body"),
    retell_agent_id: nullableString("retell_agent_id"),
    retell_agent_version: nullableVersion,
    retell_webhook_url: nullableString("retell_webhook_url"),
  };
  if (
    !dispatch.dispatch_id || !dispatch.test_run_id || !dispatch.provider ||
    !dispatch.channel || !dispatch.idempotency_key || !dispatch.from_e164 ||
    !dispatch.to_e164 || dispatch.message_body === undefined ||
    dispatch.retell_agent_id === undefined ||
    dispatch.retell_agent_version === undefined ||
    dispatch.retell_webhook_url === undefined
  ) return null;
  return dispatch as SupervisedDispatch;
}

function runtimeStore(): EliteSolarSupervisedTestDispatchStore {
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
      headers: { "X-Client-Info": "dial-smart-elite-solar-supervised-test/1" },
    },
  });
  return {
    async claim(input): Promise<ClaimResult> {
      const { data, error } = await client.rpc(
        "claim_elite_solar_supervised_test_dispatch",
        {
          p_test_run_id: input.testRunId,
          p_dispatcher_instance_id: input.dispatcherInstanceId,
        },
      );
      if (error || !Array.isArray(data) || data.length > 1) {
        throw new Error("SUPERVISED_TEST_CLAIM_RPC_FAILED");
      }
      if (data.length === 0) return { kind: "empty" };
      if (data[0]?.claimed !== true) return { kind: "not_claimed" };
      const dispatch = validDispatch(data[0]);
      if (!dispatch) throw new Error("SUPERVISED_TEST_CLAIM_RPC_INVALID");
      return { kind: "claimed", dispatch };
    },
    async finalize(input: DispatchFinalization): Promise<boolean> {
      const { data, error } = await client.rpc(
        "finalize_elite_solar_supervised_test_dispatch",
        {
          p_dispatch_id: input.dispatchId,
          p_dispatcher_instance_id: input.dispatcherInstanceId,
          p_status: input.status,
          p_provider_object_id: input.providerObjectId,
          p_provider_response_sha256: input.providerResponseSha256,
          p_error_code: input.errorCode,
        },
      );
      return !error && data === true;
    },
  };
}

serve(async (request) => {
  try {
    return await handleEliteSolarSupervisedTestDispatchRequest(request, {
      getEnvironment: (name) => Deno.env.get(name),
      store: runtimeStore(),
    });
  } catch {
    return new Response(
      JSON.stringify({
        accepted: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TEST_DISPATCH_UNAVAILABLE",
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
