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
import {
  handleZapierObserverRequest,
  zapierObserverDisabledResponse,
} from "./handler.ts";

const ZAPIER_OBSERVER_LAUNCH_CERTIFIED: boolean = false;

serve((request) => {
  if (!ZAPIER_OBSERVER_LAUNCH_CERTIFIED) {
    return zapierObserverDisabledResponse();
  }

  return handleZapierObserverRequest(request, {
    enabled: true,
    resolveServerIdentity: () =>
      Promise.reject(
        new Error("Zapier installation identity resolver is not installed"),
      ),
    submitObserverCommand: () =>
      Promise.reject(new Error("durable observer submitter is not installed")),
  });
});
