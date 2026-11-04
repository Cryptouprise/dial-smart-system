# ce-live-stripe-webhook

- status: completed
- tldr: stripe-webhook LIVE audit: verify_jwt=false (config.toml:245); no gate in LIVE/main; main==live byte-identical; Stripe signature mandatory before any write (index.ts:298-320), so anon cannot write.

RESEARCH-ONLY audit of LIVE stripe-webhook complete (node ce-live-stripe-webhook).

(a) VERIFIED: supabase/config.toml [functions.stripe-webhook] line 242, verify_jwt = false line 245 (exact).

(b) VERIFIED: No certification gate in LIVE bytes. findstr certif|quarantin|gate|LAUNCH over functions-live/stripe-webhook/index.ts + functions-live/_shared/stripe-signature.ts = 0 matches (exit 1). Main source supabase/functions/stripe-webhook/index.ts also has no gate string. Corroborates LIVE-VS-MAIN-GATES.md:38 ("Ungated on main (no match): ... stripe-webhook"). NEW: main and LIVE index.ts are BYTE-IDENTICAL (SHA256 0DEDE7BB...A4E6F0EA, 25190 bytes/599 lines) and _shared/stripe-signature.ts is byte-identical too (0475249E...C48F4). So stripe-webhook is NOT a live-stale case; both sides match and neither is gated.

(c) VERIFIED: Signature is MANDATORY before any write. index.ts:298 secret; :307 raw body; :308 stripe-signature header; :311-314 no secret -> 500 {"error":"Webhook not configured"} @313 (fail-closed); :315-317 no header -> 400 {"error":"Missing signature"} @316; :318 await verifyStripeSignature(...); :319-321 invalid -> 401 {"error":"Invalid signature"} @320. createClient(service role) only at :334, after the gate. stripe-signature.ts:31 verifyStripeSignature = HMAC-SHA256 over `${timestamp}.${payload}` (:64-79), constant-time compare (:19-29,:81-88), fail-closed catch (:89-91), 300s/60s replay window (:1-2,:59-61). Side effects only after a valid signature: stripe_events claim :266; add_credits :382/:417; organizations updates :358/:469/:511/:564; organization_credits.auto_recharge_enabled=false :571. An unauthenticated caller who cannot forge the signature CANNOT cause any write: every write is downstream of :318/:319; no DB client exists before :334.

Per-function row:
| stripe-webhook | Gate on main: NONE (LIVE-VS-MAIN-GATES.md:38 ungated; grep 0 hits) | Live has gate: NO | Evidence: SHA256 main==live index.ts 0DEDE7BB...; _shared identical 0475249E...; sig-verify before writes | 599/599 lines | main == live (byte-identical) |

Open follow-ups: whether STRIPE_WEBHOOK_SECRET is set in the deployed env; whether add_credits RPC idempotency truly blocks a within-window replay double-credit (credit path :382/:417 is NOT wrapped in withEventClaim); deployed verify_jwt == repo config (no platform call made, research-only).

## Artifact

**Findings**

(a) config.toml: [functions.stripe-webhook] at line 242, verify_jwt = false at line 245 (exact, confirmed). (b) NO certification gate in LIVE bytes: findstr for certif|quarantin|gate|LAUNCH over supabase/functions-live/stripe-webhook/index.ts + functions-live/_shared/stripe-signature.ts returned 0 matches (exit 1). Main source supabase/functions/stripe-webhook/index.ts likewise has NO gate string (only secret/signature hits). This corroborates LIVE-VS-MAIN-GATES.md:38 which lists stripe-webhook under 'Ungated on main (no match)'. ADDITIONAL: main index.ts and LIVE index.ts are BYTE-IDENTICAL (SHA256 0DEDE7BBAD1A903E97FE6FC033BA975613CE37D417D23C55F610C224A4E6F0EA, both 25190 bytes/599 lines), and _shared/stripe-signature.ts is byte-identical between main and live (SHA256 0475249EC8E4C253E8184D0F59C8220BBAD2B9267DD6E79D4450D6A44C7C48F4). So this function is not a main-newer/live-stale case; both sides match and neither is gated. (c) Anon reachability in LIVE: the handler MANDATORILY verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET BEFORE any DB client is created or any write occurs. Chain: index.ts:298 reads STRIPE_WEBHOOK_SECRET; :307 reads raw body; :308 reads stripe-signature header; :311-314 missing secret -> 500 {error:'Webhook not configured'} (@313, fail-closed); :315-317 missing header -> 400 {error:'Missing signature'} (@316); :318 calls verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET); :319-321 invalid -> 401 {error:'Invalid signature'} (@320). createClient(service role) happens ONLY at :334, after the gate; JSON parse/shape validation at :323-332. stripe-signature.ts:31 verifyStripeSignature: secret guard returns false (@37-39); parses header, requires exactly one t= and >=1 v1= (@41-55); timestamp validity (@57-62); HMAC-SHA256 over `${timestamp}.${payload}` with the secret key (@64-79); constant-time compare over all v1 values (@19-29, @81-88); any exception -> false (@89-91). Replay window: 300s past / 60s future (@1-2, @59-61). SIDE EFFECTS after a valid signature only: index.ts:266 INSERT public.stripe_events (idempotency claim, 23505=duplicate) inside withEventClaim @258; :358 update organizations.stripe_customer_id (subscription checkout); :382 rpc add_credits (credit write, idempotency_key stripe_<event.id>); :417 rpc add_credits (auto-recharge); :469 update organizations (invoice.paid restore/clear grace); :511 update organizations (past_due + grace window); :564 update organizations (subscription status/plan/billing_enabled/grace); :571 update organization_credits.auto_recharge_enabled=false (subscription.deleted). CAN AN UNAUTHENTICATED CALLER WHO CANNOT FORGE THE SIGNATURE CAUSE ANY WRITE? NO. Every write path is downstream of the :318/:319 gate; the only pre-gate responses are OPTIONS ok (:293-295), 500 config (:313), 400 missing sig (:316), 401 invalid (:320), 400 invalid JSON (:328), 400 malformed (:331). No supabase client exists before :334. So an anon caller without a valid HMAC cannot read or write anything.

