# sr::telephony-webhooks

- status: completed
- tldr: 12 webhook SR audit done: active functions all signature-gated; 4 legacy handlers safe-by-disable with latent service-role risk

Service-role auth audit of 12 public telephony webhooks COMPLETE (dial-smart-system/supabase/functions). Verdict: no active unauthenticated service-role path found; the correct control (webhook signature/shared secret) is implemented on every function that is actually live.

GOOD (signature enforced before service-role DB use): retell-call-webhook (:584-595), twilio-sms-webhook (:422-439/:488), twilio-voice-status (:34-37), twilio-voice-transcription (:36-38), twilio-voice-twiml (:65-67), telnyx-webhook (:120-170/:217-234). Plus two non-vendor functions enforcing auth in-function: retell-force-webhook (user JWT, :41-53) and retell-reconciler (service-role bearer or cron token, :268-280).

SAFE-BY-DISABLE, LATENT RISK (hardcoded false cert flag / unconditional early 503; service-role bodies below are dead, unauthenticated code): twilio-amd-webhook (:32-40, body writes from client queue_item_id/broadcast_id params :55-56), call-tracking-webhook (:134-142), retell-inbound-webhook (:43-51), inbound-transfer-webhook (:126-134; its x-webhook-secret check :146-155 is OPTIONAL/fail-open if env unset). Re-enabling any of these without adding the signature check would re-expose an unauthenticated service-role write.

Cross-cutting FACT: nowhere is the service role used for a DB read/write before signature/auth is checked. verify_jwt=false on all 12 is correct for vendor callbacks.

Validation: opened each of the 12 index.ts files plus _shared/twilio.ts and _shared/twilio-signature.ts and config.toml verify_jwt entries; every claim is cited to file:line. Read-only; no secrets printed; no live calls.
Blockers: none. Follow-ups: confirm whether the disable flags are tracked temporary containment or permanent; confirm INBOUND_TRANSFER_WEBHOOK_SECRET is set in prod; extend the same review to twilio-inbound-handler/twilio-dtmf-handler/voice-call-events/voice-call.

## Artifact

**Findings**

AUDIT: 12 telephony webhooks in C:/Users/charl/dial-smart-system/supabase/functions (contract docs/dial-smart-app-map.md:159-176). FACT unless noted. All use verify_jwt=false (correct for vendor callbacks), so the valid control is a webhook signature/shared secret.

retell-call-webhook | SR=YES (index.ts:42,:504) | SIG=YES enforce :572 mode=='enforce', :578 key present, :584-588 verifyRetellWebhookSignature on X-Retell-Signature, :589-595 401 | GOOD. Forge risk LOW: metadata user/campaign/lead/org/queue checked vs owning call_logs row (:645-660); idempotency-claimed (:614-628).

retell-inbound-webhook | SR=read :55 but UNREACHABLE | SIG=NONE | SAFE-BY-DISABLE: 503 at :43-51 before service-role/DB, rest dead code. Forge risk NONE while disabled.

retell-force-webhook | SR=YES (:35,:47) | SIG=N/A (admin) | GOOD double-gated: hard-disabled :9-11,:20-30; if re-enabled needs USER JWT :41-53 (rejects empty/service-role token), ownership :70-81. Forge risk LOW.

retell-reconciler | SR=YES (:260,:283) | SIG=N/A (internal cron/service) | GOOD: :268 constant-time bearer==SERVICE_ROLE_KEY or :269-273 cron token; :275-280 reject else; signs outbound :205,:214. Forge risk LOW.

twilio-sms-webhook | SR=YES (:460,:464) | SIG=YES :422-439 HMAC-SHA1 URL+params vs X-Twilio-Signature, :488 check,:490 403 no DB | GOOD; nit: client built :464 before :488 check but first read :540. Tenant=owner of To number :540. Forge risk LOW.

twilio-voice-status | SR=YES (:41,:43) | SIG=YES :34-37 ->403 BEFORE service-role DB | GOOD. Forge risk LOW.

twilio-voice-transcription | SR=YES (:52,:54) | SIG=YES :36-38 ->403 BEFORE service-role | GOOD. Forge risk LOW.

twilio-voice-twiml | SR=YES (:79,:81) | SIG=YES :65-67 ->403 <Reject/> | GOOD. Params only load a row (:86-96); identity==row user/teammate (:124-133); dial target from ROW (:153-154). Forge risk LOW.

twilio-amd-webhook | SR=YES (:44) | SIG=NONE | SAFE-BY-DISABLE, LATENT RISK: 503 :32-40 before DB; dead body :42-223 writes service-role from CLIENT queue_item_id/broadcast_id params (:55-56). Contained only by the early return. verify_jwt=false (:338-339).

