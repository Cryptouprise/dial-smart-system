# Solar Exit installation and first-pilot checklist

Every box in sections 1–5 is a launch blocker. Keep the campaign in `draft` and `production_launch_allowed: false` until the automated launch gate passes and the named human approvers sign off.

## 1. Company and policy inputs

- [ ] Confirm the legal entity that owns the Elite Solar Recovery brand.
- [ ] Obtain counsel's written classification of the service and the use of “Recovery,” including recovery-service, debt-relief, credit-service, legal-referral, and state licensing analysis.
- [ ] Approve the fee model, customer agreement, privacy notice, claims substantiation, and refund/cancellation language; the AI remains unable to quote or collect payment.
- [ ] Confirm the public callback number and escalation contact.
- [ ] Freeze the exact landing-form consent disclosure and version identifier.
- [ ] Verify that the disclosure names Elite Solar Recovery and expressly covers artificial/AI voice calls at the submitted number.
- [ ] Map immutable consent timestamp, consumer name, seller, text version, lead source, consent phone, property/calling state, and revocation evidence from the controlled source export. If GHL is used as a sidecar, record its exact versioned custom-field IDs separately. Never substitute the contact's current phone for the phone that consented.
- [ ] Obtain campaign-specific review for TCPA/FCC, TSR, National and state DNC, calling-time, recording, state registration, and solar-services claims.
- [ ] Populate approved lead sources, consent-text versions, calling/property states, and state recording disclosures.
- [ ] Define complaint, regulator, attorney, accessibility, and wrong-number escalation owners.

## 2. Database and product safety

- [ ] Reconcile the remote Supabase migration ledger with the repository; do not run `supabase db push` against the current divergent production history.
- [ ] Prove a clean database reset and execute every safety contract against an isolated canonical staging database.
- [ ] Verify tenant isolation with two organizations and cross-organization negative tests.
- [ ] Verify browser users cannot activate campaigns, mutate queues, alter provider evidence, mint credits, or change provider resources.
- [ ] Verify the global stop and irreversible tenant DNC controls before any provider request.
- [ ] Prove spoken opt-out at every point in the call ends promptly, persists seller-wide suppression exactly once, and blocks another provider request.
- [ ] Confirm uncertified autonomous cron jobs, Telnyx, Assistable, SMS, transfers, booking, workflows, fanout, and automatic retries remain disabled.

## 3. Retell target state

- [ ] In the isolated copy, set `environment: installation_candidate`, `bundle_status: installation_pending`, keep `production_launch_allowed: false`, and disable the synthetic offline override.
- [ ] Resolve the legal seller, public customer-service number, and approved model. Run `npm run campaign:solar-exit:installation-plan -- --root <installation-candidate-directory>` and review the zero-write LLM payload.
- [ ] Create the LLM from that reviewed payload; allow only `end_call` and no HTTP, transfer, booking, custom function, or MCP tools. Bind the returned LLM ID and exact version into the copy.
- [ ] Resolve the approved voice and canonical signed webhook, rerun the installation plan, and review the Voice Agent payload. The plan never writes to Retell.
- [ ] Create the Voice Agent from the reviewed provider payload.
- [ ] Publish immutable LLM and agent versions and record the exact non-negative version numbers.
- [ ] Verify `call_started`, `call_ended`, and `call_analyzed` webhook events.
- [ ] Verify signed recording/log URLs, post-call PII scrubbing, 30-day retention, and a six-minute maximum duration.
- [ ] Bind one owned E.164 from-number without changing a shared number per call.
- [ ] Confirm the runtime reads the exact live agent/LLM and rejects any drift from the certified target.

## 4. Offline and staging test matrix

- [ ] Run `npm run campaign:solar-exit:test`.
- [ ] Run `npm run campaign:solar-exit:validate`.
- [ ] Review `npm run campaign:solar-exit:dry-run`; confirm campaign status is `draft`, provider is Retell, and every disabled feature remains false/null.
- [ ] Import only `test-fixtures/synthetic-leads.csv` into isolated staging.
- [ ] Verify every conversation contract, including AI/recording disclosure and refusal, permission, DNC, wrong number, consent denial, legal/financial boundary, urgent timing, vulnerability, emergency, privacy interruption, complaint, voicemail-disabled behavior, and neutral closing.
- [ ] Adversarially test prompt injection, requests to use tools, fabricated deadlines, unsupported state law, government affiliation, guaranteed cancellation, and requests to stop paying.
- [ ] Verify post-call summaries contain no secret/account data and no unsupported legal conclusion.
- [ ] Force provider timeout, duplicate webhook, reordered webhook, missing analyzed event, and reconciliation recovery.
- [ ] Reconcile every test call across provider ID, call log, queue item, billing ledger, credit reservation/refund, disposition, and DNC evidence.

## 5. Signed source shadow and owned-phone canary

### Required primary path: signed direct import (no GHL required)

