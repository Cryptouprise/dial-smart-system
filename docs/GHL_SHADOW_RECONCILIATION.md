# GHL shadow reconciliation evidence

This bridge turns the signed, redacted GHL shadow lane into a deterministic audit artifact. It does not turn a shadow decision into permission to contact a lead.

## Capability boundary

The database migration adds two narrowly separated capabilities:

1. `record_ghl_shadow_ingest_receipt(...)` keeps its existing Edge-function signature, but now appends one immutable delivery-attempt row after every durable `committed`, `duplicate`, or `webhook_id_collision` result. A failure to append the attempt rolls back the receipt transaction, so the webhook handler cannot return its success acknowledgement without both pieces of evidence.
2. `export_ghl_shadow_reconciliation_evidence(...)` is a read-only `SECURITY DEFINER` RPC granted only to `authenticated`. The function independently requires a direct `organization_users` role of `owner` or `admin` for the exact organization named in the call. It never accepts a user ID from the caller and never returns another organization's rows.

The underlying bindings, receipts, delivery attempts, and webhook-ID ledger remain unavailable for direct browser, authenticated-user, and service-role table access. The export contains only UUID audit bindings, timestamps, finite allowlisted reason/event codes, policy/mapping versions, SHA-256 values, organization-scoped HMAC identifiers, and fixed no-authority flags. The RPC fails closed before export if a stored reason or event value is outside that vocabulary, so a free-form field cannot be used to smuggle contact data into the report. It contains no raw phone, name, email, address, GHL payload, custom-field value, tag, note, or credential.

Every receipt, attempt, export, and report retains:

- `contact_authorized: false`
- `launch_authorized: false`
- `external_effects_created: false`
- `external_trust_required: true`

Delivery attempts and the export additionally make provider invocation, queue mutation, and CRM mutation explicitly false.

## Export a closed tenant window

Call the RPC through an authenticated owner/admin session with an explicit closed interval:

```sql
select public.export_ghl_shadow_reconciliation_evidence(
  '<organization-uuid>'::uuid,
  '2026-07-13T15:00:00Z'::timestamptz,
  '2026-07-13T17:00:00Z'::timestamptz,
  10000
);
```

The interval is start-inclusive and end-exclusive, may not extend into the future, and is limited to 31 days. The fourth argument caps the combined receipt, delivery-attempt, and webhook-ledger rows at 10,000. An oversized window fails instead of truncating. Split an oversized interval into independently reconciled closed windows.

The selection includes receipts or delivery attempts active in the requested window, plus each selected receipt's attempt history before the window end. That makes an exact retry during a later window auditable against its original durable receipt without allowing retries after the closed end to change the artifact.

## Independently normalized comparison input

The database export alone proves lineage consistency; it cannot honestly prove that the signed receipt agrees with an independently normalized GHL source. The report builder therefore also requires a separately produced, redacted comparison document for the exact organization and window.

That document has `comparison_type: "independently_normalized_ghl_shadow_source"` and one row per expected signed webhook ID. It contains only:

- a SHA-256 webhook correlation key;
- organization and hashed location bindings;
- organization-scoped HMAC contact, consent-phone, consumer, signature, artifact, and source identifiers;
- mapping/policy/key versions and hashes;
- the independently derived decision and sorted reason codes;
- redacted field-presence, timestamp, phone-equality, revocation, DND, consent-type, suppression, and no-authority projections; and
- an HMAC-SHA256 fingerprint of the underlying independent source export, with opaque UUID export/evidence IDs and a normalizer version.

It must not contain the source export itself, a raw phone, name, email, address, custom-field value, note, tag, or an unkeyed digest of a phone-bearing structure. The independent connector/normalizer that creates this document remains outside the reconciler's capability boundary and must be authenticated by the external certificate issuer. `synthetic_only: false`, an apparently valid HMAC value, and an evidence ID are caller-supplied claims—not cryptographic proof of their origin. This offline CLI has neither the HMAC key nor an authenticated source channel and therefore cannot verify them.

## Build and verify the deterministic report

Save the RPC's JSON object as a local file, then run:

```powershell
node scripts/reconcile-ghl-shadow-evidence.mjs `
  --input <ghl-shadow-rpc-export.json> `
  --comparison <independently-normalized-redacted-ghl-export.json> `
  > <ghl-shadow-reconciliation-report.json>
```

Build mode reads the two local JSON evidence files shown above; verify mode reads one retained report. The CLI writes only to stdout. It has no database, network, provider, queue, CRM, messaging, or file-writing client. It rejects duplicate JSON object keys, unknown fields, raw-PII-shaped additions, cross-tenant rows, unbounded arrays, and noncanonical database timestamps before producing an unkeyed source digest.

Verify a retained report with:

```powershell
node scripts/reconcile-ghl-shadow-evidence.mjs `
  --verify-report <ghl-shadow-reconciliation-report.json>
```

The report embeds the safe source export and binds it with:

- a whole-export SHA-256;
- separate receipt, delivery-attempt, and webhook-ledger SHA-256 values;
- a separate digest of the independently normalized comparison rows;
- a rolling evidence-chain SHA-256 over every canonical row;
- a canonical integrity-finding digest; and
- a whole-report SHA-256.

It deterministically reconciles tenant bindings, receipt/evidence bindings, one initial attempt per receipt, exact payload retries, webhook-ID first-payload lineage, collision quarantine, row counts, ordering, every no-authority invariant, and every redacted receipt projection against its independent source row.

## Solar Exit gate meaning

`report_status: "reconciled"` means the exported signed-ingest receipt, attempt, and webhook lineage is internally consistent and every selected receipt exactly matches its independently normalized redacted source row for that tenant and window. It does not mean a lead was eligible, a call was placed successfully, or the campaign may launch.

The report exposes expected, matched, and mismatched shadow-record counts plus `solar_exit_gate_evidence.ghl_shadow_contacts_compared` and `ghl_shadow_mismatch_rate` with the explicit scope `signed_receipts_vs_independently_normalized_redacted_source_plus_attempt_and_webhook_lineage`. If the independent document is absent, the library emits `report_status: "comparison_required"`, reports zero compared contacts and a null mismatch rate, and cannot enter certificate review. It never turns internal lineage consistency into a fake zero-mismatch claim.

Every report emits `report_authority: "review_only_unattested"`, `source_fingerprint_verified: false`, `external_attestation_verified: false`, `certificate_created: false`, and `external_attestation_required: true`. A clean report can be suitable for external certificate review, but it is never the certificate itself and never authorizes launch. An independent certificate issuer must authenticate both source systems, their keyed fingerprints/evidence IDs, the exact window, report hash, campaign release binding, and required shadow volume before this artifact can support the separate `ghl_shadow_reconciliation_certificate` launch requirement.

A webhook-ID payload collision, missing attempt history, tenant mismatch, orphan row, evidence drift, authority escalation, empty export, or any other reconciliation finding makes the report unsuitable for certificate review. Existing receipts created before the attempt-ledger migration intentionally fail with `RECEIPT_MISSING_DELIVERY_ATTEMPT_EVIDENCE`; they are never silently grandfathered.
