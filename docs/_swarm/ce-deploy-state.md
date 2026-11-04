# ce-deploy-state

- status: completed
- tldr: api-gateway is LIVE. 'Launch-quarantined' = source 503 gate + config comment, enforced only by a manual script not in CI (which fails on this tree).

ce-deploy-state CLOSED (confidence: high). api-gateway IS deployed and LIVE, NOT blocked. 'Launch-quarantined' is a source-profile convention (503 gate code + config.toml comment), not a config switch; its only enforcer is the manual script certify-contact-egress-surfaces, which is NOT in CI and currently FAILS on this worktree because the tree holds the ungated live version. Details: config.toml:441-444 = [functions.api-gateway] + comment + verify_jwt=false (comment is descriptive only). Real gate = source code isExternalApiGatewayCertified()/EXTERNAL_API_NOT_CERTIFIED 503 (LIVE-VS-MAIN-GATES.md:21,53). Manifest scripts/lib/contact-egress-surface-audit.mjs:161-174 + scripts/certify-contact-egress-surfaces.mjs. Live-version docs: README.md:32/53 (v35->v39), SHIP-RUNBOOK.md:36 (v40), HANDOFF:122 (v39). functions vs functions-live: live is read-only snapshot of deployed; api-gateway byte-identical (MD5s match).

## Artifact

**Findings**

