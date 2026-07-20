// deno-lint-ignore no-import-prefix -- deployed Supabase Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- deployed Edge runtime uses the pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteEmailReleaseRegistrationInput,
  type EliteEmailReleaseRegistrationStore,
  handleEliteEmailReleaseRegistrationRequest,
} from "./handler.ts";

type Runtime = Pick<
  Parameters<typeof handleEliteEmailReleaseRegistrationRequest>[1],
  "store" | "authenticate"
>;
let runtimePromise: Promise<Runtime> | null = null;

function buildRuntime(): Promise<Runtime> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRoleKey) {
    throw new Error("ELITE_EMAIL_RELEASE_REGISTRATION_DATABASE_NOT_CONFIGURED");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "dial-smart-elite-email-release-registration/1.0",
      },
    },
  });
  const store: EliteEmailReleaseRegistrationStore = {
    async register(input: EliteEmailReleaseRegistrationInput) {
      const { data, error } = await client.rpc(
        "register_elite_email_execution_release",
        {
          p_organization_id: input.organization_id,
          p_user_id: input.user_id,
          p_campaign_id: input.campaign_id,
          p_provider: input.provider,
          p_release_fingerprint: input.release_fingerprint,
          p_handoff_proposal_sha256: input.handoff_proposal_sha256,
          p_provider_account_reference: input.provider_account_reference,
          p_sender_domain: input.sender_domain,
          p_recipient_manifest_sha256: input.recipient_manifest_sha256,
          p_recipient_count: input.recipient_count,
          p_source_release_reference: input.source_release_reference,
          p_suppression_snapshot_sha256: input.suppression_snapshot_sha256,
          p_copy_approval_reference: input.copy_approval_reference,
          p_compliance_approval_reference: input.compliance_approval_reference,
          p_owner_approval_reference: input.owner_approval_reference,
          p_execution_key_id: input.execution_key_id,
          p_signer_principal_reference: input.signer_principal_reference,
          p_idempotency_key: input.idempotency_key,
          p_expires_at: input.expires_at,
        },
      );
      if (
        error || !Array.isArray(data) || data.length !== 1 ||
        typeof data[0]?.registered !== "boolean" ||
        (data[0]?.release_id !== null &&
          typeof data[0]?.release_id !== "string") ||
        (data[0]?.release_state !== null &&
          typeof data[0]?.release_state !== "string") ||
        typeof data[0]?.reason_code !== "string"
      ) throw new Error("ELITE_EMAIL_RELEASE_REGISTRATION_RPC_FAILED");
      return data[0] as {
        registered: boolean;
        release_id: string | null;
        release_state: string | null;
        reason_code: string;
      };
    },
  };
  return Promise.resolve({
    store,
    authenticate: async (jwt) => {
      const { data, error } = await client.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
  });
}

serve(async (request) => {
  try {
    runtimePromise ||= buildRuntime();
    const runtime = await runtimePromise;
    return await handleEliteEmailReleaseRegistrationRequest(request, {
      ...runtime,
      getEnvironment: (name) => Deno.env.get(name),
    });
  } catch {
    runtimePromise = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_EMAIL_RELEASE_REGISTRATION_DISABLED",
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
