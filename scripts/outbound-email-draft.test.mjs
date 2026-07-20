import assert from "node:assert/strict";
import test from "node:test";
import {
  OutboundEmailDraftError,
  compileOutboundEmailDraft,
} from "./lib/outbound-email-draft.mjs";

const input = () => ({
  version: "outbound.email.draft.v1",
  organization_id: "123e4567-e89b-42d3-a456-426614174000",
  campaign_id: "223e4567-e89b-42d3-a456-426614174000",
  campaign_name: "Elite Solar outbound email research",
  provider: "instantly",
  source: {
    kind: "prospecting_list",
    evidence_reference: "source-review-2026-07-19",
    recipient_data_included: false,
    list_hygiene_verified: true,
  },
  sender: {
    domain: "mail.elitesolar.example",
    mailbox_reference: "instantly-account-01",
    domain_verified: true,
    reply_handling_verified: true,
    provider_binding_verified: true,
  },
  message: {
    subject_reference: "copy-email-001-subject",
    body_reference: "copy-email-001-body",
    claim_review_verified: true,
    unsubscribe_marker_present: true,
  },
  compliance: {
    sender_identity_reference: "entity-disclosure-001",
    postal_address_reference: "address-disclosure-001",
    unsubscribe_url: "https://mail.elitesolar.example/unsubscribe",
    suppression_sync_verified: true,
    jurisdiction_review_reference: "email-compliance-review-001",
  },
  review: {
    copy_approval_reference: "copy-approval-001",
    owner_approval_reference: "owner-approval-001",
    provider_health_reference: "instantly-health-001",
  },
});

test("compiles an Instantly draft without recipient data or provider action", () => {
  const draft = compileOutboundEmailDraft(input());
  assert.equal(draft.status, "draft_ready_for_human_provider_review");
  assert.equal(draft.provider, "instantly");
  assert.equal(draft.provider_action, "none");
  assert.equal(draft.recipient_data_included, false);
  assert.deepEqual(draft.unmet_gates, []);
  assert.deepEqual(draft.authority, {
    contact_authorized: false,
    launch_authorized: false,
    queue_mutation_authorized: false,
    crm_write_authorized: false,
    spend_authorized: false,
  });
});

test("holds a Mailgun draft when sender, source, and suppression checks have not passed", () => {
  const candidate = input();
  candidate.provider = "mailgun";
  candidate.source.list_hygiene_verified = false;
  candidate.sender.domain_verified = false;
  candidate.compliance.suppression_sync_verified = false;
  const draft = compileOutboundEmailDraft(candidate);
  assert.equal(draft.status, "held");
  assert.deepEqual(draft.unmet_gates, ["list_hygiene", "sender_domain", "suppression_sync"]);
  assert.equal(draft.provider_action, "none");
});

test("rejects recipient data, credentials, and unknown fields from a no-send draft", () => {
  const withRecipients = input();
  withRecipients.source.recipient_data_included = true;
  assert.throws(
    () => compileOutboundEmailDraft(withRecipients),
    (error) => error instanceof OutboundEmailDraftError && error.code === "RECIPIENT_DATA_FORBIDDEN",
  );

  const withCredential = input();
  withCredential.sender.api_key = "secret-must-never-enter-the-draft";
  assert.throws(
    () => compileOutboundEmailDraft(withCredential),
    (error) => error instanceof OutboundEmailDraftError && error.code === "UNKNOWN_FIELD",
  );
});
