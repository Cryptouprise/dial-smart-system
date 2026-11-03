# market-objection

- status: completed
- tldr: Top 3 buyer objections cited: cert gates hardcoded false (108/51 funcs), live anon number leak + 503 webhook, demo-not-product hygiene; "no tests" claim is false.

market-objection DONE (ranked first-10-minute buyer objections, code-cited). Executed atomically (all sub-checks were cheap inline reads/greps, no model spend) then complete_node.

TOP 3 OBJECTIONS:
#1 (highest NO risk) Half the product is switched off: systemic hardcoded cert gates. call-dispatcher/index.ts:15-25 (three isXCertified() -> false; used at :413/:640/:1266); ai-assistant/index.ts:2878-2880 -> :2891-2900 always 503. 108 'Certified' matches in 51 edge functions. NOT fake code (fail-closed 'launch containment', comment 2887-2890) but nothing is proven end-to-end. NUANCE: functions-live/README.md:8-10 says main's 503 gates are NOT live, so main != live.
#2 Live trust/security: voice-call-events/index.ts:217-220 returns 503 when WEBHOOK_SECRET_TELNYX unset; functions-live/README.md:23 + p5 REVIEW.md:208 document a live unauthenticated get_available_numbers leak (42 numbers); most-recent-user SMS fallback = cross-tenant leak (p5 brief:5). The 'leaked Telnyx key'/'missing Stripe secrets' are REPO-UNVERIFIABLE (checkpoints only; grep for hardcoded key = 0 hits).
#3 Demo-not-product hygiene: duplicate functions-live/ snapshot tree w/ double-nesting; root .deployed-*.ts + .tmp_api_gateway_payload.json; single-org/one-user tenancy (LIVE-SCHEMA.md:45, p4a REVIEW.md:253); LooseClient escape hatch (host.ts:82-97); live site 4 commits behind w/ deck 404.

REBUTTAL: 'no tests' is FALSE - vitest+playwright, 12+ React tests, dozens of Deno tests, ~30 SQL RLS contract tests.

VALIDATION: read every cited file at cited lines; grep-confirmed 108/51 gates and 0 hardcoded-key hits. Did NOT run tests/build or query live Supabase.
BLOCKERS/FOLLOW-UPS: need (a) live get_edge_function to confirm main-vs-live gate mismatch, (b) live-secret audit for Telnyx/Stripe, (c) green test run. Confidence: medium.

## Artifact

**Findings**

TOP 3 OBJECTIONS, RANKED.

#1 - 'Half the product is switched off': systemic hardcoded certification gates. FACT: call-dispatcher/index.ts:15-25 defines isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified, all 'return false', consumed at :413, :640, :1266 (so force-dispatch, callback automation, and Retell number sync are dead in the repo). FACT: ai-assistant/index.ts:2878-2880 has isAiAssistantToolSurfaceTenantCertified 'return false', so :2891-2900 always returns HTTP 503 AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED (comment 2887-2890: deliberate 'launch containment' - legacy tools enumerated account-global Retell/Twilio resources before proving org ownership). FACT: grep 'Certified' = 108 matches across 51 edge functions with the same `if (!isXCertified()) return 503` shape (advanced-spam-detection:10/29, ai-brain:10/4652, ai-autonomous-engine:5498/5511, disposition-router:76/89, workflow-executor:34, email-sender:8/21, ghl-integration:63/75, ml-learning-engine:50/59, nudge-scheduler:25/36, budget-tracker:21/33). A code reviewer sees the flagship AI-manager / AI-brain / live-coach / voice-broadcast / GHL surfaces present but dead. HONEST ANSWER TO #1: this is NOT fake code - the gate is a real, deliberate fail-closed containment decision, so the honest story is 'capabilities written but intentionally disabled pending tenant-binding'. But as shipped there is no in-repo date or owner to flip them and no single flagship proven end-to-end, so a smart buyer cannot verify any headline claim in 10 minutes - that is exactly what earns a NO. Fix: prove ONE flagship end-to-end on the live org, or remove the dead surface from the UX until certified. CRITICAL NUANCE: functions-live/README.md:8-10 states GitHub main carries 'unreleased 503 certification-gate changes that live does NOT have' - the LIVE deployed functions have no such gate, so a live DEMO may work while a CODE REVIEW looks switched-off. That main-vs-live divergence is itself a buyer objection ('which one is the product?').

