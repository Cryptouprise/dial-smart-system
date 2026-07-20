const CANONICAL_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,255}$/;
const SAFE_DOMAIN_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PROVIDERS = new Set(["instantly", "mailgun"]);
const SOURCE_KINDS = new Set([
  "consented_database",
  "prospecting_list",
  "website_inquiry",
  "partner_referral",
]);

export class OutboundEmailDraftError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OutboundEmailDraftError";
    this.code = code;
  }
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OutboundEmailDraftError("OBJECT_REQUIRED", `${path} must be an object`);
  }
  return value;
}

function exactKeys(value, path, allowed, required = []) {
  const record = object(value, path);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new OutboundEmailDraftError("UNKNOWN_FIELD", `${path}.${key} is not allowed`);
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new OutboundEmailDraftError("REQUIRED_FIELD", `${path}.${key} is required`);
    }
  }
  return record;
}

function cleanText(value, path, minimum, maximum) {
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum) {
    throw new OutboundEmailDraftError("TEXT_INVALID", `${path} must be a trimmed ${minimum}-${maximum} character string`);
  }
  if (/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(value)) {
    throw new OutboundEmailDraftError("TEXT_UNSAFE", `${path} contains unsafe formatting characters`);
  }
  return value;
}

function canonicalUuid(value, path) {
  const uuid = cleanText(value, path, 36, 36);
  if (!CANONICAL_UUID_PATTERN.test(uuid)) {
    throw new OutboundEmailDraftError("UUID_INVALID", `${path} must be a canonical lowercase UUID`);
  }
  return uuid;
}

function reference(value, path) {
  const result = cleanText(value, path, 8, 256);
  if (!SAFE_REFERENCE_PATTERN.test(result)) {
    throw new OutboundEmailDraftError("REFERENCE_INVALID", `${path} must be a safe external reference`);
  }
  return result;
}

function boolean(value, path) {
  if (typeof value !== "boolean") {
    throw new OutboundEmailDraftError("BOOLEAN_REQUIRED", `${path} must be boolean`);
  }
  return value;
}

