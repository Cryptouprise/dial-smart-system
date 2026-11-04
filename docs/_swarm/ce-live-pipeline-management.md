# ce-live-pipeline-management

- status: completed
- tldr: LIVE pipeline-management: verify_jwt=true (config.toml:163), NO cert gate in LIVE (main has PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED@20), anon-key reaches handler but only gets empty data.

DONE: Verified LIVE pipeline-management (C:\Users\charl\dial-smart-system).
(a) verify_jwt: supabase/config.toml:160 [functions.pipeline-management], verify_jwt = true at :163 (comment :161-162 'Launch-quarantined until dispositions, stages, leads, and mutations are organization-bound.').
(b) Gate: LIVE supabase/functions-live/pipeline-management/pipeline-management/index.ts (150 lines) has NO gate (grep CERTIFIED/NOT_TENANT/certification = 0 hits). Main SOURCE (215 lines) HAS it: isPipelineManagementTenantCertified() :10-12, enforcement :19-24 (503), constant PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED @20 - matches LIVE-VS-MAIN-GATES.md:29. fc /b: LIVE != main.
(c) Anon reachability: verify_jwt=true validates any project JWT; the anon key IS one, so an anon-key caller REACHES the handler (no-JWT callers 401 at gateway). In-function auth is optional (:21-34); anon/non-user callers hit the early return {success:true,data:[]} at :36-47 and CANNOT mutate. A user JWT runs actions scoped ONLY by user_id (no org/tenant/role check): :53,:60,:70,:78,:87,:94,:105,:113.
Actions/side effects (LIVE cites): get_dispositions :52-54 read; get_pipeline_boards :55-65 read; get_lead_positions :66-73 read; create_disposition :74-82 INSERT; create_pipeline_board :83-91 INSERT; move_lead_to_pipeline :92-103 UPSERT lead_pipeline_positions (no leads mutation); check_dispositions_exist :104-109 read; insert_default_dispositions :110-118 bulk INSERT; default :119-120 throw. NO opportunity/stage/leads writes, NO update()/delete(). Client = service-role key (:19) bypassing RLS.

Per-function row:
| pipeline-management | PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED@20 | LIVE 150L | NO gate | 0 gate strings in LIVE; main 215L has it; verify_jwt=true config.toml:163 | 150/215 | main |

VALIDATION: full LIVE read with line numbers; grep LIVE vs main; config.toml direct read; find /c line counts; fc /b byte compare; cross-check vs LIVE-VS-MAIN-GATES.md:29.
BLOCKERS/FOLLOW-UPS: No live HTTP probe (research-only) - gateway anon semantics is THEORY (corroborated by doc line 52). Not checked: snapshot-to-deploy provenance, live RLS on dispositions/pipeline_boards/lead_pipeline_positions, main action-set full diff, other repo copies.

## Artifact

**Findings**

