# sr::coach-pipeline

- status: completed
- tldr: 6-function service-role auth audit complete; 3 live/VERIFIED, 3 503-gated; coach orgs server-derived

sr::coach-pipeline DONE. Audited service-role auth for 6 edge functions (research-only, cited file:line, no secrets).

DELIVERABLE (path | uses-service-role | disabled | caller-verified):
1. coach-suggest/index.ts | YES | NO (live) | VERIFIED — anon getUser :95, org from call_logs.organization_id :115-123, membership organization_users :127-135.
2. coach-decide/index.ts | YES | NO (live) | VERIFIED — anon getUser :89, org from coach_proposals.organization_id :112, membership :114-122.
3. pipeline-management/index.ts | YES | YES | N/A-DISABLED — isPipelineManagementTenantCertified(){return false} :10-12, 503 :19-24.
4. analyze-call-transcript/index.ts | YES | YES | N/A-DISABLED — gate :144-146, 503 :156-166; pre-gate service-role branch trusted body userId :197-206.
5. disposition-router/index.ts | YES | YES | N/A-DISABLED — gate :76-78, 503 :89-99.
6. automation-scheduler/index.ts | YES | NO (contained) | VERIFIED strongest — platform-credential auth (service-role bearer/cron token, constant-time), rejects user/anon JWT; tenant from dialing_queues->campaigns :63-89.

Confirmed: both coach functions derive org server-side from the DB row, never the body.

Validation: read all 6 files + scheduler-auth.ts at auth/gate regions; verified all 3 signals from cited lines. No live calls/writes; only Deno.env.get names printed.

Follow-ups: (a) coach-decide calls supabase/functions-live/disposition-router — a DIFFERENT file, not audited; is it also gated? (b) which source tree (functions vs functions-live) is deployed. (c) RLS on the cited tables not checked.

Confidence: high.

## Artifact

**Findings**

DELIVERABLE (path | uses-service-role | disabled | caller-verified | evidence)
1. coach-suggest/index.ts | YES | NO (live) | VERIFIED | env+client :82,:88; anon getUser :95; membership organization_users :127-135; org derived SERVER-SIDE from call_logs.organization_id :115-123 (body supplies only call_log_id, UUID-validated :110-111).
2. coach-decide/index.ts | YES | NO (live) | VERIFIED | env+client :76,:82; anon getUser :89; membership organization_users :114-122; org derived SERVER-SIDE from coach_proposals.organization_id :112 (body supplies only proposal_id/decision/chosen :93-98); call_log re-scoped by org :130-137.
3. pipeline-management/index.ts | YES | YES | N/A-DISABLED | isPipelineManagementTenantCertified(){return false} :10-12; 503 PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED :19-24; service-role client :28,:34. Pre-gate code used SERVICE client for getUser :43, best-effort auth (unauth -> empty data :54-65), no membership check.
4. analyze-call-transcript/index.ts | YES | YES | N/A-DISABLED | isFallbackTranscriptAnalysisTenantCertified(){return false} :144-146; 503 FALLBACK_TRANSCRIPT_ANALYSIS_NOT_TENANT_CERTIFIED :156-166; service-role client :170,:180. Pre-gate: service-role branch TRUSTS body userId (:197-206, UNVERIFIED-CLIENT-ORG); user-JWT branch getUser :209-216, no org-membership check.
5. disposition-router/index.ts | YES | YES | N/A-DISABLED | isDispositionAutomationTenantCertified(){return false} :76-78; 503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED :89-99; service-role client :103,:112. Pre-gate: accepts exact service-role token :121 else getUser on ADMIN client :124; no org binding.
6. automation-scheduler/index.ts | YES | NO (contained, not 503) | VERIFIED (strongest) | requires exact service-role bearer OR cron token, constant-time compare, rejects user/anon JWT (scheduler-auth.ts:27-52; gate :48-59); tenant derived SERVER-SIDE from dialing_queues->campaigns(user_id,organization_id) :63-83, rows without authoritative tenant rejected :85-89; launch-profile limits to pending-queue dispatch :1-8,:146-152.

CONFIRMED: coach-suggest and coach-decide BOTH derive org server-side from the row (call_logs / coach_proposals), never from the request body.
PATTERN: the 3 live/contained functions (coach-suggest, coach-decide, automation-scheduler) verify JWT with an ANON client and derive org server-side; the 3 gated ones (pipeline-management, analyze-call-transcript, disposition-router) use the SERVICE client for getUser and are disabled for exactly this organization-binding reason.

**evidence**

- coach-suggest/index.ts:82,88,95,115-123,127-135
- coach-decide/index.ts:76,82,89,104-112,114-122,130-137
- pipeline-management/index.ts:10-12,19-24,28,34,43,54-65
- analyze-call-transcript/index.ts:144-146,156-166,170,180,197-216
- disposition-router/index.ts:76-78,89-99,103,112,116-129
- automation-scheduler/index.ts:1-8,41,48-59,61,63-89,146-152
- automation-scheduler/scheduler-auth.ts:5-19,27-52
- docs/dial-smart-app-map.md:140

**validation**

Read all 6 target files plus scheduler-auth.ts in full at their auth/gate regions; verified each requested signal (service-role key read, hardcoded disable gate, caller JWT+membership vs client-supplied org) directly from cited lines. No live calls, no writes, no secrets printed (only Deno.env.get names).

**open_questions**

- coach-decide header (coach-decide/index.ts:10-11) invokes a DIFFERENT router: supabase/functions-live/disposition-router/index.ts, not the disabled supabase/functions/disposition-router audited here. Is functions-live also disabled? Not audited.
- Which source tree (functions vs functions-live) is actually deployed is not verifiable from source alone.
- Is SUPABASE_SERVICE_ROLE_KEY the value accepted as the automation-scheduler bearer, and is AUTOMATION_SCHEDULER_CRON_TOKEN configured in prod?

**what_i_did_not_check**

- supabase/functions-live/disposition-router/index.ts and other functions-live/* variants
- deployment state (which source tree is live)
- RLS policies on call_logs/coach_proposals/organization_users/dialing_queues
- coach-suggest and coach-decide bodies beyond ~line 160
- _shared/utils.ts checkRateLimit and _shared/lithos.ts
- all other edge functions

**confidence**: high