# cue-ai-brain

- status: completed
- tldr: ai-brain: launch-quarantined (503 gate L4652, fn L10-12 false), no bypass, no call placement, anon reaches body but blocked

ai-brain cue node complete. VERDICT: launch-quarantined, NO bypass. Handler is serve() (std http, not Deno.serve) at index.ts:4647; isAiBrainTenantCertified() is hardcoded return false (L10-12) and called at L4652 BEFORE the try block (L4666)/auth/fetch, returning 503 (L4662). No tool places a call; Retell egress is list-agents L3642 / get-retell-llm L3657,L3864 / get-agent L3848 / update-retell-llm PATCH L3888 (config only). Sibling proxies: sms-messaging, autonomous-prioritization, retell-phone-management, retell-agent-management; LLM via Lovable gateway L4814/L4963 - all post-gate. config.toml L316-319 verify_jwt=true. CORS '*' L6, OPTIONS 200 L4648-4650, so anon-key JWT reaches the body but gets 503. Handler also has a service-role bypass (L4695) but it is unreachable behind the gate.

Markdown row: ai-brain | yes (supabase/functions/ai-brain/index.ts, 5026 lines) | verify_jwt=true (config.toml L316/319) | egress: YES (sibling-fn proxies L1701/1795/2806/2892/3035/3130/3170/3220/3267/3315; Retell config-only L3642/3657/3848/3864/3888; LLM L4814/4963) - NO direct call placement | launch-quarantined: YES (isAiBrainTenantCertified L10-12 false; call L4652; 503 L4662) | anon-browser reachable: transport-only (CORS '*' L6, OPTIONS no-auth L4648-4650; anon-key JWT passes verify_jwt; gate returns 503) | bypasses launch lock: NO | citations: index.ts:4647,4652-4664,4666,4693-4709; config.toml:316-319.

## Artifact

**Findings**

ai-brain is a single file: supabase/functions/ai-brain/index.ts (5026 lines; only index.ts in the dir). Handler = serve(async (req)=>{...}) at index.ts:4647 (Deno std serve 0.168.0, imported L1), NOT Deno.serve. config.toml has [functions.ai-brain] at L316 with verify_jwt = true at L319 (comment L317-318 says launch-quarantined in-function, JWT kept as defense in depth). GATE FN isAiBrainTenantCertified() = index.ts:10-12, hardcoded return false (L11) - KNOWN SIGNAL '10-1484' is imprecise (only 3 lines; 1484 is the tool-def region). GATE CALL SITE = index.ts:4652, 2nd statement of handler, immediately after OPTIONS preflight (L4648-4650) and BEFORE the try block (L4666), before any auth/fetch; returns status 503 (L4662) error AI_BRAIN_NOT_TENANT_CERTIFIED (L4659). Q1: gate runs BEFORE all provider egress (every fetch is inside the post-gate try/executeToolCall). Q2: no branch/tool reaches egress ungated; 503 is unconditional for every non-OPTIONS request; OPTIONS returns null body + CORS only (no egress). Q3: NO tool places a phone call - all direct Retell egress is read or LLM-config (list-agents L3642, get-retell-llm L3657, get-agent L3848, get-retell-llm L3864, update-retell-llm PATCH L3888); no create-phone-call/telnyx/twilio Calls.json/assistable make-call anywhere. Other egress = sibling edge fns (sms-messaging L1701/L1795, autonomous-prioritization L2806, retell-phone-management L2892/L2936/L2963/L3170/L3267/L3315, retell-agent-management L3035/L3130/L3220) and Lovable AI gateway LLM (L4814/L4963). Closest to telephony are DB-state tools launch_broadcast (case L2528) and launch_now (criticalTools set L4862 comment 'Starts live calls to real people') that feed the dispatcher - still behind the gate. Q4: transport-reachable by anon browser - CORS wildcard '*' L6; OPTIONS 200 with corsHeaders and no auth (L4648-4650); verify_jwt validates a JWT at the gateway and the public anon key IS a valid project JWT, so an anon browser reaches the body - then gets 503. Functionally dead. Q5: handler auth is dual (L4693-4709): Bearer via supabase.auth.getUser(token) (L4702) OR internal service-role bypass (internal===true && userId && token===SUPABASE_SERVICE_ROLE_KEY, L4695-4699) using service-role createClient (L4678/4688); but this code is NEVER reached because the L4652 gate short-circuits first. Q6: BYPASSES LAUNCH LOCK = NO (gate unconditional and first after OPTIONS).

