# risks-b1d-consent-capture

- status: completed
- tldr: risks-b1d-consent-capture: no durable per-lead consent record and no consent check in the call path; consent exists only in JSON docs + a zero-contact redacted shadow lane.

risks-b1d-consent-capture DONE. Answer: TCPA consent is NOT captured as a durable per-lead record in the operational schema and is NOT verified in code before a call/SMS. Facts: (1) No consent table exists - agentgrep for CREATE TABLE/REFERENCES public.consent across supabase = 0 matches; no consent columns on leads. (2) The solar-exit JSONs (eligibility-policy.json:10-45, manifest.json:6-7,142-217) are offline-only policy/docs: production_launch_allowed=false, all approvals false, __REQUIRED_*__ placeholders, and repo-wide grep shows no code loads eligibility-policy/reactivation-policy. (3) The only consent-bearing schema is ghl_shadow_ingest_lane.sql:168-296, a redacted-HMAC append-only lane with contact_authorized/launch_authorized GENERATED ALWAYS AS false (:185-187,:250-253; comment :690-691). (4) call-dispatcher/index.ts enforces only DNC (:1695-1727), evaluate_contact_stop (:1731-1750), calling hours, do_not_call - no consent. (5) outbound-calling/index.ts:652-693,793-819,926-943 enforces evaluate_contact_stop + DNC + calling hours + evaluate_campaign_contact_release - no consent. (6) The 'final release gate' evaluate_campaign_contact_release (20260713150000:187-314) checks cohort membership/identity/expiry, NOT consent. (7) evaluate_contact_stop (20260712020000:196-257) checks only kill-switch scopes, not consent. So consent is described in JSON/docs and expected in GHL custom fields, but is not a Dial Smart consent record and is not enforced in code. Confidence: medium. Validation: full trace of the certified voice path + negative searches. Follow-ups for other nodes: (a) untested egress entry points (assistable-make-call, api-gateway, ai-sms-processor, workflow-executor SMS, lead-reset) - SMS consent path not traced; (b) live DB schema not checked (migrations only); (c) GHL custom-field consent population/enforcement lives outside this repo.

## Artifact

**Findings**

TCPA consent is NOT captured as a durable per-lead record in the operational schema, and is NOT verified in code before a call/SMS goes out. Consent exists only as (a) JSON policy/docs in campaigns/solar-exit/ and (b) a redacted-HMAC, append-only zero-contact shadow lane that can never authorize contact. The certified voice dispatch path enforces DNC, contact-stop kill-switches, calling hours, and a campaign-contact-release gate that checks cohort MEMBERSHIP but never consent. FACT.

**evidence**

- campaigns/solar-exit/eligibility-policy.json:10-45 lists consent.required_evidence_fields (consent_artifact_id, ai_voice_calls_authorized, telemarketing_calls_authorized, revoked, etc.) and :5-9 default_decision=deny / seller_specific_consent_required=true, but this file is policy config only.
- agentgrep repo-wide for eligibility-policy|eligibility_policy|reactivation-policy returned 0 matches in code -> the solar-exit policy JSONs are never loaded by src/ or supabase/ (FACT).
- campaigns/solar-exit/manifest.json:6-7 environment=offline_only, production_launch_allowed=false; :142-217 all launch_approvals.approved=false; :80-105 required_launch_placeholders remain __REQUIRED_*__ -> package is unshipped test material, not running config (FACT).
- No operational consent table exists: agentgrep for 'CREATE TABLE ... consent' / 'public.consents' / 'REFERENCES public.consent' across supabase returned 0 matches (FACT). Only consent-named schema is the shadow lane.
- supabase/migrations/20260713074000_ghl_shadow_ingest_lane.sql:168-296 creates ghl_shadow_ingest_bindings/receipts/ledger; :185-187 contact_authorized/launch_authorized GENERATED ALWAYS AS false; :250-253 receipts same; :690-691 COMMENT explicitly says it cannot authorize contact. Consent values are stored only as redacted HMAC evidence jsonb (consent_*_identifier_hmac), not queryable consent records (FACT).
- supabase/functions/call-dispatcher/index.ts:1031-1068 lead eligibility checks only phone/do_not_call/workflow/callback/terminal; :1695-1727 DNC hard stop; :1731-1750 evaluate_contact_stop; :551-623 calling hours. NO consent lookup anywhere in the dispatcher (FACT).
- supabase/functions/outbound-calling/index.ts:652-693 assertContactAllowed checks evaluate_contact_stop + leads.do_not_call + dnc_list; :765-790 calling hours; :793-805/807-819 assertCampaignContactReleased; :926-943 builds release input. NO consent check at the provider boundary (FACT).
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:187-314 evaluate_campaign_contact_release checks release row exists/active/unexpired, identity binding, campaign active+agent match, lead enrolled + lead in release cohort. It does NOT read any consent field (FACT).
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196-257 evaluate_contact_stop only queries contact_stop_controls (global/org/user/campaign/provider/channel kill-switches). Not consent (FACT).
- supabase/migrations/20260713074000_ghl_shadow_ingest_lane.sql:6-43 ghl_shadow_custom_field_mapping_is_exact requires consent fields as GHL custom-field ids mapped via jsonb (per-tenant binding), i.e. consent is expected to live in GoHighLevel custom fields, not in Dial Smart operational tables (FACT).

**validation**

Traced the full certified voice egress path: call-dispatcher -> outbound-calling (final provider boundary) -> evaluate_contact_stop + evaluate_campaign_contact_release. Read each gate's SQL body in full and confirmed neither reads a consent artifact. Ran negative searches across src/ and supabase/ for a consent table, consent columns on leads, and any runtime load of the solar-exit policy JSONs (all empty).

**open_questions**

- Does any non-certified egress entry point (assistable-make-call, api-gateway, workflow-executor SMS, lead-reset/Refresh Leads, ai-sms-processor) create a call/SMS without the release gate, and does any of them check consent?
- Is consent actually instantiated as GHL custom fields for any live tenant (ghl_shadow_ingest_bindings.custom_field_mapping), and if so is it ever read at dispatch time?
- Does the live Supabase database contain consent tables/columns that the migration files under supabase/migrations do not describe (drift between repo and live schema)?

**what_i_did_not_check**

- Other egress entry points: assistable-make-call, api-gateway, ai-sms-processor, workflow-executor SMS steps, lead-reset/Refresh Leads, and any Telnyx/Twilio send paths were not read; consent enforcement for SMS specifically was not traced.
- The live Supabase database schema and data (only repo migrations were read) - a consent table could exist live without a repo migration.
- The retail Lovable app's Supabase project (emonjusymdripmkvtttc) and any functions there.
- Whether GHL custom fields holding consent are actually populated/enforced by any GHL workflow outside this repo.
- campaigns/solar-exit/ghl-mapping.json custom-field semantics and the certification/* lineage copies were not read line-by-line beyond the consent grep.

**confidence**: medium