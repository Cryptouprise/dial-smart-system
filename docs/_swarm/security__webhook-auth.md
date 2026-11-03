# security::webhook-auth

- status: completed
- tldr: All 4 webhooks verify signatures or are disabled; none accepts unsigned POST.

Webhook-auth review complete. All 4 webhooks verify a signature or are disabled; none accepts an arbitrary POST. Twilio HMAC-SHA1 verified (fail-closed, index.ts:422-439/488-497); Stripe HMAC-SHA256 verified w/ 300s replay window (fail-closed, stripe-webhook:298-321 + _shared/stripe-signature.ts); Retell HMAC-SHA256 verified, enforce default (fail-closed, retell-call-webhook:522-595 + _shared/contact-safety.ts:171-207); Telnyx has Ed25519 code but the function is hard-quarantined to 503 (172-195), so its verification is dead code and it carries an open TODO (117-119). Severity order: Telnyx > Twilio > Retell > Stripe.

## Artifact

**Findings**

All four webhooks either verify a cryptographic signature or are disabled before processing; NONE accepts an arbitrary unauthenticated POST. Verdicts: (1) twilio-sms-webhook = HMAC-SHA1 signature verified, fail-closed. (2) stripe-webhook = HMAC-SHA256 signature verified with replay window, fail-closed. (3) retell-call-webhook = HMAC-SHA256 signature verified, enforce-mode default, fail-closed. (4) telnyx-webhook = Ed25519 verification code exists but is DEAD CODE: the whole function is hard-quarantined (always returns 503 before reading the body/secret) because isTelnyxWebhookLifecycleCertified() returns false. Residual-risk ranking (highest first): Telnyx (disabled, latent fail-open branch + open TODO) > Twilio (correct, but depends on TWILIO_AUTH_TOKEN being set) > Retell > Stripe (strongest: replay window + constant-time + skew).

**evidence**

- twilio-sms-webhook/index.ts:422-439 verifyTwilioSignature: missing TWILIO_AUTH_TOKEN -> return false (424-427); missing x-twilio-signature -> false (429-432); HMAC-SHA1 over url+sorted(params) (387-401); constant-time compare (376-384). Enforced: index.ts:488-497 returns 403 before any DB access (verify placed at 488, payload validate at 499).
- telnyx-webhook/index.ts:172-174 isTelnyxWebhookLifecycleCertified() returns false; index.ts:185-195 returns 503 disabled before body/env/DB access. Ed25519 verifier at 120-170 (returns false if !signature||!timestamp 126-129, or !webhookSecret 130-133). Caller: 209-214 503 if secret unset, 217-223 401 on invalid, 225-235 5-min replay window. TODO 'Make this mandatory once the Telnyx public key is configured' at 117-119.
- retell-call-webhook/index.ts:522 verify mode default 'enforce'; 572-577 503 if not enforce; 578-583 503 if RETELL_WEBHOOK_SIGNING_KEY unset; 584-595 verify x-retell-signature then 401 on invalid; health_check path 528-567 requires service-role/user bearer. Verifier _shared/contact-safety.ts:171-207 HMAC-SHA256 over rawBody+timestamp_ms, 5-min tolerance 185-188, constant-time hex compare 203.
- stripe-webhook/index.ts:298-321: secret unset -> 500 (311-314); missing stripe-signature -> 400 (315-317); verifyStripeSignature -> 401 on invalid (318-321). Verifier _shared/stripe-signature.ts: HMAC-SHA256 of `${timestamp}.${payload}`, MAX_AGE 300s, future skew 60s, constant-time byte compare, secret unset -> false.
- supabase/config.toml:236-237 twilio verify_jwt=false; 242-245 stripe verify_jwt=false (comment notes signature required); 247-250 telnyx verify_jwt=false (comment: launch-quarantined); 274-275 retell verify_jwt=false. So all four are public routes that rely on their in-function auth, not the JWT gate.

**validation**

Read the exact verification and enforcement regions inline in all four index.ts files plus the two shared verifier modules (_shared/stripe-signature.ts, _shared/contact-safety.ts) and the relevant config.toml blocks. Confirmed for each: (a) is a signature/shared-secret checked, (b) is failure enforced (HTTP reject) vs logged-and-ignored, (c) is an unset secret fail-open or fail-closed. Cross-checked env var names (TWILIO_AUTH_TOKEN, STRIPE_WEBHOOK_SECRET, RETELL_WEBHOOK_SIGNING_KEY, WEBHOOK_SECRET_TELNYX) via grep.

**open_questions**

- Are the four secrets actually SET in the live Supabase project env? Not verifiable from repo (would need live access). If TWILIO_AUTH_TOKEN or STRIPE_WEBHOOK_SECRET is unset, those webhooks fail-closed (403/500) and stop ingesting rather than accepting unsigned traffic.
- Telnyx: when the quarantine is lifted, verifyTelnyxSignature's Ed25519 key handling (atob of WEBHOOK_SECRET_TELNYX as raw public key, no PEM/SPKI parsing) is correct against Telnyx's actual key format.
- Does any forged-but-signed Twilio/Stripe request have an RLS blast radius? Not assessed here.

**what_i_did_not_check**

- Other webhook-ish edge functions: call-tracking-webhook, ghl-webhook-trigger, ghl-batch-callback, slack-webhook, retell-inbound-webhook, retell-force-webhook, twilio-amd-webhook, twilio-inbound-handler, inbound-transfer-webhook, elite-email-mailgun-events, demo-sms-reply, ai-sms-processor - not inspected for auth (out of scope; twilio-inbound-handler is noted launch-quarantined at config.toml:252-255).
- Live Supabase env: which of the 4 secrets are actually configured (no live access).
- Whether candidateSignedUrls host/proto normalization in twilio-sms-webhook (405-419) could be abused to widen accepted URLs beyond the Twilio-signed URL (only matters if auth token leaks).
- Telnyx real key format vs the base64 raw-key decode at line 143.
- Downstream RLS/impact if a correctly-signed callback were replayed or spoofed by a party holding the provider secret.

**confidence**: high