# Deployment Truth Audit — Dial Smart System

**Generated:** 2026-07-01 · **Branch:** `claude/sales-engine-launch-check-30asbv`
**Method:** Live Supabase project (`emonjusymdripmkvtttc`) cross-referenced against the repo. Every claim below was verified against the running project via the Supabase API, not inferred from CLAUDE.md.

> **Headline:** The CLAUDE.md "NOT DEPLOYED" markers are **stale and misleading**. Lovable auto-deploys every edge function and migration on commit. In reality **everything is live** — 91 edge functions, 139 migrations, all feature tables present with RLS enabled. The database is **near-empty** (0 campaigns, 2 leads, 0 organizations), i.e. this is a **pre-launch system with no production data yet.** The real risks are (1) a handful of **publicly-callable privileged RPCs**, (2) live **experimental/debug functions** in prod, and (3) **multi-tenant org-scoping that isn't wired** but also isn't needed until org #2 exists.

---

## 1. What's actually live (ground truth)

| Layer | Live count | Notes |
|---|---|---|
| Edge functions | **91 ACTIVE** | Includes everything CLAUDE.md marked "NOT DEPLOYED" |
| Migrations applied | **139** | Latest `20260601173320` |
| Public tables | **~130** | **All have `rls_enabled = true`** |
| Organizations | **0 rows** | Multi-tenancy dormant |
| Campaigns / Leads / Calls | **0 / 2 / 2** | Effectively empty — pre-launch |

**"NOT DEPLOYED" features that are in fact fully live** (function version in parens):
- `ai-autonomous-engine` (v112) — the whole autonomous brain
- Entire Telnyx platform: `telnyx-ai-assistant` (v122), `telnyx-webhook`, `telnyx-dynamic-vars`, `telnyx-outbound-ai`, `telnyx-insights`, `telnyx-knowledge-base`, `telnyx-scheduled-events`
- `assistable-make-call` (v41) — Assistable integration (an earlier audit said "no code found"; it exists and is deployed)
- `api-gateway` (v34) + `credit-management` (v118) + `stripe-webhook` (v118) — REST/MCP + billing
- All Feb/Mar autonomous + strategist + ML tables exist (`ml_models`, `lead_predictions`, `churn_risk_events`, `sms_copy_variants`, `message_effectiveness`, `daily_battle_plans`, `strategic_insights`, …)

**Action:** Treat CLAUDE.md deploy-status lines as historical narrative only. This file is the source of truth. Going forward, do not trust "NOT DEPLOYED" — assume commit = deploy.

---

## 2. 🔴 CRITICAL — publicly-callable privileged RPCs (fix before any public launch)

Supabase security advisor flagged **36 `SECURITY DEFINER` functions executable by `anon` AND `authenticated`** over `/rest/v1/rpc/...`. Because they run as definer, a caller bypasses RLS. The dangerous ones:

| Function | Risk if left public |
|---|---|
| `mint_api_key` | Anyone can mint themselves an API key |
| `add_credits` | Anyone can grant themselves credits (revenue theft) |
| `upgrade_user_tier` | Anyone can upgrade their own plan |
| `finalize_call_cost` / `reserve_credits` | Billing manipulation |
| `has_role` / `is_org_admin` / `get_user_org_role` / `user_in_organization` | Privilege-check tampering surface |

