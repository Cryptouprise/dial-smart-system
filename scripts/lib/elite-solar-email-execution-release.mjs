import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});
const NO_SIDE_EFFECTS = Object.freeze({
  database_reads: 0,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});
const HANDOFF_NEXT_ACTION = "A named reviewer must verify the recipient manifest, suppression snapshot, provider account, and exact approved copy outside this process before any provider-side import or send.";
const RELEASE_BODY_FIELDS = Object.freeze([
  "kind", "status", "organization_id", "campaign_id", "provider", "sender_domain", "provider_account_reference",
  "recipient_manifest_sha256", "recipient_count", "source_release_reference", "suppression_snapshot_sha256", "approvals",
  "handoff_proposal_sha256", "execution_key_id", "signer_principal_reference", "idempotency_key", "issued_at", "expires_at",
]);

export class EliteSolarEmailExecutionReleaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EliteSolarEmailExecutionReleaseError";
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exact(value, path, fields) {
  if (!isRecord(value)) throw new EliteSolarEmailExecutionReleaseError("OBJECT_REQUIRED", `${path} must be an object`);
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new EliteSolarEmailExecutionReleaseError("UNKNOWN_FIELD", `${path}.${key} is not allowed`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new EliteSolarEmailExecutionReleaseError("REQUIRED_FIELD", `${path}.${key} is required`);
  }
  return value;
}

function text(value, path, minimum, maximum) {
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum) {
    throw new EliteSolarEmailExecutionReleaseError("TEXT_INVALID", `${path} must be a trimmed ${minimum}-${maximum} character string`);
  }
  if (/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) {
    throw new EliteSolarEmailExecutionReleaseError("TEXT_UNSAFE", `${path} contains unsafe formatting characters`);
  }
  return value;
}

function uuid(value, path) {
  const candidate = text(value, path, 36, 36);
  if (!UUID.test(candidate)) throw new EliteSolarEmailExecutionReleaseError("UUID_INVALID", `${path} must be a canonical lowercase UUID`);
  return candidate;
}

function reference(value, path) {
  const candidate = text(value, path, 8, 256);
  if (!REFERENCE.test(candidate)) throw new EliteSolarEmailExecutionReleaseError("REFERENCE_INVALID", `${path} must be a safe non-PII reference`);
  return candidate;
}

function digest(value, path) {
  const candidate = text(value, path, 64, 64);
  if (!SHA256.test(candidate)) throw new EliteSolarEmailExecutionReleaseError("SHA256_INVALID", `${path} must be a SHA-256 digest`);
  return candidate.toLowerCase();
}

function domain(value, path) {
  const candidate = text(value, path, 4, 253).toLowerCase();
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) {
    throw new EliteSolarEmailExecutionReleaseError("DOMAIN_INVALID", `${path} must be a domain name`);
  }
  return candidate;
}

