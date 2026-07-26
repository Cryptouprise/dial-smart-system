// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- deployed Edge runtime uses the pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteSolarSupervisedTestRunInput,
  type EliteSolarSupervisedTestRunResult,
  type EliteSolarSupervisedTestRunStore,
  handleEliteSolarSupervisedTestRunRequest,
} from "./handler.ts";

const DISPATCHER_FUNCTION = "elite-solar-supervised-test-dispatcher";

type Runtime = Pick<
  Parameters<typeof handleEliteSolarSupervisedTestRunRequest>[1],
  "store" | "dispatcher" | "authenticate"
>;

function result(value: unknown): EliteSolarSupervisedTestRunResult {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TEST_RPC_FAILED");
  }
  const row = value[0] as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") {
    throw new Error("ELITE_SOLAR_SUPERVISED_TEST_RPC_FAILED");
  }
  return {
    run_id: String(row.run_id || ""),
    run_state: String(row.run_state || ""),
    reason_code: String(row.reason_code || ""),
    dispatch_authorized: row.dispatch_authorized === true,
    dispatch_id: row.dispatch_id === null
      ? null
      : String(row.dispatch_id || ""),
  };
}

function buildRuntime(): Promise<Runtime> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TEST_DATABASE_NOT_CONFIGURED");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "dial-smart-elite-solar-supervised-test/1.0",
      },
    },
  });
  const call = async (
    name: string,
    input: EliteSolarSupervisedTestRunInput,
  ) => {
    const { data, error } = await client.rpc(name, {
      p_owner_user_id: input.owner_user_id,
      p_organization_id: input.organization_id,
      p_campaign_id: input.campaign_id,
      p_plan_id: input.plan_id,
      p_plan_version: input.plan_version,
      p_stop_on_first_inbound_reply: input.stop_on_first_inbound_reply,
      p_inbound_reply_outcome: input.inbound_reply_outcome,
      p_run_id: input.run_id ?? null,
    });
    if (error) throw new Error("ELITE_SOLAR_SUPERVISED_TEST_RPC_FAILED");
    return result(data);
  };
  const store: EliteSolarSupervisedTestRunStore = {
    arm: (input) => call("arm_elite_solar_supervised_test_run", input),
    status: (input) =>
      call("get_elite_solar_supervised_test_run_status", input),
    cancel: (input) => call("cancel_elite_solar_supervised_test_run", input),
    advance: (input) => call("advance_elite_solar_supervised_test_run", input),
    complete: (input) =>
      call("complete_elite_solar_supervised_test_handoff", input),
  };
  const dispatcherUrl = `${
    url.replace(/\/+$/, "")
  }/functions/v1/${DISPATCHER_FUNCTION}`;
  return Promise.resolve({
    store,
    authenticate: async (jwt: string) => {
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
    dispatcher: {
      async dispatch(input) {
        const response = await fetch(dispatcherUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "X-Client-Info": "dial-smart-elite-solar-supervised-test/1.0",
          },
          body: JSON.stringify(input),
        });
        // The dedicated dispatcher must durably accept its opaque run receipt
        // before this controller reports success. It receives no target, copy,
        // timing, campaign, or provider parameters from the browser.
        const responseBody = await response.text();
        if (response.status !== 202 || responseBody.length > 1_024) {
          throw new Error("ELITE_SOLAR_SUPERVISED_TEST_DISPATCHER_UNAVAILABLE");
        }
        let receipt: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(responseBody);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("INVALID_DISPATCHER_RECEIPT");
          }
          receipt = parsed as Record<string, unknown>;
        } catch {
          throw new Error("ELITE_SOLAR_SUPERVISED_TEST_DISPATCHER_UNAVAILABLE");
        }
        if (
          receipt.accepted === true &&
          receipt.reconciliation_required !== true &&
          receipt.outcome === "accepted"
        ) {
          return {
            accepted: true,
            reason_code: "DISPATCH_REQUEST_ACCEPTED",
          };
        }
        if (
          receipt.accepted === false &&
          receipt.reconciliation_required === true &&
          receipt.outcome === "acceptance_unknown"
        ) {
          return {
            accepted: false,
            reason_code: "DISPATCH_ACCEPTANCE_UNKNOWN",
          };
        }
        throw new Error("ELITE_SOLAR_SUPERVISED_TEST_DISPATCHER_UNAVAILABLE");
      },
    },
  });
}

let runtime: Promise<Runtime> | null = null;

serve(async (request) => {
  try {
    runtime ||= buildRuntime();
    return await handleEliteSolarSupervisedTestRunRequest(request, {
      ...await runtime,
      getEnvironment: (name) => Deno.env.get(name),
    });
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TEST_DISABLED",
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
