# ce-live-sms-messaging

- status: completed
- tldr: README claim REFUTED for current live (645-line); verify_jwt=false confirmed but auth gate closes the hole

ce-live-sms-messaging: README claim REFUTED for the current live snapshot. sms-messaging verify_jwt=false is CONFIRMED (config.toml:106-107), but the "unauthenticated get_available_numbers leak" is CLOSED in the live 645-line file (v529). An unconditional auth gate (lines 120-140: Authorization header required @123-125 -> 401, else auth.getUser(token) @134-137 -> 401) runs BEFORE the router switch @155, so ALL actions (health_check @156, send_sms @176, get_messages @382, get_available_numbers @414, check_webhook_status @532, configure_webhook @567) require a verified caller. No anon-reachable action exists. Line 118 is a comment stating the v525 "publicActions" leak was deleted. Live has 0 NOT_CERTIFIED gates (absent); main has SMS_EGRESS_NOT_CERTIFIED@129 + PROVIDER_ADMIN_NOT_CERTIFIED@142 (LIVE-VS-MAIN-GATES.md:32). The leak was real only in the superseded v525/470-line build recorded in README:23; README:61 records its replacement by v529/645.

## Artifact

**Findings**

VERDICT: README claim 'sms-messaging verify_jwt=FALSE -> unauthenticated get_available_numbers leak' is REFUTED for the current live snapshot (supabase/functions-live/sms-messaging/sms-messaging/index.ts, 645 lines, v529). verify_jwt=false is CONFIRMED; the unauthenticated leak is NOT present in these bytes.

(a) verify_jwt from config.toml = FALSE, exact: config.toml:106 '[functions.sms-messaging]' then config.toml:107 'verify_jwt = false'. Confirmed.

(b) Certification gate ABSENT in live. Grep for NOT_CERTIFIED in the live 645-line file returns 0 matches. The only related text is the comment at line 118 ('P5: EVERY action needs a verified caller. The live v525 publicActions list ... is deleted.'). Main carries SMS_EGRESS_NOT_CERTIFIED@129 (send_sms) and PROVIDER_ADMIN_NOT_CERTIFIED@142 (get_available_numbers, check_webhook_status, configure_webhook) per LIVE-VS-MAIN-GATES.md:32 (section 1 is explicitly 'gate inventory ON MAIN'). So gate_in_live=NO, main_gate=the two above.

(c) NO action is reachable with no auth / anon key. The auth gate is UNCONDITIONAL and runs BEFORE the router switch: line 120 reads the Authorization header; line 123-125 throws HttpError(401,'UNAUTHORIZED') when absent; line 126 strips 'Bearer '; line 127-131 internal branch requires token===serviceRoleKey AND request.user_id (anon key cannot satisfy); line 134-137 otherwise auth.getUser(token) and throws 401 when authError||!user. Router dispatch is line 155 'switch(request.action)'. Because the gate precedes the switch, every action requires a verified caller.

