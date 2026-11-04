# dw-status-activate

- status: completed
- tldr: One live path activates a campaign: api-gateway POST /v1/campaigns/:id/launch (campaigns:write + owner); UI is fully locked; canary path never writes.

dw-status-activate DONE. Question: is there any path (UI or server) that promotes a draft campaign to active today, and what does it require?

ANSWER: Yes, exactly one. `POST /v1/campaigns/:id/launch` on the external REST api-gateway (supabase/functions-live/api-gateway/index.ts:188) -> setCampaignStatus (same file:361-369), needs only an API key with `campaigns:write` and campaign user_id ownership. Exposed as MCP tool `dialsmart_launch_campaign` (mcp-server/src/tools/campaigns.ts:32-41). No consent/DNC/balance/global-stop promotion engine exists. Only extra constraint: live-only trigger trg_guard_campaign_has_agent (docs/wholesale/audit/phase1/live_only/20260828014640_campaign_launch_guard.sql:2-22) requires an assigned agent. Same function can also CREATE an active campaign via body.status (index.ts:387).

NO UI path: every browser writer is launch-locked (src/lib/launchSafety.ts:115-119 allows 'paused' only; src/hooks/usePredictiveDialing.ts:521-529; src/components/CampaignManager.tsx:499-518; CampaignLauncher.tsx:231-247; QuickTestCampaign.tsx:162-179). Repo test enforces this but scans src only (scripts/validate-campaign-bundle.test.mjs:589-602).

NO SQL/RPC/trigger writer. ai-assistant's ungated update_campaign (supabase/functions/ai-assistant/index.ts:900-917) is dead behind a 503 at :2891-2901. The canary path is read-only and never touches Supabase (campaigns/solar-exit/reference/CANARY-PROMOTION-ENGINE.md:3,26,28).

MATERIAL SIDE-FINDING: the EXTERNAL_API_NOT_CERTIFIED gate that LIVE-VS-MAIN-GATES.md:21 attributes to api-gateway@149 is absent from both api-gateway copies on disk, while 73 sibling functions keep their gates.

## Artifact

**Findings**

ANSWER: YES -- exactly one reachable path promotes a draft campaign to 'active' today, and it is a server-side REST/MCP route, not the UI.

(1) THE ONE PATH. `POST /v1/campaigns/:id/launch` on the external REST api-gateway (also exposed as the MCP tool `dialsmart_launch_campaign`). It requires only: (a) a valid API key (dsk_live_...) carrying the `campaigns:write` scope, and (b) the campaign to belong to that key's user_id. It performs a bare `update({status:'active'})`. There is NO consent / DNC / jurisdiction / provider-version / balance / global-stop promotion engine behind it. The only additional constraint is a live-only Postgres trigger that requires an agent_id or telnyx_assistant_id to be set when status becomes 'active'. The 'audited server-side promotion' the UI promises (src/lib/launchSafety.ts:15-16) does not exist in this repository.

(2) NO UI PATH. Every browser writer is launch-locked: browserCampaignStatusMutationAllowed allows only 'paused' (src/lib/launchSafety.ts:115-119); usePredictiveDialing.updateCampaign blocks non-paused status (src/hooks/usePredictiveDialing.ts:521-529); CampaignManager.handleStatusChange hard-locks 'active' (src/components/CampaignManager.tsx:499-518); CampaignLauncher.launchCampaign (src/components/CampaignLauncher.tsx:231-247) and QuickTestCampaign.activateCampaignAndDispatch (src/components/QuickTestCampaign.tsx:162-179) only show lock toasts; AutonomousAgentDashboard sets 'paused' only (src/components/AutonomousAgentDashboard.tsx:674). A repo test enforces this, but scans src only (scripts/validate-campaign-bundle.test.mjs:589-602).

