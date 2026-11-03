# gap-cold-email

- status: completed
- tldr: Cold-email layer is a gated DEMO stub: Resend send is real code but hard-disabled; Release-* are scaffolding; no inbox/warmup/campaign/deliverability. Fix = EXTEND with one Instantly execute adapter.

COLD EMAIL GAP — VERDICT: the outbound email layer is a DEMO/disabled stub, not a real transactional sender. email-sender is the only send path and is hard-disabled (isEmailEgressTenantCertified() returns false, index.ts:8-10; 503 EMAIL_EGRESS_NOT_TENANT_CERTIFIED at :21-31). The Resend POST below the gate (:58-71, default noreply@resend.dev :65) is real code but unreachable in prod; no budget/idempotency/dedup/receipt. So ESP = Resend (wired, gated off). elite-email-release-registration/-preparation/-status are SCAFFOLDING (DB ledger state machines, provider_action 'none', no client); elite-email-mailgun-events is a REAL inbound HMAC-verified receipt receiver that never sends and is disabled. Migration 20260720120000 is a default-deny ledger whose own comment says a release must be prepared+claimed before 'a future provider adapter' (:496-497) i.e. the provider adapter does not exist. INBOX: none. WARMUP: read-only sample of Instantly's warmup_status (elite-solar-provider-readiness.ts:404-405), no management. CAMPAIGN/lead-upload/deliverability: none. DEDUP: inbound receipts only (migration :114-115) + release idempotency keys, never outbound. No Instantly/Mailgun write endpoint exists anywhere (grep 0 hits); only read-only readiness GETs. CHEAPEST PATH = EXTEND: Instantly is the designated cold provider (blueprint:14). Reuse the ledger+claim RPC, the release-* handlers, the readiness module, and the signed attestation/review scripts; ADD the one missing tenant-bound Instantly execute adapter (blueprint ops #3) plus the 1-25 recipient source and lead/campaign upload. Confidence: high.

Validation: read email-sender fully and traced post-gate behavior; read all four elite-email-* handlers + index wiring, the mailgun receipt handler, the full migration, and all three docs; repo-wide grep for any ESP write endpoint returned zero; cross-checked the egress-surface audit (email-sender = hard_disabled).

Blockers/follow-ups: live-DB migration-application state and whether an Instantly/Mailgun key is actually provisioned are unverified (open questions listed). Nothing written, read-only lane.

## Artifact

**Findings**

