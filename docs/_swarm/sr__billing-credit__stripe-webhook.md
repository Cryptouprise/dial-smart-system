# sr::billing-credit::stripe-webhook

- status: completed
- tldr: stripe-webhook: signature verified (line 318) before service-role client (334) and all DB writes; no 503 disable gate.

AUDIT COMPLETE: supabase/functions/stripe-webhook/index.ts | uses-service-role=YES | disabled=NO(no 503) | caller-verified=VERIFIED (signature checked). Signature gate at lines 311-321 (verifyStripeSignature from _shared/stripe-signature.ts, called line 318) runs BEFORE createClient with the service-role key at line 334 and BEFORE every DB write. SUPABASE_SERVICE_ROLE_KEY read at line 300, used at line 334. No hardcoded 503/disable gate present. Authenticity rests solely on HMAC signature verification (verify_jwt=false per header comment line 43; no user JWT since Stripe calls it).

## Artifact

**Findings**

stripe-webhook/index.ts verifies the Stripe webhook signature BEFORE creating the service-role client and BEFORE any DB write. VERIFIED (signature checked) via _shared/stripe-signature.ts, not stripe.webhooks.constructEvent. uses-service-role = YES (SUPABASE_SERVICE_ROLE_KEY read + createClient); disabled gate + 503 = NOT PRESENT in this file; caller-verified = authenticity established ONLY by signature verification (verify_jwt=false, no user JWT).

**evidence**

- supabase/functions/stripe-webhook/index.ts:48 imports { verifyStripeSignature } from ../_shared/stripe-signature.ts
- index.ts:307 const body = await req.text(); and :308 const signature = req.headers.get('stripe-signature')
- index.ts:311-314 if (!STRIPE_WEBHOOK_SECRET) return jsonResponse({error:'Webhook not configured'}, 500)
- index.ts:315-317 if (!signature) return jsonResponse({error:'Missing signature'}, 400)
- index.ts:318 const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
- index.ts:319-321 if (!isValid) return jsonResponse({error:'Invalid signature'}, 401)  <-- gate BEFORE any DB write
- index.ts:334 const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)  <-- service client created AFTER signature gate
- index.ts:300 const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(...); :302 guard; :334 client
- index.ts:264-266 first DB mutation only inside withEventClaim (stripe_events insert), called at :355,:456,:497,:541 - all after gate
- index.ts:382 supabase.rpc('add_credits') - after gate
- index.ts:43 header comment: deploy with verify_jwt = false
- no 503 and no constructEvent anywhere in the file (findstr 503 -> no match; findstr constructEvent -> no match)
- helper _shared/stripe-signature.ts:31 verifyStripeSignature(payload, signatureHeader, secret, nowSeconds); :59-62 enforces 300s max age + 60s future skew; :66-79 HMAC-SHA256 over `${timestamp}.${payload}`; :85 constant-time compare

**validation**

Read index.ts in full (599 lines) and _shared/stripe-signature.ts in full (92 lines). findstr confirmed zero occurrences of '503' and 'constructEvent'. Ordering confirmed by line numbers: signature gate at 311-321 precedes createClient(334) and all DB writes (withEventClaim at 355/456/497/541, add_credits at 382/417).

**open_questions**

- supabase/config.toml [functions.stripe-webhook] verify_jwt=false is asserted in the file header comment (line 43) but the config.toml itself was not read in this node; if verify_jwt were true, Stripe calls (no JWT) would be rejected before reaching the handler - worth a one-line confirm.
- No hardcoded disable gate / 503 exists in this file; if the fleet expects an ENVIRONMENT/disable kill-switch, it lives elsewhere or is absent from this function.

**what_i_did_not_check**

- supabase/config.toml verify_jwt setting for this function (only the header comment asserts it).
- Other webhook files (e.g. functions-live/stripe-webhook/index.ts) referenced in the header as the prior byte-exact source.
- The add_credits RPC definition and stripe_events table/RLS, and whether service_role is required vs. the guard trigger.

**confidence**: high