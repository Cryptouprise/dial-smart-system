import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildGhlShadowReconciliationReport,
  GHL_SHADOW_EXPORT_REASON_CODES,
  parseStrictJsonDocument,
  verifyGhlShadowReconciliationReport,
} from "./lib/ghl-shadow-reconciliation.mjs";

const ORGANIZATION_ID = "d2000000-0000-4000-8000-000000000001";
const BINDING_ID = "d1000000-0000-4000-8000-000000000001";
const RECEIPT_ID = "d3000000-0000-4000-8000-000000000001";
const ATTEMPT_ONE = "d4000000-0000-4000-8000-000000000001";
const ATTEMPT_TWO = "d4000000-0000-4000-8000-000000000002";

function hash(character) {
  return character.repeat(64);
}

function safety() {
  return {
    contact_authorized: false,
    launch_authorized: false,
    provider_invocation_authorized: false,
    queue_mutation_authorized: false,
    crm_mutation_authorized: false,
    external_effects_created: false,
    external_trust_required: true,
  };
}

function evidence() {
  return {
    schema_version: "1.0.0",
    evidence_scope: "zero_contact_shadow_observation_only",
    payload_sha256: hash("a"),
    signature_scheme: "x-ghl-signature-ed25519",
    event_type: "ContactDndUpdate",
    mapping_version: "solar-ghl-map-v1",
    identifier_key_version: "elite-shadow-identifiers-v1",
    mapping_sha256: hash("b"),
    policy_version: "solar-policy-v1",
    policy_sha256: hash("c"),
    mapped_field_presence: {
      ai_voice_calls_authorized: true,
      telemarketing_calls_authorized: true,
      consent_artifact_id: true,
      consent_consumer_name: true,
      consent_phone: true,
      consent_lead_source: true,
      consent_disclosure_text: true,
      signature_evidence: true,
      source_form_version: true,
      not_condition_of_purchase_disclosure: true,
      consent_text_version: true,
      consent_captured_at: true,
      consent_seller: true,
      consent_revoked_at: true,
      property_state: true,
      calling_state: true,
    },
    source_contact_identifier_hmac: hash("d"),
    consent_phone_identifier_hmac: hash("e"),
    consent_consumer_identifier_hmac: hash("f"),
    consent_signature_identifier_hmac: hash("1"),
    consent_artifact_identifier_hmac: hash("2"),
    consent_source_identifier_hmac: hash("3"),
    consent_disclosure_sha256: hash("4"),
    current_contact_phone_matches_consent_phone: true,
    current_contact_state_ignored: true,
    current_contact_source_ignored: true,
    exact_boolean_consent_types: true,
    consent_captured_at_valid: true,
    consent_not_revoked: true,
    source_timestamp_present: true,
    source_timestamp_valid: true,
    source_timestamp_fresh_for_ordering: true,
    source_timestamp_sha256: hash("5"),
    ghl_dnd_clear_from_contact_dnd_update: true,
    external_suppression_evidence_present: false,
    contact_authorized: false,
    launch_authorized: false,
    external_effects_created: false,
    external_trust_required: true,
  };
}

function receipt() {
  return {
    receipt_id: RECEIPT_ID,
    binding_id: BINDING_ID,
    organization_id: ORGANIZATION_ID,
    installation_scope_sha256: hash("6"),
    location_identifier_sha256: hash("7"),
    payload_sha256: hash("a"),
    webhook_id_sha256: hash("8"),
    signature_scheme: "x-ghl-signature-ed25519",
    event_type: "ContactDndUpdate",
    source_occurred_at: "2026-07-13T15:59:00.000000Z",
    source_contact_identifier_hmac: hash("d"),
    consent_phone_identifier_hmac: hash("e"),
    decision: "held",
    reason_codes: ["EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED"],
    evidence: evidence(),
    webhook_id_collision: false,
    received_at: "2026-07-13T16:00:00.000000Z",
    contact_authorized: false,
    launch_authorized: false,
    external_effects_created: false,
    external_trust_required: true,
  };
}

