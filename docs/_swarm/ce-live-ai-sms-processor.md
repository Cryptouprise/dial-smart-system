# ce-live-ai-sms-processor

- status: completed
- tldr: ai-sms-processor: verify_jwt=true (config:112); NO cert gate in live bytes; anon passes platform gate but in-function auth 401s; 4 actions; SMS egress direct Telnyx/Twilio.

Node ce-live-ai-sms-processor done (RESEARCH ONLY; no writes/deploys/probes).

(a) verify_jwt = true — supabase/config.toml:109 [functions.ai-sms-processor], :112.
(b) NO cert gate in LIVE bytes: 0 matches for 'certif' in the 1215-line file; no 503. The gate the doc cites (LIVE-VS-MAIN-GATES.md:20,54) exists only in old Codex worktrees (isAiSmsProcessorTenantCertified@30-634, error_code@46) and p5-texting.md:3281 records its REMOVAL. Repo main == live snapshot byte-for-byte (fc /b: no differences; both 1215 lines).
(c) verify_jwt=true checks only JWT signature, so an anon key (validly-signed JWT) reaches the handler; block is in-function: :138-148 (no header -> 401 "Unauthorized") and :174-185 (auth.getUser fails -> 401 "Authentication failed"). Bypass: :167 service-role token + body.userId skips auth.getUser. No signed-webhook path.
Actions: process_webhook@191, generate_response@394, generate_and_send@433, convert_voice_to_sms@654 (else throw@730).
Side effects: AI spend (Lovable gateway, gemini-2.5-flash) @533/@693/@899/@1185; SMS egress DIRECT to Telnyx@572 / Twilio@599 (NOT via sms-messaging); DB writes @225/238/251/350/504/514/620/637; calendar-integration service-role egress @984/1063/1122.
PER-FUNCTION ROW: ai-sms-processor | verify_jwt=true (config:112) | main gate @46 -> NOT PRESENT here (gated copy only in old Codex worktrees; p5-texting.md:3281 = removed) | live gate: NO | auth: 401 Unauthorized(138-148) / 401 Authentication failed(174-185) / service-role bypass(167) | 4 actions | side effects: AI spend, direct Telnyx/Twilio SMS, DB writes, calendar egress | confidence: medium.
COULD_NOT: verify deployed bytes or git branch/HEAD (git commands timed out >2min).
CONFIDENCE: medium.

Validation: fc /b main vs live = identical; findstr/find 'certif' = 0 hits; direct reads of config.toml:95-140 and the live auth + action + side-effect regions.

## Artifact

**Findings**

(a) verify_jwt = TRUE. supabase/config.toml:109 declares [functions.ai-sms-processor]; :112 sets verify_jwt = true; the comment at :110-111 frames containment as config-level ('Launch-quarantined before auth, database, or AI access'), not an in-function gate.
(b) NO certification gate in LIVE bytes. 0 matches for 'certif' across the 1215-line live file; no NOT_CERTIFIED string and no 503 return. LIVE-VS-MAIN-GATES.md:20,:54 claim main carries AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED@46 'before auth', but that code is NOT in this tree: the gated copy exists only in old Codex worktrees (isAiSmsProcessorTenantCertified @30-634, error_code @46), and p5-texting.md:3281 records 'Removed: the AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED 503 gate'. On this branch main == live == gate-free.
(b2) The repo SOURCE supabase/functions/ai-sms-processor/index.ts is byte-identical to the LIVE snapshot (fc /b: no differences; both 54,349 bytes, 1215 lines), so this tree cannot distinguish main from live on gate presence.
(c) Anon reachability. verify_jwt=true enforces only JWT signature at the platform edge, so a Supabase anon key (a validly-signed JWT) passes the platform gate and DOES reach the handler; the rejection is in-function: (1) :137-148 missing Authorization -> 401 {"error":"Unauthorized"}; (2) :163-187 invalid/anon token -> auth.getUser fails -> 401 {"error":"Authentication failed"} at :174-185. This matches the observed live probe in LIVE-VS-MAIN-GATES.md:54 (anon key -> function-level 401 'Authentication failed').
(c2) Auth-bypass path: :167 - if the bearer literally equals SUPABASE_SERVICE_ROLE_KEY and body.userId is present, the call is treated as internal (isInternalCall=true, userId=body.userId) and skips auth.getUser entirely (:167-171). This is the only in-function auth skip. There is NO signed-webhook path: process_webhook (:191) sits after the same auth block and requires a valid JWT or the service-role token.
(d) Actions reachable (all after auth): process_webhook (:191), generate_response (:394), generate_and_send (:433), convert_voice_to_sms (:654); any other -> throw 'Unknown action' (:730) -> 500 catch.
(d2) Side effects: AI spend via Lovable gateway (google/gemini-2.5-flash) at :533, :693, :899 (analyzeImage, invoked from process_webhook when an image is present), :1185 (generateAIResponse, used by process_webhook auto-respond :371 and generate_response :420). SMS egress is DIRECT to providers (Telnyx :572-584, Twilio :598-610) and only inside generate_and_send - it does NOT call the sms-messaging function. DB writes to sms_conversations/sms_messages at :225/:238/:251/:350/:504/:514/:620/:637. Service-role egress to calendar-integration at :984/:1063/:1122. NOTE: process_webhook does not itself send an SMS - it records inbound, generates a reply (:371), and returns the text.

