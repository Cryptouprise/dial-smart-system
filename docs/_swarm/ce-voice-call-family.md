# ce-voice-call-family

- status: completed
- tldr: voice-token/voice-call enable egress, voice-call-action can egress (Telnyx transfer), voice-call-events cannot; no launch lock, no consent/hours/credit checks, DNC only in voice-call.

ce-voice-call-family DONE (atomic). Egress: voice-token=ENABLES (mints browser token; telnyx token / twilio VoiceGrant); voice-call=ENABLES browser egress (returns newCall/connect options; both startOutbound() return provider_call_id:null and hand the leg to the browser); voice-call-action=DIRECT provider egress via Telnyx transfer (POST /calls/{id}/actions/transfer) + dtmf/hangup (Twilio: hangup only); voice-call-events=NO egress (Telnyx Call Control webhook, DB writes only). Launch lock: NONE in any of the four (0 isXCertified/503/launchSafety matches). Consent: none. Calling-hours: none. Credit: none. DNC: only voice-call (lead.do_not_call :129 + dnc_list :135-142). Auth: voice-call/-action/voice-token verify a real user JWT in-function (supabaseAdmin.auth.getUser, 401) + server-side org membership (403/404); voice-call-events has no user auth, uses Telnyx Ed25519 signature. Browser reachability: all four are ABSENT from supabase/config.toml -> 'unlisted, default true' (repo census docs/_swarm/ce-config-jwt-census.md), so verify_jwt defaults true but only demands a valid project JWT (anon key qualifies); the in-function getUser is the real gate. Browser click-to-call surface (src/lib/voice/BrowserPhone.ts via CallWorkspace.tsx startCall :273-341) has NO launchSafety guard but is not mounted.

## Artifact

**Findings**

EGRESS SUMMARY (can it egress a call, or enable egress?). voice-token=ENABLES egress (mints the browser-phone token). voice-call=ENABLES browser egress (returns the newCall/connect options the browser needs; no server-side dial). voice-call-action=DIRECT provider egress capability via Telnyx 'transfer' (POST /calls/{id}/actions/transfer) and dtmf/hangup; Twilio only hangup. voice-call-events=NO egress (Telnyx Call Control webhook, DB writes only). NONE of the four dial server-side at call start: both provider startOutbound() return provider_call_id:null and hand the leg to the browser (telnyx.ts:238-257, twilio.ts:223-238). No function in the family contains ANY launch lock (grep for isXCertified/503/launchSafety in the 4 index.ts = 0 matches). Consent and calling-hours are NEVER checked. Credit is NEVER checked. DNC is checked ONLY in voice-call (lead.do_not_call :129 + dnc_list :135-142). AUTH: voice-call/voice-call-action/voice-token all verify a real user JWT in-function via supabaseAdmin.auth.getUser(token) (401) and derive organization membership server-side (403/404); voice-call-events has NO user auth and instead verifies a Telnyx Ed25519 webhook signature. BROWSER REACHABILITY: none of the four has a [functions.*] block in supabase/config.toml (confirmed 0 matches), so per the repo's own census (docs/_swarm/ce-config-jwt-census.md) they are 'unlisted, default true' -> verify_jwt defaults to true; that only demands some valid project JWT (the public anon key qualifies), so platform-level JWT alone is not an authorization gate - the in-function getUser is. Browser click-to-call surface exists (src/lib/voice/BrowserPhone.ts, driven by src/components/call/CallWorkspace.tsx startCall at :273-341) and it carries NO launchSafety guard (CallWorkspace does not import browserContactEgressAllowed; that guard is used only by AgentEditDialog/useAiSmsMessaging/useBroadcastReadiness), but CallWorkspace is not mounted anywhere (only CoachPanel comments reference it).

**evidence**