function attempt(id, status, attemptedAt) {
  return {
    attempt_id: id,
    receipt_id: RECEIPT_ID,
    binding_id: BINDING_ID,
    organization_id: ORGANIZATION_ID,
    installation_scope_sha256: hash("6"),
    payload_sha256: hash("a"),
    webhook_id_sha256: hash("8"),
    commit_status: status,
    decision: "held",
    reason_codes: ["EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED"],
    attempted_at: attemptedAt,
    ...safety(),
  };
}

function validExport() {
  return {
    schema_version: "1.0.0",
    export_type: "ghl_solar_exit_shadow_reconciliation_evidence",
    evidence_scope: "zero_contact_reconciliation_only",
    organization_id: ORGANIZATION_ID,
    campaign_key: "solar-exit",
    window: {
      start_inclusive: "2026-07-13T15:00:00.000000Z",
      end_exclusive: "2026-07-13T17:00:00.000000Z",
    },
    selection_semantics:
      "receipts_or_delivery_attempts_active_in_window_with_receipt_attempt_history_before_window_end",
    row_counts: {
      receipts: 1,
      delivery_attempts: 2,
      webhook_id_ledger_entries: 1,
    },
    receipts: [receipt()],
    delivery_attempts: [
      attempt(ATTEMPT_ONE, "committed", "2026-07-13T16:00:00.000000Z"),
      attempt(ATTEMPT_TWO, "duplicate", "2026-07-13T16:01:00.000000Z"),
    ],
    webhook_id_ledger: [{
      installation_scope_sha256: hash("6"),
      webhook_id_sha256: hash("8"),
      first_payload_sha256: hash("a"),
      created_at: "2026-07-13T16:00:00.000000Z",
    }],
    safety_invariants: safety(),
  };
}

function validComparison() {
  const projectedEvidence = evidence();
  delete projectedEvidence.schema_version;
  delete projectedEvidence.evidence_scope;
  delete projectedEvidence.payload_sha256;
  return {
    schema_version: "1.0.0",
    comparison_type: "independently_normalized_ghl_shadow_source",
    evidence_scope: "zero_contact_independent_comparison_only",
    organization_id: ORGANIZATION_ID,
    campaign_key: "solar-exit",
    window: {
      start_inclusive: "2026-07-13T15:00:00.000000Z",
      end_exclusive: "2026-07-13T17:00:00.000000Z",
    },
    source_system: "gohighlevel",
    source_export_id: "d5000000-0000-4000-8000-000000000001",
    source_export_evidence_id: "d6000000-0000-4000-8000-000000000001",
    source_export_fingerprint: {
      scheme: "hmac-sha256-v1",
      key_id: "elite-ghl-source-export-v1",
      scope: "independently_normalized_source_export",
      synthetic_only: false,
      value: hash("9"),
    },
    normalizer: "independent-ghl-source-normalizer",
    normalizer_version: "1.0.0",
    rows: [{
      comparison_id: "d7000000-0000-4000-8000-000000000001",
      webhook_id_sha256: hash("8"),
      organization_id: ORGANIZATION_ID,
      location_identifier_sha256: hash("7"),
      source_contact_identifier_hmac: hash("d"),
      consent_phone_identifier_hmac: hash("e"),
      decision: "held",
      reason_codes: ["EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED"],
      evidence_projection: projectedEvidence,
    }],
    safety_invariants: safety(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).reverse().map((
      key,
    ) => [key, reverseObjectKeys(value[key])]),
  );
}

