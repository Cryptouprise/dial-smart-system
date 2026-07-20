import { buildEmailProviderReadinessBrief } from "./email-provider-readiness-brief.mjs";
import { buildEliteSolarMorningBrief } from "./elite-solar-morning-brief.mjs";
import { inspectGhlSolarReadiness } from "../ghl-solar-readiness.mjs";
import { inspectInstantlyEmailReadiness } from "../instantly-email-readiness.mjs";
import { inspectMailgunEmailReadiness } from "../mailgun-email-readiness.mjs";
import { inspectRetellSolarReadiness } from "../retell-solar-readiness.mjs";

const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

function configured(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeErrorCode(error, fallback) {
  return error && typeof error === "object" && typeof error.code === "string"
    && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function readProbeCalls(result) {
  const count = result?.side_effect_invariants?.provider_read_probe_calls;
  return Number.isSafeInteger(count) && count >= 0 && count <= 8 ? count : 0;
}

async function optionalRead({ provider, requiredEnvironment, configuredValues, inspect, input, fallbackErrorCode }) {
  if (!configuredValues.every(configured)) {
    return Object.freeze({
      provider,
      status: "configuration_required",
      required_environment: Object.freeze([...requiredEnvironment]),
      provider_action: "none",
      provider_read_probe_calls: 0,
    });
  }
  try {
    const readiness = await inspect(input);
    return Object.freeze({
      provider,
      status: "readiness_observed",
      readiness,
      provider_action: "none",
      provider_read_probe_calls: readProbeCalls(readiness),
    });
  } catch (error) {
    return Object.freeze({
      provider,
      status: "readiness_blocked",
      error_code: safeErrorCode(error, fallbackErrorCode),
      provider_action: "none",
      provider_read_probe_calls: 0,
    });
  }
}

function preflightStatus({ offlineValid, retell, ghl, email }) {
  if (!offlineValid) return "offline_bundle_invalid";
  if ([retell, ghl].some((lane) => lane.status === "readiness_blocked") || email.status === "readiness_blocked") {
    return "offline_bundle_ready_readiness_blocked";
  }
  const observed = [retell, ghl].filter((lane) => lane.status === "readiness_observed").length
    + (email.status === "readiness_observed" ? 1 : 0);
  if (observed === 0) return "offline_bundle_ready_configuration_required";
  if (observed < 3) return "offline_bundle_ready_readiness_partially_observed";
  return "offline_bundle_ready_readiness_observed";
}

/**
 * Produces one redacted operator snapshot from the locked local Solar bundle
 * plus only explicitly configured, read-only provider checks. It is not a
 * provider adapter, source import, campaign launcher, or contact action.
 */
export async function buildEliteSolarOperatorPreflight({
  environment = process.env,
  buildMorningBrief = buildEliteSolarMorningBrief,
  inspectRetell = inspectRetellSolarReadiness,
  inspectGhl = inspectGhlSolarReadiness,
  inspectInstantly = inspectInstantlyEmailReadiness,
  inspectMailgun = inspectMailgunEmailReadiness,
  buildEmailBrief = buildEmailProviderReadinessBrief,
} = {}) {
  if (typeof buildMorningBrief !== "function" || typeof inspectRetell !== "function" || typeof inspectGhl !== "function"
    || typeof inspectInstantly !== "function" || typeof inspectMailgun !== "function" || typeof buildEmailBrief !== "function") {
    throw new TypeError("All local brief and read-only probe functions are required");
  }

  const morning = buildMorningBrief();
  const retell = await optionalRead({
    provider: "retell",
    requiredEnvironment: ["RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_AGENT_VERSION", "RETELL_EXPECTED_WEBHOOK_URL"],
    configuredValues: [
      environment.RETELL_API_KEY ?? environment.RETELL_AI_API_KEY,
      environment.RETELL_AGENT_ID,
      environment.RETELL_AGENT_VERSION,
      environment.RETELL_EXPECTED_WEBHOOK_URL,
    ],
    inspect: inspectRetell,
    input: {
      apiKey: environment.RETELL_API_KEY ?? environment.RETELL_AI_API_KEY,
      agentId: environment.RETELL_AGENT_ID,
      agentVersion: environment.RETELL_AGENT_VERSION,
      expectedWebhookUrl: environment.RETELL_EXPECTED_WEBHOOK_URL,
      baseUrl: environment.RETELL_BASE_URL,
    },
    fallbackErrorCode: "RETELL_READINESS_FAILED",
  });
  const ghl = await optionalRead({
    provider: "gohighlevel_optional_shadow",
    requiredEnvironment: ["GHL_SOLAR_API_TOKEN", "GHL_SOLAR_LOCATION_ID"],
    configuredValues: [environment.GHL_SOLAR_API_TOKEN, environment.GHL_SOLAR_LOCATION_ID],
    inspect: inspectGhl,
    input: {
      token: environment.GHL_SOLAR_API_TOKEN,
      locationId: environment.GHL_SOLAR_LOCATION_ID,
      baseUrl: environment.GHL_SOLAR_BASE_URL,
    },
    fallbackErrorCode: "GHL_READINESS_FAILED",
  });
  const email = await buildEmailBrief({
    instantly: {
      apiKey: environment.INSTANTLY_API_KEY,
      baseUrl: environment.INSTANTLY_BASE_URL,
    },
    mailgun: {
      apiKey: environment.MAILGUN_API_KEY,
      domain: environment.MAILGUN_DOMAIN,
      baseUrl: environment.MAILGUN_BASE_URL,
    },
    inspectInstantly,
    inspectMailgun,
  });

  const status = preflightStatus({
    offlineValid: morning.offline_validation.valid,
    retell,
    ghl,
    email,
  });
  const providerReadProbeCalls = retell.provider_read_probe_calls
    + ghl.provider_read_probe_calls
    + readProbeCalls(email);

  return Object.freeze({
    kind: "elite_solar_operator_preflight_v1",
    status,
    statement: "This is a redacted read-only posture check. A healthy provider lane is never source consent, a release, a provider write, or contact authority.",
    offline_bundle: Object.freeze({
      status: morning.status,
      valid: morning.offline_validation.valid,
      production_blocker_count: morning.production_release.blocker_count,
      next_gate: morning.next_gate,
    }),
    provider_lanes: Object.freeze({
      retell,
      gohighlevel_optional_shadow: ghl,
      email,
    }),
    operator_actions: Object.freeze([
      "Keep calls, texts, provider sends, CRM writes, queues, and spend locked.",
      "Resolve only the configuration-required or readiness-blocked lane shown above; do not paste credentials or contacts into chat or source control.",
      "Complete the signed 25-record zero-contact direct-import shadow before any owned-phone test or human canary work.",
    ]),
    authority: NO_AUTHORITY,
    side_effect_invariants: Object.freeze({
      database_reads: 0,
      database_writes: 0,
      provider_read_probe_calls: providerReadProbeCalls,
      provider_writes: 0,
      external_messages: 0,
    }),
  });
}
