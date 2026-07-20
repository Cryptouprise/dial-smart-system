// deno-lint-ignore no-import-prefix -- deployed Supabase Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- deployed Edge runtime uses the pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteEmailReleaseStatusStore,
  handleEliteEmailReleaseStatusRequest,
} from "./handler.ts";

let runtime:
  | Promise<
    {
      store: EliteEmailReleaseStatusStore;
      authenticate(jwt: string): Promise<string | null>;
    }
  >
  | null = null;
function buildRuntime() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new Error("ELITE_EMAIL_RELEASE_STATUS_DATABASE_NOT_CONFIGURED");
  }
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "dial-smart-elite-email-release-status/1.0" },
    },
  });
  const store: EliteEmailReleaseStatusStore = {
    async read(input) {
      const { data, error } = await client.from(
        "elite_email_execution_releases",
      ).select("status, expires_at, recipient_count").eq(
        "organization_id",
        input.organization_id,
      ).eq("user_id", input.user_id).eq("campaign_id", input.campaign_id).order(
        "created_at",
        { ascending: false },
      ).order("id", { ascending: false }).limit(1);
      if (error || !Array.isArray(data) || data.length > 1) {
        throw new Error("ELITE_EMAIL_RELEASE_STATUS_QUERY_FAILED");
      }
      if (data.length === 0) {
        return {
          release_state: "no_release",
          recipient_count: 0,
          expires_at: null,
        };
      }
      const release = data[0];
      if (
        typeof release?.status !== "string" ||
        typeof release?.recipient_count !== "number" ||
        (release?.expires_at !== null &&
          typeof release?.expires_at !== "string")
      ) throw new Error("ELITE_EMAIL_RELEASE_STATUS_QUERY_INVALID");
      const expired = release.expires_at !== null &&
        Date.parse(release.expires_at) <= Date.now() &&
        !["completed", "held", "revoked"].includes(release.status);
      return {
        release_state: expired ? "expired" : release.status,
        recipient_count: release.recipient_count,
        expires_at: release.expires_at,
      };
    },
  };
  return Promise.resolve({
    store,
    authenticate: async (jwt: string) => {
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
  });
}
serve(async (request) => {
  try {
    runtime ||= buildRuntime();
    return await handleEliteEmailReleaseStatusRequest(request, {
      ...await runtime,
      getEnvironment: (name) => Deno.env.get(name),
    });
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_EMAIL_RELEASE_STATUS_DISABLED",
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