**evidence**

- supabase/config.toml:109 [functions.ai-sms-processor]
- supabase/config.toml:112 verify_jwt = true
- grep -i certif on supabase/functions-live/ai-sms-processor/ai-sms-processor/index.ts (1215 lines) -> 0 matches; no 503 string
- fc /b supabase\functions\ai-sms-processor\index.ts vs supabase\functions-live\ai-sms-processor\ai-sms-processor\index.ts -> FC: no differences encountered
- index.ts:137-148 missing Authorization -> 401 {"error":"Unauthorized"}
- index.ts:163-187 token !== serviceRoleKey -> supabaseAdmin.auth.getUser(token) -> 401 {"error":"Authentication failed"} at :174-185
- index.ts:167-171 service-role internal bypass (token === SUPABASE_SERVICE_ROLE_KEY && body.userId)
- index.ts actions: :191 process_webhook, :394 generate_response, :433 generate_and_send, :654 convert_voice_to_sms, :730 throw Unknown action
- index.ts AI spend (Lovable gateway gemini-2.5-flash): :533, :693, :899 (analyzeImage), :1185 (generateAIResponse)
- index.ts SMS egress direct: Telnyx :572-584, Twilio :598-610 (only inside generate_and_send)
- index.ts DB writes: sms_conversations :225,:238,:350,:504,:514,:637; sms_messages :251,:620
- index.ts calendar-integration service-role egress: :984-995, :1063-1079, :1122-1134
- Gated variant only in Documents\Codex\2026-07-11\github-plugin-github-openai-curated-remote-2\work\*\supabase\functions\ai-sms-processor\index.ts (isAiSmsProcessorTenantCertified @30-634, error_code @46)
- dial-smart-system\docs\wholesale\phases\out\p5-texting.md:3281 records the gate removal

**validation**

Read config.toml:95-140; read the full live auth region (index.ts:130-205), all four action handlers (:191-730), and every provider/AI fetch and DB write site via targeted findstr plus direct reads; byte-compared main vs live with fc /b; repo-wide grep for the gate constant to locate the gated variant.

**open_questions**

- Did the actually-deployed live function (project emonjusymdripmkvtttc) receive the gate-free P5 build, or is the local functions-live snapshot just a copy of current repo main?
- Which branch/commit is checked out (git log/branch timed out >2min)?
- Who sends process_webhook's returned reply text to SMS - is inbound AI auto-reply live or dead in this build?

**edge_cases_considered**

- anon key is a validly-signed JWT, so verify_jwt=true does not block it at the platform edge
- service_role token + body.userId bypasses auth.getUser entirely (:167-171)
- OPTIONS short-circuits with 200 CORS null body before auth (:131-135)
- unknown action -> thrown Error -> 500 catch (:730-739), not a 503 gate
- process_webhook still passes through the same auth block, so there is no unauthenticated webhook path

**what_i_did_not_check**

- Deployed edge-function bytes on Supabase (only the local functions-live snapshot was read; no network/MCP call made)
- git branch/HEAD and pre-gate vs post-P5 commit history (git commands exceeded the 2-minute timeout)
- The caller consuming process_webhook's returned response text (twilio-sms-webhook / workflow-executor)
- RLS policies and the default_organization_for_user RPC definition
- analyzeImage call sites beyond :899 and the image branch inside process_webhook
- The other 99 edge functions' gate/verify_jwt rows

**confidence**: medium