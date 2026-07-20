import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildEliteSolarEmailHandoffProposal } from "./lib/elite-solar-email-handoff.mjs";
import {
  EliteSolarEmailExecutionReleaseError,
  buildEliteSolarEmailExecutionRelease,
  verifyEliteSolarEmailExecutionRelease,
} from "./lib/elite-solar-email-execution-release.mjs";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const KEY = Buffer.from([...Array(32).keys()]);
const IDS = { organization: "123e4567-e89b-42d3-a456-426614174000", campaign: "223e4567-e89b-42d3-a456-426614174000" };

function draftInput() {
  return {
    version: "outbound.email.draft.v1", organization_id: IDS.organization, campaign_id: IDS.campaign,
    campaign_name: "Elite Solar reviewed reactivation", provider: "instantly",
    source: { kind: "consented_database", evidence_reference: "elite-consent-source-review-v1", recipient_data_included: false, list_hygiene_verified: true },
    sender: { domain: "mail.elitesolar.example", mailbox_reference: "instantly-elite-sender-v1", domain_verified: true, reply_handling_verified: true, provider_binding_verified: true },
    message: { subject_reference: "elite-copy-subject-v1", body_reference: "elite-copy-body-v1", claim_review_verified: true, unsubscribe_marker_present: true },
    compliance: { sender_identity_reference: "elite-sender-identity-v1", postal_address_reference: "elite-postal-address-v1", unsubscribe_url: "https://mail.elitesolar.example/unsubscribe", suppression_sync_verified: true, jurisdiction_review_reference: "elite-email-compliance-v1" },
    review: { copy_approval_reference: "elite-copy-approval-v1", owner_approval_reference: "elite-owner-approval-v1", provider_health_reference: "instantly-readiness-v1" },
  };
}

function handoff(now = NOW, expiresAt = "2026-07-20T14:00:00.000Z") {
  return buildEliteSolarEmailHandoffProposal({
    draftInput: draftInput(),
    releaseRequest: {
      version: "elite.solar.email.handoff.v1", organization_id: IDS.organization, campaign_id: IDS.campaign,
      provider_account_reference: "instantly-elite-account-v1", recipient_manifest_sha256: "a".repeat(64), recipient_count: 2,
      source_release_reference: "elite-signed-recipient-release-v1", suppression_snapshot_sha256: "b".repeat(64),
      copy_approval_reference: "elite-copy-approval-v1", compliance_approval_reference: "elite-compliance-approval-v1", owner_approval_reference: "elite-owner-approval-v1",
      expires_at: expiresAt,
    },
    now,
  });
}

function request(overrides = {}) {
  return {
    version: "elite.solar.email.execution.release.v1",
    execution_key_id: "elite-email-release-key-v1",
    signer_principal_reference: "elite-owner-approval-v1",
    idempotency_key: "elite-email-release-20260720-001",
    expires_at: "2026-07-20T13:00:00.000Z",
    ...overrides,
  };
}

