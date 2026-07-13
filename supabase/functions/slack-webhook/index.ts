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
import {
  handleSlackObserverRequest,
  slackObserverDisabledResponse,
} from "./handler.ts";

const SLACK_OBSERVER_LAUNCH_CERTIFIED: boolean = false;

serve((request) => {
  if (!SLACK_OBSERVER_LAUNCH_CERTIFIED) {
    return slackObserverDisabledResponse();
  }

  return handleSlackObserverRequest(request, {
    enabled: true,
    getSigningSecret: () => Deno.env.get("SLACK_SIGNING_SECRET") ?? "",
    nowEpochSeconds: () => Math.floor(Date.now() / 1000),
    submitObserverCommand: () =>
      Promise.reject(new Error("durable observer submitter is not installed")),
  });
});
