/**
 * Slack R0 observer adapter.
 *
 * This public Edge entry point is deliberately hard-locked. Enabling it
 * requires a reviewed code change after the tenant-binding and durable receipt
 * submitter have been deployed and certified; no environment flag can unlock
 * it. The disabled response is returned before reading the request body,
 * signing secret, database, or network.
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
  handleSlackObserverRequest,
  slackObserverDisabledResponse,
} from "./handler.ts";

const SLACK_OBSERVER_LAUNCH_CERTIFIED: boolean = false;

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
  if (!SLACK_OBSERVER_LAUNCH_CERTIFIED) {
    return slackObserverDisabledResponse();
  }

  return handleSlackObserverRequest(request, {
    enabled: true,
    getSigningSecret: () => Deno.env.get("SLACK_SIGNING_SECRET") ?? "",
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    submitObserverCommand: (submission) =>
      observerRuntime().submitSlackCommand(submission),
  });
});
