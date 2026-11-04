# ce-webhook-and-reconciler-egress

- status: completed
- tldr: 6 Retell/inbound functions: only force-webhook (egress) + phone-management (redirect) can move calls; reconciler does not; all launch-locked; zero in-file DNC gating.

DONE: ce-webhook-and-reconciler-egress — classified the 6 Retell/inbound edge functions by egress/redial/redirect capability, auth, browser reachability (config.toml verify_jwt), launch lock, and consent/DNC gating, all with file:line.

ANSWER: Only 2 of 6 can originate/redirect a live call if unlocked: retell-force-webhook (make_test_call -> outbound-calling create_call = egress, index.ts:123-170; update_webhook PATCH agent webhook_url = redirect, 85-121) and retell-phone-management (update sets inbound_agent_id/outbound_agent_id + inbound_webhook_url, 104-123). setup-inbound-calls redirects at the carrier (rewrites every Twilio VoiceUrl, 75-85). retell-reconciler does NOT egress — the :129 'create-phone-call metadata' is a COMMENT; it only GETs get-call (105-109), POSTs list-calls (131-152) and replays the internal retell-call-webhook (196-224). retell-inbound-webhook and inbound-transfer-webhook place/redirect no call. Metadata producers: outbound-calling/index.ts:1811, demo-call:350, voice-broadcast-engine:121.

verify_jwt (config.toml): inbound-webhook=false (288), force-webhook=true (175), reconciler=false (277), setup-inbound-calls=true (257), inbound-transfer-webhook=false (335), phone-management=true (120). Note: the anon JWT passes verify_jwt=true, so the flag is not an authorization boundary (precedent config.toml:189-193) — in-function auth is what matters, and setup-inbound-calls has NONE.

All six are CORS-open (*) with OPTIONS handling, so all are browser-reachable. Launch lock: 4 unconditional 503 kill switches before any side effect (inbound-webhook 43-51; setup 14-22; transfer 126-134; phone-management 28-36); force-webhook gated by a hardcoded false predicate (9-11, 20-30); reconciler env-gated by RETELL_RECONCILER_ENABLED (264, 341).

CONSENT/DNC: NONE of the six enforces DNC/consent in-file. Grep across exactly these six files matches only retell-force-webhook, in a comment (131-133) delegating DNC/global-stops/billing to downstream outbound-calling. So the one egressing file relies entirely on that downstream boundary.

EVIDENCE: config.toml:120,175,257,277,288,335; all six index.ts read in full; _shared/tenant-context.ts:66-84; grep for create-phone-call producers. CONFIDENCE: high. Repo source only — deployed bundles not diffed.

## Artifact

**Findings**

SCOPE: six edge functions, repo source only, no live calls. (1) EGRESS/REDIAL/REDIRECT: only retell-force-webhook and retell-phone-management can originate or redirect a live call if their locks were lifted. retell-force-webhook make_test_call proxies to the canonical outbound-calling create_call (index.ts:123-170) = call egress, and update_webhook PATCHes the agent webhook_url (85-121) = event redirect. retell-phone-management import/update/delete/purchase numbers and its update sets inbound_agent_id/outbound_agent_id (110-113) and inbound_webhook_url (115) = redirects where calls/events go. setup-inbound-calls rewrites EVERY Twilio number VoiceUrl to twilio-inbound-handler (75-85) = carrier-level inbound redirect (not a per-call dial). retell-reconciler performs NO call egress: it only GETs get-call (105-109), POSTs list-calls (131-152) and replays the internal retell-call-webhook (196-224). retell-inbound-webhook and inbound-transfer-webhook place/redirect no call. (2) The reconciler :129 reference is a COMMENT about the metadata object attached by the certified create-phone-call producers (outbound-calling/index.ts:1811, demo-call:350, voice-broadcast-engine:121); reconciler consumes those fields as an immutable list-calls filter (139-149) - it does not create calls. (3) AUTH: retell-inbound-webhook NONE (verify_jwt=false). inbound-transfer-webhook optional shared secret only, no-op when unset (146-155; verify_jwt=false). retell-reconciler in-function exact service-role bearer OR cron token with body.source==='pg_cron' (265-279; verify_jwt=false). retell-force-webhook platform JWT + in-function user JWT via auth.getUser (42-53) + agent ownership (70-81). setup-inbound-calls NO in-function auth; only platform verify_jwt=true (257-258). retell-phone-management platform JWT + in-function service-role-with-userId or auth.getUser (56-65) + fail-closed org membership (67-71). (4) BROWSER REACHABILITY: all six are HTTP endpoints with CORS '*' and OPTIONS handling, so all are browser-reachable; verify_jwt=false (inbound-webhook, reconciler, transfer) means an anonymous browser POST reaches the handler body (each then 503s as disabled); the three verify_jwt=true functions need a header JWT but the public anon JWT passes that platform gate (config.toml:189-193), so the flag is not itself an authorization boundary - the real boundary is in-function and setup-inbound-calls has none. (5) LAUNCH LOCK: four unconditional early-return 503 kill switches before any side effect (inbound-webhook 43-51; setup 14-22; transfer 126-134; phone-management 28-36); force-webhook gated by hardcoded false predicate isRetellMaintenanceRouteTenantCertified (9-11, checked 20-30); reconciler env-gated by RETELL_RECONCILER_ENABLED (264, 341) plus verifyMode enforce (263, 342). (6) CONSENT/DNC: NONE of the six enforces any DNC/do-not-call/consent/TCPA check in-file. A targeted grep across these six files for do_not_call|DNC|consent|opt_out|global_stop|dnc_list matches ONLY retell-force-webhook, and only in a comment (131-133) asserting the downstream outbound-calling boundary rechecks DNC/global stops/billing - so for the one egressing file DNC is DELEGATED, not local.

