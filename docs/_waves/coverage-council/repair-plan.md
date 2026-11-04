# The ordered repair plan

lane: repair-plan  mode: council  reconciled by: manager:deepseek/deepseek-v4.1-flash over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.0279 (reviewers $0.0228 + manager $0.0051)
tokens: 10847 in / 4778 out
files: src/lib/launchSafety.ts, supabase/functions-live/README.md

---

**Step zero — deploy gate.** Do **not** deploy `main`. README: `*_NOT_CERTIFIED` 503 gates exist only on `main`, never live; live snapshots are read-only.  
- **Option A — deploy `main`:** dialer/report paths return 503; revenue-path outage.  
- **Option B — deploy live/`wholesale` or per-function live-reconciled bytes:** preserves live behavior; README verifies byte-identity for only 8 re-snapshotted files, so per-function for the rest. Gates stay unreconciled.  
Choose B unless no deploy is needed.

**Ordered plan (risk removed ÷ effort)**

1. **Migration `20260407220336_3e4797af`** — file not in evidence. If unapplied: add intended `WHERE` or remove bare `DELETE`. If applied: do not edit history; restore/compensate. Test: two-org seeded replay, non-target row counts unchanged. Blast: wipes all `lead_pipeline_positions`.
2. **Stripe metadata** — `supabase/functions/stripe-webhook/index.ts:368`. Change to `credit_amount_cents ?? amount_cents`. Test: mock session with `credit_amount_cents=5000` → `p_amount_cents=5000`. Blast: zero credits or free credits. Flag `:384` vs `:419` discrepancy.
3. **Revoke `get_user_organizations`** — definition/grants not in evidence. `REVOKE EXECUTE ... FROM anon, authenticated` (add `public` if confirmed). Test: anon/tenant-A call denied. Blast: breaks org switching if used.
4. **Campaign wizard org_id** — `src/components/CampaignWizard.tsx`; grep shows no `organization_id`. Add from trusted server session; validate server-side. Test: fresh org creates campaign; cross-tenant rejected. Blast: insert fails or cross-tenant write.
5. **Retell signing key** — `supabase/functions/retell-call-webhook/index.ts` (live v453). Set secret; fail closed on missing/invalid; do not accept unsigned. Test: valid 200, missing 503, invalid 401, no DB writes. Blast: forged outcomes or dropped real events.
6. **Dispatcher cron** — `supabase/functions/call-dispatcher/index.ts` or pg_cron, not in evidence. Wake tenants with active campaigns/onboarding, not only due rows. Test: fresh org zero rows → work. Blast: no dispatch or thundering herd.
7. **Phone provisioning** — file not in evidence. Allocate/purchase number on org creation. Test: fresh org has number. Blast: onboarding blocked.
8. **73 gates** — `supabase/functions/*/index.ts` on `main`; reference `functions-live`. Remove or certify per gate. Test: staging happy paths non-503. Blast: outage if deployed `main`; contact egress if removed without server checks.
9. **85 org-blind tables** — migrations/RLS not in evidence. Add `organization_id` + RLS; backfill before `NOT NULL`. Test: tenant A cannot read/write tenant B. Blast: cross-tenant leak or broken queries.

**Must NOT touch:** `supabase/functions-live/**`; Retell signature verification (fix secret); `src/lib/launchSafety.ts` browser locks (do not flip true); `paused` status mutation; cosmetic trailing comments; applied migration history.

**Disagreements**
- **Deploy source:** R1 hold vs R2/R3 deploy live/`wholesale`/per-function. Evidence favors not `main`; live/`wholesale` verified only for 8 files, so per-function for others.
- **Retell:** R3 “fallback/graceful verification” vs R1/R2 fail closed. No evidence; security favors fail closed. Reject R3 if it means accepting unsigned.
- **Revoke scope:** R1 `anon, authenticated` vs R3 `public, anon, authenticated`. Unresolved.
- **Ordering:** R1 migration first; R2/R3 stripe first. Migration triage first because unapplied bare DELETE is catastrophic; stripe second.
- **`get_user_organizations` placement:** R1 step 2 vs R3 step 5. Unresolved.

**Rejected**
- R3 “Confidence: High” — unsupported; most defect details are not in evidence.
- R3 Retell “fallback/graceful verification” — reject if it weakens signature.
- R2 blanket “deploy live snapshot/`wholesale`” — overbroad; README verifies only 8 files.
- R1 “hold deploy recommended” as universal — only if no deploy is needed.

**None checked:** actual gate source; checkout creator; migration file/applied state; cron definition; Retell secret name/env; `get_user_organizations` definition/grants; 85 table list/RLS; phone provisioning code; test suite; live secrets; counts 73/40+/85; current `wholesale` state; Stripe RPC signatures.

**Confidence: medium-low.** Next check: whether `20260407220336_3e4797af` is applied and its exact SQL — that decides step 1 and the recovery window.