test("reconciles a committed delivery plus exact retry without granting contact authority", () => {
  const report = buildGhlShadowReconciliationReport(
    validExport(),
    validComparison(),
  );
  assert.equal(report.report_status, "reconciled");
  assert.equal(report.integrity.finding_count, 0);
  assert.equal(report.totals.receipts, 1);
  assert.equal(report.totals.exact_retry_deliveries, 1);
  assert.equal(report.totals.unique_contacts_observed, 1);
  assert.equal(report.totals.independently_matched_receipts, 1);
  assert.equal(
    report.solar_exit_gate_evidence.independent_source_comparison_present,
    true,
  );
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_records_expected, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_records_matched, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatches, 0);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_contacts_compared, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatch_rate, 0);
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    true,
  );
  assert.equal(report.solar_exit_gate_evidence.certificate_created, false);
  assert.equal(report.solar_exit_gate_evidence.contact_authorized, false);
  assert.equal(report.side_effect_invariants.database_writes_by_reconciler, 0);
  assert.equal(verifyGhlShadowReconciliationReport(report), true);
});

test("a clean comparison remains review-only and cannot masquerade as an attested certificate", () => {
  const comparison = validComparison();
  assert.equal(comparison.source_export_fingerprint.synthetic_only, false);

  const report = buildGhlShadowReconciliationReport(validExport(), comparison);
  assert.equal(report.report_status, "reconciled");
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    true,
  );
  assert.equal(
    report.solar_exit_gate_evidence.report_authority,
    "review_only_unattested",
  );
  assert.equal(
    report.solar_exit_gate_evidence.source_fingerprint_verified,
    false,
  );
  assert.equal(
    report.solar_exit_gate_evidence.external_attestation_verified,
    false,
  );
  assert.equal(
    report.solar_exit_gate_evidence.external_attestation_required,
    true,
  );
  assert.equal(report.solar_exit_gate_evidence.certificate_created, false);
  assert.equal(report.solar_exit_gate_evidence.launch_authorized, false);
});

test("report is byte-deterministic across JSON object key order", () => {
  const left = buildGhlShadowReconciliationReport(
    validExport(),
    validComparison(),
  );
  const right = buildGhlShadowReconciliationReport(
    reverseObjectKeys(validExport()),
    reverseObjectKeys(validComparison()),
  );
  assert.deepEqual(left, right);
  assert.equal(left.report_sha256, right.report_sha256);
});

test("lineage without an independent source comparison cannot claim compared contacts or zero mismatch", () => {
  const report = buildGhlShadowReconciliationReport(validExport());
  assert.equal(report.report_status, "comparison_required");
  assert.equal(
    report.solar_exit_gate_evidence.independent_source_comparison_present,
    false,
  );
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_contacts_compared, 0);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatch_rate, null);
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    false,
  );
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "INDEPENDENT_SOURCE_COMPARISON_REQUIRED"
    ),
  );
  assert.equal(verifyGhlShadowReconciliationReport(report), true);
});

test("independently normalized consent/revocation drift is a real shadow mismatch", () => {
  const comparison = validComparison();
  comparison.rows[0].evidence_projection.consent_not_revoked = false;
  const report = buildGhlShadowReconciliationReport(validExport(), comparison);
  assert.equal(report.report_status, "mismatch_detected");
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_records_expected, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_records_matched, 0);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatches, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatch_rate, 1);
  const finding = report.integrity.findings.find((candidate) =>
    candidate.code === "INDEPENDENT_SOURCE_COMPARISON_MISMATCH"
  );
  assert(
    finding.differing_fields.includes(
      "evidence_projection.consent_not_revoked",
    ),
  );
});

test("strict parser rejects duplicate keys including escaped equivalents", () => {
  assert.throws(
    () => parseStrictJsonDocument('{"tenant":1,"tenant":2}'),
    /Duplicate JSON object key/,
  );
  assert.throws(
    () => parseStrictJsonDocument('{"tenant":1,"ten\\u0061nt":2}'),
    /Duplicate JSON object key/,
  );
});

