# Solar Exit zero-contact shadow evaluator

The shadow evaluator answers one narrow question for each normalized lead:

> If the lead, tenant binding, and trusted consent evidence were presented to the Solar Exit consent gate at the stated time, would that gate allow or block it?

It does **not** place a call. It has no provider client, database client, HTTP client, webhook client, messaging client, or file-writing API. The library returns a value in memory; the CLI reads local JSON and emits the report to stdout. Every result, including `would_call`, contains `contact_authorized: false` and `provider_invocation_authorized: false`.

## Why two kinds of shadow run exist

- `offline` accepts only the campaign's reserved 202-555 synthetic override. It proves the evaluator and reporting contract with fictional data.
- `production` evaluates exported real records without contacting them. It fails the entire batch closed if the policy is unresolved. Each record also fails closed unless its server-verified, tenant-bound, replay-checked, unexpired `trusted_dispatch_context` is present.

The production input must be constructed by a trusted server boundary after signed-ingest verification. A person typing `"trust_level": "server_verified"` into a file does not make the source trustworthy; the context's `trust_evidence_id` and SHA-256 are audit bindings to that upstream evidence. This evaluator deliberately does not claim to authenticate an upstream signature by itself.

## Input contract

```json
{
  "schema_version": "1.0.0",
  "batch_id": "stable-audit-id",
  "as_of": "2026-07-13T16:00:00.000Z",
  "records": [
    {
      "lead": {
        "lead_id": "...",
        "external_contact_id": "...",
        "organization_id": "...",
        "source_system": "gohighlevel",
        "phone_number": "+13035550123",
        "seller": "resolved legal seller",
        "lead_source": "approved source",
        "property_state": "CO",
        "calling_state": "CO"
      },
      "consent_evidence": {
        "consent_artifact_id": "...",
        "lead_id": "...",
        "consumer_name": "...",
        "phone_number": "+13035550123",
        "dialed_phone_number": "+13035550123",
        "seller": "resolved legal seller",
        "lead_source": "approved source",
        "source_form_version": "...",
        "consent_disclosure_text": "exact captured disclosure",
        "consent_text_version": "...",
        "signature_evidence": "...",
        "not_condition_of_purchase_disclosure": true,
        "ai_voice_calls_authorized": true,
        "telemarketing_calls_authorized": true,
        "captured_at": "...",
        "revoked": false,
        "property_state": "CO",
        "calling_state": "CO",
        "suppression_checks": {}
      },
      "trusted_dispatch_context": null
    }
  ]
}
```

Production `trusted_dispatch_context` additionally requires:

- the fields already consumed by `evaluateConsentEvidence`: authorization, lead, destination phone, seller, source, consent artifact, form version, and disclosure version;
- tenant binding: organization, external contact, and source system;
- `authorization_scope: "solar_exit_shadow_evaluate_only"` and `contact_authorized: false`;
- `trust_level: "server_verified"`, plus true integrity, tenant-binding, and replay checks;
- a trust evidence ID and an issued/expiry window containing the batch's explicit `as_of` timestamp.

The explicit timestamp is mandatory so identical accepted inputs produce byte-equivalent decisions and hashes. The evaluator does not substitute the machine's current time for this audit timestamp.

## Production phone pseudonym key

Production reports never emit a raw phone or an unkeyed phone digest. The evaluator emits an organization-scoped HMAC-SHA256 pseudonym with a non-secret key ID. The same E.164 number therefore has a different pseudonym under another organization or after an intentional key rotation.

The CLI requires both:

- `--phone-hmac-key-file <path>`: a regular binary file outside this repository containing 32-4096 cryptographically random bytes;
- `--phone-hmac-key-id <id>`: a non-secret 3-128 character rotation identifier, such as `elite-solar-shadow-phone-v1`.

Key bytes are never accepted as a CLI argument or environment value, included in a report, or printed in an error. The CLI reads the external file only for the synchronous evaluation and overwrites its in-process key buffer afterward. It rejects short, highly printable, or low-diversity material as an entropy sanity check. This check cannot prove how a key was generated: create it with an operating-system CSPRNG or materialize it from a secret manager, restrict its filesystem ACL, keep it outside source control, and never use a passphrase/text file as raw key material.

Production example:

```powershell
node scripts/evaluate-solar-exit-shadow.mjs `
  --mode production `
  --root <resolved-candidate-directory> `
  --input <normalized-shadow-batch.json> `
  --phone-hmac-key-file <external-binary-key-file> `
  --phone-hmac-key-id elite-solar-shadow-phone-v1
