import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  MailgunEmailReadinessError,
  inspectMailgunEmailReadiness,
} from "./mailgun-email-readiness.mjs";

const apiKey = "key-test-mailgun-0123456789";
const domain = "mail.example.test";

test("Mailgun readiness performs one read-only redacted domain check", async () => {
  const calls = [];
  const result = await inspectMailgunEmailReadiness({
    apiKey,
    domain,
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({ domain: {
        name: domain,
        state: "active",
        receiving_dns_records: [{ record_type: "MX" }],
        sending_dns_records: [{ record_type: "TXT" }, { record_type: "TXT" }],
      } }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.mailgun.net/v3/domains/${domain}`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(
    calls[0].init.headers.Authorization,
    `Basic ${Buffer.from(`api:${apiKey}`, "utf8").toString("base64")}`,
  );
  assert.deepEqual(result, {
    kind: "mailgun_email_readiness_v1",
    reachable: true,
    domain_read_authorized: true,
    sender_domain_active: true,
    sender_domain_state: "active",
    receiving_dns_record_count: 1,
    sending_dns_record_count: 2,
    provider_action: "none",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  });
  assert.equal(JSON.stringify(result).includes(domain), false);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
});

test("Mailgun readiness permits only official API bases before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectMailgunEmailReadiness({
      apiKey,
      domain,
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof MailgunEmailReadinessError && error.code === "BASE_URL_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("Mailgun readiness fails closed on rejected reads without exposing response data", async () => {
  await assert.rejects(
    () => inspectMailgunEmailReadiness({
      apiKey,
      domain,
      fetchImpl: async () => new Response(JSON.stringify({ message: "private upstream error" }), { status: 401 }),
    }),
    (error) => error instanceof MailgunEmailReadinessError && error.code === "MAILGUN_READ_REJECTED",
  );
});

test("Mailgun readiness CLI executes its main routine and fails closed without configuration", () => {
  const env = { ...process.env };
  delete env.MAILGUN_API_KEY;
  delete env.MAILGUN_DOMAIN;
  const result = spawnSync(process.execPath, ["scripts/mailgun-email-readiness.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.kind, "mailgun_email_readiness_v1");
  assert.equal(body.reachable, false);
  assert.equal(body.error_code, "CONFIGURATION_INVALID");
  assert.equal(body.provider_action, "none");
  assert.equal(body.authority.contact_authorized, false);
});