test("database and Node export boundaries pin the same finite non-PII reason-code vocabulary", () => {
  const migration = readFileSync(
    resolve(
      "supabase/migrations/20260713075000_ghl_shadow_reconciliation_export.sql",
    ),
    "utf8",
  );
  const block = migration.match(
    /candidate\.reason = ANY\(ARRAY\[(.*?)\]::text\[\]\)/s,
  )?.[1];
  assert(block, "SQL reason-code allowlist was not found");
  const sqlCodes = [...block.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) =>
    match[1]
  ).sort();
  assert.deepEqual(sqlCodes, [...GHL_SHADOW_EXPORT_REASON_CODES]);

  const encodedPii = validExport();
  encodedPii.receipts[0].reason_codes = ["PHONE_13035550123"];
  assert.throws(
    () => buildGhlShadowReconciliationReport(encodedPii, validComparison()),
    /non-allowlisted reason code/,
  );
});

test("unknown raw-PII-shaped fields are rejected before any unkeyed source hash is created", () => {
  const input = validExport();
  input.receipts[0].phone_number = "+13035550123";
  assert.throws(
    () => buildGhlShadowReconciliationReport(input, validComparison()),
    /keys must be exactly/,
  );

  const comparison = validComparison();
  comparison.rows[0].consumer_name = "Raw Name";
  assert.throws(
    () => buildGhlShadowReconciliationReport(validExport(), comparison),
    /keys must be exactly/,
  );
});

test("cross-tenant receipt and attempt rows fail closed instead of appearing in a report", () => {
  const receiptLeak = validExport();
  receiptLeak.receipts[0].organization_id =
    "d2000000-0000-4000-8000-000000000002";
  assert.throws(
    () => buildGhlShadowReconciliationReport(receiptLeak, validComparison()),
    /tenant boundary/,
  );

  const attemptLeak = validExport();
  attemptLeak.delivery_attempts[0].organization_id =
    "d2000000-0000-4000-8000-000000000002";
  assert.throws(
    () => buildGhlShadowReconciliationReport(attemptLeak, validComparison()),
    /tenant boundary/,
  );

  const comparisonLeak = validComparison();
  comparisonLeak.organization_id = "d2000000-0000-4000-8000-000000000002";
  assert.throws(
    () => buildGhlShadowReconciliationReport(validExport(), comparisonLeak),
    /tenant boundary/,
  );
});

test("attempt-to-receipt tampering is deterministic mismatch evidence", () => {
  const input = validExport();
  input.delivery_attempts[1].payload_sha256 = hash("9");
  const report = buildGhlShadowReconciliationReport(input, validComparison());
  assert.equal(report.report_status, "mismatch_detected");
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "ATTEMPT_RECEIPT_BINDING_MISMATCH"
    ),
  );
  assert.equal(report.integrity.receipt_integrity_mismatch_rate, 1);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatch_rate, 1);
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    false,
  );
  assert.equal(verifyGhlShadowReconciliationReport(report), true);
});

test("webhook-id payload collision remains launch-blocking reconciliation evidence", () => {
  const input = validExport();
  input.receipts[0].payload_sha256 = hash("9");
  input.receipts[0].evidence.payload_sha256 = hash("9");
  input.receipts[0].decision = "quarantined";
  input.receipts[0].reason_codes = [
    "EXTERNAL_SUPPRESSION_EVIDENCE_REQUIRED",
    "WEBHOOK_ID_PAYLOAD_COLLISION",
  ];
  input.receipts[0].webhook_id_collision = true;
  input.delivery_attempts = [
    attempt(ATTEMPT_ONE, "webhook_id_collision", "2026-07-13T16:00:00.000000Z"),
  ];
  input.delivery_attempts[0].payload_sha256 = hash("9");
  input.delivery_attempts[0].decision = "quarantined";
  input.delivery_attempts[0].reason_codes = [...input.receipts[0].reason_codes];
  input.row_counts.delivery_attempts = 1;
  const report = buildGhlShadowReconciliationReport(input, validComparison());
  assert.equal(report.report_status, "mismatch_detected");
  assert.equal(
    report.replay_duplicate_accounting.webhook_id_payload_collisions,
    1,
  );
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "WEBHOOK_ID_PAYLOAD_COLLISION_OBSERVED"
    ),
  );
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    false,
  );
});