- [ ] Create the Ed25519 signing pair and independent phone-HMAC key in a new, access-controlled directory outside the repository. Keep both private key files out of browsers, source control, CRM records, and chat.
- [ ] Pin only the signing public-key fingerprint, signing-key ID, signer principal ID, legal seller, approved lead source, and consent-disclosure identifiers in the isolated Elite release candidate.
- [ ] Export exactly 25 consent-proven Elite database-reactivation records from the controlled source. The export must bind the original consent phone, immutable consent artifact, seller, source form/version, timestamp, property state, calling state, and revocation/suppression evidence. Historical appointments or a current CRM phone number do not qualify on their own.
- [ ] Use the external signing workflow to create a short-lived signed import envelope, then run the zero-contact direct-import shadow. It must make no provider call, CRM/database write, queue change, text, booking, workflow, or spend action.
- [ ] Require a clean 25/25 result with zero tenant, seller, consent, revocation, state, timestamp, signature, or identity mismatches. Preserve only the redacted report and required independent evidence; do not copy raw lead PII into repository evidence.
- [ ] Treat the signed source report as review evidence only. It never grants contact or provider-invocation authority; the later release gate must still pass every provider, DNC, state, approval, and canary requirement.

### Optional GHL sidecar: reconciliation only

- [ ] If GHL is used, bind the exact GHL location to the exact Dial Smart organization and configure one versioned, hash-bound location/organization/mapping/policy record.
- [ ] Enable signed inbound GHL shadow ingestion only. Keep notes, tags, stages, appointments, workflows, queues, calls, providers, SMS, and every writeback path disabled during this comparison.
- [ ] Require exact raw-body `X-GHL-Signature` Ed25519 verification and `ContactDndUpdate` coverage. Missing or ambiguous call-DND/suppression state must block.
- [ ] Compare GHL receipts to the independently signed source only when GHL is actually in scope. A clean GHL comparison is supplementary evidence, never contact authority and never a prerequisite for the direct-import route.

### Owned-phone safety and promotion evidence

- [ ] Call only owned team phones first and prove opt-out suppression before a second call can be created.
- [ ] Prove global stop blocks a queued call before the provider request.
- [ ] Prove one call cannot double-charge and an uncreated/failed call refunds its reservation exactly once.
- [ ] Obtain product, operations, compliance, finance, and engineering release signoff.

## 6. Release candidate and small Elite Solar Recovery launch

- [ ] Keep `campaigns/solar-exit` immutable as the CI-validated offline template. Copy the complete directory to an isolated, access-controlled release-candidate directory.
- [ ] Preserve the pinned canonical digest and add an exact `source_parent`, unique release-candidate ID, and creation timestamp in the copy; never relabel the canonical directory itself.
- [ ] Resolve placeholders, structured consent artifacts, state-rule sources, evidence hashes, and all five approval records only in the release-candidate copy. Keep every approval/certificate artifact beneath its confined `evidence/` root.
- [ ] Bind every approval and certificate to the exact bundle/manifest/artifact-map digests and published Retell agent/LLM IDs and versions. Use five different named trusted principals for the five approval roles.
- [ ] Store the launch trust root outside both campaign directories, pin its file digest through the deployment-controlled `SOLAR_EXIT_TRUST_ROOT_SHA256`, and confirm local-only attestations cannot pass the gate.
- [ ] Change that copy to `environment: production_candidate`, `bundle_status: launch_approved`, and `production_launch_allowed: true` only through reviewed change control.
- [ ] Run `npm run campaign:solar-exit:launch-gate -- --root <release-candidate-directory> --trust-root <external-trust-root.json>` and require zero errors. Do not edit the source template to make this command pass.
- [ ] Create a manually reviewed five-lead cohort only from reactivation records with exact seller-specific AI/telemarketing consent; historical appointments, old records, and prior interest do not qualify automatically.
- [ ] Have a human monitor every call and keep a one-click global stop available.
- [ ] Review all five calls before expanding to 20; review all 20 before expanding to 50.
- [ ] Stop on any consent dispute, DNC failure, wrong tenant, policy claim, provider drift, unreconciled call, duplicated charge, or complaint.

## 7. Expansion after Elite

- [ ] Use Omega Accounting as the second-tenant isolation test only after the Elite pilot is clean.
- [ ] Build a separate prompt, consent policy, state/legal posture, dispositions, GHL mapping, and agent/version for Omega. Do not reuse Solar Exit claims.
- [ ] Consider Noble Gold only after separate financial-marketing and calling review.
- [ ] Use Infinite AI/internal owned numbers for continuous synthetic and provider monitoring.

## Signoff record

| Role | Name | Evidence/version | Date | Approved |
|---|---|---|---|---|
| Product owner |  |  |  |  |
| Operations |  |  |  |  |
| Compliance/legal reviewer |  |  |  |  |
| Finance/billing |  |  |  |  |
| Engineering release owner |  |  |  |  |
