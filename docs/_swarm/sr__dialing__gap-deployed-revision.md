# sr::dialing::gap-deployed-revision

- status: completed
- tldr: Working tree dirty but the 11 audited functions are clean == HEAD 617094a0; gates born false 2026-07-13, never toggled; no deploy pipeline, deployed-state UNVERIFIED.

DONE: git forensics on C:/Users/charl/dial-smart-system for the 'is deployed == audited?' gap. TOUCHED: none (read-only). EVIDENCE: see node artifact. RESULT: (a) working tree DIRTY (6 modified + hundreds untracked) but git status on all 11 audited function paths is EMPTY -> those 11 are tracked and clean == HEAD 617094a0, so the audit matches HEAD; nothing uncommitted touches the 11. Only docs/scripts_ship/mcp-gateway are dirty. (b) 'isXCertified' is report shorthand (0 hits in source); the real call-dispatcher gates at index.ts:15-25 were born 'return false' in a8393da5 (2026-07-13 23:41:48 -0600) and -G/-L show they were NEVER toggled true; the ~51-function rollout is 6d8c7989 (2026-07-13 16:28). (c) NO in-repo deploy pipeline (grep 'functions deploy' in .github/workflows = 0); only artifacts are untracked April-2026 captures (.deployed-call-dispatcher-v609.ts etc., mtime 4/16-4/17) whose blobs map to April commits and which contain ZERO gates. Deployment cannot be linked from the repo, so working copy = audit baseline and deployed-state = UNVERIFIED. CONFIDENCE: medium (high for a/b; c unverifiable from repo).

## Artifact

**Findings**

REPO/BASELINE: C:/Users/charl/dial-smart-system is a git repo; HEAD=main=617094a042e743670d3558141e4e399b97b04c90 (2026-11-03 11:59:42 -0700, 'docs: Dial Smart capability review - verdict, digest, swarm evidence, visual report'). Branches: main 617094a0, pr-49 d082833a (2026-01-13), wholesale 44e8faa5 (2026-11-02). || (a) WORKING TREE IS DIRTY: 6 modified tracked files (docs/_swarm/ALL-REPORTS.md, docs/dial-smart-review-report.html, docs/dial-smart-review-report.png, scripts/ship/_host_routes.py, scripts/ship/_q_d2d_verify.sql, supabase/functions/mcp/index.ts) plus hundreds untracked. NONE of the six is one of the 11 audited functions. git status --porcelain on the 11 audited paths (call-dispatcher, voice-token, voice-broadcast-tts, voice-broadcast-engine, voice-broadcast-queue, voice-call, voice-call-action, voice-call-events, demo-call, predictive-dialing-engine, outbound-calling index.ts) is EMPTY -> all tracked and clean == HEAD, so the working-copy audit DOES match committed HEAD 617094a0 for those 11. || (b) 'isXCertified' is swarm-report shorthand: the literal string is absent from source (git log -S isXCertified -- supabase/functions = 0). call-dispatcher's three gates (isForceDispatchCertified, isCallbackAutomationCertified, isAutomaticRetellNumberSyncCertified) at index.ts:15-25 were introduced by a8393da5 (2026-07-13 23:41:48 -0600, Cryptouprise) as 'return false' from birth; git log -G Certified -- call-dispatcher/index.ts returns ONLY a8393da5 and git log -L per gate shows a single introduction commit. NO history of toggling true/false - gates never enabled. Bulk gate rollout across ~51 edge functions is 6d8c7989 (2026-07-13 16:28:03 -0600, same author, 247-file commit); precursor 4b180532 (2026-07-12). || (c) NO in-repo deployment pipeline pins the deployed commit: .github/workflows holds only CI/tests; grep 'functions deploy' = 0; 'supabase' appears only as path filters/test targets. The ONLY deployment artifacts are 4 untracked root files .deployed-call-dispatcher-v602.ts/-v609.ts and .deployed-retell-call-webhook-v448.ts/-v449.ts, mtimes 2026-04-16/17 (April), whose blobs map to April commits (f32a1330 2026-04-20, fe1e009e 2026-04-17, 9e678c54/fad3cd6e/64bfe0cd 2026-04-16). Those snapshots contain ZERO 'Certified' matches - they PREDATE the 2026-07 gates that the working copy has; v609 differs from working copy by 627 insertions/340 deletions. CONCLUSION: working copy (HEAD 617094a0) is the audit baseline; the currently-deployed revision is UNVERIFIED from the repo.

**evidence**

- git rev-parse HEAD -> 617094a042e743670d3558141e4e399b97b04c90; HEAD->main, origin/main
- git status --porcelain -> 6 modified + many untracked; ' M supabase/functions/mcp/index.ts'; '?? docs/_swarm/*.md'; '?? .deployed-*.ts'
- git status --porcelain -- <11 audited function paths> -> EMPTY
- supabase/functions/call-dispatcher/index.ts:15-25 -> isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified all 'return false'
- git log -G Certified -- supabase/functions/call-dispatcher/index.ts -> only a8393da5 (2026-07-13 23:41:48 -0600)
- git log -L :isForceDispatchCertified:supabase/functions/call-dispatcher/index.ts -> single commit a8393da5 adding 'return false'
- git log -S isXCertified -- supabase/functions -> empty
- 6d8c7989 (2026-07-13 16:28:03 -0600) --stat -> ~51 function index.ts files + supabase/config.toml + .github/workflows/test.yml
- .deployed-call-dispatcher-v609.ts -> grep Certified = 0; mtime 4/17/2026; blob 10814ea7 in commits f32a1330 (2026-04-20)/fe1e009e (2026-04-17)
- .github/workflows -> grep 'functions deploy' = 0; 'supabase' only in path filters/tests

**validation**

Ran git status (clean vs dirty), porcelain on the 11 specific paths, HEAD/branch check, git log -L per gate, git log -G/-S per symbol, git hash-object + git log --find-object to place deployed snapshots in history, and Windows mtimes. Cross-checked the audit's '108 Certified / 51 files' claim via agentgrep (confirmed 108 matches / 51 files).

**open_questions**

- Which commit is live in the Supabase project today? Needs a live read of deployed function version/updated_at or the Lovable deploy log (not done - RESEARCH ONLY, no live calls).
- Was the April 2026 deploy snapshot ever superseded, i.e. is the gate-bearing HEAD actually deployed?

**edge_cases_considered**

- Branches pr-49 (d082833a, 2026-01-13) and wholesale (44e8faa5, 2026-11-02) could be the deployed line; neither matches the April deploy snapshots and no branch marker exists, so main/HEAD 617094a0 is treated as the audited baseline.
- The audit's shorthand name 'isXCertified' does not exist in source (git -S = 0); mapped to the concrete per-function gates.
- A dirty tree could still be 'the audit' if the audit read the working copy rather than HEAD; verified that for the 11 functions working copy == HEAD anyway.

**what_i_did_not_check**

- No live check of Supabase or Lovable, so the actual deployed revision cannot be pinned (repo has no marker).
- Did not run git log -L on all 108 gates across 51 functions - only the 3 call-dispatcher gates plus global -S/-G.
- Did not resolve why 6d8c7989 also matches -S isForceDispatchCertified (likely a different file/test, not the dispatcher gate).
- Did not line-by-line the other 10 functions' gate histories (their reports say most have no gate; voice-token confirmed no 'Certified' in first 50 lines).
- Did not check out-of-repo deploy configs (Lovable/Netlify/Vercel) for a pinned commit.

**confidence**: medium