call-tracking-webhook | SR=YES (:146,:152) | SIG=NONE | SAFE-BY-DISABLE: 503 :134-142; dead unauthenticated legacy body :144+. verify_jwt=false (:239-240).

telnyx-webhook | SR=YES (:249,:255) | SIG=YES :120-170 Ed25519 over timestamp|rawBody with WEBHOOK_SECRET_TELNYX, enforced :217-223 ->401, replay :226-234, 503 if key unset :209-214 | ALSO hard-disabled :172-195. Forge risk LOW.

inbound-transfer-webhook | SR=YES (:138,:157) | SIG=PARTIAL/fail-open :146-155 x-webhook-secret vs env ONLY if set (unset => no check) | ALSO hard-disabled :126-134. Forge risk latent.

CROSS-CUTTING: (a) real signature path: retell-call-webhook, twilio-voice-status/-transcription/-twiml, twilio-sms-webhook, telnyx-webhook. (b) inert via hardcoded false flag or early 503: twilio-amd-webhook, call-tracking-webhook, retell-inbound-webhook; safe at rest but service-role bodies remain dead code, and the safety property is a boolean literal, not a verification routine. Nowhere is service role used for DB read/write BEFORE signature/auth.

**evidence**

- retell-call-webhook/index.ts:42,504 (SR); :572,578,584-595 (sig enforce)
- config.toml:274-275 retell-call-webhook verify_jwt=false
- retell-inbound-webhook/index.ts:43-51 (disabled 503), :55 (SR unreachable) ; config.toml:288-289
- retell-force-webhook/index.ts:9-11,20-30 (disabled), :35,47 (SR), :41-53,70-81 (user JWT+ownership) ; config.toml:177 verify_jwt=true
- retell-reconciler/index.ts:260,283 (SR), :268-280 (auth), :205,214 (outbound signing) ; config.toml:277-281
- twilio-sms-webhook/index.ts:460,464 (SR), :422-439,488,490 (sig), :540 (tenant) ; config.toml:236-237
- twilio-voice-status/index.ts:41,43 (SR), :34-37 (sig)
- twilio-voice-transcription/index.ts:52,54 (SR), :36-38 (sig)
- twilio-voice-twiml/index.ts:79,81 (SR), :65-67 (sig), :86-96,124-133,153-154 (row-bound)
- twilio-amd-webhook/index.ts:32-40 (disabled), :44 (SR), :55-56 (forgeable params) ; config.toml:338-339
- call-tracking-webhook/index.ts:134-142 (disabled), :146,152 (SR) ; config.toml:239-240
- telnyx-webhook/index.ts:249,255 (SR), :120-170,217-234 (Ed25519+replay), :172-195 (disabled) ; config.toml:247-250
- inbound-transfer-webhook/index.ts:126-134 (disabled), :138,157 (SR), :146-155 (optional secret) ; config.toml:335-336
- _shared/twilio.ts:286-307 validateTwilioWebhook ; _shared/twilio-signature.ts:26-57 verifyTwilioSignature

**validation**

Read all 12 index.ts files (grep for SUPABASE_SERVICE_ROLE_KEY + signature tokens, then opened the auth-relevant line ranges) plus _shared/twilio.ts:286-307 validateTwilioWebhook, _shared/twilio-signature.ts:26-57 verifyTwilioSignature, and config.toml verify_jwt entries. Every claim carries a file:line read directly from source. No secrets printed; no live system touched; no repo writes.

**open_questions**

- Are the hardening booleans/early-return disables intended as temporary launch-containment with a tracked re-enable checklist, or permanent? No linked gate/ticket found.
- Is INBOUND_TRANSFER_WEBHOOK_SECRET set in production? If unset, the shared-secret branch is dead and re-enabling relies solely on the disabled flag.
- Does retell-call-webhook's X-DialSmart-Reconciliation header path (index.ts:514) remain fully covered by the same :584 signature check?

**what_i_did_not_check**

- Did not execute functions or live-probe the deployed Supabase URL; hardening flags read from source only.
- Did not read retell-call-webhook lines 120-499 and 680-2952 (post-signature side effects) exhaustively; a deep forged-metadata path was not fully traced.
- Did not audit other telephony handlers seen in grep (twilio-inbound-handler, twilio-dtmf-handler, voice-call-events, voice-call).
- Did not confirm prod env values (RETELL_WEBHOOK_VERIFY_MODE, WEBHOOK_SECRET_TELNYX, TWILIO_AUTH_TOKEN, INBOUND_TRANSFER_WEBHOOK_SECRET); source defaults are fail-closed the safe way.
- Did not verify config.toml is the deployed source of truth vs secrets overrides.

**confidence**: high