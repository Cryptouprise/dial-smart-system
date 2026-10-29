Assumption: "pack" = a per-organization feature bundle; the simplest storage is a column on `organizations` plus a config table, since no pack concept exists in the material.

### Phases

**Phase 1 — Apply the hardening migrations to live DB (S)**
Goal: live DB matches the repo's tenant contract.
Changes: apply the 20260712–20260720 migrations (report:01-schema A, D, E). No new code.
Prove: run the audit's trigger list against live DB; confirm `call_logs`/`dnc_list` delete guards fire and `organization_id` is NOT NULL on `leads`, `campaigns`, `phone_numbers`, `call_logs` (report:01-schema A).
Note: the 20260712 RESTRICT vs 20260720 SET NULL conflict must be resolved first (report:01-schema A) — GUESS which wins; verify live.

**Phase 2 — Pack storage + UI gating (M)**
Goal: a company's enabled packs drive which screens render.
Changes: `organizations.settings` JSONB already exists (report:01-schema A) — store `{"packs":["solar_exit"]}` there; no new table. Add a `useEnabledPacks()` hook reading `currentOrganization` (report:04-frontend C). Gate sidebar groups in `navigationGroups` (report:04-frontend D) and routes in `App.tsx:141-150` (report:04-frontend A).
Prove: set `settings.packs` on the one live org; confirm only that pack's sidebar group and routes appear; unset and confirm they hide.

**Phase 3 — Pack fields, stages, scripts (M)**
Goal: a pack adds its own lead fields, pipeline stages, scripts.
Changes: `leads` has no `custom_fields` column (report:01-schema C) — GUESS: add `leads.custom_fields JSONB DEFAULT '{}'` (no migration in material adds it). Pipeline stages already exist as `dispositions.pipeline_stage` and `pipeline_boards` (report:01-schema B); seed per-pack rows on pack enable. Scripts: `agent_scripts` carries `organization_id` (report:01-schema A).
Prove: enable a pack, confirm its dispositions/boards/scripts rows exist for the org and are invisible to another org.

**Phase 4 — Telnyx browser phone (L)**
Goal: a person dials from the browser.
Changes: new edge function `telnyx-voice-token` (credential endpoint); new `telnyx-call-control` webhook; write `call_logs` rows with `telnyx_call_control_id`, `telnyx_call_session_id`, `telnyx_conversation_id` (columns exist, report:01-schema B). No browser-calling code exists today (report:03-sms-voice F).
Prove: place a browser call, confirm a `call_logs` row appears with a `telnyx_call_control_id` and a `recording_url`.

**Phase 5 — SMS tenant fix (M)**
Goal: SMS stops being per-user.
Changes: `sms_messages`/`sms_conversations` carry `user_id` only (report:01-schema A); inbound falls back to "most recent user" (report:03-sms-voice B.4). Add `organization_id` to both, rewrite RLS, remove the fallback. `send_sms` is hard-disabled (report:03-sms-voice A.2) — re-enable only after this.
Prove: two users in one org see the same conversation; a second org sees none.

**Phase 6 — Billing lock (M)**
Goal: unpaid org loses access automatically.
Changes: `organizations.subscription_status` and `billing_enabled` exist (report:01-schema A); `organization_credits` exists (report:01-schema B). Add a check in `ProtectedRoute` (implementation UNKNOWN, report:04-frontend G) reading `subscription_status`.
Prove: set status to `suspended`; confirm the org's users are locked out.

### Packs

- Storage: `organizations.settings` JSONB (report:01-schema A) — `{"packs":["solar_exit","wholesale_re"]}`. No new table. GUESS: this is sufficient; a `pack_config` table is only needed if packs get per-org overrides.
- UI show/hide: one hook reads `settings.packs`; sidebar filters `navigationGroups` (report:04-frontend D); routes conditionally rendered in `App.tsx` (report:04-frontend A). Simple mode already filters by `simpleMode: true` (report:04-frontend D) — pack items must set it.
- Pack fields: `leads.custom_fields` JSONB (GUESS — not in material, report:01-schema C).
- Pack stages: seed `dispositions` rows (`pipeline_stage`, `organization_id` present, report:01-schema B) and `pipeline_boards` rows on enable.
- Pack scripts: seed `agent_scripts` rows (carries `organization_id`, report:01-schema A).

### Telnyx browser phone

- Credential endpoint: new `telnyx-voice-token` edge function returning a short-lived Telnyx credential. GUESS on Telnyx's exact token API — not in material.
- Connection: browser WebRTC client (new code; none exists, report:03-sms-voice F).
- Call control webhook: new `telnyx-call-control` function; must use service-role key because `call_logs` is revoked from `authenticated` (report:01-schema E).
- Recording: store URL in `call_logs.recording_url` (column exists, report:01-schema B).
- Logging: insert `call_logs` with `organization_id`, `user_id`, `telnyx_call_control_id`; the `call_logs_require_authoritative_tenant` and `call_logs_same_tenant_graph` triggers will reject bad rows (report:01-schema D).
- Telnyx account setup: UNKNOWN — no material covers Telnyx account/connection config. File that would answer it: Telnyx provider docs, not in material.
- Per-company number + caller ID: `phone_numbers` has `organization_id`, `provider` CHECK includes `telnyx`, `call_direction`, `purpose` (report:01-schema B). Rule: caller ID must be a `phone_numbers` row with matching `organization_id` and `provider='telnyx'`. Today `placeCall` does not verify the supplied `from_number` belongs to the org (report:02-api E) — fix in Phase 4.

### Before company #2

Ranked by risk:
1. **SMS cross-tenant leak** — `sms_messages`/`sms_conversations` are `user_id`-only and inbound falls back to "most recent user" (report:01-schema A; report:03-sms-voice B.4). Highest risk: one company's texts reachable by another.
2. **Hardening migrations unapplied** — live DB lacks the tenant triggers and RLS lockdowns (report:01-schema A, D, E).
3. **`campaign_leads`/`dialing_queues` have no `organization_id`** and RLS is `user_id`-based (report:01-schema A) — a manager cannot act on a colleague's lead.
4. **`user_roles` is global, unscoped** (report:01-schema A) — a role in one org leaks to another.
5. **`placeCall` does not validate `from_number` ownership** (report:02-api E) — caller-ID spoofing across tenants.
6. **`markLeadDnc` upsert supplies wrong conflict column** (report:02-api E) — DNC writes may fail silently.
7. **External API gateway hard-disabled** (report:02-api E) — if any company relies on it, it is off.
8. **`ai_sms_settings` keyed by `user_id`, no per-org off switch** (report:03-sms-voice C.9).

### Not now

- Rebuilding the external API gateway (report:02-api E).
- Twilio paths — Telnyx is the chosen provider; Twilio code is disabled (report:03-sms-voice F).
- Conference / IVR / forward-to-cell (absent, report:03-sms-voice F, H).
- START/resubscribe handling (absent, report:03-sms-voice H).
- A separate `pack_config` table — `settings` JSONB suffices until proven otherwise.
- Mortgage and Law Firm packs — build the mechanism, ship Solar Exit and Wholesale Real Estate first.