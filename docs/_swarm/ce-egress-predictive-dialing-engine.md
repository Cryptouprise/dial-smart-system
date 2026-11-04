# ce-egress-predictive-dialing-engine

- status: completed
- tldr: Egress only at index.ts:221 (invoke workflow-executor); hard 503 gate at line 24 precedes it; verify_jwt=true; CORS '*' but real getUser check => anon not reachable.

predictive-dialing-engine/index.ts: NO direct provider egress; single egress = internal invoke 'workflow-executor' at index.ts:221 (start branch), whose chain reaches provider create calls (outbound-calling create-phone-call; assistable-make-call) but is runtime-unreachable. Hard launch gate isPredictiveDialingTenantCertified() (def 15-17 returns false, call 24, 503 at 26) runs BEFORE egress. verify_jwt=true (config.toml:132). CORS '*' (line 6) but real auth check exists (authHeader 44-50 + supabase.auth.getUser 52) => anon NOT reachable. Only bypass is OPTIONS (20-22) which reaches no egress.

## Artifact

**Findings**

EGRESS: The target file has NO direct provider call/SMS and NO fetch() to any provider endpoint. Its ONLY egress site is an internal edge-function invoke at index.ts:221 `await supabase.functions.invoke('workflow-executor', {...})` inside the `start` branch (case 'start' at index.ts:133). Statically the invoke target reaches provider CREATE calls: workflow-executor/index.ts:1468 invokes 'outbound-calling' (provider create at outbound-calling/index.ts:1811 `${baseUrl}/create-phone-call` = Retell, plus Telnyx 1271/1308) and workflow-executor/index.ts:1678 fetches assistable-make-call (which POSTs https://api.assistable.ai/v2/ghl/make-call). But all of it is runtime-unreachable because the file is hard launch-quarantined. verify_jwt: CONFIRMED true at supabase/config.toml:132 ([functions.predictive-dialing-engine] block at :129, comment :130-131); no opt-out. LAUNCH-QUARANTINED: exactly one gate helper, isPredictiveDialingTenantCertified() defined index.ts:15-17 returning false, called index.ts:24, 503 at index.ts:25-28; it runs BEFORE the first egress line 221. ANONYMOUS-BROWSER REACHABLE: NO - CORS is wildcard (index.ts:6) but a real identity check exists (Authorization header required index.ts:44-50; supabase.auth.getUser(token) index.ts:52 with 401 at 54-59), and verify_jwt=true enforces a platform JWT. Note the 503 gate (line 24) fires before the auth check (line 52), so unauthenticated callers get 503 not 401. BYPASSES LAUNCH LOCK: only OPTIONS (index.ts:20-22) returns before the gate and it reaches zero egress; no service-role branch, no pre-gate early return, no env/feature flag (only SUPABASE_URL/SERVICE_ROLE_KEY reads at 32-33), no cron/scheduler branch, no force_dispatch path in this file.

**evidence**

- supabase/functions/predictive-dialing-engine/index.ts:5-8 (CORS '*'): const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
- supabase/functions/predictive-dialing-engine/index.ts:15-17 (gate def, hardcoded false): function isPredictiveDialingTenantCertified(): boolean { return false; }
- supabase/functions/predictive-dialing-engine/index.ts:20-22 (OPTIONS pre-gate, no egress): if (req.method === 'OPTIONS') { return new Response(null, { headers: corsHeaders }); }
- supabase/functions/predictive-dialing-engine/index.ts:24-28 (503 gate): if (!isPredictiveDialingTenantCertified()) { return new Response(JSON.stringify({ success: false, disabled: true, error_code: 'PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED', ... }), { status: 503,
- supabase/functions/predictive-dialing-engine/index.ts:44-52 (real identity check): const authHeader = req.headers.get('Authorization'); if (!authHeader) {...401...} const token = authHeader.replace('Bearer ', ''); const { data: { user }, error: authError } = await supabase.auth.getUser(token);
- supabase/functions/predictive-dialing-engine/index.ts:221 (ONLY egress site): const { error: workflowError } = await supabase.functions.invoke('workflow-executor', {
- supabase/config.toml:129-132 (verify_jwt): [functions.predictive-dialing-engine] / # Launch-quarantined until pacing, queues, workflows, and dispatch share the / # certified exact-organization state machine. / verify_jwt = true
- supabase/functions/workflow-executor/index.ts:1468 (invoke outbound-calling) and :1678 (fetch .../functions/v1/assistable-make-call)
- supabase/functions/outbound-calling/index.ts:1811 (fetch `${baseUrl}/create-phone-call`, Retell provider create) and :1271 (https://api.telnyx.com/v2/ai/assistants/.../calls)
- supabase/functions/assistable-make-call/index.ts:19 (const ASSISTABLE_API_URL = 'https://api.assistable.ai/v2/ghl/make-call';) and :101 (if (!isAssistableEgressCertified()) { - its own 503 gate)

**validation**

Read all 328 lines of the target file verbatim. Grepped for imports (only lines 1-3), fetch/invoke (only 221), Deno.env (32-33), 'Certified' (15/24/25). Grepped config.toml for the block (129-132) and all verify_jwt lines (no false override for this function). Traced the single invoke target to its downstream provider create calls. Static analysis only; no live calls, no writes.

**open_questions**

- Could a dashboard/CLI verify_jwt override differ from config.toml (not verifiable from repo alone)?

**edge_cases_considered**

- OPTIONS pre-gate early return (reaches no egress)
- GET branch (gated at line 24 first)
- POST start/stop/status branches (all gated)
- service-role / cron / force_dispatch paths (absent from file)

**what_i_did_not_check**

- Did not read full bodies of workflow-executor/outbound-calling/assistable-make-call - only grepped for provider endpoints, sufficient to establish the invoke target reaches provider create calls statically.
- Did not check for a Supabase dashboard/CLI verify_jwt override separate from config.toml.
- Did not exercise the runtime gate (RESEARCH-ONLY; no live calls).

**confidence**: high