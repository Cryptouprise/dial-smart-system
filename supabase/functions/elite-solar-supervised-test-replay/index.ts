// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleEliteSolarSupervisedTestReplayRequest,
} from "./handler.ts";

const PLAN_ID = "elite_solar_self_test_v1";
const PLAN_VERSION = "2026-07-26";

type Runtime = {
  configuration: {
    ownerUserId: string;
    organizationId: string;
    campaignId: string;
  };
  getReplay(input: {
    ownerUserId: string;
    organizationId: string;
    campaignId: string;
    planId: string;
    planVersion: string;
    runId: string;
  }): Promise<unknown>;
  authenticate: (jwt: string) => Promise<string | null>;
};

function text(
  value: string | undefined | null,
  minimum: number,
  maximum: number,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) {
    return null;
  }
  return trimmed;
}

function uuid(value: string | undefined | null): string | null {
  return value && value.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value) ? value.toLowerCase() : null;
}

function buildRuntime() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) throw new Error("SUPERVISED_TEST_DATABASE_NOT_CONFIGURED");
  const ownerUserId = uuid(
    text(Deno.env.get("ELITE_SOLAR_SUPERVISED_TEST_OWNER_USER_ID"), 1, 36),
  );
  const organizationId = uuid(
    text(Deno.env.get("ELITE_SOLAR_SUPERVISED_TEST_ORGANIZATION_ID"), 1, 36),
  );
  const campaignId = uuid(
    text(Deno.env.get("ELITE_SOLAR_SUPERVISED_TEST_CAMPAIGN_ID"), 1, 36),
  );
  const enabled = Deno.env.get("ELITE_SOLAR_SUPERVISED_TEST_ENABLED") === "true";
  if (!enabled || !ownerUserId || !organizationId || !campaignId) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TEST_NOT_PROVISIONED");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "dial-smart-elite-solar-test-replay/1" },
    },
  });

  return {
    configuration: {
      ownerUserId,
      organizationId,
      campaignId,
    },
    authenticate: async (jwt: string) => {
      const { data, error } = await client.auth.getUser(jwt);
      if (error || !data.user) return null;
      return data.user.id;
    },
    getReplay: async ({
      ownerUserId,
      organizationId,
      campaignId,
      planId,
      planVersion,
      runId,
    }) => {
      const { data, error } = await client.rpc(
        "get_elite_solar_supervised_test_replay",
        {
          p_owner_user_id: ownerUserId,
          p_organization_id: organizationId,
          p_campaign_id: campaignId,
          p_plan_id: planId,
          p_plan_version: planVersion,
          p_run_id: runId,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new Error("REPLAY_UNAVAILABLE");
      }
      const result = data[0];
      if (!result || typeof result !== "object" || !("replay" in result)) {
        throw new Error("REPLAY_MALFORMED");
      }
      return result.replay;
    },
  } as Runtime;
}

let runtime: Promise<Runtime> | null = null;

serve(async (request) => {
  try {
    runtime ||= Promise.resolve(buildRuntime());
    const { configuration, getReplay, authenticate } = await runtime;
    return handleEliteSolarSupervisedTestReplayRequest(
      request,
      configuration,
      {
        store: { getReplay },
        authenticate,
        expectedPlanId: PLAN_ID,
        expectedPlanVersion: PLAN_VERSION,
      },
    );
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TEST_REPLAY_DISABLED",
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