(a) config.toml block [functions.pipeline-management] at supabase/config.toml:160, verify_jwt = true at supabase/config.toml:163. | (b) LIVE snapshot supabase/functions-live/pipeline-management/pipeline-management/index.ts (150 lines) has NO certification gate; grep for CERTIFIED/NOT_TENANT/certification/gate/tenant returned 0 matches. Main SOURCE supabase/functions/pipeline-management/index.ts (215 lines) DOES have the gate: helper isPipelineManagementTenantCertified() at :10-12 (return false), enforcement at :19-24 returning 503 with constant PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED at :20, matching LIVE-VS-MAIN-GATES.md:29. files differ from byte 0; LIVE is the pre-gate code. | (c) Anon reachability: platform layer verify_jwt=true requires a valid project JWT; the anon key IS a valid project JWT, so an anon-key caller passes the gateway and REACHES the handler (no-JWT callers are rejected 401 at the gateway). THEORY, not probed. In-function auth (LIVE) is OPTIONAL: authHeader read :21; user=null :22; :23 skips auth when authHeader === 'Bearer '+SUPABASE_ANON_KEY; else :26-30 getUser(token) sets user. When user is null the handler returns early {success:true,data:[]} at :36-47, so an anon-key caller reaches the handler but performs NO read or write. A user JWT yields user.id and every action is scoped ONLY by user_id (no org/tenant/role check) - :53,:60,:70,:78,:87,:94,:105,:113. | (c) Actions + side effects: get_dispositions :52-54 SELECT dispositions (read); get_pipeline_boards :55-65 SELECT pipeline_boards + joins dispositions/campaigns (read); get_lead_positions :66-73 SELECT lead_pipeline_positions + leads join (read); create_disposition :74-82 INSERT dispositions (WRITE); create_pipeline_board :83-91 INSERT pipeline_boards (WRITE); move_lead_to_pipeline :92-103 UPSERT lead_pipeline_positions (WRITE, does NOT mutate leads); check_dispositions_exist :104-109 SELECT (read); insert_default_dispositions :110-118 bulk INSERT dispositions (WRITE); default :119-120 throw Invalid action. Error surface :122-125; success envelope :127-135; catch :136-147 status 500 code PIPELINE_ERROR. | (c) Scope limits: NO opportunity/stage/leads-table mutations and NO update()/delete() anywhere in the 150 LIVE lines (grep = 0 hits). Client uses the SERVICE-ROLE key (LIVE:19), bypassing RLS; authorization rests entirely on the user_id filter with no organization/tenant dimension - exactly why main gates it. CORS wide open: Access-Control-Allow-Origin '*' (LIVE:4).

**evidence**

- supabase/config.toml:160 -> [functions.pipeline-management]
- supabase/config.toml:163 -> verify_jwt = true
- supabase/config.toml:161-162 -> comment 'Launch-quarantined until dispositions, stages, leads, and mutations are organization-bound.'
- supabase/functions/pipeline-management/index.ts:10-12 -> function isPipelineManagementTenantCertified(){ return false; }
- supabase/functions/pipeline-management/index.ts:19-24 -> if(!isPipelineManagementTenantCertified()) return 503
- supabase/functions/pipeline-management/index.ts:20 -> error_code 'PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED'
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:29 -> pipeline-management: PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED@20
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:9-11 -> gates committed 2026-07-13 (a8393da5); live deployed 2026-07-01, pre-gate
- supabase/functions-live/pipeline-management/pipeline-management/index.ts:21-34 -> optional in-function auth
- supabase/functions-live/pipeline-management/pipeline-management/index.ts:36-47 -> early return {success:true,data:[]} when no user
- supabase/functions-live/pipeline-management/pipeline-management/index.ts:74-118 -> write actions
- findstr on LIVE index.ts for CERTIFIED|NOT_TENANT|certification|gate|tenant -> 0 matches (exit 1)
- fc /b LIVE vs main -> differ from byte 0; LIVE=150 lines, main=215 lines

**validation**

Read the LIVE 150-line file end to end with line numbers; grep for gate/tenant strings in LIVE returned zero matches while the same grep on main returned the gate at :10/:19/:20; config.toml block and verify_jwt line read directly; line counts via find /c /v; fc /b byte comparison confirmed LIVE!=main; cross-checked gate name and line against docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:29.

**open_questions**

- Was the deployed live pipeline-management built from this 150-line snapshot? Snapshot provenance/commit not established in this node.
- Do dispositions/pipeline_boards/lead_pipeline_positions have per-user RLS, given the function uses the service-role key and relies solely on user_id filtering?
- Which callers (workflow-executor, disposition-router, ai-assistant) invoke pipeline-management server-side with a user JWT, and would un-gating be required for those flows?

**what_i_did_not_check**

- No live HTTP probe performed (research-only, repo-only). The gateway claim that an anon key passes verify_jwt and reaches the handler is from Supabase platform semantics plus the corroborating pattern in LIVE-VS-MAIN-GATES.md:52, not observed on this function.
- Did not scan the whole repo for other/duplicate copies of pipeline-management beyond the two paths given.
- Did not read main lines 41-215 to diff the full action set or confirm main's action list matches LIVE.
- Did not inspect live RLS policies on the three tables or the anon REST surface for those tables directly.

**confidence**: high