**evidence**

- supabase/config.toml:316-319 ([functions.ai-brain]; verify_jwt = true)
- supabase/functions/ai-brain/index.ts:1 (import serve from deno std http 0.168.0)
- supabase/functions/ai-brain/index.ts:5-8 (corsHeaders, Access-Control-Allow-Origin '*')
- supabase/functions/ai-brain/index.ts:10-12 (isAiBrainTenantCertified() returns false - L11)
- supabase/functions/ai-brain/index.ts:4647 (serve(async (req) => {)
- supabase/functions/ai-brain/index.ts:4648-4650 (OPTIONS short-circuit with corsHeaders, no auth)
- supabase/functions/ai-brain/index.ts:4652-4664 (gate call + 503 AI_BRAIN_NOT_TENANT_CERTIFIED)
- supabase/functions/ai-brain/index.ts:4666 (try { begins AFTER the gate)
- supabase/functions/ai-brain/index.ts:4676-4709 (authHeader; getUser L4702; internal service-role bypass L4695)
- supabase/functions/ai-brain/index.ts:3642,3657,3848,3864,3888 (Retell list-agents / get-retell-llm x2 / get-agent / update-retell-llm PATCH - config only)
- supabase/functions/ai-brain/index.ts:3660,3895 (provider response read; no call endpoint)
- supabase/functions/ai-brain/index.ts:4814,4963 (Lovable AI gateway LLM completions)
- supabase/functions/ai-brain/index.ts:1701,1795,2806,2892,3035 (sibling edge-function proxies)
- supabase/functions/ai-brain/index.ts:4862 (criticalTools 'launch_now' comment) and 2528 (case 'launch_broadcast')

**validation**

Static read only per research-only mandate: read config.toml L305-334 and ai-brain index.ts L1-60, L3620-3910, L4630-4760, L4855-4945, L4970-5026; findstr enumeration of serve(, isAiBrainTenantCertified, all fetch(/provider endpoints, and call/broadcast 'case' handlers. No live systems touched; no files changed.

**open_questions**

- Whether voice_broadcasts/broadcast_queue DB writes trigger a dispatcher (triggers not read); moot for launch safety but relevant to the future certified replacement.
- Tool-definition region (~L400-1500) mapping of 'launch_now' to a downstream call-placement edge function was not fully read.

**edge_cases_considered**

- OPTIONS preflight is unauthenticated and returns 200 with CORS wildcard before the gate but performs no egress.
- Internal service-role caller path (index.ts:4695) would skip getUser auth, yet is unreachable because the 503 gate precedes it.
- Sibling function proxies (retell-phone-management / retell-agent-management / sms-messaging) could indirectly reach call/SMS egress, but only from inside the post-gate try block.
- verify_jwt=true still admits the public anon-key JWT, so gateway config alone would not stop an anon browser; the in-function 503 is the effective control.

**what_i_did_not_check**

- Full text of all ~100 tool case bodies between L1500 and L4400 (only call/broadcast-adjacent and Retell tools were read).
- Whether DB triggers fan out voice_broadcasts / broadcast_queue writes to a dispatcher (no migration/trigger read).
- Frontend call sites invoking ai-brain in src/ (how a browser obtains the anon JWT).
- Other edge functions' own launch gates (retell-phone-management, sms-messaging) - separate cue nodes.

**confidence**: high