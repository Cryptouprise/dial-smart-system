# Elite Solar Recovery Solar Exit campaign

This directory is the complete first-pilot campaign package for consented database-reactivation inquiries about solar agreement review. It is product configuration and test material, not website copy.

The package is **offline-ready for deterministic review and validation**. It is not installed in Retell, staging, or production, and it is intentionally **not authorized to contact anyone**. Provider or staging readiness still requires a resolved release-candidate copy, canonical database installation, exact provider versions, and owned-phone end-to-end evidence.

## What the AI can do

- identify itself as AI and identify Elite Solar Recovery;
- confirm permission to continue;
- collect a small set of high-level facts about an agreement and the consumer's concern;
- explain that possible options depend on the agreement and facts;
- record a request for human or document review;
- recognize opt-outs, consent disputes, wrong numbers, complaints, and unsupported questions;
- finish the call and produce a structured, neutral disposition.

## What the AI cannot do in this pilot

- cold call, infer consent from an old database record, decide its own lead eligibility, or bypass consent/DNC/state/time gates;
- promise that an agreement can be cancelled, rescinded, refunded, reduced, or otherwise changed;
- provide legal or financial advice, declare a contract invalid, or advise stopping payments;
- transfer a call, book an appointment, send SMS, trigger GHL workflows, use arbitrary HTTP/MCP tools, or fan out across phone numbers;
- collect financial credentials, government identifiers, passwords, full dates of birth, or unredacted account numbers;
- activate itself or expand a cohort without a human-reviewed launch gate.

## Package map

- `manifest.json` — campaign identity, conservative rate limits, feature locks, and unresolved launch inputs.
- `agent-prompt.md` — the production-intent conversation contract and approved copy.
- `retell-agent.json` — an offline Retell provider specification and version-certification target; only `end_call` is permitted.
- `eligibility-policy.json` — fail-closed consent, DNC, jurisdiction, time, frequency, and provider gates.
- `dispositions.json` — neutral outcomes with all external automation disabled.
- `ghl-mapping.json` — the exact tenant-bound, shadow/read-only mapping and redacted reconciliation contract. The code-backed signed ingress is documented in `docs/GHL_SOLAR_SHADOW_INGEST.md`.
- `direct-import-mapping.json` — the primary, GHL-independent signed-export contract. It verifies a user-owned Ed25519 export locally and emits only a redacted zero-contact report.
- `conversation-tests.json` — adversarial and happy-path conversation contracts covering disclosure, refusal, claims, safety, privacy, and provider outcomes.
- `test-fixtures/` — fictional North American 555 numbers and `.invalid` emails only.
- `reference/launch-evidence-schema.json` — non-passing examples of the structured approval, certificate, consent, state-policy, and suppression evidence required in a release candidate.
- `reference/CANARY-PROMOTION-ENGINE.md` — the deterministic owned-phone and 5/20/50 evidence-chain contract.
- `installation-checklist.md` — the exact path from package to small live canary.
- `docs/SOLAR_EXIT_SHADOW_EVALUATOR.md` — the repository-level input/output contract for zero-contact lead rehearsal.

## Commands

From the repository root:

```powershell
npm run campaign:solar-exit:test
npm run campaign:solar-exit:validate
npm run campaign:solar-exit:dry-run
npm run campaign:solar-exit:shadow-demo
npm run campaign:solar-exit:provision-direct-import-keys -- --destination <new-external-key-directory> --signing-key-id elite-solar-direct-import-v1 --signer-principal-id <approved-signer-id>
npm run campaign:solar-exit:sign-direct-import -- --root <resolved-candidate-directory> --input <external-unsigned-import.json> --private-key-file <external-ed25519-private-key.pem> --output <new-external-signed-import.json>
npm run campaign:solar-exit:canary-template -- owned_phone_20
npm run campaign:solar-exit:create-installation-candidate -- --destination <new-isolated-directory> --release-id <immutable-release-id>
npm run campaign:solar-exit:apply-installation-inputs -- --root <installation-candidate-directory> --input <external-reviewed-installation-input.json> --dry-run
npm run campaign:solar-exit:installation-plan -- --root <installation-candidate-directory>
npm run campaign:solar-exit:conversation-template
npm run campaign:solar-exit:lint-transcript -- --input <synthetic-transcript.json>
$env:GHL_SOLAR_API_TOKEN = '<external-pit-token>'
$env:GHL_SOLAR_LOCATION_ID = '<external-location-id>'
npm run ghl:solar:readiness
$env:SOLAR_EXIT_TRUST_ROOT_SHA256 = '<externally-pinned-sha256>'
npm run campaign:solar-exit:launch-gate -- --root <release-candidate-directory> --trust-root <external-trust-root.json>
npm run campaign:solar-exit:release-proposal -- --template
npm run campaign:solar-exit:release-proposal -- --root <release-candidate-directory> --trust-root <external-trust-root.json> --input <canary-5-request.json>
```

