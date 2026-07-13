// deno-lint-ignore no-import-prefix -- deployed Supabase Edge runtime pins this std version.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- repository Edge functions use the pinned esm.sh client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decodeRandom32ByteSecret,
  importShadowIdentifierKey,
} from "../_shared/ghl-shadow-contract.ts";
import {
  type GhlShadowCommitResult,
  type GhlShadowReceiptInput,
  type GhlShadowStore,
  handleGhlShadowIngestRequest,
} from "./handler.ts";

type Runtime = {
  store: GhlShadowStore;
  identifierKey: CryptoKey;
};

let runtimePromise: Promise<Runtime> | null = null;

function unavailable(errorCode: string): Response {
  return new Response(
    JSON.stringify({
      accepted: false,
      error_code: errorCode,
      evidence_scope: "zero_contact_shadow_observation_only",
      contact_authorized: false,
      launch_authorized: false,
      external_effects_created: false,
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function buildRuntime(): Promise<Runtime> {
  const projectUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const rpcToken = Deno.env.get("GHL_SHADOW_INGEST_RPC_TOKEN") || "";
  const identifierSecret = Deno.env.get("GHL_SHADOW_IDENTIFIER_HMAC_KEY") || "";
  const identifierKeyVersion =
    Deno.env.get("GHL_SHADOW_IDENTIFIER_HMAC_KEY_VERSION") || "";
  if (
    !projectUrl || !publishableKey || !rpcToken || !identifierSecret ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(identifierKeyVersion)
  ) {
    throw new Error("GHL_SHADOW_RUNTIME_NOT_CONFIGURED");
  }
  decodeRandom32ByteSecret(rpcToken, "GHL shadow RPC token");

  // This public webhook intentionally uses only the publishable/anon database
  // client. The two allowed SECURITY DEFINER RPCs independently require the
  // dedicated Edge-to-Vault token. No general database credential exists here.
  const supabase = createClient(projectUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "X-Client-Info": "dial-smart-ghl-shadow-ingest/1.0" },
    },
  });

  const store: GhlShadowStore = {
    async getEnabledContract(locationId) {
      const { data, error } = await supabase.rpc(
        "get_ghl_shadow_ingest_contract",
        {
          p_rpc_token: rpcToken,
          p_location_id: locationId,
        },
      );
      if (error) throw new Error("shadow_contract_rpc_failed");
      if (!Array.isArray(data) || data.length === 0) return null;
      if (data.length !== 1) throw new Error("shadow_contract_not_unique");
      if (data[0]?.identifier_key_version !== identifierKeyVersion) {
        throw new Error("shadow_identifier_key_version_mismatch");
      }
      return data[0];
    },

    async commitReceipt(
      input: GhlShadowReceiptInput,
    ): Promise<GhlShadowCommitResult> {
      const { data, error } = await supabase.rpc(
        "record_ghl_shadow_ingest_receipt",
        {
          p_rpc_token: rpcToken,
          p_expected_binding_id: input.expected_binding_id,
          p_location_id: input.ghl_location_id,
          p_payload_sha256: input.payload_sha256,
          p_webhook_id_sha256: input.webhook_id_sha256,
          p_signature_scheme: input.signature_scheme,
          p_event_type: input.event_type,
          p_source_occurred_at: input.source_occurred_at,
          p_source_contact_identifier_hmac:
            input.source_contact_identifier_hmac,
          p_consent_phone_identifier_hmac: input.consent_phone_identifier_hmac,
          p_decision: input.decision,
          p_reason_codes: input.reason_codes,
          p_evidence: input.evidence,
        },
      );
      if (error || !Array.isArray(data) || data.length !== 1) {
        throw new Error("shadow_receipt_rpc_failed");
      }
      const row = data[0];
      if (
        typeof row?.receipt_id !== "string" ||
        !["committed", "duplicate", "webhook_id_collision"].includes(
          row.commit_status,
        ) ||
        !["held", "quarantined"].includes(row.decision) ||
        !Array.isArray(row.reason_codes)
      ) throw new Error("shadow_receipt_rpc_contract_invalid");
      return row as GhlShadowCommitResult;
    },
  };

  return {
    store,
    identifierKey: await importShadowIdentifierKey(identifierSecret),
  };
}

serve(async (request) => {
  try {
    runtimePromise ||= buildRuntime();
    const runtime = await runtimePromise;
    return await handleGhlShadowIngestRequest(request, runtime);
  } catch {
    // A missing/mismatched Edge/Vault secret is a launch-disabled state. Never
    // acknowledge a webhook as accepted unless its evidence commit succeeded.
    runtimePromise = null;
    return unavailable("GHL_SHADOW_INGEST_DISABLED");
  }
});