a) api-gateway is DEPLOYED and LIVE, not blocked. Evidence: supabase/functions-live/README.md:32 'api-gateway | OK (Management API) | functions/api-gateway/index.ts: 1267 ... | v35 | verify_jwt=false' and :53 re-snapshot row 'api-gateway | v39 | ... 1393/130/431'; docs/wholesale/SHIP-RUNBOOK.md:36 'api-gateway ... DEPLOYED 11/02, now live v40'; docs/wholesale/HANDOFF-2026-11-02.md:122 'DEPLOYED 11/02, live v39 (was v35), verify_jwt=false'; docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:53 live v35, 'Live has gate? NO', GET /v1/health -> HTTP 200; DEPLOYMENT_AUDIT.md:24 'api-gateway (v34) ... REST/MCP + billing' live.  ENFORCEMENT: 'Launch-quarantined' is a COMMENT-LEVEL convention, not a config-enforced switch. supabase/config.toml:441-444 is [functions.api-gateway] + two comment lines ('Launch-quarantined before database/provider access. The legacy dsk_live_ control plane can bypass certified queue lifecycle and retry contracts.') + verify_jwt = false. The comment is descriptive only; config.toml enforces nothing (and verify_jwt=false actually lowers JWT protection). ~60 other config.toml lines carry the same 'Launch-quarantined' label. The REAL mechanism is (1) a hard-coded 503 gate in the function source: isExternalApiGatewayCertified(): boolean { return false } returning EXTERNAL_API_NOT_CERTIFIED before routing (LIVE-VS-MAIN-GATES.md:21 '@149 every request, before routing, 503'; docs/wholesale/audit/out/02-api.md:86 'index.ts:64-66 isCertified() returns false ... index.ts:145-156 returns 503 EXTERNAL_API_NOT_CERTIFIED before auth'); plus (2) a source-topology manifest script scripts/lib/contact-egress-surface-audit.mjs:161-174 registering surface id 'external_api_control_plane', file supabase/functions/api-gateway/index.ts, state 'hard_disabled', required markers ['function isExternalApiGatewayCertified(): boolean {','EXTERNAL_API_NOT_CERTIFIED'], mustPrecede EXTERNAL_API_NOT_CERTIFIED before 'const supabase = createClient'. Wrapper scripts/certify-contact-egress-surfaces.mjs:6 calls assertContactEgressSurfaces (lib:252-256 throws on missing markers); npm script certify:contact-egress-surfaces is part of certify:static.  CRUCIAL: the manifest is NOT wired into CI. .github/workflows/test.yml (name 'Certification gates') runs only certify:database-recovery:test (@39), certify:mcp (@41) and certify-fresh-database.test.mjs (@174); grep of .github/workflows/*.yml for certify|egress returns only those. So the quarantine is enforced by a MANUAL, opt-in script, not automatically.  DECISIVE: running the manifest against the current worktree FAILS - `Set-Location C:/Users/charl/dial-smart-system; node scripts/certify-contact-egress-surfaces.mjs` -> exit 1 with 'external_api_control_plane: missing required safety marker: function isExternalApiGatewayCertified(): boolean {', 'missing required safety marker: EXTERNAL_API_NOT_CERTIFIED', and 'containment marker must appear before the legacy call action'. Independently agentgrep on supabase/functions/api-gateway/index.ts for regex CERTIFIED returns 0 matches. So the checked-out api-gateway is the UNGATED live version and does not satisfy its own quarantine manifest.  b) functions vs functions-live: functions-live is the read-only SNAPSHOT of deployed code; supabase/functions is the editable source of truth. supabase/functions-live/README.md:1-10 'LIVE deployed edge function snapshots ... read-only snapshots of the code actually deployed ... Do not edit files here; edit supabase/functions/<slug>/ and re-snapshot after deploys.' For api-gateway the two trees are BYTE-IDENTICAL: MD5 index.ts=021a1b4f9b28b2ca8b53e0a836a06c56 (both), _shared/api-auth.ts=1edc68f4c96b3c519cf27d492da751f3 (both), _shared/utils.ts=67ccf8adeb5dc8c037fa16c22e1ec150 (both); both 1393 lines. REVIEW.md:15-20 confirms the shipped source came from the live snapshot, not main's gated copy.  c) Docs asserting api-gateway NOT deployed/disabled are only HISTORICAL or about MAIN's gated copy, never about live: CLAUDE.md:2727 'Not deployed. Both migrations still pending ... The api-gateway function needs redeployment' (April 2026; DEPLOYMENT_AUDIT.md:6,27 calls CLAUDE.md NOT-DEPLOYED markers 'stale and misleading'); docs/wholesale/PLAN.md:52-59 'GitHub main's edge functions ... contain certification gates that return 503: ... api-gateway -> EXTERNAL_API_NOT_CERTIFIED / API_SMS_TENANT_SCHEMA_NOT_CERTIFIED ... Deploying any function from main as-is would switch off texting and the API'; docs/wholesale/phases/staging/api-gateway/REVIEW.md:143 'Main's gated copy ... must never be deployed (503 gates)'; LIVE-VS-MAIN-GATES.md:64 'api-gateway | Entire external API and the dialsmart MCP server ... return 503 for every request' (only if main were deployed). No doc says the LIVE api-gateway is disabled; all say it is live and serving.

**evidence**

- supabase/functions-live/README.md:32 (api-gateway live v35 verify_jwt=false), :53 (v39 re-snapshot, 1393 lines), :1-10 (snapshots are read-only copies of deployed code)
- supabase/config.toml:441-444 ([functions.api-gateway] + 'Launch-quarantined before database/provider access...' + verify_jwt=false); ~60 other 'Launch-quarantined' comment lines (findstr output)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:21,53,64,77 (api-gateway gates live on main only; live has NO gate; health 200)
- docs/wholesale/audit/out/02-api.md:86 (gated main build: isCertified() false at index.ts:64-66, 503 at index.ts:145-156)
- scripts/lib/contact-egress-surface-audit.mjs:161-174 (external_api_control_plane hard_disabled manifest entry), :206-256 (audit/assert logic)
- scripts/certify-contact-egress-surfaces.mjs:1-11 (CLI wrapper)
- package.json scripts: certify:contact-egress-surfaces = node scripts/certify-contact-egress-surfaces.mjs; certify:static includes it
- .github/workflows/test.yml:39,41,174 (CI runs certify:database-recovery:test + certify:mcp only; no egress audit)
- RUN: node scripts/certify-contact-egress-surfaces.mjs (cwd repo root) -> EXIT=1 with 3 external_api_control_plane failures
- agentgrep supabase/functions/api-gateway/index.ts regex 'CERTIFIED' -> 0 matches
- MD5s (certutil) functions vs functions-live api-gateway: 021a1b4f9b28b2ca8b53e0a836a06c56 / 1edc68f4c96b3c519cf27d492da751f3 / 67ccf8adeb5dc8c037fa16c22e1ec150 (identical in both)
- docs/wholesale/SHIP-RUNBOOK.md:36 (live v40), docs/wholesale/HANDOFF-2026-11-02.md:122 (DEPLOYED 11/02 v39), DEPLOYMENT_AUDIT.md:24 (v34 live), CLAUDE.md:2727 (stale 'Not deployed')
- docs/wholesale/phases/staging/api-gateway/REVIEW.md:6,15-20,143 (built on LIVE v35, shipped v39; 'Main's gated copy ... must never be deployed (503 gates)')

**validation**

Read-only. Sources: git-tracked files via read/agentgrep/certutil MD5. Executed only the read-only audit script scripts/certify-contact-egress-surfaces.mjs (fs reads + prints). No writes, no network, no deploys, no DB access.

**open_questions**

- Exact live version right now (v39 vs v40 vs later) was not re-confirmed against the Supabase API (research-only, no live calls); repo docs dated 10/29-11/02 disagree.
- Whether the gate code still exists in any committed revision vs only in docs; the git binary hangs in this environment so `git show a8393da5:supabase/functions/api-gateway/index.ts` was not run.
- Whether the worktree is dirty relative to HEAD (HEAD = refs/heads/main 846665ed; refs/heads/wholesale 44e8faa5; files match wholesale/live).

**edge_cases_considered**

- config.toml comments could be mistaken for an enforcement switch; verified they are inert (only the verify_jwt value matters, and it is false).
- The manifest script exists and is in package.json but is NOT in CI, so 'enforced' is manual, not automated.
- The manifest read path is cwd-dependent (process.cwd()); run outside the repo it ENOENTs, from repo root it gives the real verdict.
- The word 'quarantine' also appears as unrelated DB/domain concepts (phone_numbers.quarantine_until in api-gateway runtime code, number_quarantine disposition, DB credential-quarantine migrations) - these are NOT the launch quarantine.

**what_i_did_not_check**

- Live Supabase API (no list_edge_functions / get_edge_function call; version state taken from repo docs only).
- git status/diff (git binary timed out repeatedly; branch state read from .git/HEAD + .git/refs/heads/* instead).
- The other ~73 gated functions individually; relied on LIVE-VS-MAIN-GATES.md inventory.
- Whether certify:static or certify:contact-egress-surfaces runs anywhere outside test.yml (pre-commit hooks, external cron).
- supabase/functions/_shared vs functions-live/_shared equality beyond api-gateway's two files.

**confidence**: high