# ce-agw-egress-paths

- status: completed
- tldr: api-gateway has 3 egresses (485 outbound-calling, 560 sms-messaging, 970 call-dispatcher); launch is direct DB update; 0 provider fetches

DONE: Enumerated every outbound egress of api-gateway (both supabase/functions/api-gateway/ and supabase/functions-live/api-gateway/) and proved no direct provider fetch.

FINDING: Exactly 3 egresses, all POSTs to sibling Supabase functions via `${SUPABASE_URL}/functions/v1/...` with the service-role bearer:
- POST /v1/calls -> placeCall (index.ts:441) -> fetch outbound-calling @ index.ts:485
- POST /v1/sms -> sendSms (index.ts:537) -> fetch sms-messaging @ index.ts:560
- POST /v1/campaigns/:id/force-dispatch -> forceDispatch (index.ts:951) -> fetch call-dispatcher @ index.ts:970
- POST /v1/campaigns/:id/launch -> setCampaignStatus('active') (index.ts:361) is a DIRECT DB UPDATE (index.ts:363), NO egress.

VERDICT: api-gateway does NOT place calls directly. It only proxies to outbound-calling (calls) and call-dispatcher (dispatch). The provider string is forwarded as a body field (index.ts:500), never turned into a provider URL.

EVIDENCE: scoped grep of provider hostnames (retellai.com|telnyx.com|twilio.com|api.*) over each api-gateway subtree = "0 matches in 0 files". Scoped grep of fetch(/invoke primitives = exactly 3, at 485/560/970. The two subtrees are byte-identical (fc: no differences encountered for all 3 files each).

VALIDATION: full read of all 6 files in the subtrees + walked every branch of dispatch() (index.ts:151-219) against its handler.

CONFIDENCE: high. Did not check: deploy source (repo copies identical so conclusion holds), call-dispatcher/outbound-calling internals (separate nodes), deployed live bundle vs repo.

## Artifact

**Findings**

api-gateway has EXACTLY three outbound egresses; all three are HTTPS POSTs to OTHER Supabase edge functions in the same project (via `${SUPABASE_URL}/functions/v1/...`), authenticated with the service-role bearer. api-gateway NEVER talks to a telephony provider directly. Subtree inventory: each of supabase/functions/api-gateway/ and supabase/functions-live/api-gateway/ contains exactly 3 files (index.ts + _shared/api-auth.ts + _shared/utils.ts), and the two subtrees are byte-identical (fc reports 'no differences encountered', exit 0, for all three files). EGRESS 1 (POST /v1/calls): dispatch() line 199-202 routes POST /v1/calls -> placeCall (index.ts:441). placeCall's only egress is fetch(`${SUPABASE_URL}/functions/v1/outbound-calling`) at index.ts:485. EGRESS 2 (POST /v1/sms): dispatch() line 207-210 routes POST /v1/sms -> sendSms (index.ts:537). sendSms's only egress is fetch(`${SUPABASE_URL}/functions/v1/sms-messaging`) at index.ts:560. EGRESS 3 (POST /v1/campaigns/:id/force-dispatch): dispatch() line 194 routes force-dispatch -> forceDispatch (index.ts:951). forceDispatch's only egress is fetch(`${SUPABASE_URL}/functions/v1/call-dispatcher`) at index.ts:970. NO-EGRESS ROUTE (POST /v1/campaigns/:id/launch): dispatch() line 188 -> setCampaignStatus(rc,id,'active') (index.ts:361); it does a direct DB write only, `supabase.from('campaigns').update({status})` at index.ts:363, and returns. No fetch, no external egress. All other routes (leads, campaigns list/get/create/validate/live-stats/disposition-breakdown/retry-failed/dry-run/pre-launch-audit, calls list/get/stuck, sms list, phone-numbers(+health), system/stats, system/health-check, credits/balance, me, health) touch only the Supabase client (database egress to the project's own PostgREST) and never leave to a provider. VERDICT: api-gateway does NOT place calls directly. It only PROXIES: the call path is api-gateway -> outbound-calling (which is the function that actually holds api.retellai.com / api.telnyx.com), and the dispatch path is api-gateway -> call-dispatcher. The provider string ('retell'/'telnyx'/'twilio') is merely forwarded as a body field (index.ts:500) and is never dereferenced into a provider URL by api-gateway.

**evidence**

