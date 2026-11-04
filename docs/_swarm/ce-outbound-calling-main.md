# ce-outbound-calling-main

- status: completed
- tldr: outbound-calling: consent/DNC/global-stop/calling-hours re-checked at 1808 before egress 1811; credit only pre-egress-earlier; verify_jwt=false, not launch-quarantined.

RESEARCH ONLY audit of supabase/functions/outbound-calling/index.ts.

Egress = index.ts:1811 POST `${baseUrl}/create-phone-call`, immediately preceded by guard index.ts:1808 `await enforceFinalBoundary();`.

Gate re-check status:
1. Consent - RE-CHECKED pre-egress (folded into evaluate_contact_stop at 653; via enforceFinalBoundary at 809).
2. DNC - RE-CHECKED pre-egress (leads.do_not_call 668-678 + dnc_list 685-691; via 809). skipDncCheck ignored at 683.
3. Global/contact stop - RE-CHECKED pre-egress (evaluate_contact_stop 653-665; via 809).
4. Calling hours - RE-CHECKED pre-egress (assertCallingHoursAllowed 765-790; via 810; also 830-880).
5. Credit balance - NOT re-checked pre-egress; checked once earlier (check_credit_balance 950-954, reserve_credits 1007-1016; block ends 1043). Only the reservation hold protects; no credit RPC between 1043 and 1811.

Auth: platform verify_jwt DISABLED (config.toml:124); enforced in-function (401 no header 188-200; service-role bypass 220/227; getUser 240-257).
Quarantine: NOT launch-quarantined; only early 503 is the Telnyx provider gate 295-305. Retell egress is live.

Validation: read of index.ts 169-1043, 1258-1330, 1780-1900 + config.toml; findstr confirmed enforceFinalBoundary call sites = 1269/1306/1808 and egress literal at 1811.
Blockers: none. Follow-up: verify deployed vs repo config.toml; and whether evaluate_contact_stop truly encodes consent/global-stop semantics.

## Artifact

**Findings**

Gate 1 consent: RE-CHECKED immediately before egress. No separate 'consent' identifier exists; consent is folded into the evaluate_contact_stop RPC (index.ts:653) called by assertContactAllowed, which enforceFinalBoundary invokes at index.ts:809, one line before egress. Gate 2 DNC: RE-CHECKED immediately before egress - assertContactAllowed re-reads leads.do_not_call (668-678) and dnc_list (685-691) at index.ts:809; skipDncCheck ignored at 683. Gate 3 global/contact stop: RE-CHECKED immediately before egress via evaluate_contact_stop (653-665) at index.ts:809. Gate 4 calling hours: RE-CHECKED immediately before egress via assertCallingHoursAllowed() (765-790) at index.ts:810 (also earlier at 830-880). Gate 5 credit balance: NOT re-checked immediately before the Retell call; checked once earlier - check_credit_balance (950-954) and reserve_credits (1007-1016) inside block ending 1043 - with no credit RPC between 1043 and egress at 1811; mitigation is the reservation hold only. Egress is index.ts:1811 POST `${baseUrl}/create-phone-call`, immediately preceded by guard index.ts:1808 await enforceFinalBoundary(). Auth: platform JWT verification is DISABLED (config.toml:124 verify_jwt=false); handler enforces auth itself - 401 if Authorization absent (188-200), service-role callers bypass JWT and take userId from body (220,227-237), user calls verified with getUser(token) and 401 on failure (240-257). Quarantine: handler is NOT globally launch-quarantined; the only early 503 is the provider gate at 295-305 disabling Telnyx while Retell stays live, and config.toml:124 lacks the 'Launch-quarantined in-function' note that sibling functions carry.

**evidence**

- supabase/functions/outbound-calling/index.ts:1811 - egress: const res = await fetchWithTimeout(`${baseUrl}/create-phone-call`, {
- index.ts:1808 - `await enforceFinalBoundary();` is the LAST statement before the egress fetch, inside the retryWithBackoff callback
- index.ts:807-819 - enforceFinalBoundary body
- index.ts:809 - `await assertContactAllowed('final-provider-boundary');`
- index.ts:810 - `assertCallingHoursAllowed();`
- index.ts:811 - `await assertCampaignContactReleased();`
- index.ts:653 - supabaseAdmin.rpc('evaluate_contact_stop', {...}) (consent + contact/global stop)
- index.ts:668-678 - lead-level do_not_call re-read and DNC_BLOCKED
- index.ts:685-691 - dnc_list lookup and DNC_BLOCKED
- index.ts:822 - earlier `await assertContactAllowed('preflight');`
- index.ts:946-1043 - credit block; check_credit_balance at 950-954, reserve_credits at 1007-1016; NO credit RPC between 1043 and 1811
- supabase/config.toml:123-124 - [functions.outbound-calling] / verify_jwt = false  # Handles auth internally - supports both JWT and service-role calls from dispatcher
- index.ts:184-200 - missing Authorization header -> 401
- index.ts:220,227-237 - service-role token bypass, userId taken from body
- index.ts:240-257 - non-service call verified via supabaseAdmin.auth.getUser(token); 401 on failure
- index.ts:295-305 - only 503 in handler, a provider gate for action=create_call && provider!=='retell', not a launch quarantine

**validation**

Line-cited read of the full create_call path (index.ts 169-1043, 1258-1330, 1780-1900) plus config.toml. findstr confirms enforceFinalBoundary call sites are exactly 1269, 1306, 1808 and the egress literal 'create-phone-call' is at 1811.

**open_questions**

- Does deployed Supabase config match repo config.toml (could be verify_jwt=true in prod)?
- Body of evaluate_contact_stop RPC - does it truly encode consent + global stop and is it complete?
- Can the ~700-line window between credit reservation (1043) and egress (1811) change balance despite the hold?

**edge_cases_considered**

- Telnyx path is hard-disabled (503) so its enforceFinalBoundary call sites at 1269/1306 are unreachable for create_call
- retryWithBackoff is invoked with maxRetries=1 and never re-issues after in_flight, so enforceFinalBoundary runs once per physical attempt
- skipDncCheck and skipCreditCheck are accepted in the request type but explicitly ignored (683, 945)

**what_i_did_not_check**

- RPC bodies (SQL) for evaluate_contact_stop, check_credit_balance, reserve_credits, certifiedOutboundCallingWindow
- Whether deployed config.toml matches the repo (only repo file read)
- retryWithBackoff implementation source
- Deployed function version vs repo HEAD
- Whether the dispatcher reaches this function with a service-role key in a way that skips org binding

**confidence**: high