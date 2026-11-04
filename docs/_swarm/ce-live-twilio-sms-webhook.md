# ce-live-twilio-sms-webhook

- status: completed
- tldr: twilio-sms-webhook: verify_jwt=false; live UNGATED + Twilio sig verification enforced (anon only OPTIONS); doc's main gate @316 lives in Codex tree, before sig, no sig check

DONE: audited LIVE twilio-sms-webhook (verify_jwt, gates, anon reachability, signature validation).
TOUCHED: none (research only).
EVIDENCE: fc /b working-copy vs live snapshot = 'no differences' (1706 lines); findstr gates on live = none; config.toml:236-237; live L449-497, L385-439; gated-main L307-321.
RESULT: (a) verify_jwt=false (config.toml:237 under [functions.twilio-sms-webhook] @236). (b) Live has NO gate (0 matches CERTIFIED/UNSIGNED/503/disabled; only return-false in signature helpers L380/426/431/438). The doc's main gate UNSIGNED_WEBHOOK_NOT_CERTIFIED@316 is NOT in repo supabase/functions/twilio-sms-webhook/index.ts (byte-identical to live); it lives in the Codex work tree (1891 lines) as an unconditional 503 at L313-321 (error_code L316), placed before parse/signature and with NO Twilio signature check at all => main's gate is before signature verification. (c) Live anon/anon-key reachability: OPTIONS 200 no-op (L451-455); all else 403 at L490-496 after failing verifyTwilioSignature (L422-439, invoked L488) => no DB writes/egress for unauthenticated callers. Twilio signature validation DOES exist in live. Side effects (post-valid-signature only): conversation insert L586, message insert L610-626, disposition-router fetch L651-673, lead update L687-700, sms-messaging send_sms fetch L1642-1659.
Row: twilio-sms-webhook | verify_jwt=false(config.toml:237) | gate_in_live=NO | main_gate=UNSIGNED_WEBHOOK_NOT_CERTIFIED@316 (Codex tree; before sig) | anon-reachable=OPTIONS only (L451-455; no side effects); POST->403 (L490) | side effects=gated behind valid Twilio signature.
COULD_NOT: verify via git (git ops timed out); HTTP-probe live.
CONFIDENCE: high.

## Artifact

**Findings**

(a) verify_jwt for twilio-sms-webhook = false. Exact lines: supabase/config.toml:236 `[functions.twilio-sms-webhook]` and :237 `verify_jwt = false`. (b) LIVE bytes contain NO certification gate: zero matches for NOT_CERTIFIED / UNSIGNED / CERTIFIED / 'status: 503' / 'disabled'. Only `return false` sites are inside signature helpers (L380 timingSafeEqualStrings, L426/431/438 verifyTwilioSignature). Live is UNGATED. (b-cont) The doc's main gate UNSIGNED_WEBHOOK_NOT_CERTIFIED@316 (LIVE-VS-MAIN-GATES.md:35) does NOT exist in repo supabase/functions/twilio-sms-webhook/index.ts: that file is BYTE-IDENTICAL to the live snapshot (fc /b = 'no differences', both 1706 lines). The gated main lives in a different tree: C:/Users/charl/Documents/Codex/2026-07-11/github-plugin-github-openai-curated-remote-2/work/dial-smart-system/supabase/functions/twilio-sms-webhook/index.ts (1891 lines; doc said 1892). There the gate is an UNCONDITIONAL 503 JSON response at L313-321 (error_code at L316) inside serve() right after the OPTIONS branch and BEFORE the try{} block, so before parsing, before any signature check, and before validateTwilioPayload@357. That gated main has NO Twilio signature verification at all. (c) Live Twilio signature validation IS present and enforced: computeTwilioSignature L387-401, candidateSignedUrls L405-419, verifyTwilioSignature L422-439 (fail-closed 403 when TWILIO_AUTH_TOKEN unset), invoked L488-497 before any DB access. Anon/anon-key reachability in LIVE: OPTIONS -> 200 empty response with corsHeaders (L451-455), no side effects; all other methods parse (L465-482) then verifyTwilioSignature (L484-488) and, without a valid X-Twilio-Signature (needs the auth token), return 403 at L490-496 with NO DB writes and NO egress. So NO side-effecting action is anon-reachable.

**evidence**

- supabase/config.toml:236-237
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:449-455 (serve + OPTIONS)
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:465-497 (parse / signature-verify / 403)
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:385-439 (compute + verifyTwilioSignature)
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:586,610-626 (conversation/message inserts)
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:651-673 (fetch disposition-router), 687-700 (lead update)
- supabase/functions-live/twilio-sms-webhook/twilio-sms-webhook/index.ts:1642-1659 (fetch sms-messaging send_sms)
- C:/Users/charl/Documents/Codex/2026-07-11/github-plugin-github-openai-curated-remote-2/work/dial-smart-system/supabase/functions/twilio-sms-webhook/index.ts:307-321 (gated main: serve/OPTIONS/503, error_code L316)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:35,55 (doc claim)
- fc /b: 'no differences encountered' between working-copy index.ts and live snapshot index.ts

**validation**

fc /b byte compare of working-copy vs live snapshot = identical (1706 lines). findstr on live for CERTIFIED/503/UNSIGNED = none; for disabled/status:503/return false = only L380/426/431/438. config.toml 236-237 and gated-main L307-321 read directly.

**open_questions**

- Why is repo supabase/functions/twilio-sms-webhook/index.ts byte-identical to live (no gate) when LIVE-VS-MAIN-GATES.md describes main as the 1891/1892-line gated version? Which tree is authoritative?
- Is TWILIO_AUTH_TOKEN set in Supabase project emonjusymdripmkvtttc? If unset, live 403s ALL requests including genuine Twilio callbacks.

**edge_cases_considered**

- TWILIO_AUTH_TOKEN unset => fail-closed 403 for every request (L424-427)
- MMS empty body allowed (L519-521)
- Duplicate Twilio retries de-duped by MessageSid (L591-596)
- Multi-tenant number ownership: refuses to guess tenant on 0 or >1 owners (L546-557)
- Candidate signed URLs cover x-forwarded-proto/host (L405-419)

**what_i_did_not_check**

- Could not verify repo git HEAD blob: all git commands exceeded 90s-3min timeouts on this repo. Working-copy==live rests on fc /b, not git.
- Did not enumerate all parallel Codex work-copy trees (pr69-merge, observer-control-plane, operator-command-center, provider-binding-center, solar-exit-campaign-brief, elite-solar-supervised-test); grep showed each with the same gate at L316, assumed identical.
- Did not HTTP-probe the live function (research-only; no live calls).
- Did not inspect sms-messaging/disposition-router internals or confirm the live TWILIO_AUTH_TOKEN env is actually set.
- Body parsing (L465-482) runs before signature verification; did not assess DoS/size exposure of parsing unauthenticated bodies.

**confidence**: high