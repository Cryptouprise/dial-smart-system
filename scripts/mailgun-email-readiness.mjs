#!/usr/bin/env node
import { pathToFileURL } from "node:url";

/**
 * Performs exactly one redacted, read-only Mailgun sender-domain probe.
 *
 * It never sends mail, lists suppressions, looks up recipients, or changes DNS
 * or tracking settings. The response body, domain name, and API key are never
 * emitted by this script.
 */

const DEFAULT_BASE_URL = "https://api.mailgun.net";
const ALLOWED_BASE_URLS = new Set([
  "https://api.mailgun.net",
  "https://api.eu.mailgun.net",
]);
const SECRET_PATTERN = /^[^\s\x00-\x1f\x7f]{16,512}$/;
const DOMAIN_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export class MailgunEmailReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MailgunEmailReadinessError";
    this.code = code;
  }
}

function secret(value, name) {
  if (typeof value !== "string" || !SECRET_PATTERN.test(value)) {
    throw new MailgunEmailReadinessError("CONFIGURATION_INVALID", `${name} is missing or invalid`);
  }
  return value;
}

function senderDomain(value) {
  if (typeof value !== "string" || value !== value.trim()) {
    throw new MailgunEmailReadinessError("CONFIGURATION_INVALID", "MAILGUN_DOMAIN is missing or invalid");
  }
  const domain = value.toLowerCase();
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new MailgunEmailReadinessError("CONFIGURATION_INVALID", "MAILGUN_DOMAIN is missing or invalid");
  }
  return domain;
}

function normalizedBaseUrl(value) {
  const candidate = value ?? DEFAULT_BASE_URL;
  if (!ALLOWED_BASE_URLS.has(candidate)) {
    throw new MailgunEmailReadinessError(
      "BASE_URL_FORBIDDEN",
      "The Mailgun readiness check permits only the official US or EU API base URL",
    );
  }
  return candidate;
}

function countRecords(value) {
  return Array.isArray(value) ? value.length : 0;
}

function domainSummary(body) {
  const data = body && typeof body === "object" && !Array.isArray(body) && body.domain
    && typeof body.domain === "object" && !Array.isArray(body.domain)
    ? body.domain
    : body;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { state: "unknown", receivingDnsRecordCount: 0, sendingDnsRecordCount: 0 };
  }
  const state = typeof data.state === "string" && /^[a-z_-]{1,32}$/i.test(data.state)
    ? data.state.toLowerCase()
    : "unknown";
  return {
    state,
    receivingDnsRecordCount: countRecords(data.receiving_dns_records),
    sendingDnsRecordCount: countRecords(data.sending_dns_records),
  };
}

/**
 * Performs one GET /v3/domains/{domain}. The caller receives only a redacted
 * domain-state/DNS-count summary and no authority to send or mutate Mailgun.
 */
export async function inspectMailgunEmailReadiness({
  apiKey,
  domain,
  baseUrl,
  fetchImpl = globalThis.fetch,
}) {
  const key = secret(apiKey, "MAILGUN_API_KEY");
  const sender = senderDomain(domain);
  const root = normalizedBaseUrl(baseUrl);
  if (typeof fetchImpl !== "function") {
    throw new MailgunEmailReadinessError("FETCH_UNAVAILABLE", "A fetch implementation is required");
  }

  const url = new URL(`/v3/domains/${encodeURIComponent(sender)}`, root);
  const authorization = `Basic ${Buffer.from(`api:${key}`, "utf8").toString("base64")}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: authorization,
        Accept: "application/json",
      },
    });
  } catch {
    throw new MailgunEmailReadinessError("MAILGUN_UNREACHABLE", "The Mailgun domain endpoint could not be reached");
  }
  if (!response || typeof response.status !== "number") {
    throw new MailgunEmailReadinessError("MAILGUN_RESPONSE_INVALID", "The Mailgun domain endpoint returned an invalid response");
  }
  if (!response.ok) {
    throw new MailgunEmailReadinessError("MAILGUN_READ_REJECTED", `The Mailgun domain read was rejected with HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new MailgunEmailReadinessError("MAILGUN_RESPONSE_INVALID", "The Mailgun domain endpoint did not return JSON");
  }
  const summary = domainSummary(body);
  return Object.freeze({
    kind: "mailgun_email_readiness_v1",
    reachable: true,
    domain_read_authorized: true,
    sender_domain_active: summary.state === "active",
    sender_domain_state: summary.state,
    receiving_dns_record_count: summary.receivingDnsRecordCount,
    sending_dns_record_count: summary.sendingDnsRecordCount,
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
    const result = await inspectMailgunEmailReadiness({
      apiKey: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN,
      baseUrl: process.env.MAILGUN_BASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof MailgunEmailReadinessError
      ? error.code
      : "MAILGUN_READINESS_FAILED";
    process.stdout.write(`${JSON.stringify({
      kind: "mailgun_email_readiness_v1",
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