(3) NO SQL/RPC/TRIGGER WRITER. Nothing in supabase/ or certification/ sets campaigns.status='active'. The only SQL referencing campaign status plus 'active' are readers/decisions: supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:251 and supabase/migrations/20260713150000_campaign_contact_release_gate.sql:266 (the release gate is downstream of activation, not a gate on it).

(4) SECOND SERVER WRITER THAT IS DEAD. supabase/functions/ai-assistant/index.ts:900-917 update_campaign copies args.status verbatim with no allowlist, but the whole function 503s before auth at :2891-2901 (AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED). It is not deployed in functions-live/ at all.

(5) THE CANARY PATH IS NOT A WRITER. campaigns/solar-exit/reference/CANARY-PROMOTION-ENGINE.md:3,26,28 -- read-only, stdout-only, never touches Supabase/Retell/GHL/a lead, authorization_scope 'evidence_chain_only', launch_authorized false. A 'promote'/'normal' verdict is evidence for an external trust root; nothing in the repo consumes it to flip campaigns.status.

(6) MATERIAL DISCREPANCY. docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:21 attributes an api-gateway gate (EXTERNAL_API_NOT_CERTIFIED@149, 503s every request before routing) to main. That gate string is absent from both api-gateway copies on this working tree and from api-gateway/_shared, while 73 other *_NOT_CERTIFIED markers exist under supabase/functions/. So on this checkout the launch route is unguarded in both the main/containment profile and the live snapshot, and LIVE-VS-MAIN-GATES.md:53 independently confirms live api-gateway (v35) has no gate and answers /v1/health with HTTP 200.

SECOND INSERT-SIDE PATH (same function): api-gateway createCampaign (supabase/functions-live/api-gateway/index.ts:383-399) sets `status: body.status ?? "draft"`, i.e. POST /v1/campaigns can also CREATE an already-active campaign if the caller passes status:'active'. It too is guarded only by the same DB trigger.

**evidence**

