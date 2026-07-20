// deno-lint-ignore-file no-import-prefix -- repository Edge tests pin the deployed Deno std version.
import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  ELITE_EMAIL_MAILGUN_MAX_BODY_BYTES,
  type EliteEmailMailgunEventInput,
  handleEliteEmailMailgunEventRequest,
  importEliteEmailMailgunHmacKey,
  parseEliteEmailMailgunEventConfiguration,
} from "./handler.ts";

const IDS = Object.freeze({
  release: "123e4567-e89b-42d3-a456-426614174000",
  organization: "223e4567-e89b-42d3-a456-426614174000",
  user: "323e4567-e89b-42d3-a456-426614174000",
  campaign: "423e4567-e89b-42d3-a456-426614174000",
});
const SIGNING_SECRET = "mailgun-webhook-signing-secret-that-is-long-enough";
const IDENTIFIER_SECRET =
  "identifier-hmac-secret-that-is-long-enough-for-events";
const ACCOUNT_REFERENCE = "1234567890303a4bd1f33898";
const DOMAIN = "mail.example.test";

async function hmac(secret: string, material: string): Promise<string> {
  const key = await importEliteEmailMailgunHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(signature)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function request(
  event: Record<string, unknown>,
  overrides: {
    token?: string;
    timestamp?: string;
    signature?: string;
    parentSignature?: string;
  } = {},
): Promise<Request> {
  const token = overrides.token || "a".repeat(50);
  const timestamp = overrides.timestamp || "1784556000";
  const signature = overrides.signature ||
    await hmac(SIGNING_SECRET, `${timestamp}${token}`);
  return new Request(
    "https://example.invalid/functions/v1/elite-email-mailgun-events",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        signature: {
          timestamp,
          token,
          signature,
          ...(overrides.parentSignature === undefined
            ? {}
            : { "parent-signature": overrides.parentSignature }),
        },
        "event-data": event,
      }),
    },
  );
}

function event(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    account: { id: ACCOUNT_REFERENCE },
    domain: { name: DOMAIN },
    event: "delivered",
    id: "mailgun-event-0001",
    timestamp: 1784556000,
    recipient: "person@example.test",
    ...overrides,
  };
}

async function dependencies() {
  const records: EliteEmailMailgunEventInput[] = [];
  return {
    records,
    deps: {
      store: {
        record: (input: EliteEmailMailgunEventInput) => {
          records.push(input);
          return Promise.resolve({
            recorded: true,
            result_code: "EMAIL_EVENT_RECORDED",
          });
        },
      },
      signingKey: await importEliteEmailMailgunHmacKey(SIGNING_SECRET),
      identifierKey: await importEliteEmailMailgunHmacKey(IDENTIFIER_SECRET),
      configuration: {
        releaseId: IDS.release,
        organizationId: IDS.organization,
        userId: IDS.user,
        campaignId: IDS.campaign,
        providerAccountReference: ACCOUNT_REFERENCE,
        senderDomain: DOMAIN,
        maxClockSkewSeconds: 86_400,
      },
      now: () => new Date("2026-07-20T14:00:00Z"),
    },
  };
}

