# dw-quicklaunch

- status: completed
- tldr: All 3 browser launch paths are no-ops; real egress is server-side only; top risk = addTestLead writes live leads with no lock

DONE: Traced the QuickLaunch flow. All three browser launch surfaces are intentionally non-executing. (1) QuickLaunchButton.handleLaunch (QuickLaunchButton.tsx:102-114) never dispatches: demo = toast only, else calls onLaunch if given, and it is mounted at Dashboard.tsx:278 with NO onLaunch prop, so it is a production no-op. checkReadiness (:35-101) only checks ANY campaign's agent_id (:61-66), ANY active number (:76-81), and non-DNC lead count (:69-73) - not the target campaign, provider binding, script, or hours. (2) QuickTestCampaign.activateCampaignAndDispatch (QuickTestCampaign.tsx:162-180) is a pure no-op: validates selectedCampaign only, then toasts the launch-lock message; button labeled 'Activation Locked'. No status update or edge call. (3) Required vs optional: readiness hook criticals = campaign name, Retell-imported numbers, wait/SMS/agent checks (agent+phone checks apply ONLY if the workflow has call steps), leads attached, timezone. Optional/warning = A2P, webhook, calling hours. Script is never validated anywhere in this path; from_number only 'any active number exists'. (4) No browser path reaches a phone number: launchSafety.ts hardcodes browserCallDispatchAllowed()/browserContactEgressAllowed() = false, and useCallDispatcher (:109-118,:199-206) early-returns on that gate. Real egress is server-side only: call-dispatcher dials 'active' campaigns via outbound-calling (:1955), Retell only (Telnyx :1647-1666 and Assistable :1754-1777 blocked).\n\nTOP DAY-ONE RISK (THEORY): QuickTestCampaign.addTestLead (:55-161) writes a real phone number into campaign_leads (:131-138) and can reset a lead to 'new' (:97-101) with NO launch lock; if that campaign is already server-activated, the next dispatcher tick could call it. No campaign_leads INSERT trigger found.\n\nVALIDATION: static source trace of the 4 files + launchSafety.ts + useCallDispatcher.ts + useCampaignReadiness.ts + call-dispatcher edge fn; no live-system calls.\n\nFOLLOW-UPS: (a) confirm call-dispatcher's timer/cadence; (b) confirm outbound-calling's own consent/DNC/global-stop re-checks; (c) check RLS on leads/campaign_leads; (d) inspect ReadinessFixDialogs write paths on active campaigns.

## Artifact

**Findings**

1) QuickLaunchButton.checkReadiness (QuickLaunchButton.tsx:35-101) computes 3 booleans only: hasAgent = ANY campaign row with non-null agent_id (:61-66); hasLeads = count of non-DNC leads (:69-73); hasPhoneNumber = ANY active phone_numbers row (:76-81). isReady = all three (:91). It does NOT check the specific campaign being launched, agent/provider binding, script, hours, or egress certification. Demo mode hardcodes isReady:true (:38-49). 2) QuickLaunchButton.handleLaunch (:102-114) NEVER dispatches. Demo -> toast only + return (:103-109). Non-demo -> calls props.onLaunch() if provided (:111-113); with no onLaunch prop it is a pure no-op. Mounted at Dashboard.tsx:278 as <QuickLaunchButton /> with NO onLaunch prop, so in production the button does nothing. Even the ready-state button is labeled 'Review Launch Requirements' (:154) and shows 'Launch certification is still required' (:144) + CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE (:173). 3) QuickTestCampaign.activateCampaignAndDispatch (:162-180) is a deliberate no-op: validates only selectedCampaign truthiness (:163-170), then sets lastAction + toasts the launch-lock message (:172-178). No status update, no edge-function invoke, no provider call. Button labeled 'Activation Locked' (:268). 4) QuickTestCampaign.addTestLead (:55-161) DOES write live data: validates selectedCampaign+testPhone (:56-63), requires userId+organizationId (:69-70), verifies campaign ownership (:72-79), formats phone to E.164 (:81), then either RESETS an existing lead to status:'new' (:94-101) or INSERTS a new lead (first_name 'Test') (:102-119), then inserts a campaign_leads row (:129-139). It changes NO campaign activation state and applies no launch lock. 5) Config required vs optional (useCampaignReadiness, src/hooks/useCampaignReadiness.ts): CRITICAL = campaign_name; retell_phone_numbers (0 usable active numbers with retell_phone_id); wait_steps_config (only if workflow has wait steps); sms_phone_number + ai_sms_settings (only if SMS steps); ai_agent (agent_id) + agent_phone + caller_id_retell (ALL only if workflow has CALL steps); leads_assigned; timezone_coverage (critical only when ALL campaign leads lack state AND no campaign timezone). OPTIONAL/warning = a2p_registration, campaign_sms_number, webhook, calling_hours (defaults 9-5). A campaign with NO workflow steps bypasses every agent/phone/SMS check; leads_assigned still always runs. 6) Script is NEVER validated by any of the four components nor by the readiness hook; from_number is only 'any active number exists' (QuickLaunchButton.tsx:76-81), not campaign/provider-bound; calling_hours optional. 7) No browser path reaches a phone number: launchSafety.ts hardcodes browserCallDispatchAllowed()=false, browserContactEgressAllowed()=false, browserAutonomousActionAllowed()=false, browserProviderAdministrationAllowed()=false; browserCampaignStatusMutationAllowed()=true only for 'paused'. useCallDispatcher.dispatchCalls (:109-118) and startAutoDispatch (:199-206) early-return on the false gate before invoking call-dispatcher; forceRequeue/forceDispatch/resetSchedule only toast lock messages (:260-295). 8) The only real egress is server-side call-dispatcher: considers status='active' campaigns only (:891) and invokes outbound-calling (:1955); Telnyx blocked (:1647-1666), Assistable blocked (:1754-1777); Retell = sole launch-certified provider (:883); force/callback/auto-sync gates hardcoded false (:15-25). 9) Highest day-one risk (THEORY): addTestLead inserts a real phone number into campaign_leads on ANY selected campaign (:131-138) and can flip an existing lead back to 'new' (:97-101) with no launch lock; if that campaign is already status='active', the next server dispatcher tick could place a real Retell call/SMS. No DB trigger on campaign_leads INSERT found (only updated_at), so dispatch is poll-driven.