**Fix:** `REVOKE EXECUTE ... FROM anon, authenticated` on server-only RPCs (they're called by edge functions using the service role, which is unaffected). Ship as a reviewed migration — do NOT blind-revoke without confirming no client calls them directly.

**Also flagged:**
- **4 `SECURITY DEFINER` views (ERROR):** `top_openers`, `time_wasted_summary`, `voicemail_performance`, `call_outcome_dimensions` → recreate as `SECURITY INVOKER`.
- **27 functions with mutable `search_path`** → add `SET search_path = ''` (search-path injection hardening).
- **2 public storage buckets allow listing:** `broadcast-audio`, `marketing-assets` → scope SELECT policies.
- **`edge_function_errors`** INSERT policy `WITH CHECK (true)` → scope to service role.
- **Postgres `15.8.1.094`** has outstanding security patches → upgrade.

> No table has RLS disabled and no table has zero policies — the read-side data model is sound. The exposure is in **function grants**, not tables.

---

## 3. 🟠 Live experimental / debug / one-shot functions in production

These are ACTIVE in prod and should be deleted or gated — they are attack surface and confusion:

`patch-grace-once`, `debug-twilio-call`, `test-sip-call`, `test-workflow`, `clear-voice-webhooks`, `remove-trunk`, `backfill-call-agent-data`, `retell-cost-backfill`, `check-number-config`, `configure-sip-trunk`, `setup-lady-jarvis`, `demo-call`, `demo-scrape-website`, `demo-sms-reply`, `retell-force-webhook`.

**Action:** Audit each. One-shots (`patch-grace-once`, `*-backfill`) should be removed post-run. `debug-*` / `test-*` should never be in prod. `demo-*` are fine if the marketing demo depends on them — confirm and keep.

---

## 4. 🟡 Multi-tenant org-scoping — half-wired, dormant

- `organizations` + `organization_users` exist, RLS enabled, **0 rows**.
- Only **10 of 91 edge functions** reference `organization_id`; the rest scope by `user_id`.
- Edge functions use the **service-role key**, which **bypasses RLS** — so org isolation depends on explicit `.eq('organization_id', …)` filters in function code, which are largely absent.

**Verdict:** Not a live risk — there is exactly one operator (you) and zero orgs. It becomes the **#1 blocker the moment you onboard a second organization** as a white-label tenant. Do the org-scoping sweep *before* SaaS, not before your own launch.

---

## 5. Launch decision matrix

| If you're launching… | Ready? | Must-fix first |
|---|---|---|
| **Your own sales operation** (single operator) | **Nearly** | (a) lock down public privileged RPCs, (b) verify Retell dial path end-to-end with real data, (c) silent-failure alerting |
| **Multi-tenant white-label SaaS** | **No** | All of the above **plus** org-scoping sweep across 91 functions + cross-org isolation tests |

---

## 6. Pre-launch checklist (single-operator launch)

- [x] **Security:** revoke `anon`/`authenticated` EXECUTE on `mint_api_key`, `add_credits`, `upgrade_user_tier`, `reserve_credits`, `finalize_call_cost` + all server-only RPCs. **DONE** — migration `20260701132102` (applied). Verified: 0 SECURITY DEFINER functions anon-callable.
- [x] **Security:** flip 4 SECURITY DEFINER views to `security_invoker`; pin `search_path` on all public functions. **DONE** — migrations `20260701132102` + `20260701132334` (applied). Verified: 0 functions without a pinned search_path.
- [x] **Security:** replace always-true `edge_function_errors` INSERT policy with own-row check. **DONE**.
- [x] **Reliability:** silent-failure alerting on the dial path. **DONE** — `_shared/alerting.ts` wired into `call-dispatcher`.
- [x] **UX:** first-run guided setup hero on Command Center. **DONE**.
- [x] **Build (CRITICAL):** `index.html` + `public/showcase/blog-index.html` were base64-corrupted → a standard `vite build` emitted a **blank app with no JS**. **DONE** — decoded back to real HTML; build now emits the app bundle. (Lovable's pipeline apparently decoded these on its side, which is why prod worked; CI/any standard build did not.)
- [x] **Orchestration:** adopt `resolveRouting()` in the dispatcher (Phase 1). **DONE** — inline provider selection replaced by the shared router; explicit-provider fallback added.
- [x] **Perf:** PWA precache scoped to the app shell. **DONE** — 43 MB/358 entries → 3.8 MB/202 entries.
- [x] **Storage:** `broadcast-audio` / `marketing-assets` listing — **ACCEPTED BY DESIGN.** Both must be `public` (Twilio fetches audio via unsigned URLs; marketing site needs public images), public downloads bypass RLS, and contents are non-sensitive. Revisit only if these buckets ever hold sensitive data (then: private bucket + signed URLs).
- [ ] **Cleanup (you — CLI):** delete debug/test/one-shot edge functions still live in prod (§3). No MCP delete tool. Run:
  ```bash
  supabase functions delete patch-grace-once debug-twilio-call test-sip-call \
    backfill-call-agent-data retell-cost-backfill --project-ref emonjusymdripmkvtttc
  # review before deleting (keep if still needed): test-workflow, clear-voice-webhooks,
  # remove-trunk, check-number-config, configure-sip-trunk, setup-lady-jarvis, retell-force-webhook
  # KEEP: demo-* (marketing demo depends on them)
  ```
- [ ] **Infra (you — dashboard):** upgrade Postgres to the patched version. Supabase Dashboard → Settings → Infrastructure → Upgrade.
- [ ] **Verify (you):** one real end-to-end Retell campaign — dispatch → webhook → `call_logs` row → disposition recorded.
- [ ] **Hygiene (non-blocking):** 714 `console.*` statements, `npm audit` high/moderate vulns.

---

## 7. What's genuinely solid

- Builds clean: `npm run build` ✅, `tsc --noEmit` ✅ 0 errors.
- Read-side data model: every table RLS-enabled, no open tables.
- Core Retell dial path deployed and iterated hard (dispatcher v609, outbound-calling v599, retell-call-webhook v452).
- Deep feature surface fully deployed (autonomous engine, Telnyx, credits, MCP/REST API).

*This audit is a point-in-time snapshot. Re-run the Supabase advisors after any DDL change.*
