import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  GhlSolarReadinessError,
  inspectGhlSolarReadiness,
} from "./ghl-solar-readiness.mjs";

const token = `pit-${"a".repeat(36)}`;
const locationId = "test-location-001";

test("GHL Solar readiness performs one redacted, read-only contacts check", async () => {
  const calls = [];
  const result = await inspectGhlSolarReadiness({
    token,
    locationId,
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify({
        contacts: [{ id: "contact-id-not-returned-to-caller", email: "private@example.invalid" }],
        traceId: "private-trace-not-returned-to-caller",
      }), { status: 200 });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${"https://services.leadconnectorhq.com"}/contacts/?locationId=${locationId}&limit=1`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[0].init.headers.Version, "2021-07-28");
  assert.deepEqual(result, {
    kind: "ghl_solar_readiness_v1",
    reachable: true,
    contacts_read_authorized: true,
    sample_page_contact_count: 1,
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  });
  assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("GHL Solar readiness rejects any nonofficial base URL before making a request", async () => {
  let calls = 0;
  await assert.rejects(
    () => inspectGhlSolarReadiness({
      token,
      locationId,
      baseUrl: "https://example.invalid",
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      },
    }),
    (error) => error instanceof GhlSolarReadinessError && error.code === "BASE_URL_FORBIDDEN",
  );
  assert.equal(calls, 0);
});

test("GHL Solar readiness fails closed on rejected reads without exposing response data", async () => {
  await assert.rejects(
    () => inspectGhlSolarReadiness({
      token,
      locationId,
      fetchImpl: async () => new Response(JSON.stringify({ message: "private upstream error" }), { status: 401 }),
    }),
    (error) => error instanceof GhlSolarReadinessError && error.code === "GHL_READ_REJECTED",
  );
});

test("GHL Solar readiness CLI executes its main routine and fails closed without configuration", () => {
  const env = { ...process.env };
  delete env.GHL_SOLAR_API_TOKEN;
  delete env.GHL_SOLAR_LOCATION_ID;
  const result = spawnSync(process.execPath, ["scripts/ghl-solar-readiness.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "ghl_solar_readiness_v1",
    reachable: false,
    error_code: "CONFIGURATION_INVALID",
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    },
  });
});
