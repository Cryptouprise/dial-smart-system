# ce-wh-stripe

- status: completed
- tldr: stripe-webhook: CORS *@51, Stripe HMAC signature auth@318 blocks anon (no), service-role db write after guard

FUNC | cors_wildcard=yes@51 | in_func_auth=yes@318 | auth_kind=signature | anon_reachable=no | priv_side_effect=service-role-db-write | note=if (!isValid) return jsonResponse({ error: "Invalid signature" }, 401);

EVIDENCE
supabase/functions/stripe-webhook/index.ts:51  "Access-Control-Allow-Origin": "*",
supabase/functions/stripe-webhook/index.ts:315-321  if (!signature) { return jsonResponse({ error: "Missing signature" }, 400); } const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET); if (!isValid) { return jsonResponse({ error: "Invalid signature" }, 401); }
supabase/functions/stripe-webhook/index.ts:334  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
supabase/functions/_shared/stripe-signature.ts:59  if (nowSeconds - timestamp > STRIPE_SIGNATURE_MAX_AGE_SECONDS) return false;
supabase/functions/_shared/stripe-signature.ts:85  matched = constantTimeEqualBytes(expected, supplied) ? true : matched;
supabase/functions/_shared/utils.ts:12  'Access-Control-Allow-Origin': '*',


## Artifact

**Findings**

FUNC | cors_wildcard=yes@51 | in_func_auth=yes@318 | auth_kind=signature | anon_reachable=no | priv_side_effect=service-role-db-write | note=if (!isValid) return jsonResponse({ error: "Invalid signature" }, 401);

1. CORS: wildcard ACAO '*' set INLINE in stripe-webhook/index.ts:51 (local corsHeaders, not _shared/utils.ts). Also Access-Control-Allow-Headers at L52 includes stripe-signature. Every response spreads corsHeaders via jsonResponse (L89-94); OPTIONS preflight returns 'ok' at L293-295.
2. In-function auth: REAL rejection. L308 reads stripe-signature header; L315-317 no signature -> 400; L318 verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET); L319-321 !isValid -> 401. Missing secret L311-314 -> 500 (fails closed). verifyStripeSignature (stripe-signature.ts:31-92) does HMAC-SHA256 over `${timestamp}.${payload}`, requires exactly one t=, >=1 v1=, 5-min max age (L59), 60s future skew (L60), constant-time compare (L19-29); returns false on any failure.
3. auth_kind: signature (Stripe HMAC-SHA256 webhook signature).
4. anon_reachable: no. A browser with only the public anon key cannot forge the HMAC (needs STRIPE_WEBHOOK_SECRET, server-side secret); all privileged paths sit after the L319 guard.
5. priv_side_effect: service-role-db-write. createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) at L334; writes organizations (L358/469/511/564), stripe_events claim insert/delete (L266/281), rpc add_credits (L382/417). All reached only AFTER signature valid.

Caveat (not a finding against the guard, but true): reachable side effects also require a valid Stripe-signed body, so anon browser cannot trigger them; the wildcard CORS is harmless here since the auth is a signature not a browser session.

**evidence**

- supabase/functions/stripe-webhook/index.ts:51  "Access-Control-Allow-Origin": "*",
- supabase/functions/stripe-webhook/index.ts:315-321  if (!signature) { return jsonResponse({ error: "Missing signature" }, 400); }  const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET); if (!isValid) { return jsonResponse({ error: "Invalid signature" }, 401); }
- supabase/functions/stripe-webhook/index.ts:334  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
- supabase/functions/stripe-webhook/index.ts:300  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
- supabase/functions/_shared/stripe-signature.ts:59  if (nowSeconds - timestamp > STRIPE_SIGNATURE_MAX_AGE_SECONDS) return false;
- supabase/functions/_shared/stripe-signature.ts:85  matched = constantTimeEqualBytes(expected, supplied) ? true : matched;
- supabase/functions/stripe-webhook/index.ts:382-388  await supabase.rpc("add_credits", { p_organization_id: organizationId, p_amount_cents: totalCredits, ...
- supabase/functions/_shared/utils.ts:12  'Access-Control-Allow-Origin': '*',

**validation**

Read all three files end-to-end (stripe-webhook/index.ts 599 lines, _shared/stripe-signature.ts 92 lines, _shared/utils.ts 568 lines). Confirmed the guard order in serve() handler: OPTIONS (L293) -> read body/signature (L307-308) -> secret-present check (L311) -> signature-present check (L315) -> verifyStripeSignature (L318) -> 401 (L319) -> JSON parse (L324) -> service-role client created L334 -> all DB writes. No privileged write occurs before L334, and L334 is only reached after L319 passes.

**open_questions**

- config.toml verify_jwt=false not re-verified in this read pass (out of the three assigned files); hint states verify_jwt=false, and findings do not depend on it since in-function signature auth is the guard.
- STRIPE_WEBHOOK_SECRET value/currency not checked (secret contents not read by design).

**what_i_did_not_check**

- config.toml [functions.stripe-webhook] verify_jwt value (not in assigned file set)
- Live deployed functions-live/stripe-webhook/index.ts byte-equivalence with this source
- Whether Supabase platform-level (gateway) auth adds anything beyond verify_jwt

**confidence**: high