# dw-dispatch-reach

- status: completed
- tldr: No browser component can start a real first-campaign call: UI gate browserCallDispatchAllowed()=false AND server rejects browser campaign calls at outbound-calling:364-368.

DONE: Determine whether any browser component can start a real outbound call for a first campaign, and where it dies.
TOUCHED: none (research only).
EVIDENCE: see artifact evidence list (key: outbound-calling/index.ts:364-368; launchSafety.ts:128-133; CampaignManager.tsx:780/:727; CallCenter.tsx:101 + zero importers; useCallDispatcher.ts:109/:199).
RESULT: NO browser component can start a real outbound call for a first campaign. makeCall (usePredictiveDialing.ts:663) has no internal guard and always sends campaignId + a user JWT. Its mounted caller (CampaignManager.handleStartCall:780) is blocked by browserCallDispatchAllowed()=false; its ungated caller (CallCenter.tsx:101) is unmounted dead code. Even if reached, the server definitively rejects browser campaign calls at outbound-calling:364-368 ("Campaign calls require the service dispatcher and an exact atomic queue claim"), plus requires an active campaign (:379) that the browser cannot activate, and a default-deny contact release (:926-943). Only call-dispatcher -> outbound-calling (service role + queueId + dispatchGeneration, call-dispatcher:1939-1961) can dial, and that dispatcher is client-gated by the same false flag.
COULD_NOT: verify DB/seed state, campaign_contact_release RPC SQL, or other dial edge functions (research-only, no live reads).
CONFIDENCE: high (reachability + server block); medium on contact-release specifics.

## Artifact

**Findings**

makeCall has NO internal launch-lock guard and always sends campaignId + caller JWT. Of its two UI callers, CampaignManager.handleStartCall is gated by browserCallDispatchAllowed() (which hardcodes false); CallCenter.handleStartCall is UNgated but CallCenter.tsx is unmounted dead code with zero importers. Independently, the server hard-rejects any browser JWT campaign create_call at outbound-calling:364-368 ('Campaign calls require the service dispatcher and an exact atomic queue claim'), and also requires campaign.status==='active' (:379) which the browser cannot set (activation is launch-locked). Therefore NO browser component can start a real outbound call for a first campaign. The only dialing path is call-dispatcher -> outbound-calling with the service-role key + queueId + dispatchGeneration; that dispatcher is reachable by an auth'd user from the browser only through useCallDispatcher, which is itself blocked by browserCallDispatchAllowed(). RANKED FAILURES: (1) CRITICAL outbound-calling:364-368 server reject. (2) CRITICAL launchSafety.ts:128-133 false gate blocks all mounted dispatch (CampaignManager:780/:727, useCallDispatcher:109/:199). (3) HIGH campaign must be 'active' (:379) but a fresh campaign is 'draft' and activation is launch-locked. (4) HIGH default-deny campaign contact release (:926-943). (5) MED caller rotation_enabled===true + retell_phone_id (:476/:490) and calling-hours/tz (:765-790) and credits (:946-1043). (6) LOW/DEAD CallCenter.tsx:76-120 ungated but unreachable.

**evidence**

- src/hooks/usePredictiveDialing.ts:663-732 makeCall (no internal launch-lock guard; always passes campaignId at :696)
- src/hooks/usePredictiveDialing.ts:691-702 invokes outbound-calling action:create_call
- src/components/CampaignManager.tsx:777-783 handleStartCall gated by browserCallDispatchAllowed() at :780
- src/components/CampaignManager.tsx:726-732 handleDispatchNow gated at :727
- src/components/CallCenter.tsx:76-120 handleStartCall calls makeCall at :101 UNGATED
- CallCenter.tsx has no importers (findstr across src returns only self-refs) => dead/unrouted
- src/components/PredictiveDialingDashboard.tsx:9,279 mounts CampaignManager
- src/lib/launchSafety.ts:21-22 CALL_DISPATCH_LAUNCH_LOCK_MESSAGE; :128-133 browserCallDispatchAllowed() returns false; :115-119 browserCampaignStatusMutationAllowed only 'paused'
- src/hooks/useCallDispatcher.ts:109-118 dispatchCalls blocked; :199-206 startAutoDispatch blocked
- supabase/functions/outbound-calling/index.ts:364-368 hard-reject browser campaign calls
- supabase/functions/outbound-calling/index.ts:379 requires campaign.status==='active'
- supabase/functions/outbound-calling/index.ts:469-492 caller-ID active/rotation_enabled/retell_phone_id gates
- supabase/functions/outbound-calling/index.ts:926-943 + _shared/campaign-contact-release.ts:17-29 default-deny release gate
- supabase/functions/call-dispatcher/index.ts:1939-1961 only service-role path that dials

**validation**

grep of makeCall + launch-lock symbols; read of every makeCall caller; read of create_call branch of both edge functions; confirmed zero importers of CallCenter via recursive findstr.

**open_questions**

- Does a campaign_contact_release / canary-cohort row mechanism exist so a genuinely first campaign could ever be released?
- Is call-dispatcher invoked by automation-scheduler under service role (browser-independent real launcher)?
- Any non-makeCall browser fetch to outbound-calling without campaignId (company-owned test path)?

**what_i_did_not_check**

- campaign_contact_release RPC SQL body (default-deny inferred)
- actual DB/seed state (no DB read; research-only)
- api-gateway and other edge functions that may dial
- assistable-make-call / ai-autonomous-engine / automation-scheduler call paths
- built router manifest (searched src component refs only)
- CampaignLauncher.tsx wiring (appears unused; does not call makeCall)
- no app build/run

**confidence**: high