**evidence**

- supabase/config.toml:242-245 -> [functions.stripe-webhook] ... verify_jwt = false (line 245)
- supabase/functions-live/stripe-webhook/index.ts:298 STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
- supabase/functions-live/stripe-webhook/index.ts:307-308 body=await req.text(); signature=req.headers.get('stripe-signature')
- supabase/functions-live/stripe-webhook/index.ts:311-314 missing secret -> jsonResponse({error:'Webhook not configured'},500) @313
- supabase/functions-live/stripe-webhook/index.ts:315-317 missing signature -> jsonResponse({error:'Missing signature'},400) @316
- supabase/functions-live/stripe-webhook/index.ts:318 isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
- supabase/functions-live/stripe-webhook/index.ts:319-321 invalid -> jsonResponse({error:'Invalid signature'},401) @320
- supabase/functions-live/stripe-webhook/index.ts:334 createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) (first DB client, after gate)
- supabase/functions-live/_shared/stripe-signature.ts:31-91 verifyStripeSignature (HMAC-SHA256, constant-time @19-29/@81-88, fail-closed @89-91)
- supabase/functions-live/_shared/stripe-signature.ts:1-2,59-61 replay window 300s past / 60s future
- supabase/functions-live/stripe-webhook/index.ts:258-289 withEventClaim INSERT stripe_events @266, release on failure @280-283
- supabase/functions-live/stripe-webhook/index.ts:382,417 rpc('add_credits') credit writes; :358,:469,:511,:564 organizations updates; :571 organization_credits.auto_recharge_enabled=false
- SHA256 main index.ts == live index.ts == 0DEDE7BBAD1A903E97FE6FC033BA975613CE37D417D23C55F610C224A4E6F0EA (25190 bytes each)
- SHA256 main _shared/stripe-signature.ts == live _shared/stripe-signature.ts == 0475249EC8E4C253E8184D0F59C8220BBAD2B9267DD6E79D4450D6A44C7C48F4
- findstr certif|quarantin|gate|LAUNCH over live index.ts+stripe-signature.ts -> 0 matches (exit 1)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:38 lists stripe-webhook among functions 'Ungated on main (no match)'

**validation**

Read all 599 lines of LIVE index.ts and 92 lines of stripe-signature.ts; grep for gate vocabulary (certif/quarantin/gate/not_configured/LAUNCH) returned 0 hits in LIVE bytes; grep main source confirmed no gate string; PowerShell Get-FileHash proved main==live byte-identity for both files; read config.toml lines 230-255 confirming verify_jwt=false at line 245. Verified the gate (line 318/319) precedes the first createClient (line 334) and every write site (266,358,382,417,469,511,564,571) by inspecting line order.

**open_questions**

- Is STRIPE_WEBHOOK_SECRET actually set in the deployed Supabase env? Repo cannot show this; if unset the handler 500s fail-closed (@313) rather than processing.
- Are the live-processed writes truly idempotent under replay? The credit path (@382/@417) is NOT wrapped in withEventClaim; it relies on the add_credits RPC's p_idempotency_key (stripe_<event.id>). Within the 300s replay window a captured valid signature could be resent; whether add_credits dedupes is a Postgres-side fact not verifiable from these files.
- Does the deployed function's verify_jwt actually equal the repo config.toml value (deployment/config drift)? Verified only the repo file.

**what_i_did_not_check**

- The add_credits / add_credits idempotency implementation in Postgres (would need DB/migration defs to confirm double-credit protection on replay).
- The actual deployed Supabase platform state: whether verify_jwt=false is what is live, whether STRIPE_WEBHOOK_SECRET is set, and the deployed function version.
- The staging copy under docs/wholesale/phases/staging/p6/supabase/functions/stripe-webhook (separate tree; not diffed).
- Migration files (e.g. 20261029160000_billing_lock.sql) and the trg_guard_organization_billing_columns trigger behavior.
- Runtime behavior: no live HTTP call was made (research-only).

**confidence**: high