VERDICT: The outbound email layer is a DEMO/disabled stub, not a real transactional sender. (1) email-sender is the ONLY outbound send path and it is hard-disabled: isEmailEgressTenantCertified() returns false (email-sender/index.ts:8-10) and the handler returns HTTP 503 EMAIL_EGRESS_NOT_TENANT_CERTIFIED before touching any provider (:21-31). BELOW the gate the Resend wiring is REAL code (POST https://api.resend.com/emails, :58-71; default from 'Smart Dialer <noreply@resend.dev>' :65) but is unreachable in production. So the ESP is Resend, wired but gated off. There is NO budget, idempotency, dedup, confirmation, or durable receipt on the send path (the :18-20 comment says exactly why it was disabled). It is registered as hard_disabled in the egress audit (scripts/lib/contact-egress-surface-audit.mjs:103-118). (2) elevenlabs-tts is the same pattern (spend gate false, 503) - context only. (3) elite-email-release-registration/-preparation/-status are SCAFFOLDING (DB ledger state machines, no provider client): registration accepts an HMAC-signed no-PII artifact and leaves it 'pending_adapter_provisioning' (registration/handler.ts:387,604-605, provider instantly|mailgun :64,422); preparation only moves a release to 'prepared' and reports provider_action 'none' (preparation/handler.ts:317,483); status is a summary-only read (status/handler.ts:144,214). (4) elite-email-mailgun-events is a REAL inbound webhook receiver (verifies Mailgun HMAC-SHA256 over timestamp+token, handler.ts:272) but it only records redacted receipts; it never sends (:330-335) and is disabled/un-deployed. (5) The migration 20260720120000_elite_email_execution_ledger.sql is a default-deny ledger with a service-role single-use claim RPC; its own comment states a release 'must be prepared and claimed exactly once before a future provider adapter can consider a provider request' (:496-497) - i.e. the provider adapter does not exist. (6) Specialized capability status: INBOX = none; WARMUP = read-only only (the code samples Instantly's warmup_status, elite-solar-provider-readiness.ts:404-405; it does not manage warmup); CAMPAIGN/LEAD-UPLOAD = none; DELIVERABILITY = none; DEDUP = only for INBOUND provider events (unique receipt fingerprint, migration :114-115) plus release idempotency keys, never for outbound sends. Instantly and Mailgun exist ONLY as redacted READ-ONLY readiness GETs (elite-solar-provider-readiness.ts:389-422 Instantly GET /api/v2/accounts; :448-475 Mailgun GET /v3/domains). Grep for any Instantly/Mailgun write endpoint returns ZERO matches. Blueprint is explicit: the Resend endpoint 'is hard-disabled and included in contact-egress certification; it is not a fallback route' and 'No Instantly or Mailgun campaign, recipient, mailbox, template, webhook, or email has been created or sent by this work' (docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md:194-197). CHEAPEST PATH TO RUN COLD EMAIL = EXTEND (reuse the existing envelope, add the missing execute adapter). Instantly is the designated cold/provider (blueprint:14). Reuse: elite-solar-provider-readiness.ts (readiness), the migration ledger + claim_elite_email_execution_release RPC (default-deny, single-use), the release-registration/preparation/status handlers, and scripts/lib/elite-email-source-attestation.mjs + scripts/lib/elite-solar-email-release-review.mjs (signed no-PII cohort + suppression/approval gates). Extend (the single missing piece, blueprint ops list #3 at :142-144): one tenant-bound Instantly execute adapter that (a) calls claim_elite_email_execution_release, then (b) makes the allowlisted Instantly API V2 write (leads upload + campaign add). Build (does not exist at all): the recipient source for the approved 1-25 cohort and the Instantly lead/campaign upload calls (POST /api/v2/leads, /api/v2/campaigns). Net: months of safety scaffolding is done; the entire remaining gap is exactly one provider-write adapter + the recipient source.

**evidence**

- supabase/functions/email-sender/index.ts:8-10 isEmailEgressTenantCertified() returns false
- supabase/functions/email-sender/index.ts:21-31 hard 503 EMAIL_EGRESS_NOT_TENANT_CERTIFIED before any provider call
- supabase/functions/email-sender/index.ts:34,58-71 real Resend POST below the gate, default from noreply@resend.dev (:65); no budget/idempotency/dedup/receipt
- scripts/lib/contact-egress-surface-audit.mjs:103-118 email-sender registered hard_disabled, physicalApi https://api.resend.com/emails
- supabase/functions/elevenlabs-tts/index.ts:14-16,25-35 same spend-gate false + 503 pattern
- supabase/functions/elite-email-release-registration/handler.ts:64,387,422,604-605 provider instantly|mailgun, left pending_adapter_provisioning, no send
- supabase/functions/elite-email-release-preparation/handler.ts:317,483 provider_action 'none'
- supabase/functions/elite-email-release-status/handler.ts:144,214 summary-only read
- supabase/functions/elite-email-mailgun-events/handler.ts:272 HMAC verify; :330-335 inbound receipt only, no send
- supabase/migrations/20260720120000_elite_email_execution_ledger.sql:24 provider check instantly|mailgun; :114-115 inbound-receipt unique dedup; :338 claim RPC; :496-497 future-adapter comment
- supabase/functions/_shared/elite-solar-provider-readiness.ts:389-422 Instantly read-only readiness (warmup_status read at :404-405); :448-475 Mailgun read-only readiness
- docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md:14 Instantly=cold/sequenced role; :130-151 required adapter ops (execute missing); :194-197 Resend hard-disabled, nothing sent
- docs/ELITE_EMAIL_RELEASE_LEDGER.md:62-82 five steps remaining before any execution; :43-45 no send queue/recipient/address/body column
- docs/ELITE_SOLAR_LIVE_EVIDENCE_HANDOFF.md:43-47 Instantly=sequenced outbound provider, first cohort 1-25 after separate release
- grep regex instantly\.ai/api/v2/(leads|campaigns|emails)|/v3/.../messages -> 0 matches (no outbound write adapter anywhere)

**validation**

Read the full email-sender handler end-to-end and traced what happens after the gate (returns 503 before the Resend block; Resend code is dead). Read all four elite-email-* handlers plus index.ts wiring, the mailgun receipt handler, the full migration, and all three docs. Cross-checked with a repo-wide regex grep for any Instantly/Mailgun/Resend write endpoint (0 hits) and the egress-surface audit which classifies email-sender as hard_disabled. Confirmed the elevenlabs-tts sibling gate for pattern consistency.

**open_questions**

- Is the email ledger migration (20260720120000) actually applied in the live DB or only in the repo? Repo docs say 'not applied or deployed'.
- Is an Instantly account actually provisioned for this tenant (readiness code exists but was it ever run against a live key)?
- Is RESEND_API_KEY still present as a prod secret (would matter only if the gate were flipped)?
- Does the DoorBoss/wholesale sub-tree (docs/wholesale) have a separate, non-Elite cold-email path? Not checked here.

**what_i_did_not_check**

- Did not verify live DB state (whether the ledger migration is applied in production).
- Did not run any readiness probe against a live Instantly/Mailgun key.
- Did not inspect the src/hooks/useAutonomousAgent.ts sendEmail caller beyond knowing it invokes email-sender (which is gated).
- Did not read the four elite-email-release-*/index.ts runtime wiring in full (only the handlers), nor the MCP server email tools.
- Did not audit docs/wholesale/** for a parallel cold-email implementation.

**confidence**: high