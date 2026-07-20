// deno-lint-ignore no-import-prefix -- deployed Supabase Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- deployed Edge runtime uses the pinned client build.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EliteEmailReleasePreparationStore,
  handleEliteEmailReleasePreparationRequest,
} from "./handler.ts";

let runtime:
  | Promise<
    {
      store: EliteEmailReleasePreparationStore;
      authenticate(jwt: string): Promise<string | null>;
    }
  >
  | null = null;
function buildRuntime() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new Error("ELITE_EMAIL_RELEASE_PREPARATION_DATABASE_NOT_CONFIGURED");
  }
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "dial-smart-elite-email-release-preparation/1.0",
      },
    },
  });
  const store: EliteEmailReleasePreparationStore = {
    async prepare(input) {
      const { data, error } = await client.rpc(
        "prepare_elite_email_execution_release",
        {
          p_release_id: input.release_id,
          p_organization_id: input.organization_id,
          p_user_id: input.user_id,
          p_campaign_id: input.campaign_id,
          p_attestation_fingerprint: input.attestation_fingerprint,
          p_source_system: input.source_system,
          p_source_release_reference: input.source_release_reference,
          p_recipient_manifest_sha256: input.recipient_manifest_sha256,
          p_suppression_snapshot_sha256: input.suppression_snapshot_sha256,
          p_recipient_count: input.recipient_count,
          p_signing_key_id: input.signing_key_id,
          p_signer_principal_reference: input.signer_principal_reference,
          p_public_key_spki_sha256: input.public_key_spki_sha256,
          p_evidence_as_of: input.evidence_as_of,
          p_issued_at: input.issued_at,
          p_expires_at: input.expires_at,
        },
      );
      if (
        error || !Array.isArray(data) || data.length !== 1 ||
        typeof data[0]?.prepared !== "boolean" ||
        (data[0]?.release_id !== null &&
          typeof data[0]?.release_id !== "string") ||
        (data[0]?.release_state !== null &&
          typeof data[0]?.release_state !== "string") ||
        typeof data[0]?.reason_code !== "string"
      ) throw new Error("ELITE_EMAIL_RELEASE_PREPARATION_RPC_FAILED");
      return data[0];
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
    return await handleEliteEmailReleasePreparationRequest(request, {
      ...await runtime,
      getEnvironment: (name) => Deno.env.get(name),
    });
  } catch {
    runtime = null;
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: "ELITE_EMAIL_RELEASE_PREPARATION_DISABLED",
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
