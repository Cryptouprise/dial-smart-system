/**
 * Zapier R0 observer adapter.
 *
 * This Edge entry point is deliberately hard-locked. Enabling it requires a
 * reviewed code change after a revocable API key is provisioned to exactly one
 * active Zapier installation/principal/org and the durable receipt submitter is
 * deployed. There is no environment-variable unlock.
 */

// deno-lint-ignore no-import-prefix -- deployed Edge runtime pins this std entry point.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// deno-lint-ignore no-import-prefix -- Supabase Edge resolves this pinned runtime import.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createExternalObserverRuntime,
  type ObserverRuntimeClient,
} from "../_shared/control-plane/observer-runtime.ts";
import {
  handleZapierObserverRequest,
  zapierObserverDisabledResponse,
} from "./handler.ts";

const ZAPIER_OBSERVER_LAUNCH_CERTIFIED: boolean = false;

function observerRuntime() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const identifierHmacKey = Deno.env.get(
    "EXTERNAL_CONTROL_IDENTIFIER_HMAC_KEY",
  );
  const identifierKeyVersion = Deno.env.get(
    "EXTERNAL_CONTROL_IDENTIFIER_KEY_VERSION",
  );
  if (
    !supabaseUrl || !serviceRoleKey || !identifierHmacKey ||
    !identifierKeyVersion
  ) {
    throw new Error("observer runtime is not provisioned");
  }
  return createExternalObserverRuntime({
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    }) as unknown as ObserverRuntimeClient,
    identifier_hmac_key: identifierHmacKey,
    identifier_key_version: identifierKeyVersion,
  });
}

serve((request) => {
  if (!ZAPIER_OBSERVER_LAUNCH_CERTIFIED) {
    return zapierObserverDisabledResponse();
  }

  return handleZapierObserverRequest(request, {
    enabled: true,
    resolveServerIdentity: (credential) =>
      observerRuntime().resolveZapierIdentity(credential),
    submitObserverCommand: (submission) =>
      observerRuntime().submitZapierCommand(submission),
  });
});