#2 - Live trust/security blockers. (a) FACT: voice-call-events/index.ts:212-220 returns HTTP 503 'Telnyx webhook signature verification is not configured' whenever WEBHOOK_SECRET_TELNYX is unset - inbound Telnyx call events are rejected in prod (index.ts:219). (b) FACT (live snapshots): functions-live/README.md:23 documents the LIVE sms-messaging deployed with verify_jwt=FALSE -> 'unauthenticated get_available_numbers leak'; docs/wholesale/phases/staging/p5/REVIEW.md:208 confirms get_available_numbers 'without a login is now 401 (live leaked 42 numbers)' - an anonymous read of the phone inventory. (c) FACT (docs): inbound SMS with no matching 'to' 'FALLS BACK TO THE MOST RECENT USER' (docs/wholesale/phases/briefs/p5-texting-per-company.md:5; docs/wholesale/PLAN-draft-deepseek.md:57) and user_roles is global/unscoped (PLAN-draft-deepseek.md:60) - a cross-tenant leak. (d) THE TWO SCARIEST CLAIMS ARE UNVERIFIABLE FROM THE REPO: 'leaked Telnyx key' and 'missing Stripe secrets' appear ONLY in session checkpoints (scripts/ship/_checkpoint_new.md:64, scripts/ship/_checkpoint_d2d_port.md:69, docs/wholesale/HANDOFF-2026-11-02.md:119), never in code; a repo grep for a hardcoded Telnyx key (KEY[0-9a-fA-F]{20}) returns 0 hits, and root .env holds only the Supabase anon/publishable key (public by design). So the verifiable security facts are the anon phone-inventory leak and the 503 webhook; the leaked-key / Stripe-secret claims need a live-secret audit before any demo.

#3 - 'Looks like a demo, not a product' hygiene + single-tenant reality. (a) The repo commits a full duplicate snapshot tree supabase/functions-live/ (12 slugs) with accidental double-nesting (functions-live/sms-messaging/sms-messaging/index.ts, call-dispatcher/functions/call-dispatcher/index.ts, retell-call-webhook/functions/retell-call-webhook/index.ts); functions-live/README.md:1-15 calls them read-only snapshots - defensible, but it roughly doubles the surface and reads as unmanaged. (b) Root-level debris: .deployed-call-dispatcher-v602.ts, .deployed-call-dispatcher-v609.ts, .deployed-retell-call-webhook-v448.ts, -v449.ts, .tmp_api_gateway_payload.json, .env, .env.monitoring.example (dir listing). (c) Local dist/ and dist-ssr/ present (gitignored); a fresh vite build is GREEN per scripts/ship/_checkpoint_addendum_build.md:5-14, so the stale-dist item is a local footgun, not a published-build defect. (d) Single-tenant reality vs the 'multi-tenant' claim: only ONE organization exists (Default Organization 11824e05-24e3-4dc3-b684-5d0bc7c436d6) whose sole member (5969774f-...) is owner AND platform admin (docs/wholesale/audit/phase1/LIVE-SCHEMA.md:45; docs/wholesale/phases/staging/p4a/REVIEW.md:253); core-table RLS is still largely per-USER auth.uid()=user_id rather than per-org (LIVE-SCHEMA.md:21-41). (e) Type-safety escape hatch: src/packs/door_to_door/host.ts:82-97 defines interface LooseClient and casts `const db = supabase as unknown as LooseClient`, bypassing generated Supabase types in the newest pack. (f) The live site is behind: both production domains still serve commit 61ce6d40 while source is 4 commits ahead, port chunk MISSING, deck 404 (scripts/ship/_checkpoint_addendum_build.md:35-38).