Actions (all post-auth): health_check@156 (no Twilio; returns capabilities list incl. the string 'get_available_numbers'@167 + twilio_configured/telnyx_configured booleans; no inventory); send_sms@176 (egress: Telnyx POST api.telnyx.com/v2/messages @258-270 or Twilio POST Messages.json @329-341; DB writes sms_messages insert @235 and status updates @275/@285/@346/@355; ownership gate @192, DNC gate @194-209); get_messages@382 (DB read sms_messages@402, org-scoped); get_available_numbers@414 (DB read phone_numbers@437 + Twilio IncomingPhoneNumbers@455-465 + messaging services@472-500, then filtered to caller's companies @508-524 -> NO cross-tenant inventory); check_webhook_status@532 (ownership check @544, Twilio read @547); configure_webhook@567 (ownership check @579, Twilio SmsUrl WRITE @597-604); default@619 unknown action -> error.

Reconciling README: README.md has two tables. Table 1 (10/29 pull, README:23) records the OLD live = sms-messaging/index.ts:470 v525 'verify_jwt=FALSE -> unauthenticated get_available_numbers leak'. Table 2 (11/02 re-snapshot, README:61) records the live was REPLACED by sms-messaging/sms-messaging/index.ts:645 v529 ('was v525 / 470'), with README:66-68 attesting every snapshot sha256 == the LIVE body. So the leak was real in the superseded v525/470 build (corroborated by LIVE-VS-MAIN-GATES.md:52: 'unauthenticated POST get_available_numbers returned HTTP 200 with the Twilio number inventory' for v525) and is fixed in the v529 bytes the task points at.

Line cites 118/167/414 do NOT support the leak: 118 is the comment stating the leak was deleted; 167 is merely the 'get_available_numbers' string inside the health_check capabilities array; 414 is 'case get_available_numbers' which sits AFTER the auth gate at 120-140. Note the file is 645 lines, so the README's 470-line row cannot describe it.

PER-FUNCTION ROW: sms-messaging | verify_jwt=false (config.toml:106-107) | gate_in_live=NO (0 NOT_CERTIFIED; live 645-line v529) | main_gate=SMS_EGRESS_NOT_CERTIFIED@129 + PROVIDER_ADMIN_NOT_CERTIFIED@142 | anon-reachable actions=NONE (auth gate @120-140 ahead of switch @155; no header->401 @123-125; bad token->401 @134-137) | side effects (authed only): send_sms=Twilio/Telnyx egress + sms_messages writes; configure_webhook=Twilio number SmsUrl write; others read-only.

**evidence**

- config.toml:106 -> '[functions.sms-messaging]'
- config.toml:107 -> 'verify_jwt = false'
- functions-live/sms-messaging/sms-messaging/index.ts:118-119 -> comment: P5, EVERY action needs a verified caller; live v525 'publicActions' list is deleted
- functions-live/.../index.ts:120 -> const authHeader = req.headers.get('Authorization')
- functions-live/.../index.ts:123-125 -> if (!authHeader) throw new HttpError(401,'UNAUTHORIZED',...) 
- functions-live/.../index.ts:126 -> const token = authHeader.replace('Bearer ','')
- functions-live/.../index.ts:127-131 -> if (token === serviceRoleKey && request.user_id) { userId=request.user_id; isInternalCall=true }
- functions-live/.../index.ts:134-137 -> auth.getUser(token); if (authError||!user) throw 401
- functions-live/.../index.ts:142 -> const memberOrgIds = await loadMemberOrgIds(supabaseAdmin, userId)
- functions-live/.../index.ts:155 -> switch(request.action){  (router dispatch)
- functions-live/.../index.ts:156 case 'health_check' ; 167 'get_available_numbers' (capability string) ; 176 case 'send_sms' ; 382 case 'get_messages' ; 414 case 'get_available_numbers' ; 532 case 'check_webhook_status' ; 567 case 'configure_webhook' ; 619 default
- functions-live/.../index.ts:192 resolveSendOrganization ; 235 sms_messages insert ; 258-270 Telnyx egress ; 329-341 Twilio egress ; 437 phone_numbers select ; 455-465 Twilio IncomingPhoneNumbers ; 508-524 filter to caller companies ; 544 & 579 ownership checks ; 597-604 Twilio SmsUrl write
- grep 'NOT_CERTIFIED' in live file = 0 matches
- LIVE-VS-MAIN-GATES.md:32 -> 'sms-messaging: SMS_EGRESS_NOT_CERTIFIED@129 (send_sms), PROVIDER_ADMIN_NOT_CERTIFIED@142 (get_available_numbers, check_webhook_status, configure_webhook)' (section 1 = gates ON MAIN)
- LIVE-VS-MAIN-GATES.md:52 -> v525, live has gate? NO; unauthenticated POST get_available_numbers returned HTTP 200 with Twilio number inventory
- README.md:23 (10/29 table) -> sms-messaging/index.ts:470 v525 verify_jwt=FALSE -> unauthenticated leak
- README.md:61 (11/02 table) -> sms-messaging v529 sms-messaging/sms-messaging/index.ts 645 lines, was v525/470
- SHA256 live file == source file (C9F5FBAC525ED709DC9BCDC7311A3634B1FA74F987747134091CEDF3F87F88A8), both 33259 bytes / 645 lines

**validation**

Read the entire 645-line live file. Confirmed config.toml:106-107 by direct line fetch. Grep proves 0 NOT_CERTIFIED in live. SHA256 live==source. Enumerated all actions and the ordering of the auth gate vs router dispatch.

**open_questions**

- Were the exact v525/470-line live bytes ever captured to disk? (Not found; only the 629-line P5 staging draft at docs/wholesale/phases/staging/p5/.../sms-messaging/index.ts and the README row describe it.)
- README.md:23 has no 'superseded' marker, so a reader can still take the leak as current - is that intended?
- LIVE-VS-MAIN-GATES.md is dated 2026-10-29 and assesses v525; it is stale vs the 11/02 v529 live.

**edge_cases_considered**

- OPTIONS preflight returns 200 with no auth (lines 103-107) but carries no data.
- Malformed body: req.json() @117 throws before the switch -> 500 via catch @628-644; no data leaked.
- Internal-call branch @127 requires the SERVICE ROLE key, not the anon key, so an anon caller cannot forge isInternalCall.
- auth.getUser(anonKey) fails (anon key is not a user access token) -> 401 @135-137; no anon path.
- verify_jwt=false only removes the PLATFORM gateway check; in-function auth (120-140) still enforces a verified user/service caller.
- get_available_numbers scopes reads to memberOrgIds and returns [] when the caller has no company (@430-436), so even an authed caller cannot read another tenant's inventory.

**what_i_did_not_check**

- Did not issue any live HTTP probe (research-only; unauthenticated call would also be a side effect).
- Did not confirm on the Supabase server that v529 (not v525) is the currently deployed version beyond the README byte-equality attestation and the on-disk snapshot.
- Did not inspect the main 939-line sms-messaging source to verify gate line numbers 129/142 firsthand (relied on LIVE-VS-MAIN-GATES.md:32).
- Did not review the full call-path of every caller (api-gateway, disposition-router, twilio-sms-webhook) that invokes sms-messaging with the service role.

**confidence**: high