```

Offline mode rejects production key options and uses `synthetic-fixture-only-hmac-sha256-v1` with the explicit key ID `synthetic-public-demo-key-v1`. That public deterministic mode is safe only for the reserved fictional fixture numbers and provides no secrecy for real numbers.

## Output and integrity

The report contains no raw phone number, consumer name, disclosure text, signature evidence, or unkeyed digest of a phone-bearing input structure. It includes stable lead/tenant audit identifiers, an HMAC phone pseudonym, keyed batch/record/context fingerprints, a non-sensitive policy hash, decision IDs, aggregate reason counts, a decision-array digest, and a whole-report SHA-256. The pseudonym and every keyed sensitive fingerprint carry the same explicit key ID.

`production_policy_blockers` is always emitted, including during an offline run, so an operator can see exactly why the selected policy is not usable for production. In production mode, `policy_blockers` must be identical to that list; in offline mode, `policy_blockers` remains empty because the synthetic demonstration is allowed to run. `production_policy_blockers_sha256` binds the ordered blocker list independently, and the whole-report hash binds that digest and list again.

`verifySolarExitShadowReport` checks the pseudonym scheme/key-ID binding, keyed fingerprint shapes, absence of legacy unkeyed phone-bearing hashes, blocker digest, blocker ordering and uniqueness, mode/status consistency, decision digest, whole-report digest, and no-contact flags. It returns `false` rather than throwing for malformed input. Report-level unkeyed SHA-256 values operate only over the already-pseudonymized report and bind audit artifacts together; they do not authenticate who produced a report. Authentication belongs to the external trust/evidence boundary.

`would_call` means "passed this zero-contact eligibility comparison." It is not a launch certificate and does not prove provider, calling-hour, billing, webhook, recording, or live-call readiness. Those remain provider-boundary and launch-gate responsibilities.

## Future read-only GHL export adapter

The clean adapter boundary is a separate, local, one-way transformation. The shadow evaluator should never receive a GHL API token, make a GHL request, or interpret raw custom fields itself.

```text
GHL read-only export
  -> external signature/integrity + tenant/replay verifier
  -> pure GHL-to-ShadowBatch adapter
  -> ShadowBatch JSON file/stdout
  -> zero-contact shadow evaluator
  -> hashed report JSON on stdout
```

The future pure adapter API should be equivalent to:

```text
adaptVerifiedGhlExport({
  verified_export,
  tenant_binding,
  approved_field_mapping,
  eligibility_policy,
  suppression_evidence_by_lead,
  as_of
}) -> ShadowBatchV1
```

Contract requirements:

- `verified_export` is an opaque result created by the upstream verifier, not raw JSON with a user-entered `verified: true`. It binds the source-export SHA-256, export ID/time, GHL location, organization, signer evidence, and replay result.
- One export batch belongs to exactly one GHL location and one Dial Smart organization. A mixed or mismatched tenant batch is rejected as a whole.
- `approved_field_mapping` is versioned and hashed. It maps explicit GHL custom-field IDs to exact consent fields; display-name guessing and tag-based consent inference are forbidden.
- Phone and state normalization must be deterministic. Invalid or ambiguous values remain blocked; the adapter never invents a country, state, seller, disclosure version, or consent value.
- DNC, reassigned-number, ownership, complaint, prior-opt-out, wrong-number, and global-stop evidence comes from a trusted suppression snapshot keyed to the lead and number. It is never inferred from an absent GHL tag.
- Each output record gets a unique `authorization_id`; its `trust_evidence_id` content-addresses the verified export/evidence; its scope is exactly `solar_exit_shadow_evaluate_only`; and `contact_authorized` is always `false`.
- The adapter emits exactly the existing `ShadowBatchV1` fields. Raw GHL payloads, API credentials, arbitrary notes, and unknown custom fields are neither copied into the batch nor accepted by the evaluator.
- Mapping failure is fail-closed and auditable per lead. Signature, replay, or tenant failure blocks the entire export before adaptation.

The eventual adapter CLI should also be file/stdin to stdout only. A separate operator-controlled connector may create the read-only export file, but that connector is outside the evaluator and adapter capability boundary. This keeps network credentials and contact-capable APIs out of the decision process.

## Offline demonstration

From the repository root:

```powershell
node scripts/evaluate-solar-exit-shadow.mjs --mode offline --input scripts/test-fixtures/solar-exit-shadow-demo-input.json
```

The fixture uses reserved fictional 202-555-01xx numbers. The expected result is three `would_call` decisions and three deliberate blocks. Nothing is written anywhere unless the operator explicitly redirects stdout.

Production must point `--root` at a separate resolved candidate and provide the external HMAC key file and key ID. With those key options present, running production mode against the immutable source bundle prints a `blocked_unresolved_policy` report and exits with status 2. Without them it fails before evaluation and emits no report.
