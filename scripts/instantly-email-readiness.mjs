#!/usr/bin/env node
/**
 * Performs exactly one redacted, read-only Instantly account probe.
 *
 * This is intentionally not an Instantly campaign or lead client. It reads one
 * account sample solely to confirm a read-key and surface safe aggregate health
 * indicators. The response body, mailbox address, names, and API key never
 * leave this process.
 */

const DEFAULT_BASE_URL = "https://api.instantly.ai";
const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{16,512}$/;

export class InstantlyEmailReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "InstantlyEmailReadinessError";
    this.code = code;
  }
}

function secret(value, name) {
  if (typeof value !== "string" || !SECRET_PATTERN.test(value)) {
    throw new InstantlyEmailReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  return value;
}

function normalizedBaseUrl(value) {
  const candidate = value ?? DEFAULT_BASE_URL;
  if (candidate !== DEFAULT_BASE_URL) {
    throw new InstantlyEmailReadinessError(
      "BASE_URL_FORBIDDEN",
      "The Instantly readiness check permits only the official API base URL",
    );
  }
  return candidate;
}

function sampleAccounts(body) {
  if (Array.isArray(body)) return body.slice(0, 1);
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  for (const key of ["items", "data", "accounts"]) {
    if (Array.isArray(body[key])) return body[key].slice(0, 1);
  }
  return [];
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Performs one GET /api/v2/accounts?limit=1. The response is reduced to
 * aggregate booleans/counts before returning, so it cannot expose mailbox PII.
 */
export async function inspectInstantlyEmailReadiness({
  apiKey,
  baseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const key = secret(apiKey, "INSTANTLY_API_KEY");
  const root = normalizedBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new InstantlyEmailReadinessError("FETCH_UNAVAILABLE", "A fetch implementation is required");
  }

  const url = new URL("/api/v2/accounts", root);
  url.searchParams.set("limit", "1");

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new InstantlyEmailReadinessError("INSTANTLY_UNREACHABLE", "The Instantly account endpoint could not be reached");
  }
  if (!response || typeof response.status !== "number") {
    throw new InstantlyEmailReadinessError("INSTANTLY_RESPONSE_INVALID", "The Instantly account endpoint returned an invalid response");
  }
  if (!response.ok) {
    throw new InstantlyEmailReadinessError("INSTANTLY_READ_REJECTED", `The Instantly account read was rejected with HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new InstantlyEmailReadinessError("INSTANTLY_RESPONSE_INVALID", "The Instantly account endpoint did not return JSON");
  }
  const accounts = sampleAccounts(body).filter(isObject);
  const setupComplete = accounts.filter((account) => account.setup_pending === false).length;
  const warmupActive = accounts.filter((account) => account.warmup_status === 1).length;
  const trackingActive = accounts.filter((account) => account.tracking_domain_status === "active").length;

  return Object.freeze({
    kind: "instantly_email_readiness_v1",
    reachable: true,
    accounts_read_authorized: true,
    sampled_account_count: accounts.length,
    sampled_setup_complete_count: setupComplete,
    sampled_warmup_active_count: warmupActive,
    sampled_tracking_domain_active_count: trackingActive,
    provider_action: "none",
    authority: Object.freeze({
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    }),
  });
}

async function main() {
  try {
    const result = await inspectInstantlyEmailReadiness({
      apiKey: process.env.INSTANTLY_API_KEY,
      baseUrl: process.env.INSTANTLY_BASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof InstantlyEmailReadinessError
      ? error.code
      : "INSTANTLY_READINESS_FAILED";
    process.stdout.write(`${JSON.stringify({
      kind: "instantly_email_readiness_v1",
      reachable: false,
      error_code: code,
      provider_action: "none",
      authority: {
        contact_authorized: false,
        launch_authorized: false,
        queue_mutation_authorized: false,
        crm_write_authorized: false,
        spend_authorized: false,
      },
    })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