function integer(value, path, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EliteSolarEmailExecutionReleaseError("INTEGER_INVALID", `${path} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function date(value, path) {
  const candidate = text(value, path, 20, 40);
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) throw new EliteSolarEmailExecutionReleaseError("TIMESTAMP_INVALID", `${path} must be ISO-8601`);
  return new Date(parsed).toISOString();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function hmacKey(value) {
  if (!(value instanceof Uint8Array) || value.byteLength < 32 || value.byteLength > 4096) {
    throw new EliteSolarEmailExecutionReleaseError("HMAC_KEY_INVALID", "execution_hmac_key must contain 32-4096 binary bytes");
  }
  const key = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  const distinct = new Set(key).size;
  const printable = [...key].filter((byte) => byte >= 0x20 && byte <= 0x7e).length;
  if (distinct < 16 || printable / key.length > 0.75) {
    throw new EliteSolarEmailExecutionReleaseError("HMAC_KEY_INVALID", "execution_hmac_key must be high-entropy binary material");
  }
  return key;
}

function signature(key, body) {
  return `hmac-sha256:${createHmac("sha256", key).update(canonicalJson(body), "utf8").digest("hex")}`;
}

function sameSignature(left, right) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function proposalCore(proposal) {
  return {
    kind: "elite_solar_email_provider_handoff_proposal_v1",
    organization_id: proposal.organization_id,
    campaign_id: proposal.campaign_id,
    campaign_name: proposal.campaign_name,
    provider: proposal.provider,
    sender_domain: proposal.sender_domain,
    provider_account_reference: proposal.provider_account_reference,
    recipient_manifest_sha256: proposal.recipient_manifest_sha256,
    recipient_count: proposal.recipient_count,
    source_release_reference: proposal.source_release_reference,
    suppression_snapshot_sha256: proposal.suppression_snapshot_sha256,
    approvals: proposal.approvals,
    expires_at: proposal.expires_at,
  };
}

function validateHandoffProposal(value) {
  const proposal = exact(value, "$.proposal", [
    "operation", "status", "kind", "organization_id", "campaign_id", "campaign_name", "provider", "sender_domain",
    "provider_account_reference", "recipient_manifest_sha256", "recipient_count", "source_release_reference",
    "suppression_snapshot_sha256", "approvals", "expires_at", "recipient_data_included", "provider_action",
    "next_human_action", "authority", "side_effect_invariants", "proposal_sha256",
  ]);
  if (proposal.operation !== "review_only_no_provider_action" || proposal.status !== "awaiting_separate_human_provider_execution"
    || proposal.kind !== "elite_solar_email_provider_handoff_proposal_v1" || proposal.provider_action !== "none") {
    throw new EliteSolarEmailExecutionReleaseError("HANDOFF_STATE_INVALID", "The handoff proposal is not a reviewed no-provider-action Elite release");
  }
  const parsed = {
    organization_id: uuid(proposal.organization_id, "$.proposal.organization_id"),
    campaign_id: uuid(proposal.campaign_id, "$.proposal.campaign_id"),
    campaign_name: text(proposal.campaign_name, "$.proposal.campaign_name", 3, 160),
    provider: text(proposal.provider, "$.proposal.provider", 7, 16),
    sender_domain: domain(proposal.sender_domain, "$.proposal.sender_domain"),
    provider_account_reference: reference(proposal.provider_account_reference, "$.proposal.provider_account_reference"),
    recipient_manifest_sha256: digest(proposal.recipient_manifest_sha256, "$.proposal.recipient_manifest_sha256"),
    recipient_count: integer(proposal.recipient_count, "$.proposal.recipient_count", 1, 25),
    source_release_reference: reference(proposal.source_release_reference, "$.proposal.source_release_reference"),
    suppression_snapshot_sha256: digest(proposal.suppression_snapshot_sha256, "$.proposal.suppression_snapshot_sha256"),
    approvals: exact(proposal.approvals, "$.proposal.approvals", ["copy", "compliance", "owner"]),
    expires_at: date(proposal.expires_at, "$.proposal.expires_at"),
  };
  if (parsed.provider !== "instantly" && parsed.provider !== "mailgun") {
    throw new EliteSolarEmailExecutionReleaseError("PROVIDER_UNSUPPORTED", "Only Instantly or Mailgun are valid Elite email handoff providers");
  }
  parsed.approvals = {
    copy: reference(parsed.approvals.copy, "$.proposal.approvals.copy"),
    compliance: reference(parsed.approvals.compliance, "$.proposal.approvals.compliance"),
    owner: reference(parsed.approvals.owner, "$.proposal.approvals.owner"),
  };
  if (proposal.recipient_data_included !== false || proposal.next_human_action !== HANDOFF_NEXT_ACTION) {
    throw new EliteSolarEmailExecutionReleaseError("HANDOFF_PII_OR_ACTION_INVALID", "The handoff proposal has an unexpected recipient or action surface");
  }
  if (canonicalJson(proposal.authority) !== canonicalJson(NO_AUTHORITY) || canonicalJson(proposal.side_effect_invariants) !== canonicalJson(NO_SIDE_EFFECTS)) {
    throw new EliteSolarEmailExecutionReleaseError("HANDOFF_AUTHORITY_INVALID", "The handoff proposal must preserve every no-authority invariant");
  }
  const core = proposalCore(parsed);
  if (digest(proposal.proposal_sha256, "$.proposal.proposal_sha256") !== createHash("sha256").update(canonicalJson(core), "utf8").digest("hex")) {
    throw new EliteSolarEmailExecutionReleaseError("HANDOFF_DIGEST_MISMATCH", "The handoff proposal digest does not match its reviewed contents");
  }
  return Object.freeze({ ...parsed, proposal_sha256: proposal.proposal_sha256.toLowerCase() });
}

function validateRequest(value, now, handoffExpiresAt) {
  const request = exact(value, "$.request", ["version", "execution_key_id", "signer_principal_reference", "idempotency_key", "expires_at"]);
  if (request.version !== "elite.solar.email.execution.release.v1") {
    throw new EliteSolarEmailExecutionReleaseError("VERSION_UNSUPPORTED", "$.request.version is unsupported");
  }
  const expiresAt = date(request.expires_at, "$.request.expires_at");
  const expiry = Date.parse(expiresAt);
  const minimum = now.getTime() + 10 * 60 * 1000;
  const maximum = Math.min(Date.parse(handoffExpiresAt), now.getTime() + 24 * 60 * 60 * 1000);
  if (expiry < minimum || expiry > maximum) {
    throw new EliteSolarEmailExecutionReleaseError("EXPIRY_INVALID", "$.request.expires_at must be 10 minutes through the handoff expiry (and at most 24 hours) in the future");
  }
  const idempotencyKey = text(request.idempotency_key, "$.request.idempotency_key", 16, 128);
  if (!IDEMPOTENCY.test(idempotencyKey)) {
    throw new EliteSolarEmailExecutionReleaseError("IDEMPOTENCY_KEY_INVALID", "$.request.idempotency_key must be a bounded safe identifier");
  }
  return Object.freeze({
    execution_key_id: reference(request.execution_key_id, "$.request.execution_key_id"),
    signer_principal_reference: reference(request.signer_principal_reference, "$.request.signer_principal_reference"),
    idempotency_key: idempotencyKey,
    expires_at: expiresAt,
  });
}

function releaseBody(handoff, request, now) {
  return Object.freeze({
    kind: "elite_solar_email_execution_release_candidate_v1",
    status: "pending_future_server_adapter_verification",
    organization_id: handoff.organization_id,
    campaign_id: handoff.campaign_id,
    provider: handoff.provider,
    sender_domain: handoff.sender_domain,
    provider_account_reference: handoff.provider_account_reference,
    recipient_manifest_sha256: handoff.recipient_manifest_sha256,
    recipient_count: handoff.recipient_count,
    source_release_reference: handoff.source_release_reference,
    suppression_snapshot_sha256: handoff.suppression_snapshot_sha256,
    approvals: handoff.approvals,
    handoff_proposal_sha256: handoff.proposal_sha256,
    execution_key_id: request.execution_key_id,
    signer_principal_reference: request.signer_principal_reference,
    idempotency_key: request.idempotency_key,
    issued_at: now.toISOString(),
    expires_at: request.expires_at,
  });
}

function validateReleaseBody(value) {
  const body = exact(value, "$.release", RELEASE_BODY_FIELDS);
  if (body.kind !== "elite_solar_email_execution_release_candidate_v1" || body.status !== "pending_future_server_adapter_verification") {
    throw new EliteSolarEmailExecutionReleaseError("RELEASE_STATE_INVALID", "The execution release candidate has an invalid state");
  }
  const parsed = {
    ...body,
    organization_id: uuid(body.organization_id, "$.release.organization_id"),
    campaign_id: uuid(body.campaign_id, "$.release.campaign_id"),
    provider: text(body.provider, "$.release.provider", 7, 16),
    sender_domain: domain(body.sender_domain, "$.release.sender_domain"),
    provider_account_reference: reference(body.provider_account_reference, "$.release.provider_account_reference"),
    recipient_manifest_sha256: digest(body.recipient_manifest_sha256, "$.release.recipient_manifest_sha256"),
    recipient_count: integer(body.recipient_count, "$.release.recipient_count", 1, 25),
    source_release_reference: reference(body.source_release_reference, "$.release.source_release_reference"),
    suppression_snapshot_sha256: digest(body.suppression_snapshot_sha256, "$.release.suppression_snapshot_sha256"),
    approvals: exact(body.approvals, "$.release.approvals", ["copy", "compliance", "owner"]),
    handoff_proposal_sha256: digest(body.handoff_proposal_sha256, "$.release.handoff_proposal_sha256"),
    execution_key_id: reference(body.execution_key_id, "$.release.execution_key_id"),
    signer_principal_reference: reference(body.signer_principal_reference, "$.release.signer_principal_reference"),
    issued_at: date(body.issued_at, "$.release.issued_at"),
    expires_at: date(body.expires_at, "$.release.expires_at"),
  };
  if (parsed.provider !== "instantly" && parsed.provider !== "mailgun") throw new EliteSolarEmailExecutionReleaseError("PROVIDER_UNSUPPORTED", "Release provider is unsupported");
  if (!IDEMPOTENCY.test(text(body.idempotency_key, "$.release.idempotency_key", 16, 128))) throw new EliteSolarEmailExecutionReleaseError("IDEMPOTENCY_KEY_INVALID", "Release idempotency key is invalid");
  parsed.idempotency_key = body.idempotency_key;
  parsed.approvals = {
    copy: reference(parsed.approvals.copy, "$.release.approvals.copy"),
    compliance: reference(parsed.approvals.compliance, "$.release.approvals.compliance"),
    owner: reference(parsed.approvals.owner, "$.release.approvals.owner"),
  };
  return Object.freeze(parsed);
}

/**
 * Creates a tenant/campaign-bound signed release candidate. It has no provider
 * client and it does not authorize a send; a future server adapter must verify
 * its signature, expiry, idempotency key, durable replay claim, and all live
 * provider/source/suppression gates independently.
 */
export function buildEliteSolarEmailExecutionRelease({ handoffProposal, request, executionHmacKey, now = new Date() }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new EliteSolarEmailExecutionReleaseError("NOW_INVALID", "now must be a valid Date");
  const handoff = validateHandoffProposal(handoffProposal);
  const parsedRequest = validateRequest(request, now, handoff.expires_at);
  const key = hmacKey(executionHmacKey);
  const body = releaseBody(handoff, parsedRequest, now);
  return Object.freeze({
    ...body,
    signature: signature(key, body),
    recipient_data_included: false,
    provider_action: "none",
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}

/** Verifies only the signed release artifact; it performs no replay claim or I/O. */
export function verifyEliteSolarEmailExecutionRelease({ release, executionHmacKey, now = new Date() }) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new EliteSolarEmailExecutionReleaseError("NOW_INVALID", "now must be a valid Date");
  const root = exact(release, "$.release", [
    ...RELEASE_BODY_FIELDS,
    "signature", "recipient_data_included", "provider_action", "authority", "side_effect_invariants",
  ]);
  const body = validateReleaseBody(Object.fromEntries(RELEASE_BODY_FIELDS.map((field) => [field, root[field]])));
  const supplied = text(root.signature, "$.release.signature", 76, 76);
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(supplied)) throw new EliteSolarEmailExecutionReleaseError("SIGNATURE_INVALID", "Release signature format is invalid");
  if (root.recipient_data_included !== false || root.provider_action !== "none"
    || canonicalJson(root.authority) !== canonicalJson(NO_AUTHORITY)
    || canonicalJson(root.side_effect_invariants) !== canonicalJson(NO_SIDE_EFFECTS)) {
    throw new EliteSolarEmailExecutionReleaseError("RELEASE_AUTHORITY_INVALID", "Release candidate violates no-authority invariants");
  }
  const validSignature = sameSignature(supplied, signature(hmacKey(executionHmacKey), body));
  const valid = validSignature && Date.parse(body.expires_at) > now.getTime();
  return Object.freeze({
    kind: "elite_solar_email_execution_release_verification_v1",
    valid,
    verification_status: validSignature ? (valid ? "valid_pending_adapter_verification" : "expired") : "signature_invalid",
    provider: body.provider,
    recipient_count: body.recipient_count,
    expires_at: body.expires_at,
    release_fingerprint: `sha256:${createHash("sha256").update(canonicalJson(body), "utf8").digest("hex")}`,
    provider_action: "none",
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}