**evidence**

- config.toml:288-289 retell-inbound-webhook verify_jwt=false
- config.toml:175-177 retell-force-webhook verify_jwt=true
- config.toml:277-281 retell-reconciler verify_jwt=false
- config.toml:257-258 setup-inbound-calls verify_jwt=true
- config.toml:335-336 inbound-transfer-webhook verify_jwt=false
- config.toml:120-121 retell-phone-management verify_jwt=true
- config.toml:189-193 precedent: legacy verify_jwt accepts the public anon JWT and is not an authorization gate
- retell-inbound-webhook/index.ts:8-11 CORS wildcard; :39-41 OPTIONS; :43-51 unconditional 503 INBOUND_DYNAMIC_VARS_NOT_CERTIFIED before all logic; :53-436 unreachable body reading phone_numbers/leads/retell_transfer_context and at :207-219 inserting a lead
- retell-force-webhook/index.ts:9-11 isRetellMaintenanceRouteTenantCertified() returns false; :20-30 gate 503 RETELL_MAINTENANCE_ROUTE_NOT_TENANT_CERTIFIED; :42-46 rejects service-role bearer; :48-53 supabase.auth.getUser; :70-81 retell_agents ownership user_id=user.id + active; :85-121 update_webhook PATCHes agent webhook_url; :123-170 make_test_call POSTs /functions/v1/outbound-calling action=create_call; :131-133 comment claiming downstream rechecks DNC/global stops/billing
- retell-reconciler/index.ts:105-109 GET v2/get-call; :131-152 POST v3/list-calls; :127-130 comment about certified create-phone-call metadata; :196-224 invokeReconstructedWebhook to retell-call-webhook; :263 verifyMode; :264,341 RETELL_RECONCILER_ENABLED; :265-279 service bearer constant-time OR cron token source=pg_cron; :340 action whitelist
- setup-inbound-calls/index.ts:3 public-endpoint comment; :14-22 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED; :47-54 GET Twilio IncomingPhoneNumbers; :75-85 POST rewrite VoiceUrl to twilio-inbound-handler
- inbound-transfer-webhook/index.ts:126-134 unconditional 503 UNSIGNED_WEBHOOK_NOT_CERTIFIED; :146-155 optional x-webhook-secret; :92-102 phone-format validation; :256-270 writes inbound_transfers + leads + call_logs
- retell-phone-management/index.ts:28-36 unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED; :56-65 bearer serviceKey path requires userId else auth.getUser; :67-71 authorizeOrganizationContext; :94-101 import-phone-number; :104-123 update-phone-number sets inbound_agent_id/outbound_agent_id/inbound_webhook_url; :130-134 delete; :168-174 purchase-phone-number
- _shared/tenant-context.ts:66-84 authorizeOrganizationContext fails closed on non-membership
- create-phone-call producers: outbound-calling/index.ts:1811; demo-call/index.ts:350; voice-broadcast-engine/index.ts:121

**validation**

Read all six target index.ts files in full and supabase/config.toml in full; grepped repo for create-phone-call producers; read _shared/tenant-context.ts. Proof-only: no writes, no network calls, no production contact. Every claim anchored to a file:line and each in-file auth gate cross-checked against its config.toml verify_jwt entry.

**open_questions**

- Do the deployed versions of these six match this repo working tree? Only repo source was read; functions-live / dw-deployed-mirror snapshots were not diffed for these six.
- Does outbound-calling (the delegated DNC boundary at force-webhook:131-133) actually enforce DNC/global-stops/consent and billing, and is it itself launch-locked?
- retell-force-webhook make_test_call accepts an arbitrary organizationId and passes it downstream with no in-file membership check (125, 140-149) - confirmed gap here; whether outbound-calling rejects a non-member orgId is unverified.
- setup-inbound-calls has no in-function auth; is there another guard (a rotated non-anon key backing verify_jwt) that changes its production reachability?

**edge_cases_considered**

- Anon Supabase JWT satisfies the platform verify_jwt=true gate; config comments acknowledge anon JWT is not an authorization boundary (config.toml:189-193)
- retell-reconciler replays retell-call-webhook with the service-role key and X-DialSmart-Reconciliation header (index.ts:206-216) - classified as internal webhook replay, not call egress
- inbound-transfer-webhook optional secret is a no-op when INBOUND_TRANSFER_WEBHOOK_SECRET is unset (index.ts:146)
- the disabled 503 blocks sit before the try block and before any env/DB/provider access in 4 files, so they are true unconditional kill switches
- setup-inbound-calls is called a 'Simple public endpoint' (index.ts:3) and has no in-function auth, so its only protection is the 503 lock

**what_i_did_not_check**

- The live/deployed bundle for these six functions (only repo source inspected; functions-live and dw-deployed-mirror not diffed).
- outbound-calling/index.ts enforcement internals (DNC, global stops, billing, ambiguous-create) that retell-force-webhook delegates to.
- voice-broadcast-engine and demo-call create-phone-call paths in detail (only call sites located).
- RPC bodies (claim/finish/bind/fail retell reconciliation) and DB-level RLS/DNC enforcement behind the reconciler.
- Semantics of _shared/contact-safety.ts and _shared/call-exposure-policy.ts (not imported by any of the six per the reads).

**confidence**: high