- voice-call/index.ts:167-175 provider.startOutbound(...) called; voice-call/index.ts:186-196 comment: both providers return provider_call_id null (browser completes the leg); voice-call/index.ts:198-206 returns extra{client_state,...}/params -- the browser newCall options
- voice-call/index.ts:49-66 auth.getUser(token) -> 401; :83 authorizeOrganizationContext -> 403; :104-115 caller ID org-scoped; :120-129 lead org-scoped + do_not_call DNC block; :135-142 dnc_list org-scoped DNC block; :69 rate limit 120/min
- voice-call-action/index.ts:51-68 getUser 401; :84-100 org derived from call_logs row + organization_users membership 404; :110-148 register_provider_call (binds id, no egress); :150-164 provider.action(...) egress path
- telnyx.ts:269-289 transfer -> telnyxCommand(ctx.providerCallId,'transfer',{to}) POST /calls/{id}/actions/transfer; :270-273 dtmf send_dtmf; :274-283 hangup
- twilio.ts:240-266 action(): mute/unmute/hold/unhold/dtmf no-op; :251-261 hangup POST Calls.json; :264-266 transfer throws (not supported on browser leg)
- voice-token/index.ts:42-51 getUser 401; :70 authorizeOrganizationContext 403; :75-86 provider.mintToken(...) -> returns {token,...}
- telnyx.ts:208-235 mintToken: ensureTelephonyCredential (POST /telephony_credentials :108-114) then POST /telephony_credentials/{id}/token; twilio.ts:84-116 buildAccessToken grants.voice.outgoing.application_sid=TWILIO_TWIML_APP_SID; 217-221 mintToken -- token enables browser egress
- voice-call-events/index.ts:212-225 Ed25519 verify (503 if WEBHOOK_SECRET_TELNYX missing, 401 if sig invalid); :233-246 parseWebhookBody + resolveCallLog + applyEvent; :142-205 only DB updates/RPC -- no provider POST anywhere in the file
- voice-call-events/index.ts:227-252 sole network use is the DB via supabaseAdmin; no fetch to api.telnyx.com
- supabase/config.toml read in full (449 lines): 0 matches for voice-call/voice-call-action/voice-call-events/voice-token (findstr exit 1); by contrast telnyx-webhook is explicitly verify_jwt=false at config.toml:250
- docs/_swarm/ce-config-jwt-census.md Section 3 lists voice-call, voice-call-action, voice-call-events, voice-token among 19 dirs with NO config block -> 'default verify_jwt=true'
- src/lib/voice/BrowserPhone.ts:164-216 call(): POST voice-call then places leg (telnyx newCall :183-191 / twilio device.connect :197-204); :370 postAction -> voice-call-action
- src/components/call/CallWorkspace.tsx:273-341 startCall: invoke voice-token (:295) then new BrowserPhone (:308) then bp.call (:318); no browserContactEgressAllowed guard; CallWorkspace not mounted (mounted-usage grep = CoachPanel comments only)
- src/lib/launchSafety.ts:149-151 browserContactEgressAllowed() returns false; guard used only in AgentEditDialog.tsx:822, useAiSmsMessaging.ts:160, useBroadcastReadiness.ts:387 (not in the browser-phone path)

**validation**

All four target index.ts files read in full (212/181/252/94 lines). supabase/config.toml read in full and findstr-confirmed to have no block for any of the four. Dependencies read in full: _shared/voice-provider.ts, _shared/telnyx.ts, _shared/twilio.ts, src/lib/launchSafety.ts, src/lib/voice/BrowserPhone.ts, and CallWorkspace.tsx:255-341. Cross-checked against two prior repo artifacts (docs/_swarm/ce-config-jwt-census.md, docs/_swarm/sr__dialing__voice-call{,-action,-events}.md, sr__dialing__voice-token.md) - their auth/service-role claims match my independent line-by-line read. Egress classification done by grepping the four files + shared modules for provider POST endpoints and reading each match.

**open_questions**

- verify_jwt default: the four are unlisted so verify_jwt defaults to true, yet voice-call-events is a Telnyx webhook and Telnyx cannot present a Supabase JWT - if the deployed project really enforces verify_jwt=true the webhook would be rejected at the gateway before reaching the signature check. Is verify_jwt actually enforced as true on the live project for these four, or does the project run them without JWT verification? Repo census is a claim, not a live-project check.
- Does the public anon JWT satisfy verify_jwt=true on the live project (making 'default true' a non-gate)? Repo precedent (demo-call per docs/_swarm/ce-demo-call.md) says anon passes verify_jwt. Not verified against the live deployment here.
- voice-call-action 'transfer' egress: once a call_logs row is bound, a teammate can transfer the Telnyx leg to any valid E.164 with no consent/DNC/hours/credit check - is that intended and is the target number validated against any policy?
- voice-token mintToken for Telnyx performs a provider write (credential create) as a side effect of GET-like token minting; is that bounded/audited?

**what_i_did_not_check**

- The live/deployed Supabase project's actual verify_jwt settings (no access from this repo; only config.toml + census artifact).
- RLS policies on call_logs / dnc_list / voice_credentials / organization_users (reviewed only the service-role code paths, which bypass RLS).
- twilio-voice-twiml (the TwiML app voice URL that actually dials the <Dial> for the Twilio leg) - it is the true server-side egress for the Twilio browser path and is out of this node's 4-file scope; the browser-phone Twilio chain is voice-token -> device.connect -> twilio-voice-twiml.
- _shared/utils.ts checkRateLimit implementation (rate-limit semantics, memory vs shared).
- Whether any OTHER caller reaches these functions besides BrowserPhone/CallWorkspace (e.g. coach-decide/coach-suggest or pack functions importing voice-provider).
- Whether the browser-phone UI (CallWorkspace) is reachable through any route not found by my mount grep (e.g. dynamic import or lazy route).

**confidence**: high