test("builds and verifies a signed no-send Elite email execution release candidate", () => {
  const release = buildEliteSolarEmailExecutionRelease({ handoffProposal: handoff(), request: request(), executionHmacKey: KEY, now: NOW });
  assert.equal(release.status, "pending_future_server_adapter_verification");
  assert.equal(release.provider, "instantly");
  assert.equal(release.recipient_count, 2);
  assert.equal(release.recipient_data_included, false);
  assert.equal(release.provider_action, "none");
  assert.equal(release.authority.contact_authorized, false);
  assert.match(release.signature, /^hmac-sha256:[a-f0-9]{64}$/);

  const verified = verifyEliteSolarEmailExecutionRelease({ release, executionHmacKey: KEY, now: new Date("2026-07-20T12:30:00.000Z") });
  assert.deepEqual(verified, {
    kind: "elite_solar_email_execution_release_verification_v1",
    valid: true,
    verification_status: "valid_pending_adapter_verification",
    provider: "instantly",
    recipient_count: 2,
    expires_at: "2026-07-20T13:00:00.000Z",
    release_fingerprint: verified.release_fingerprint,
    provider_action: "none",
    authority: release.authority,
    side_effect_invariants: release.side_effect_invariants,
  });
  assert.match(verified.release_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("holds tampering, expiry, recipient-bearing handoffs, and unsafe keys", () => {
  const release = buildEliteSolarEmailExecutionRelease({ handoffProposal: handoff(), request: request(), executionHmacKey: KEY, now: NOW });
  const tampered = { ...release, recipient_count: 3 };
  const invalid = verifyEliteSolarEmailExecutionRelease({ release: tampered, executionHmacKey: KEY, now: NOW });
  assert.deepEqual({ valid: invalid.valid, verification_status: invalid.verification_status }, { valid: false, verification_status: "signature_invalid" });

  const expired = verifyEliteSolarEmailExecutionRelease({ release, executionHmacKey: KEY, now: new Date("2026-07-20T13:01:00.000Z") });
  assert.deepEqual({ valid: expired.valid, verification_status: expired.verification_status }, { valid: false, verification_status: "expired" });

  assert.throws(
    () => buildEliteSolarEmailExecutionRelease({ handoffProposal: { ...handoff(), recipients: ["person@example.test"] }, request: request(), executionHmacKey: KEY, now: NOW }),
    (error) => error instanceof EliteSolarEmailExecutionReleaseError && error.code === "UNKNOWN_FIELD",
  );
  assert.throws(
    () => buildEliteSolarEmailExecutionRelease({ handoffProposal: handoff(), request: request(), executionHmacKey: Buffer.alloc(32, 65), now: NOW }),
    (error) => error instanceof EliteSolarEmailExecutionReleaseError && error.code === "HMAC_KEY_INVALID",
  );
});

test("CLI writes only a new external no-send release artifact and refuses repository output", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "elite-email-release-"));
  try {
    const proposal = join(sandbox, "handoff.json");
    const releaseRequest = join(sandbox, "request.json");
    const key = join(sandbox, "release-key.bin");
    const output = join(sandbox, "release.json");
    const cliNow = new Date();
    writeFileSync(proposal, JSON.stringify(handoff(cliNow, new Date(cliNow.getTime() + 2 * 60 * 60 * 1000).toISOString())));
    writeFileSync(releaseRequest, JSON.stringify(request({ expires_at: new Date(cliNow.getTime() + 60 * 60 * 1000).toISOString() })));
    writeFileSync(key, KEY);
    const result = spawnSync(process.execPath, ["scripts/create-elite-solar-email-execution-release.mjs", "--proposal", proposal, "--request", releaseRequest, "--hmac-key-file", key, "--output", output], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.provider_write_performed, false);
    assert.equal(report.external_messages_sent, 0);
    assert.equal(result.stdout.includes("instantly-elite-account-v1"), false);
    const release = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(release.recipient_data_included, false);
    assert.equal(verifyEliteSolarEmailExecutionRelease({ release, executionHmacKey: KEY }).valid, true);

    const verified = spawnSync(process.execPath, ["scripts/create-elite-solar-email-execution-release.mjs", "--verify", "--input", output, "--hmac-key-file", key], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(JSON.parse(verified.stdout).verification_status, "valid_pending_adapter_verification");

    const repository = spawnSync(process.execPath, ["scripts/create-elite-solar-email-execution-release.mjs", "--proposal", proposal, "--request", releaseRequest, "--hmac-key-file", key, "--output", join(process.cwd(), "release.json")], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(repository.status, 0);
    assert.match(repository.stderr, /ELITE_SOLAR_EMAIL_EXECUTION_RELEASE_FAILED/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("release-key provisioner creates an independent external binary key without printing it", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "elite-email-release-key-"));
  try {
    const destination = join(sandbox, "key-material");
    const result = spawnSync(process.execPath, ["scripts/provision-elite-solar-email-release-key.mjs", "--destination", destination, "--key-id", "elite-email-release-v1"], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.key_file_created, true);
    assert.equal(report.key_printed, false);
    assert.equal(report.provider_write_performed, false);
    assert.equal(readFileSync(join(destination, "elite-solar-email-execution-release-hmac-v1.bin")).byteLength, 32);
    assert.equal(result.stdout.includes(readFileSync(join(destination, "elite-solar-email-execution-release-hmac-v1.bin")).toString("hex")), false);

    const repository = spawnSync(process.execPath, ["scripts/provision-elite-solar-email-release-key.mjs", "--destination", join(process.cwd(), "email-release-key"), "--key-id", "elite-email-release-v1"], { cwd: process.cwd(), encoding: "utf8" });
    assert.notEqual(repository.status, 0);
    assert.match(repository.stderr, /ELITE_SOLAR_EMAIL_RELEASE_KEY_PROVISION_FAILED/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
