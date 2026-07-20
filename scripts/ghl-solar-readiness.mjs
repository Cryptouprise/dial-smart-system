#!/usr/bin/env node
/**
 * Optional Solar Freedom GHL read-only readiness check.
 *
 * The check intentionally reads a single contacts page and emits only a
 * redacted status summary. It cannot create, update, delete, import, send,
 * trigger a workflow, or write to any Dial Smart/Retell/Telnyx surface.
 *
 * Credentials are read only from the caller's environment so they cannot be
 * recorded in shell history, source, output, or a campaign candidate:
 *   GHL_SOLAR_API_TOKEN
 *   GHL_SOLAR_LOCATION_ID
 */

const DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";
const PIT_TOKEN_PATTERN = /^pit-[A-Za-z0-9-]{16,128}$/;
const LOCATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export class GhlSolarReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GhlSolarReadinessError";
    this.code = code;
  }
}

function cleanEnvironmentValue(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new GhlSolarReadinessError(
      "CONFIGURATION_INVALID",
      `${name} is missing or invalid`,
    );
  }
  return value;
}

function normalizedBaseUrl(value) {
  const candidate = value ?? DEFAULT_BASE_URL;
  if (candidate !== DEFAULT_BASE_URL) {
    throw new GhlSolarReadinessError(
      "BASE_URL_FORBIDDEN",
      "The GHL readiness check permits only the official LeadConnector API base URL",
    );
  }
  return candidate;
}

function boundedContactCount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const contacts = value.contacts;
  return Array.isArray(contacts) && contacts.length <= 1 ? contacts.length : 0;
}

/**
 * Performs exactly one safe GET request. No contact object or trace ID leaves
 * this function; callers receive only the endpoint reachability and a 0/1
 * page count needed to diagnose a location/credential mismatch.
 */
export async function inspectGhlSolarReadiness({
  token,
  locationId,
  baseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const credential = cleanEnvironmentValue(
    token,
    "GHL_SOLAR_API_TOKEN",
    PIT_TOKEN_PATTERN,
  );
  const location = cleanEnvironmentValue(
    locationId,
    "GHL_SOLAR_LOCATION_ID",
    LOCATION_ID_PATTERN,
  );
  const root = normalizedBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new GhlSolarReadinessError(
      "FETCH_UNAVAILABLE",
      "A fetch implementation is required",
    );
  }

  const url = new URL("/contacts/", root);
  url.searchParams.set("locationId", location);
  url.searchParams.set("limit", "1");

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });
  } catch {
    throw new GhlSolarReadinessError(
      "GHL_UNREACHABLE",
      "The optional GHL read endpoint could not be reached",
    );
  }

  if (!response || typeof response.status !== "number") {
    throw new GhlSolarReadinessError(
      "GHL_RESPONSE_INVALID",
      "The optional GHL read endpoint returned an invalid response",
    );
  }
  if (!response.ok) {
    throw new GhlSolarReadinessError(
      "GHL_READ_REJECTED",
      `The optional GHL contacts read was rejected with HTTP ${response.status}`,
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new GhlSolarReadinessError(
      "GHL_RESPONSE_INVALID",
      "The optional GHL read endpoint did not return JSON",
    );
  }

  return Object.freeze({
    kind: "ghl_solar_readiness_v1",
    reachable: true,
    contacts_read_authorized: true,
    sample_page_contact_count: boundedContactCount(body),
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
    const result = await inspectGhlSolarReadiness({
      token: process.env.GHL_SOLAR_API_TOKEN,
      locationId: process.env.GHL_SOLAR_LOCATION_ID,
      baseUrl: process.env.GHL_SOLAR_BASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof GhlSolarReadinessError
      ? error.code
      : "GHL_READINESS_FAILED";
    process.stdout.write(JSON.stringify({
      kind: "ghl_solar_readiness_v1",
      reachable: false,
      error_code: code,
      authority: {
        contact_authorized: false,
        launch_authorized: false,
        queue_mutation_authorized: false,
        crm_write_authorized: false,
        spend_authorized: false,
      },
    }) + "\n");
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