test("missing and orphan attempt evidence cannot produce a clean reconciliation", () => {
  const missing = validExport();
  missing.delivery_attempts = [];
  missing.row_counts.delivery_attempts = 0;
  let report = buildGhlShadowReconciliationReport(missing, validComparison());
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "RECEIPT_MISSING_DELIVERY_ATTEMPT_EVIDENCE"
    ),
  );

  const orphan = validExport();
  orphan.delivery_attempts[1].receipt_id =
    "d3000000-0000-4000-8000-000000000002";
  report = buildGhlShadowReconciliationReport(orphan, validComparison());
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "ORPHAN_DELIVERY_ATTEMPT"
    ),
  );
});

test("row count and ordering drift are visible instead of normalized away", () => {
  const input = validExport();
  input.row_counts.delivery_attempts = 1;
  input.delivery_attempts.reverse();
  const report = buildGhlShadowReconciliationReport(input, validComparison());
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "EXPORT_ROW_COUNT_MISMATCH"
    ),
  );
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "ATTEMPT_ORDER_NONCANONICAL"
    ),
  );
});

test("empty export is honest no-evidence output and cannot enter certificate review", () => {
  const input = validExport();
  input.receipts = [];
  input.delivery_attempts = [];
  input.webhook_id_ledger = [];
  input.row_counts = {
    receipts: 0,
    delivery_attempts: 0,
    webhook_id_ledger_entries: 0,
  };
  const comparison = validComparison();
  comparison.rows = [];
  const report = buildGhlShadowReconciliationReport(input, comparison);
  assert.equal(report.report_status, "no_evidence");
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_contacts_compared, 0);
  assert.equal(report.solar_exit_gate_evidence.ghl_shadow_mismatch_rate, null);
  assert.equal(
    report.solar_exit_gate_evidence.suitable_for_external_certificate_review,
    false,
  );
  assert(
    report.integrity.findings.some((finding) =>
      finding.code === "NO_SHADOW_EVIDENCE"
    ),
  );
});

test("whole-report, row-array, and evidence-chain tampering fails verification", () => {
  const report = buildGhlShadowReconciliationReport(
    validExport(),
    validComparison(),
  );
  for (
    const mutate of [
      (value) => {
        value.totals.exact_retry_deliveries = 9;
      },
      (value) => {
        value.evidence_hashes.receipts_sha256 = hash("0");
      },
      (value) => {
        value.source_export.receipts[0].decision = "quarantined";
      },
      (value) => {
        value.report_sha256 = hash("f");
      },
    ]
  ) {
    const tampered = clone(report);
    mutate(tampered);
    assert.equal(verifyGhlShadowReconciliationReport(tampered), false);
  }
});

test("CLI writes a deterministic report to stdout and verify mode recomputes its internal hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "ghl-shadow-reconciliation-"));
  try {
    const inputPath = join(directory, "export.json");
    const comparisonPath = join(directory, "comparison.json");
    const reportPath = join(directory, "report.json");
    writeFileSync(inputPath, JSON.stringify(validExport()));
    writeFileSync(comparisonPath, JSON.stringify(validComparison()));
    const command = resolve("scripts/reconcile-ghl-shadow-evidence.mjs");
    const built = spawnSync(
      process.execPath,
      [
        command,
        "--input",
        inputPath,
        "--comparison",
        comparisonPath,
        "--compact",
      ],
      { encoding: "utf8" },
    );
    assert.equal(built.status, 0, built.stderr);
    assert.equal(built.stderr, "");
    const report = JSON.parse(built.stdout);
    assert.equal(report.report_status, "reconciled");
    writeFileSync(reportPath, built.stdout);
    const verified = spawnSync(process.execPath, [
      command,
      "--verify-report",
      reportPath,
      "--compact",
    ], { encoding: "utf8" });
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(JSON.parse(verified.stdout), { valid: true });
    assert.equal(
      readFileSync(inputPath, "utf8"),
      JSON.stringify(validExport()),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
