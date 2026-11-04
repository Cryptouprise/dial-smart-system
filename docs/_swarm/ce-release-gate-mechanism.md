# ce-release-gate-mechanism

- status: completed
- tldr: Release gate = DB table campaign_contact_releases, enforced at runtime in outbound-calling (not api-gateway/dispatcher). Manifest flags are CI-only, not runtime.

ce-release-gate-mechanism resolved. Runtime launch gate = public.campaign_contact_releases + single evaluator public.evaluate_campaign_contact_release() (supabase/migrations/20260713150000_campaign_contact_release_gate.sql:6-42,187-314,316-326). It is enforced at RUNTIME by the outbound-calling edge function (index.ts:25,792-819,926-943, invoked at 1269/1306/1808 before the Retell create-phone-call at 1811) - application-layer, service_role-only, default-deny, NOT a DB trigger/RLS on campaigns or dispatch. api-gateway (index.ts:485-502) and call-dispatcher (index.ts:1955-1961) both egress through outbound-calling, so they inherit the gate. KEY CAVEAT: the gate only runs when campaignId is set (index.ts:794,926) - api-gateway passes campaignId: body.campaign_id ?? null, so an unscoped POST /v1/calls skips the gate; call-dispatcher always sets campaign_id, so dispatcher dispatch IS gated and fails closed without an active matching release+cohort. The manifest flags production_launch_allowed/global_stop_required/global_stop_drill_certificate (campaigns/*/manifest.json) are NOT read at runtime - no runtime importer exists; enforced only by offline CLI/CI validators (scripts/lib/solar-exit-bundle.mjs:639, scripts/lib/pilot-portfolio.mjs:83, npm campaign:solar-exit:launch-gate). Verdict on the manifest: DOCUMENTATION/CI-ONLY, advisory at runtime. The DB release table is the real runtime lock.

## Artifact

**Findings**

(a) The runtime launch gate is DB-owned and lives in table public.campaign_contact_releases (+ public.campaign_contact_release_members), evaluated ONLY by public.evaluate_campaign_contact_release(...). Migration: supabase/migrations/20260713150000_campaign_contact_release_gate.sql. Default-deny: no matching active release row returns allowed=false, CAMPAIGN_RELEASE_NOT_FOUND (lines 232-235); the function also consumes (not gates) campaign.status='active' (line 266). Read-only operator summary is get_campaign_contact_release_status() in supabase/migrations/20260713160000_campaign_contact_release_status.sql:9-115. The manifest flags are a SECOND, different layer. (b) Enforcement is RUNTIME but application-layer (Deno edge function -> service_role RPC), NOT a DB trigger/constraint/RLS: the gate is called from supabase/functions/outbound-calling/index.ts. There is no trigger blocking campaign activation or queue dispatch when no release exists. The manifest flags production_launch_allowed=false, global_stop_required=true, global_stop_drill_certificate=null (campaigns/solar-exit/manifest.json:7,56,222; campaigns/pilot-portfolio/manifest.json:5) are NOT read at runtime (zero runtime importers of campaigns/*; only src/components/AutonomousAgentDashboard.tsx:61 imports agent-prompt.md?raw). They are enforced only by offline CLI/CI validators: scripts/lib/solar-exit-bundle.mjs:639-648, scripts/lib/pilot-portfolio.mjs:83 (LAUNCH_LOCK), via npm scripts campaign:solar-exit:launch-gate / campaign:solar-exit:validate / certify:static (package.json:28,33,73). So the manifest launch lock is DOCUMENTATION/CI-only; it is not enforced by the call path. (c) api-gateway and call-dispatcher are NOT enforcement points; both egress through outbound-calling. api-gateway/index.ts:485-502 proxies POST /v1/calls to outbound-calling action=create_call passing campaignId: body.campaign_id ?? null. call-dispatcher/index.ts:1955-1961 invokes outbound-calling with campaignId: queueItem.campaign_id (always set). The gate in outbound-calling only runs inside `if (campaignId)` (index.ts:794, 926) and enforceFinalBoundary() is invoked at :1269, :1306, :1808 immediately before the Retell create-phone-call fetch at :1811. CONSEQUENCE: a dispatcher-driven campaign call IS subject to the release gate and fails closed (CAMPAIGN_RELEASE_NOT_AUTHORIZED) unless an active matching release+cohort exists; an api-gateway create_call is blocked by the gate ONLY when the caller supplies campaign_id - omit it and campaignId=null, the release gate is skipped entirely (the call still passes DNC/contact-stop/calling-hours/agent-certification and must use provider=retell per index.ts:295).

**evidence**

- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:6-42 (table campaign_contact_releases; default-deny, no seed)
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:62-76 (campaign_contact_release_members cohort)
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:187-314 (evaluate_campaign_contact_release; 232-235 NOT_FOUND denial; 254-257 expired/revoked; 266 consumes campaign.status='active')
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:316-326 (RLS enabled; REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to service_role only)
- supabase/migrations/20260713150000_campaign_contact_release_gate.sql:122,183 (immutability triggers on release+member tables)
- supabase/migrations/20260713160000_campaign_contact_release_status.sql:9-115 (summary-only status RPC)
- supabase/functions/_shared/campaign-contact-release.ts:150-177 (evaluateCampaignContactRelease RPC wrapper; fails closed, CAMPAIGN_RELEASE_UNAVAILABLE)
- supabase/functions/outbound-calling/index.ts:23-25 (import), :792-805 (assertCampaignContactReleased; early return if !campaignId), :807-819 (enforceFinalBoundary), :926-943 (builds release context if campaignId), :1269/1306/1808 (enforceFinalBoundary calls), :1811 (Retell create-phone-call egress)
- supabase/functions/outbound-calling/index.ts:295-305 (create_call with provider!=retell returns 503 PROVIDER_EGRESS_NOT_CERTIFIED)
- supabase/functions/api-gateway/index.ts:456 (assertOwnedCampaign only if body.campaign_id), :483-502 (proxy action=create_call, campaignId: body.campaign_id ?? null)
- supabase/functions/call-dispatcher/index.ts:1940-1961 (invoke outbound-calling with campaignId from queueItem)
- supabase/functions/call-dispatcher/index.ts:460,703,1175 (.eq('campaigns.status','active') upstream filters)
- campaigns/solar-exit/manifest.json:7 (production_launch_allowed:false), :56 (global_stop_required:true in launch_profile), :222 (global_stop_drill_certificate:null)
- campaigns/pilot-portfolio/manifest.json:5 (production_launch_allowed:false), :7-15 (real_contact/provider/crm/spend_authorized all false)
- campaigns/solar-exit/installation-checklist.md:3 (checklist is documentation; 'keep the campaign in draft and production_launch_allowed:false until the automated launch gate passes')
- campaigns/solar-exit/eligibility-policy.json:1-... (default_decision deny, cold_calling_enabled false, all approved_* lists empty)
- scripts/lib/solar-exit-bundle.mjs:633-648 (launchBlockers reads manifest.production_launch_allowed!=true etc.)
- scripts/lib/pilot-portfolio.mjs:83 (issue 'LAUNCH_LOCK' if production_launch_allowed!==false)
- package.json:28,33,73 (campaign:solar-exit:validate, campaign:solar-exit:launch-gate, certify:static - all offline CLI)
- docs/CAMPAIGN_CONTACT_RELEASE_GATE.md:3-24,53-57,88-99 (gate is DB-only, triggered right after live Retell agent/LLM fetch, before credit and at provider boundary; 'does not fall back to a UI flag, a test flag, a campaign status, or a provider default')
- Repo-wide search: no runtime file reads campaigns/*/manifest.json or eligibility-policy.json (only src/components/AutonomousAgentDashboard.tsx:61 imports campaigns/solar-exit/agent-prompt.md?raw)

**validation**

Static evidence only (research task, no execution). Read the full SQL migration bodies, the shared TS client, both call-path functions, both manifests, the eligibility policy, the checklist, the CLI validators, and the authoritative gate doc. Confirmed via repo-wide search that no runtime code loads campaigns/* manifests or the eligibility policy.

**open_questions**

- Do the other Retell egress functions - demo-call/index.ts:350 and voice-broadcast-engine/index.ts:121 (both call api.retellai.com/v2/create-phone-call directly) - import or enforce campaign-contact-release? Repo-wide grep shows they do NOT. Are they deployed/reachable in production, and should they carry the gate?
- Is telnyx-outbound-ai/index.ts a live egress surface, and is it gated?
- Is an unscoped single create_call (no campaign_id) intended to be exempt from the release gate, or is that an unguarded hole?
- Do any direct service_role callers other than api-gateway/call-dispatcher invoke outbound-calling create_call with a campaign_id and no release row (that path fails closed, but worth confirming no caller silently omits campaign_id).

**edge_cases_considered**

- Unscoped api-gateway create_call (no campaign_id) skips the release gate entirely because outbound-calling guards on `if (campaignId)`.
- Draft/non-active campaign can never pass the gate since evaluate_campaign_contact_release requires campaign.status='active' at line 266, so a dispatcher call to a draft campaign is denied.
- Provider != retell is hard-disabled at create_call (503), so the gate's provider='retell' assumption is enforced upstream too.
- A release row exists but the specific lead is not a cohort member -> LEAD_NOT_IN_RELEASE_COHORT denial (lines 299-310).
- Expired/revoked release -> CAMPAIGN_RELEASE_EXPIRED_OR_REVOKED (254-257); members cannot be added to expired/revoked releases (member trigger 146-148).
- Gate is evaluated twice: before credit hold (line 942) and again at the final provider boundary (via enforceFinalBoundary), so a release revoked mid-flight cannot spend or dial.
- Manifest flags live in repo artifacts that the deployed edge functions do not load, so flipping production_launch_allowed to true has no runtime effect by itself.

**what_i_did_not_check**

- Did not execute any function or RPC; enforcement conclusion is from reading fail-closed code paths, not runtime proof.
- Did not verify the deployed/live state of the Supabase project (which functions are actually deployed, whether campaign_contact_releases is applied, whether any real release rows exist) - only the repo migrations.
- Did not audit demo-call, voice-broadcast-engine, telnyx-outbound-ai, retell-agent-management (create-web-call), or retell-reconciler as egress surfaces beyond confirming they lack the gate import.
- Did not check whether the RLS/grants suffice to stop an anon/authenticated caller from reaching outbound-calling directly (only that the RPC itself is service_role-only).
- Did not read the full campaign_contact_release_gate_contract.sql test suite or run certify:campaign-contact-release.
- Did not check the frontend Campaign Setup Check UI rendering of get_campaign_contact_release_status.

**confidence**: high