- supabase/functions-live/api-gateway/index.ts:183 route regex contains launch|pause|validate|... ; :188 `if (action === "launch" && method === "POST") return setCampaignStatus(rc, id, "active");`
- supabase/functions-live/api-gateway/index.ts:361-369 setCampaignStatus(rc, id, status): requireScope(rc.ctx, "campaigns:write") then rc.supabase.from("campaigns").update({ status }).eq("user_id", rc.ctx.userId).eq("id", id).select(CAMPAIGN_FIELDS) -- no launch gate, no consent/DNC/balance/global-stop check
- supabase/functions/api-gateway/index.ts:188 and :361 identical unguarded launch route + writer (containment-profile duplicate of the same file)
- mcp-server/src/tools/campaigns.ts:32-41 dialsmart_launch_campaign -> c.post('/v1/campaigns/${args.id}/launch'), description: 'Launch (activate) a campaign by setting its status to active. The dispatcher will start placing calls on its next tick.'
- docs/wholesale/audit/phase1/live_only/20260828014640_campaign_launch_guard.sql:2-22 guard_campaign_has_agent() + 'CREATE TRIGGER trg_guard_campaign_has_agent BEFORE INSERT OR UPDATE ON public.campaigns' (live-only pull, never committed to the repo tree) -- raises only when NEW.status='active' AND agent_id/telnyx_assistant_id are both null
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:266 `AND campaign.status = 'active'` inside evaluate_campaign_contact_release() -- the release gate consumes activation, it does not gate it
- src/lib/launchSafety.ts:115-119 browserCampaignStatusMutationAllowed(status) returns status === 'paused'; :15-16 CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE promises 'an audited server-side promotion proves consent, DNC, jurisdiction, provider version, balance, and global-stop readiness'
- src/hooks/usePredictiveDialing.ts:521-529 updateCampaign returns null + lock toast whenever updates.status is not 'paused'; :550-553 adds .in('status',['draft','paused']) to config edits
- src/components/CampaignManager.tsx:495-532 handleStatusChange: newStatus==='active' runs readiness then hard-locks and returns (:499-518), other statuses go through browserCampaignStatusMutationAllowed (:520-527)
- src/components/CampaignLauncher.tsx:231-247 launchCampaign: lock toast only, no write
- src/components/QuickTestCampaign.tsx:162-179 activateCampaignAndDispatch: lock toast only; :262-269 button labelled 'Activation Locked'
- src/components/AutonomousAgentDashboard.tsx:674 `await supabase.from('campaigns').update({ status: 'paused' })` (pause only); :691-692 activation lock toast
- src/hooks/useCampaignCompliance.ts:214 autoPauseCampaign and src/hooks/useProactiveHealthMonitor.ts:229 -- the only two other campaign status writers in src, both 'paused'
- scripts/validate-campaign-bundle.test.mjs:589-602 test 'frontend has no direct browser write that activates a campaign': walks only src/**/*.{ts,tsx} with regex /\.from\(\s*['\"]campaigns['\"]\s*\)[\s\S]{0,240}?\.update\(\s*\{\s*status:\s*['\"]active['\"]/ and asserts zero offenders -- does NOT scan supabase/
- supabase/functions/ai-assistant/index.ts:900-917 update_campaign copies args.status verbatim into updates.status (no allowlist, would accept 'active'), but :2891-2901 returns 503 AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED before auth; function absent from functions-live/
- campaigns/solar-exit/reference/CANARY-PROMOTION-ENGINE.md:3 read-only decision engine, never touches Retell/GHL/Supabase/lead, authorization_scope 'evidence_chain_only', contact_authorized false, launch_authorized false, external_trust_required true; :26 templates print to stdout only, CLI has no file-writing option; :28 template generation never authorizes contact and never touches Supabase
- package.json:42-43 campaign:solar-exit:canary and campaign:solar-exit:canary-template -> scripts/evaluate-solar-exit-canary.mjs (exit 0 promote/normal, 2 hold, 1 unreadable)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:21 api-gateway main gate EXTERNAL_API_NOT_CERTIFIED@149 (every request, before routing, 503); :53 live api-gateway is v35 and has NO gate, GET /v1/health returned HTTP 200 {"ok":true,"version":"0.2.0"}
- repo-wide grep EXTERNAL_API_NOT_CERTIFIED: 0 hits in supabase/ source (both functions/ and functions-live/ api-gateway lack it; api-gateway/_shared has no gate); hits only in docs/wholesale/PLAN.md:56, docs/wholesale/audit/out/02-api.md:86, LIVE-VS-MAIN-GATES.md:21,53, docs/wholesale/phases/staging/api-gateway/REVIEW.md:18, scripts/lib/contact-egress-surface-audit.mjs:167,171
- grep _NOT_CERTIFIED over supabase/: 73 hits in 52 files -- every other containment-profile function carries a gate, api-gateway does not
- supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:251 dialing-queue trigger refuses rows when campaign.status <> 'active' (reader, not writer)
- grep `from(campaigns)` + `.update` over supabase/: exactly 3 sites -- functions-live/api-gateway/index.ts:363, functions/api-gateway/index.ts:363, functions/ai-assistant/index.ts:908 -- all enumerated and read
- grep `campaign.*status.*active` over supabase/**/*.sql and certification/**/*.sql: only the dialing-queue reader (:251) and the release gate (:266); certification/recovery-lineage-v4..v24 assert status='active' only as precondition/baseline, nothing promotes
- all four .deployed-*.ts frozen live snapshots contain 68 `campaigns` references, all reads (.eq('campaigns.status','active'), .select(...).in('id', ...)), zero campaign status updates
- DEPLOYMENT_AUDIT.md:24 lists api-gateway (v34) among functions confirmed live and ACTIVE in project emonjusymdripmkvtttc

**validation**

Method: static read/grep of the working tree C:/Users/charl/dial-smart-system (branch refs/heads/main per .git/HEAD). Searches executed: (a) regex from\(['\"]campaigns['\"]\) over src -> 48 hits/29 files, filtered to .update(; (b) `.update({ status` over src -> 12 hits/9 files, every one read; (c) `.from(campaigns).update` over supabase/ -> 3 hits, all read at line level; (d) setCampaignStatus|launchCampaign|activateCampaign repo-wide -> 10 hits/4 files, all read; (e) _NOT_CERTIFIED over supabase/ -> 73 hits/52 files; (f) NOT_CERTIFIED|certified|503 scoped to both api-gateway folders -> only _shared/utils.ts circuit-breaker text, no gate; (g) `ON public.campaigns` and campaign.*status.*active over **/*.sql; (h) canary doc + evaluate-solar-exit-canary references + package.json scripts; (i) `campaigns` in all four .deployed-*.ts snapshots -> 68 hits, all reads; (j) EXTERNAL_API_NOT_CERTIFIED repo-wide. Every writer candidate was opened and read at line level. NOT validated by execution: no test suite run, no live/anon HTTP probe issued, live DB trigger inventory taken from the committed live-only pull rather than queried.

**open_questions**

- Is functions-live/api-gateway the deployed artifact, or supabase/functions/api-gateway? Both carry an identical unguarded launch route so the answer to 'is there a path' is unchanged, but deployment identity is unresolved from the repo alone.
- DEPLOYMENT_AUDIT.md:24 says api-gateway live v34; LIVE-VS-MAIN-GATES.md:53 says v35 and ungated. Is the curated functions-live/ snapshot current as of 2026-11-03 or has live drifted since the 2026-07-01 mass deploy?
- Does any API key currently carry campaigns:write? If none exist, the path is latent rather than hot. Key inventory is in the api_keys table, not the repo.
- Why does api-gateway on disk lack the EXTERNAL_API_NOT_CERTIFIED gate that LIVE-VS-MAIN-GATES.md:21 attributes to main@149 while 73 sibling functions keep theirs -- local-main vs wholesale divergence, or dropped during the staging ownership-guard rewrite (docs/wholesale/phases/staging/api-gateway/REVIEW.md:18 treats the gate as something to preserve)?

**what_i_did_not_check**

- Live Supabase (project emonjusymdripmkvtttc) was NOT queried: I did not confirm that guard_campaign_has_agent is still installed on public.campaigns or that it is the only trigger on that table.
- I did not fetch deployed edge-function bodies via get_edge_function; the 'live api-gateway is ungated' conclusion rests on the functions-live/ snapshot plus LIVE-VS-MAIN-GATES.md, not a fresh pull.
- I did not inventory prod. Nine live-only functions absent from the repo (LIVE-VS-MAIN-GATES.md:45: configure-sip-trunk, debug-twilio-call, gemini-video, patch-grace-once, retell-credentials-check, test-sip-call, twilio-outbound-call, twilio-termination-proxy, twilio-trust-hub) were not inspected for a campaign-activation writer.
- I did not inspect the `wholesale` branch or GitHub origin/main (git remote/branch commands timed out in this environment); findings are scoped to the checked-out tree only, and wholesale may carry a gated api-gateway.
- I did not read the RLS UPDATE policies on public.campaigns. If a signed-in user's own-campaign UPDATE policy permits it, a direct PostgREST PATCH status='active' would be a second activation path independent of api-gateway.
- I did not verify whether scripts/lib/contact-egress-surface-audit.mjs (which references EXTERNAL_API_NOT_CERTIFIED at :167,:171) currently passes or flags the ungated api-gateway.
- I did not trace any external consumer of the canary 'promote'/'normal' decision, so an out-of-repo actor turning a promote verdict into an activation cannot be ruled out.
- Staging/doc mirror copies (docs/wholesale/phases/staging/**, docs/wholesale/audit/out/**) were not independently grepped for activation writers; they are not deployed code paths.
- I did not verify whether the api_keys table's campaigns:write scope is actually enforced per-key (requireScope reads rc.ctx.scopes, but I did not read _shared/api-auth.ts scope loading).

**confidence**: high