**evidence**

- QuickLaunchButton.tsx:35-101 (checkReadiness), :61-66, :69-73, :76-81, :91
- QuickLaunchButton.tsx:102-114 (handleLaunch no-op/toast), :144, :154, :173
- Dashboard.tsx:16 (import), :278 (<QuickLaunchButton /> no onLaunch)
- QuickTestCampaign.tsx:55-161 (addTestLead writes), :97-101 (reset to new), :131-138 (campaign_leads insert), :162-180 (activateCampaignAndDispatch no-op), :268 (label)
- PredictiveDialingDashboard.tsx:162 (<QuickTestCampaign />)
- CampaignReadinessChecker.tsx:39-52, :152-154, :240-258 (setup check + launch-lock alert)
- CampaignLaunchVerification.tsx:176-179, :200-204 (health_check only), :531-563, :565-589 (diagnostics never grant launch)
- src/lib/launchSafety.ts (browserCallDispatchAllowed/browserContactEgressAllowed/campaign status mutation gates; CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE)
- src/hooks/useCallDispatcher.ts:109-118, :199-206, :260-295 (gated dispatch)
- src/hooks/useCampaignReadiness.ts (checks and criticals)
- supabase/functions/call-dispatcher/index.ts:15-25, :891, :883, :1647-1666, :1754-1777, :1955
- grep: invoke('call-dispatcher' finds only browser diagnostics/health callers + tests

**validation**

Static source trace only. Confirmed: (a) three browser launch buttons are no-ops or toasts; (b) real dispatch gate browserCallDispatchAllowed() is hardcoded false; (c) server dispatcher can dial only active campaigns and blocks Telnyx/Assistable; (d) addTestLead performs real DB writes with no launch lock. No live-system calls made.

**open_questions**

- Is call-dispatcher invoked on a timer by pg_cron/automation-scheduler, or only on demand?
- Does call-dispatcher enforce a top-level certified gate beyond active-campaign selection before invoking outbound-calling?
- Does outbound-calling re-check consent/DNC/global-stop before placing a Retell call?
- RLS: can a customer browser session write campaign_leads/leads for their org only?

**edge_cases_considered**

- Demo mode returns isReady:true and toast-only launch (QuickLaunchButton.tsx:38-49, :103-109)
- onLaunch prop absent in production mount (Dashboard.tsx:278)
- Campaign with no workflow steps skips all agent/phone/SMS readiness checks
- existing lead reset to 'new' on an active campaign
- 10 vs 11 digit phone normalization (+1)
- organizationId/userId required guards in addTestLead

**what_i_did_not_check**

- Whether pg_cron or automation-scheduler invokes call-dispatcher automatically and at what cadence
- call-dispatcher's full pre-dispatch gating beyond active-campaign selection (webhook signing, idempotency, contact-stop, DNC correctness)
- outbound-calling's own consent/DNC/global-stop re-checks and whether it can be invoked directly
- The ReadinessFixDialogs write paths (do they mutate an active campaign contrary to the ACTIVE_CAMPAIGN_CONFIGURATION lock)
- RLS policies on leads/campaign_leads/phone_numbers
- Whether any other component/page passes onLaunch to QuickLaunchButton or calls dispatchCalls without the gate
- CampaignContactReleaseStatus and CampaignReadinessChecker full mount wiring

**confidence**: medium