- supabase/functions/api-gateway/index.ts:199-202 — route block: `if (path === "/v1/calls") { if (method === "GET") return listCalls(rc); if (method === "POST") return placeCall(rc); }`
- supabase/functions/api-gateway/index.ts:441 — `async function placeCall(rc) {`
- supabase/functions/api-gateway/index.ts:485 — `const upstream = await fetch(`${SUPABASE_URL}/functions/v1/outbound-calling`, {` (headers carry `Authorization: Bearer ${SERVICE_KEY}`; body action:'create_call')
- supabase/functions/api-gateway/index.ts:207-210 — route block: `if (path === "/v1/sms") { if (method === "GET") return listSms(rc); if (method === "POST") return sendSms(rc); }`
- supabase/functions/api-gateway/index.ts:537 — `async function sendSms(rc) {`
- supabase/functions/api-gateway/index.ts:560 — `const upstream = await fetch(`${SUPABASE_URL}/functions/v1/sms-messaging`, {` (body action:'send_sms'); result returned at index.ts:580
- supabase/functions/api-gateway/index.ts:194 — route line: `if (action === "force-dispatch" && method === "POST") return forceDispatch(rc, id);`
- supabase/functions/api-gateway/index.ts:951 — `async function forceDispatch(rc, id) {`
- supabase/functions/api-gateway/index.ts:970 — `const upstream = await fetch(`${SUPABASE_URL}/functions/v1/call-dispatcher`, {` (body action:'dispatch', internal:true)
- supabase/functions/api-gateway/index.ts:188 — route line: `if (action === "launch" && method === "POST") return setCampaignStatus(rc, id, "active");`
- supabase/functions/api-gateway/index.ts:361-369 — setCampaignStatus: `const { data, error } = await rc.supabase.from("campaigns").update({ status }).eq(...)...;` then returns successResponse. No fetch.
- GREP (provider hosts, scoped): path=supabase/functions/api-gateway, regex `retellai\.com|telnyx\.com|twilio\.com|api\.retell|api\.telnyx|api\.twilio` -> 'matches: 0 in 0 files'. Same grep on supabase/functions-live/api-gateway -> 'matches: 0 in 0 files'.
- GREP (egress, scoped): path=supabase/functions/api-gateway, regex `fetch\(|XMLHttpRequest|axios|supabase\.functions\.invoke|\.invoke\(` -> 'matches: 3 in 1 files' at index.ts:485, 560, 970 (and NO supabase-js .invoke()). Identical result for supabase/functions-live/api-gateway.
- IDENTITY: `fc supabase/functions/api-gateway/index.ts supabase/functions-live/api-gateway/index.ts` -> 'FC: no differences encountered'; same for _shared/api-auth.ts and _shared/utils.ts. So the live copy mirrors the main copy exactly.
- supabase/functions/api-gateway/_shared/api-auth.ts — read in full; no fetch; only supabase client + `supabaseAdmin.rpc("touch_api_key")` (line 75) and audit insert (line 116) = DB egress only.
- supabase/functions/api-gateway/_shared/utils.ts — read in full; pure helpers (zod, CORS, error classes, in-memory rate-limit/cache/circuit-breaker). No fetch, no provider host.

**validation**

Two independent scoped greps (provider hostnames -> 0 matches; egress primitives -> exactly 3 matches at 485/560/970) over both api-gateway subtrees, plus a full read of all 6 files in the subtrees. fc byte-comparison confirms main and live subtrees are identical, so the enumeration holds for both. Every route in dispatch() (index.ts:151-219) was walked against its handler to confirm which leave the function.

**open_questions**

- Is the deployed 'live' api-gateway the repo's supabase/functions-live/api-gateway/ or supabase/functions/api-gateway/ copy? Repo copies are identical, so conclusion is the same either way, but the deploy source is unconfirmed.
- Downstream egress of outbound-calling (api.retellai.com / api.telnyx.com at functions/outbound-calling/index.ts:1271,1308,1422) and call-dispatcher was observed but is out of scope for this node; confirms api-gateway hands off rather than dialing itself.

**what_i_did_not_check**

- Whether api-gateway is referenced by any config (config.toml / supabase functions list) or invoked by other functions — I only inspected the api-gateway module itself.
- The deployed live bundle vs the repo copy — I read the repo files only, not the running edge function.
- call-dispatcher's own internals (whether IT places calls directly or proxies to outbound-calling) — separate node.
- outbound-calling's full egress set — only the provider-host grep lines were seen, not a line-by-line read.

**confidence**: high