REBUTTAL - the 'no tests' objection is FALSE. Test infra is extensive: vitest + playwright configured (package.json:21-26; devDeps vitest 4.1.10, @playwright/test 1.57.0); 12+ React component tests under src/components/__tests__/ (ActionQueuePanel, AutonomousAgentDashboard, CampaignLaunchVerification, CampaignWizard, CommandCenter, DailyReports, EliteSolarLaunchControl, EnhancedLeadManager, ErrorBoundary, LeadJourneyDashboard...); dozens of Deno *.test.ts under supabase/functions (incl. _shared/api-auth.test.ts, _shared/control-plane/*.test.ts, teams-bot-auth.test.ts, zapier-observer/handler.test.ts, automation-scheduler/scheduler-auth.test.ts); ~30 SQL RLS contract tests under supabase/tests/ (credential_storage_contract.sql, billing_ownership_boundary_contract.sql, call_log_evidence_boundary_contract.sql, dnc_tenant_contract.sql, provider_resource_ownership_boundary_contract.sql...); and scripts/*.test.mjs. So 'missing proof' is not a fair first-10-minute objection - the proof exists (the CI gate at package.json:73 is a very large composite). The real gaps are trust/verification, not absence of tests.

RANKED NO-LIST (fastest deal-killer first): (1) flagship surfaces gated off in the repo; (2) anonymous phone-inventory leak + 503 inbound webhook + unverified secret claims; (3) snapshot-tree duplication, root debris, single-tenant/one-user reality, LooseClient escape hatch, and a live site 4 commits behind with a 404.

**evidence**

- supabase/functions/call-dispatcher/index.ts:15-25 (three isXCertified() return false) consumed at :413, :640, :1266
- supabase/functions/ai-assistant/index.ts:2878-2880 gate false; :2887-2890 rationale comment; :2891-2900 HTTP 503 response
- grep 'Certified' = 108 matches in 51 files under supabase/functions (advanced-spam-detection:10/29, ai-brain:10/4652, ai-autonomous-engine:5498/5511, disposition-router:76/89, ghl-integration:63/75, ml-learning-engine:50/59, nudge-scheduler:25/36)
- supabase/functions-live/README.md:8-10 (main carries unidentified 503 gates live does NOT have) and :23 (live sms-messaging verify_jwt=FALSE -> unauthenticated get_available_numbers leak)
- supabase/functions/voice-call-events/index.ts:212-220 (WEBHOOK_SECRET_TELNYX unset -> HTTP 503)
- docs/wholesale/phases/briefs/p5-texting-per-company.md:5 and docs/wholesale/PLAN-draft-deepseek.md:57,60 (most-recent-user fallback cross-tenant leak; global user_roles)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:45 (1 organization) and :21-41 (core-table RLS still per-user); docs/wholesale/phases/staging/p4a/REVIEW.md:253 (sole member owner AND platform admin)
- src/packs/door_to_door/host.ts:82-97 (interface LooseClient; `as unknown as LooseClient`)
- package.json:21-26 (test scripts), :73 (certify:static composite); src/components/__tests__/*.test.tsx; supabase/tests/*.sql; supabase/functions/**/*.test.ts
- scripts/ship/_checkpoint_addendum_build.md:5-14 (fresh vite build GREEN), :35-38 (live serves 61ce6d40, port chunk MISSING, deck 404)
- scripts/ship/_checkpoint_new.md:64, _checkpoint_d2d_port.md:69, docs/wholesale/HANDOFF-2026-11-02.md:119 (declared but unverifiable Telnyx-leak / missing-Stripe claims)
- root dir listing: .deployed-*.ts, .tmp_api_gateway_payload.json, .env, dist/, dist-ssr/

**validation**

Read each cited file at the cited lines (call-dispatcher/index.ts 1-40; ai-assistant/index.ts 2876-2906; voice-call-events/index.ts 205-252; package.json; .gitignore; supabase/functions-live/README.md; src/packs/door_to_door/host.ts 78-122; checkpoint addendum full; LIVE-SCHEMA.md and staging/p4a/REVIEW.md excerpts via grep). Grep-confirmed systemic gate pattern (108 matches / 51 files) and absence of hardcoded Telnyx key (0 hits for KEY[0-9a-fA-F]{20}). Did NOT run the test suite or a fresh build (10.5 min, needs env).

**open_questions**

- Do the false cert gates exist in the LIVE deployed functions, or only on main? (functions-live/README.md:8-10 says live does NOT carry them - confirm per slug via a live get_edge_function.)
- Can the Telnyx-leak and missing-Stripe-secrets claims be confirmed in the live Supabase secret store? (Unverifiable from repo.)
- Is the live unauthenticated get_available_numbers leak still open, or was it closed by the 11/02 ship?
- Is the per-user (auth.uid()=user_id) RLS on core tables actually exploitable across orgs once a 2nd org exists?
- Do the existing tests pass (has anyone seen a green run)?
- Exact dist/ vs source divergence (staleness only inferred from docs).

**what_i_did_not_check**

- Ran no tests and no build (could not verify the suite is green).
- Did not query the live Supabase project (secrets, deployed function bodies, org/user counts).
- Did not diff main against functions-live byte-for-byte per slug to enumerate exactly which functions differ.
- Did not evaluate overall UX, pricing, or onboarding polish (only trust/repo/proof signals were requested).
- Did not verify the RLS policies are exploitable in practice, only read the documented schema.
- Did not assess the 199 migrations for correctness/destructive risk (covered by other lanes).

**confidence**: medium