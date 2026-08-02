// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleEliteSolarSupervisedTestMatrixRequest } from "./handler.ts";

type Runtime = {
  ownerUserId: string;
  organizationId: string;
  campaignId: string;
  authenticate: (jwt: string) => Promise<string | null>;
  getReplay: (input: {
    ownerUserId: string;
    organizationId: string;
    campaignId: string;
    planId: string;
    planVersion: string;
    runId: string;
  }) => Promise<unknown>;
};

function text(
  value: string | undefined | null,
  minimum: number,
  maximum: number,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < minimum || trimmed.length > maximum) return null;
  return trimmed.toLowerCase();
}

function uuid(value: string | undefined | null): string | null {
  return value && value.length === 36 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ? value.toLowerCase()
    : null;
}

function buildRuntime(): Runtime {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
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
  if (!enabled || !ownerUserId || !organizationId || !campaignId || !url || !serviceRoleKey) {
    throw new Error("ELITE_SOLAR_SUPERVISED_TEST_NOT_PROVISIONED");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "dial-smart-elite-solar-test-matrix/1",
      },
    },
  });

  return {
    ownerUserId,
    organizationId,
    campaignId,
    authenticate: async (jwt: string) => {
      const { data, error } = await client.auth.getUser(jwt);
      if (error || !data.user) return null;
      return data.user.id;
    },
    getReplay: async (input) => {
      const { data, error } = await client.rpc("get_elite_solar_supervised_test_replay", {
        p_owner_user_id: input.ownerUserId,
        p_organization_id: input.organizationId,
        p_campaign_id: input.campaignId,
        p_plan_id: input.planId,
        p_plan_version: input.planVersion,
        p_run_id: input.runId,
      });
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new Error("REPLAY_UNAVAILABLE");
      }
      const result = data[0];
      if (!result || typeof result !== "object" || !("replay" in result)) {
        throw new Error("REPLAY_MALFORMED");
      }
      return result.replay as unknown;
    },
  };
}

let runtime: Promise<Runtime> | null = null;

serve(async (request) => {
  try {
    runtime ||= Promise.resolve(buildRuntime());
    const deps = await runtime;
    return await handleEliteSolarSupervisedTestMatrixRequest(
      request,
      {
        authenticate: deps.authenticate,
        ownerUserId: deps.ownerUserId,
        organizationId: deps.organizationId,
        campaignId: deps.campaignId,
        store: {
          getReplay: deps.getReplay,
        },
      },
    );
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_SOLAR_SUPERVISED_TEST_MATRIX_DISABLED",
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