The validation, test, dry-run, shadow-demo, canary-template, installation-candidate, installation-plan, and conversation-template commands do not touch a database or provider. The candidate command requires a brand-new directory outside the source package, preserves the canonical source digest, turns off the synthetic authorization, and leaves production disabled. The source dry-run deliberately emits `null` provider payloads. In an isolated copy marked `installation_candidate` with production still disabled, the installation plan unlocks the LLM payload after the legal seller, public phone, and model are resolved; after the returned LLM ID/version, voice, and webhook are bound, it unlocks the Voice Agent payload. This two-phase plan avoids requiring an agent ID before the agent can be created. After Retell sandbox or owned-phone execution, save the completed evidence form and independently exported provider call/destination context, then run `npm run campaign:solar-exit:score-conversations -- --root <candidate> --input <results.json> --trusted-context <provider-evidence.json>`. That command checks evidence completeness, exact bundle/provider binding, provider call IDs, authorized destinations, hashes, and human attestations; it does **not** inspect audio/transcripts semantically and always returns `semantic_execution_certified: false` and `launch_certificate_created: false`.

`campaign:solar-exit:lint-transcript` adds an optional synthetic-only language preflight. It accepts no provider IDs, live/owned-phone execution, contact data, tools, or network access. Its output contains only boolean checks and reason codes while catching a bounded set of high-risk patterns: missing AI/company/permission disclosure, a missed DNC acknowledgement/end-call, outcome guarantees, cancellation promises, payment direction, unsafe affiliation claims, and some sensitive-data prompts. It still reports `semantic_execution_certified: false`; a sandbox/owned-phone recording and human review remain mandatory evidence for the actual conversation certificate.

When an optional Solar Freedom HighLevel location is available, `npm run ghl:solar:readiness` performs one contacts `GET` using environment-only credentials and returns only a redacted 0/1-count status. It does not print a contact, trace ID, token, location ID, or response body; it cannot create, update, import, send, trigger a workflow, or authorize outreach. GHL remains optional: a passing readiness check is neither signed import evidence nor consent, release, or contact authority.

For the first setup pass, copy [installation-input.example.json](reference/installation-input.example.json) to a new access-controlled location **outside** this repository and the candidate directory. Fill it only with reviewed non-secret identifiers, versions, public numbers, legal references, and the public Ed25519 SPKI fingerprint. The installation-input compiler rejects unknown fields (including API-key fields), requires an isolated launch-disabled candidate, leaves GHL optional, and can run with `--dry-run` first. It does not accept a provider credential, private key, token, raw lead, or consent record; it cannot make a provider, CRM, database, queue, or contact change.

Run a normalized export through zero-contact production shadow evaluation with:

```powershell
npm run campaign:solar-exit:shadow -- `
  --mode production `
  --root <resolved-candidate-directory> `
  --input <normalized-shadow-batch.json> `
  --phone-hmac-key-file <external-binary-key-file> `
  --phone-hmac-key-id elite-solar-shadow-phone-v1
```

For a GHL-independent owned export, keep the signing public key and the production phone-HMAC key outside the repository, then run:

```powershell
npm run campaign:solar-exit:direct-import-shadow -- `
  --root <resolved-candidate-directory> `
  --input <signed-direct-import.json> `
  --public-key-file <external-ed25519-public-key> `
  --phone-hmac-key-file <external-binary-key-file> `
  --phone-hmac-key-id elite-solar-shadow-phone-v1
```

The signed import must bind one organization, seller, source system, approved lead source, and short-lived audit window. The adapter validates the candidate-pinned public-key fingerprint and Ed25519 signature before it constructs an in-memory shadow batch. It does not write a batch to disk, connect to GHL, call a provider, or print raw contact data; its only stdout result is the same redacted zero-contact report.

To create the first key material safely, run the provisioning command above with a brand-new directory outside the repository. It creates an Ed25519 private/public pair and an independent 32-byte HMAC key, then prints only the public signing fingerprint and the mapping values to copy into an isolated candidate. It never prints either secret or contacts an external system. Keep the private signing key and HMAC key in the approved secret location; do not commit, upload, or paste them into the browser.

After the isolated candidate is resolved, the signing command accepts one externally stored unsigned import object, checks that the supplied private key matches the candidate-pinned public fingerprint, and writes the signed envelope only to a brand-new external output file. The evaluator is still the next step; signing is not source approval, a CRM import, or permission to call.