function httpsUrl(value, path) {
  const source = cleanText(value, path, 12, 2048);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new OutboundEmailDraftError("URL_INVALID", `${path} must be an HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new OutboundEmailDraftError("URL_INVALID", `${path} must be a safe HTTPS URL`);
  }
  return url.toString();
}

function requiredBoolean(record, key, path) {
  return boolean(record[key], `${path}.${key}`);
}

/**
 * Compile a provider-neutral outbound-email campaign into a no-send review
 * artifact. The artifact intentionally accepts no recipient data, provider
 * credential, mailbox address, or send switch. It is a policy boundary for
 * future Instantly/Mailgun integrations, not a client for either provider.
 */
export function compileOutboundEmailDraft(input) {
  const root = exactKeys(input, "$", [
    "version",
    "organization_id",
    "campaign_id",
    "campaign_name",
    "provider",
    "source",
    "sender",
    "message",
    "compliance",
    "review",
  ], [
    "version",
    "organization_id",
    "campaign_id",
    "campaign_name",
    "provider",
    "source",
    "sender",
    "message",
    "compliance",
    "review",
  ]);
  if (root.version !== "outbound.email.draft.v1") {
    throw new OutboundEmailDraftError("VERSION_UNSUPPORTED", "$.version must be outbound.email.draft.v1");
  }
  const provider = cleanText(root.provider, "$.provider", 7, 16);
  if (!PROVIDERS.has(provider)) {
    throw new OutboundEmailDraftError("PROVIDER_UNSUPPORTED", "$.provider must be instantly or mailgun");
  }

  const source = exactKeys(root.source, "$.source", [
    "kind",
    "evidence_reference",
    "recipient_data_included",
    "list_hygiene_verified",
  ], ["kind", "evidence_reference", "recipient_data_included", "list_hygiene_verified"]);
  const sourceKind = cleanText(source.kind, "$.source.kind", 8, 32);
  if (!SOURCE_KINDS.has(sourceKind)) {
    throw new OutboundEmailDraftError("SOURCE_KIND_INVALID", "$.source.kind is not allowlisted");
  }
  const recipientDataIncluded = boolean(source.recipient_data_included, "$.source.recipient_data_included");
  if (recipientDataIncluded) {
    throw new OutboundEmailDraftError(
      "RECIPIENT_DATA_FORBIDDEN",
      "Recipient data belongs in the separately approved provider import path, never in a draft artifact",
    );
  }

  const sender = exactKeys(root.sender, "$.sender", [
    "domain",
    "mailbox_reference",
    "domain_verified",
    "reply_handling_verified",
    "provider_binding_verified",
  ], ["domain", "mailbox_reference", "domain_verified", "reply_handling_verified", "provider_binding_verified"]);
  const domain = cleanText(sender.domain, "$.sender.domain", 4, 253).toLowerCase();
  if (!SAFE_DOMAIN_PATTERN.test(domain)) {
    throw new OutboundEmailDraftError("DOMAIN_INVALID", "$.sender.domain must be a valid sender domain");
  }

  const message = exactKeys(root.message, "$.message", [
    "subject_reference",
    "body_reference",
    "claim_review_verified",
    "unsubscribe_marker_present",
  ], ["subject_reference", "body_reference", "claim_review_verified", "unsubscribe_marker_present"]);
  const compliance = exactKeys(root.compliance, "$.compliance", [
    "sender_identity_reference",
    "postal_address_reference",
    "unsubscribe_url",
    "suppression_sync_verified",
    "jurisdiction_review_reference",
  ], ["sender_identity_reference", "postal_address_reference", "unsubscribe_url", "suppression_sync_verified", "jurisdiction_review_reference"]);
  const review = exactKeys(root.review, "$.review", [
    "copy_approval_reference",
    "owner_approval_reference",
    "provider_health_reference",
  ], ["copy_approval_reference", "owner_approval_reference", "provider_health_reference"]);

  const gates = [
    ["source_evidence", reference(source.evidence_reference, "$.source.evidence_reference")],
    ["list_hygiene", requiredBoolean(source, "list_hygiene_verified", "$.source")],
    ["sender_domain", requiredBoolean(sender, "domain_verified", "$.sender")],
    ["reply_handling", requiredBoolean(sender, "reply_handling_verified", "$.sender")],
    ["provider_binding", requiredBoolean(sender, "provider_binding_verified", "$.sender")],
    ["claim_review", requiredBoolean(message, "claim_review_verified", "$.message")],
    ["unsubscribe_marker", requiredBoolean(message, "unsubscribe_marker_present", "$.message")],
    ["sender_identity", reference(compliance.sender_identity_reference, "$.compliance.sender_identity_reference")],
    ["postal_address", reference(compliance.postal_address_reference, "$.compliance.postal_address_reference")],
    ["unsubscribe_url", httpsUrl(compliance.unsubscribe_url, "$.compliance.unsubscribe_url")],
    ["suppression_sync", requiredBoolean(compliance, "suppression_sync_verified", "$.compliance")],
    ["jurisdiction_review", reference(compliance.jurisdiction_review_reference, "$.compliance.jurisdiction_review_reference")],
    ["copy_approval", reference(review.copy_approval_reference, "$.review.copy_approval_reference")],
    ["owner_approval", reference(review.owner_approval_reference, "$.review.owner_approval_reference")],
    ["provider_health", reference(review.provider_health_reference, "$.review.provider_health_reference")],
  ];
  const unmet = gates.filter(([, value]) => value === false).map(([key]) => key);

  return Object.freeze({
    kind: "outbound_email_draft_v1",
    organization_id: canonicalUuid(root.organization_id, "$.organization_id"),
    campaign_id: canonicalUuid(root.campaign_id, "$.campaign_id"),
    campaign_name: cleanText(root.campaign_name, "$.campaign_name", 1, 120),
    provider,
    source_kind: sourceKind,
    sender_domain: domain,
    mailbox_reference: reference(sender.mailbox_reference, "$.sender.mailbox_reference"),
    status: unmet.length === 0 ? "draft_ready_for_human_provider_review" : "held",
    unmet_gates: Object.freeze(unmet),
    provider_action: "none",
    recipient_data_included: false,
    authority: Object.freeze({
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      spend_authorized: false,
    }),
  });
}
