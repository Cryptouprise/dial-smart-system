import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildEliteSolarOperatorPreflight } from "./lib/elite-solar-operator-preflight.mjs";

function morningBrief(valid = true) {
  return {
    status: valid ? "offline_bundle_ready" : "offline_bundle_invalid",
    offline_validation: { valid },
    production_release: { blocker_count: valid ? 22 : 23 },
    next_gate: { id: "signed_source_shadow_25", label: "Shadow first" },
  };
}

const NO_AUTHORITY = {
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
};

test("Elite operator preflight stays local when no provider configuration is present", async () => {
  let retellCalls = 0;
  let ghlCalls = 0;
  let instantlyCalls = 0;
  let mailgunCalls = 0;
  const result = await buildEliteSolarOperatorPreflight({
    environment: {},
    buildMorningBrief: () => morningBrief(),
    inspectRetell: async () => { retellCalls += 1; },
    inspectGhl: async () => { ghlCalls += 1; },
    inspectInstantly: async () => { instantlyCalls += 1; },
    inspectMailgun: async () => { mailgunCalls += 1; },
  });

  assert.equal(result.status, "offline_bundle_ready_configuration_required");
  assert.equal(result.provider_lanes.retell.status, "configuration_required");
  assert.deepEqual(result.provider_lanes.retell.required_environment, ["RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_AGENT_VERSION", "RETELL_EXPECTED_WEBHOOK_URL"]);
  assert.equal(result.provider_lanes.gohighlevel_optional_shadow.status, "configuration_required");
  assert.equal(result.provider_lanes.email.status, "configuration_required");
  assert.deepEqual(result.side_effect_invariants, {
    database_reads: 0,
    database_writes: 0,
    provider_read_probe_calls: 0,
    provider_writes: 0,
    external_messages: 0,
  });
  assert.deepEqual(result.authority, NO_AUTHORITY);
  assert.deepEqual([retellCalls, ghlCalls, instantlyCalls, mailgunCalls], [0, 0, 0, 0]);
});

test("Elite operator preflight aggregates redacted read-only lane evidence without authority", async () => {
  const calls = [];
  const result = await buildEliteSolarOperatorPreflight({
    environment: {
      RETELL_API_KEY: "retell-key-present",
      RETELL_AGENT_ID: "agent_1234567890abcdef",
      RETELL_AGENT_VERSION: "7",
      RETELL_EXPECTED_WEBHOOK_URL: "https://project.example.test/retell",
      GHL_SOLAR_API_TOKEN: "pit-1234567890abcdef",
      GHL_SOLAR_LOCATION_ID: "location_1234567890",
      INSTANTLY_API_KEY: "instantly-key-present",
      MAILGUN_API_KEY: "mailgun-key-present",
      MAILGUN_DOMAIN: "mail.example.test",
    },
    buildMorningBrief: () => morningBrief(),
    inspectRetell: async (input) => {
      calls.push(["retell", input]);
      return { kind: "retell_solar_readiness_v2", candidate_configuration_verified: true, side_effect_invariants: { provider_read_probe_calls: 2 } };
    },
    inspectGhl: async (input) => {
      calls.push(["ghl", input]);
      return { kind: "ghl_solar_readiness_v1", side_effect_invariants: { provider_read_probe_calls: 1 } };
    },
    inspectInstantly: async (input) => {
      calls.push(["instantly", input]);
      return { kind: "instantly_email_readiness_v1", provider_action: "none" };
    },
    inspectMailgun: async (input) => {
      calls.push(["mailgun", input]);
      return { kind: "mailgun_email_readiness_v1", provider_action: "none" };
    },
  });

  assert.equal(result.status, "offline_bundle_ready_readiness_observed");
  assert.equal(result.provider_lanes.retell.status, "readiness_observed");
  assert.equal(result.provider_lanes.gohighlevel_optional_shadow.status, "readiness_observed");
  assert.equal(result.provider_lanes.email.status, "readiness_observed");
  assert.equal(result.side_effect_invariants.provider_read_probe_calls, 5);
  assert.deepEqual(calls.map(([provider]) => provider), ["retell", "ghl", "instantly", "mailgun"]);
  assert.equal(JSON.stringify(result).includes("retell-key-present"), false);
  assert.equal(JSON.stringify(result).includes("agent_1234567890abcdef"), false);
  assert.equal(JSON.stringify(result).includes("location_1234567890"), false);
});

test("Elite operator preflight holds a blocked lane without surfacing provider response details", async () => {
  const result = await buildEliteSolarOperatorPreflight({
    environment: {
      RETELL_API_KEY: "retell-key-present",
      RETELL_AGENT_ID: "agent_1234567890abcdef",
      RETELL_AGENT_VERSION: "7",
      RETELL_EXPECTED_WEBHOOK_URL: "https://project.example.test/retell",
    },
    buildMorningBrief: () => morningBrief(),
    inspectRetell: async () => {
      const error = new Error("private provider error body");
      error.code = "RETELL_READ_REJECTED";
      throw error;
    },
    inspectGhl: async () => { throw new Error("should not run"); },
    inspectInstantly: async () => { throw new Error("should not run"); },
    inspectMailgun: async () => { throw new Error("should not run"); },
  });

  assert.equal(result.status, "offline_bundle_ready_readiness_blocked");
  assert.deepEqual(result.provider_lanes.retell, {
    provider: "retell",
    status: "readiness_blocked",
    error_code: "RETELL_READ_REJECTED",
    provider_action: "none",
    provider_read_probe_calls: 0,
  });
  assert.equal(JSON.stringify(result).includes("private provider error body"), false);
  assert.equal(result.authority.contact_authorized, false);
});

test("Elite operator preflight CLI emits a no-probe configuration handoff and rejects flags", () => {
  const success = spawnSync(process.execPath, ["scripts/build-elite-solar-operator-preflight.mjs"], {
    cwd: process.cwd(),
    env: {},
    encoding: "utf8",
  });
  assert.equal(success.status, 0, success.stderr);
  const result = JSON.parse(success.stdout);
  assert.equal(result.status, "offline_bundle_ready_configuration_required");
  assert.equal(result.side_effect_invariants.provider_read_probe_calls, 0);
  assert.equal(result.authority.launch_authorized, false);

  const failure = spawnSync(process.execPath, ["scripts/build-elite-solar-operator-preflight.mjs", "--launch"], {
    cwd: process.cwd(),
    env: {},
    encoding: "utf8",
  });
  assert.equal(failure.status, 1);
  assert.match(failure.stderr, /ELITE_SOLAR_OPERATOR_PREFLIGHT_FAILED/);
});