The shadow result can say `would_call`, but every record remains `contact_authorized: false`; the command has no provider or network client. Production phone identifiers and phone-bearing record/context fingerprints use organization-scoped HMAC-SHA256. Key bytes must be cryptographically random and stored in a regular file outside the repository; they are never printed or accepted as a CLI argument. The separate signed GHL ingress accepts exact raw-body Ed25519 events only after it is deliberately deployed and configured; it writes append-only hashes/HMACs, booleans, versions, and reason codes, and it can return only `held` or `quarantined`. It has no lead, queue, provider, message, workflow, or GHL-writeback capability. After owned-phone or controlled live evidence has been independently collected, evaluate one exact cohort with `npm run campaign:solar-exit:canary -- --input <cohort-results.json>`. A passing canary report advances only the evidence-review sequence. It never grants call or launch authority by itself.

Launch evidence is fail-closed. Approval and certificate hashes are recomputed from regular files confined beneath the candidate's `evidence/` directory. Every record must bind the exact bundle version, launch-manifest digest, complete artifact-digest map, and published Retell agent/LLM IDs and versions. All five approval roles require different named principals. Local files and human-attestation forms alone can never make launch validation pass: the gate also requires a trust-root JSON stored outside both campaign directories, whose file digest is supplied through the externally controlled `SOLAR_EXIT_TRUST_ROOT_SHA256` environment variable. The launch-gate command is expected to fail now and prints every unresolved blocker.

## Morning operator brief

For a single no-contact handoff that combines the locked bundle, the exact
production blockers, the fixed rollout ladder, and the separate draft-only
email lane, run:

```powershell
npm run campaign:solar-exit:morning-brief
```

The brief reads only the local canonical campaign specification. It never reads
leads, credentials, GHL, Retell, Instantly, Mailgun, a database, or a browser;
it makes no network or provider request and grants no launch authority.

Once that gate passes, the release-proposal command can compile a first-`canary_5` review artifact from exact tenant/campaign/caller-number UUIDs and five unique lead UUIDs. It allows a 10-minute-to-24-hour expiry only, emits no lead PII, and has no database, provider, CRM, or network client. The proposal is still **not** a release, authorization, or launch certificate; a separately reviewed service-only persistence workflow and the final per-call evaluator remain mandatory.

## Safe rollout

1. Reconcile and certify the Supabase migration history in an isolated staging project. Do not push the current divergent migration set into production.
2. Copy this immutable offline template to an isolated release-candidate directory. Preserve `canonical_source_sha256`; add the exact `source_parent`, unique release-candidate ID, and creation timestamp only in that copy. The gate rejects the canonical directory, an arbitrary root without provenance, or a source template whose content no longer matches its pinned digest.
3. Create and publish exact Retell agent and LLM versions from the resolved provider payloads, then bind their immutable IDs and versions into the release candidate.
4. Install the campaign as `draft`, never `active`, and import only the synthetic fixtures.
5. Pass all conversation contracts in Retell sandbox or with owned internal phones.
6. Pass a low-value provider E2E proving signed webhook receipt, terminal call state, cost, credit settlement, reconciliation, and global DNC behavior.
7. Verify a signed, user-owned direct export in zero-contact shadow mode and require 25/25 clean reactivation consent mappings. GHL may supply the same shadow evidence later, but is not required.
8. Run the fixed evidence sequence: 20 owned-phone calls, then manually approved Elite Solar Recovery batches of 5, 20, and 50 consented leads. Stop on any safety, provider, billing, source-reconciliation, or compliance failure.

## Claims and legal posture

The copy is deliberately an **options-review intake**, not an “automatic contract exit” pitch. Official consumer guidance warns against rushed solar claims, hidden financing terms, invented government or utility affiliation, and promises that sound too good to be true. Cancellation rights can depend on how and where a sale occurred, timing, contract terms, state law, installation, and financing. The AI therefore never announces that a right or result applies; a qualified human must review the specific facts.

Primary references used for the policy posture:

- FTC, “Solar energy is rising in popularity. So are the scams”: https://consumer.ftc.gov/consumer-alerts/2024/09/solar-energy-rising-popularity-so-are-scams
- FTC, “How to avoid getting burned by solar or clean energy scams”: https://consumer.ftc.gov/consumer-alerts/2024/08/how-avoid-getting-burned-solar-clean-energy-scams
- CFPB consumer advisory on complex solar loans: https://www.consumerfinance.gov/archive/newsroom/consumer-advisory-steer-clear-of-costly-and-complex-loans-for-solar-energy-installation/
- FTC Cooling-Off Rule: https://consumer.ftc.gov/articles/buyers-remorse-ftcs-cooling-rule-may-help
- FTC Telemarketing Sales Rule guide: https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule

These references inform conservative product behavior; they are not a substitute for campaign-specific legal review.