Deno.test("valid Mailgun delivery persists a redacted, release-bound receipt and returns 204", async () => {
  const { deps, records } = await dependencies();
  const response = await handleEliteEmailMailgunEventRequest(
    await request(event()),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(await response.text(), "");
  assertEquals(records.length, 1);
  assertEquals(records[0].release_id, IDS.release);
  assertEquals(records[0].event_kind, "email_delivered");
  assertEquals(records[0].correlation_status, "recipient_hmac_bound");
  assertMatch(records[0].receipt_fingerprint, /^hmac-sha256:[a-f0-9]{64}$/);
  assertMatch(
    records[0].recipient_fingerprint || "",
    /^hmac-sha256:[a-f0-9]{64}$/,
  );
  assertMatch(
    records[0].provider_token_fingerprint,
    /^hmac-sha256:[a-f0-9]{64}$/,
  );
  const serialized = JSON.stringify(records[0]);
  assertEquals(serialized.includes("person@example.test"), false);
  assertEquals(serialized.includes("a".repeat(50)), false);
});

Deno.test("a valid subaccount-shaped payload may carry the documented parent signature without downgrading HMAC verification", async () => {
  const { deps, records } = await dependencies();
  const response = await handleEliteEmailMailgunEventRequest(
    await request(event(), { parentSignature: "b".repeat(64) }),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 1);
});

Deno.test("permanent failure, unsubscribe, and complaint require review without mutating a suppression list", async () => {
  const { deps, records } = await dependencies();
  for (
    const [index, payload] of [
      event({
        event: "failed",
        severity: "permanent",
        id: "mailgun-event-0002",
      }),
      event({ event: "unsubscribed", id: "mailgun-event-0003" }),
      event({ event: "complained", id: "mailgun-event-0004" }),
    ].entries()
  ) {
    const response = await handleEliteEmailMailgunEventRequest(
      await request(payload, {
        token: String.fromCharCode(98 + index).repeat(50),
      }),
      deps,
    );
    assertEquals(response.status, 204);
  }
  assertEquals(records.map((record) => record.event_kind), [
    "permanent_bounce",
    "unsubscribe",
    "spam_complaint",
  ]);
  assert(records.every((record) => record.suppression_review_required));
  assert(records.every((record) => record.human_review_required));
});

Deno.test("a bad HMAC, stale delivery, non-JSON input, and oversized body never touch storage", async () => {
  const { deps, records } = await dependencies();
  let response = await handleEliteEmailMailgunEventRequest(
    await request(event(), { signature: "0".repeat(64) }),
    deps,
  );
  assertEquals(response.status, 401);
  response = await handleEliteEmailMailgunEventRequest(
    await request(event(), { timestamp: "1700000000" }),
    deps,
  );
  assertEquals(response.status, 401);
  response = await handleEliteEmailMailgunEventRequest(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }),
    deps,
  );
  assertEquals(response.status, 415);
  response = await handleEliteEmailMailgunEventRequest(
    new Request("https://example.invalid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(ELITE_EMAIL_MAILGUN_MAX_BODY_BYTES + 1),
    }),
    deps,
  );
  assertEquals(response.status, 413);
  assertEquals(records.length, 0);
});

Deno.test("wrong account/domain, unsupported events, malformed payloads, and redacted recipients are held safely", async () => {
  const { deps, records } = await dependencies();
  for (
    const payload of [
      event({ domain: { name: "wrong.example.test" } }),
      event({ event: "stored" }),
      { account: { id: ACCOUNT_REFERENCE }, domain: { name: DOMAIN } },
    ]
  ) {
    const response = await handleEliteEmailMailgunEventRequest(
      await request(payload),
      deps,
    );
    assertEquals(response.status, 202);
  }
  const response = await handleEliteEmailMailgunEventRequest(
    await request(
      event({ recipient: "[REDACTED]", id: "mailgun-event-0005" }),
      { token: "e".repeat(50) },
    ),
    deps,
  );
  assertEquals(response.status, 204);
  assertEquals(records.length, 1);
  assertEquals(records[0].recipient_fingerprint, null);
  assertEquals(records[0].correlation_status, "recipient_redacted_or_absent");
  assertEquals(records[0].human_review_required, true);
});

Deno.test("a non-recorded database outcome never receives a provider acknowledgement", async () => {
  const { deps } = await dependencies();
  deps.store.record = () =>
    Promise.resolve({
      recorded: false,
      result_code: "EMAIL_EVENT_RELEASE_NOT_EXECUTING",
    });
  const response = await handleEliteEmailMailgunEventRequest(
    await request(event()),
    deps,
  );
  assertEquals(response.status, 503);
});

Deno.test("runtime configuration is disabled by default and validates one exact release binding", () => {
  assert(() => {
    try {
      parseEliteEmailMailgunEventConfiguration(() => undefined);
      return false;
    } catch {
      return true;
    }
  });
  const values = new Map<string, string>([
    ["ELITE_EMAIL_MAILGUN_EVENTS_ENABLED", "true"],
    ["ELITE_EMAIL_MAILGUN_EVENTS_RELEASE_ID", IDS.release],
    ["ELITE_EMAIL_MAILGUN_EVENTS_ORGANIZATION_ID", IDS.organization],
    ["ELITE_EMAIL_MAILGUN_EVENTS_USER_ID", IDS.user],
    ["ELITE_EMAIL_MAILGUN_EVENTS_CAMPAIGN_ID", IDS.campaign],
    ["ELITE_EMAIL_MAILGUN_EVENTS_ACCOUNT_REFERENCE", ACCOUNT_REFERENCE],
    ["ELITE_EMAIL_MAILGUN_EVENTS_SENDER_DOMAIN", DOMAIN],
  ]);
  const configuration = parseEliteEmailMailgunEventConfiguration((name) =>
    values.get(name)
  );
  assertEquals(configuration.releaseId, IDS.release);
  assertEquals(configuration.maxClockSkewSeconds, 86_400);
});
