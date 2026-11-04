# ce-live-gate-inventory-crosscheck

- status: completed
- tldr: Claim CONFIRMED: 0 cert gates in any live snapshot; main has gates in 4/12 slugs; hashes MATCH x5 / MISMATCH x7

RESEARCH ONLY. Node ce-live-gate-inventory-crosscheck COMPLETE. Claim 'the 503 certification gates exist only on GitHub main, never on live' is CONFIRMED at repo level.

WHAT: (1) Swept ALL *.ts/*.md under supabase/functions-live for NOT_CERTIFIED|certified|503|launch-quarantin|quarantin -> 26 matches in 5 files; ZERO in live code. Only gate-term hits are prose in functions-live/README.md:10 and :80. The two '503' hits in live code are retry classifiers (api-gateway/_shared/utils.ts:324, outbound-calling/index.ts:50). All 'quarantine' hits are phone-number quarantine, not cert gates. (2) Per-slug NOT_CERTIFIED in main index.ts for all 12 slugs. (3) SHA256 live snapshot vs main source for all 12.

KEY RESULT (12 rows): live_has_gate = NO for all 12. main_gate_constants:
- twilio-sms-webhook none | sms-messaging none | ai-sms-processor none | disposition-router none
- outbound-calling PROVIDER_EGRESS_NOT_CERTIFIED@299, RETELL_CALL_DURATION_NOT_CERTIFIED@890, RETELL_AGENT_NOT_CERTIFIED@899/903/907/914
- telnyx-webhook TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED@189
- call-dispatcher FORCE_DISPATCH_NOT_CERTIFIED@417, TELNYX_EGRESS_NOT_CERTIFIED@1666, PROVIDER_NOT_CERTIFIED@1777
- retell-call-webhook none
- workflow-executor WORKFLOW_AUTOMATION_NOT_CERTIFIED@224, WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED@1746
- pipeline-management none | api-gateway none | stripe-webhook none

SHA256: MATCH x5 (ai-sms-processor, api-gateway, sms-messaging, stripe-webhook, twilio-sms-webhook = the 5 re-snapshotted 11/02); MISMATCH x7 (call-dispatcher, disposition-router, outbound-calling, pipeline-management, retell-call-webhook, telnyx-webhook, workflow-executor = the 7 never-redeployed). All 4 gate-bearing slugs are in the MISMATCH set, i.e. main has gate code live does not. Main's shared gate libs (_shared/retell-provider-contract.ts, _shared/call-exposure-policy.ts) are absent from the live tree entirely.

VALIDATION: agentgrep whole-directory sweeps + PowerShell Select-String authority + Get-FileHash. Two independent methods agree. Repo unmodified (nothing written inside dial-smart-system). Temp script + probe file created outside the repo and deleted (verified).

TOOL CAVEAT for other nodes: agentgrep SINGLE-FILE mode gave false negatives (0 matches for files that contain the string); whole-DIRECTORY mode is fine.

BLOCKERS/FOLLOW-UP: verification is against repo-recorded snapshots, NOT the live deployment; a live Management-API pull of the same 12 functions is still unverified. Also unverified: whether the checkout equals GitHub origin/main. Confidence: HIGH within scope.

## Artifact

**Findings**

CLAIM CONFIRMED at repo level.

(1) ZERO certification-gate code under supabase/functions-live. An authoritative case-insensitive Select-String sweep of every *.ts and *.md in the live tree found NO NOT_CERTIFIED / *_NOT_CERTIFIED token in any live CODE file. The only two _NOT_CERTIFIED hits in the whole live tree are prose in functions-live/README.md (lines 10 and 80), which merely document the claim.

(2) No 503 gate responses in live. The only two '503' occurrences in live code are retry-classifier literals (api-gateway/_shared/utils.ts:324, outbound-calling/index.ts:50). A search for an actual 503 status response ('status: 503') in functions-live returned 0 matches.

(3) Every 'quarantine' hit in live is phone-number quarantine (spam/rotation/daily-cap), not a launch certification gate.

(4) Main source carries NOT_CERTIFIED gates in exactly 4 of the 12 slugs: outbound-calling (PROVIDER_EGRESS_NOT_CERTIFIED@299, RETELL_CALL_DURATION_NOT_CERTIFIED@890, RETELL_AGENT_NOT_CERTIFIED@899/903/907/914), call-dispatcher (FORCE_DISPATCH_NOT_CERTIFIED@417, TELNYX_EGRESS_NOT_CERTIFIED@1666, PROVIDER_NOT_CERTIFIED@1777), workflow-executor (WORKFLOW_AUTOMATION_NOT_CERTIFIED@224, WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED@1746), telnyx-webhook (TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED@189). The other 8 slugs have NO NOT_CERTIFIED in main either.

(5) Main's shared gate library (_shared/retell-provider-contract.ts, _shared/call-exposure-policy.ts) has no counterpart anywhere in the live snapshot tree.

(6) SHA256: the 5 MATCH slugs are exactly the 5 functions re-snapshotted on 11/02; the 7 MISMATCH slugs are exactly the 7 the live README calls 'never redeployed'. All 4 gate-bearing slugs sit inside the MISMATCH set, i.e. main has gate code that live does not - direct evidence for the 'exists on main, never on live' half.

(7) TOOL CAVEAT: agentgrep in single-FILE mode returned 0 matches for files that demonstrably contain the string; whole-DIRECTORY mode worked. Select-String was used as the authority; other nodes relying on single-file agentgrep should be re-verified.

**evidence**

- supabase/functions-live/README.md:10 - '503 "certification gate" changes that live does NOT have'
- supabase/functions-live/README.md:80 - '(the 503 `*_NOT_CERTIFIED` gates exist only on GitHub `main`, never on live).'
- Select-String over ALL *.ts and *.md under supabase/functions-live for NOT_CERTIFIED|certified|503|launch-quarantin|quarantin: only README.md:10 and README.md:80 match on gate terms; every other hit is phone-quarantine or a retry-503 string
- regex 'status:\s*503' in supabase/functions-live -> 0 matches in 0 files
- supabase/functions-live/api-gateway/_shared/utils.ts:324 - errorMessage.includes('503') (retry classifier, NOT a gate)
- supabase/functions-live/outbound-calling/index.ts:50 - error.message?.includes('503') (retry classifier, NOT a gate)
- supabase/functions-live/api-gateway/index.ts:781,798,800,804,808,1024,1027,1031,1032,1036,1070,1074,1083,1085 - all 'quarantine' hits are phone-number quarantine_until, unrelated to certification
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1020,1052,1143,1165,1184,1194,1644,1676 - phone-number quarantine, unrelated to certification
- supabase/functions/call-dispatcher/index.ts:417 FORCE_DISPATCH_NOT_CERTIFIED; :1666 TELNYX_EGRESS_NOT_CERTIFIED; :1777 PROVIDER_NOT_CERTIFIED
- supabase/functions/outbound-calling/index.ts:299 PROVIDER_EGRESS_NOT_CERTIFIED; :890 RETELL_CALL_DURATION_NOT_CERTIFIED; :899,:903,:907,:914 RETELL_AGENT_NOT_CERTIFIED
- supabase/functions/telnyx-webhook/index.ts:189 TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED
- supabase/functions/workflow-executor/index.ts:224 WORKFLOW_AUTOMATION_NOT_CERTIFIED; :1745 action 'webhook_egress_not_certified'; :1746 WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED
- supabase/functions/_shared/retell-provider-contract.ts:93,96,99,102,105,108,111,114,120,128,147,151 - RETELL_AGENT_NOT_CERTIFIED throws (shared gate lib, absent from live tree)
- supabase/functions/_shared/call-exposure-policy.ts:12,18 - RETELL_CALL_DURATION_NOT_CERTIFIED (shared gate lib, absent from live tree)
- Get-FileHash SHA256: MATCH x5 (ai-sms-processor, api-gateway, sms-messaging, stripe-webhook, twilio-sms-webhook); MISMATCH x7 (call-dispatcher, disposition-router, outbound-calling, pipeline-management, retell-call-webhook, telnyx-webhook, workflow-executor)

**validation**

Two independent methods agree. (1) agentgrep whole-directory sweeps: functions-live for NOT_CERTIFIED|certified|503|launch-quarantin|quarantin (26 matches / 5 files), functions for NOT_CERTIFIED (73 matches / 52 files). (2) PowerShell Select-String authoritative per-file sweeps, used because agentgrep single-file mode gave false negatives. SHA256 via Get-FileHash over 12 explicit live-path vs main-path pairs. All operations read-only; the one temp script written (C:/Users/charl/dss-crosscheck-hash.ps1) and one probe file were deleted (verified). Nothing in the repo was modified.

**open_questions**

- Are the recorded snapshots in supabase/functions-live byte-identical to what is actually deployed on Supabase project emonjusymdripmkvtttc right now? This verifies the claim against the repo's recorded snapshots, not against live itself.
- Which git branch/ref is the current checkout of supabase/functions? The claim names 'GitHub main'; hashes were compared against the working tree, not origin/main.
- For the 7 MISMATCH slugs, what are the non-gate differences between main and live (beyond the NOT_CERTIFIED constants)?

**what_i_did_not_check**

- Did NOT query the live Supabase project via MCP/Management API; 'live' here means the repo's snapshots, not the deployment.
- Did NOT verify that the working-tree supabase/functions/* equals GitHub origin/main (git ref not inspected).
- Did NOT grep non-index.ts or per-slug _shared files on the main side beyond index.ts (only the two global _shared gate libs were noted).
- Did NOT enumerate the full set of non-gate differences causing the 7 SHA256 mismatches.
- Did NOT check the other ~66 functions outside the given 12 slugs for gates (whole-tree grep showed many, e.g. calendar-integration, retell-inbound-webhook - out of scope for the 12-row table).
- Did NOT inspect deployed Supabase bundle bytes directly (only repo snapshots of them).

**confidence**: high