# ce-egress-retell-force-webhook

- status: completed
- tldr: retell-force-webhook: egress yes but gated by hardcoded 503; verify_jwt true; not anon-reachable; no bypass

DONE: egress/gate analysis of retell-force-webhook/index.ts (197 lines, research only, nothing changed).

ROW: retell-force-webhook | egress: YES (all unreachable behind hardcoded 503) | verify_jwt: true (config.toml:177) | launch-quarantined(503): YES, helper isRetellMaintenanceRouteTenantCertified() lines 9-11 (return false), call line 20, 503 return line 27, gate BEFORE first egress (line 87/96/134/173) | anon-browser reachable: NO (CORS '*' line 5 BUT in-function JWT check lines 36/41/42/48 + gateway verify_jwt) | bypasses launch lock: NO (only OPTIONS early-return lines 14-16, no egress) | citations: index.ts 5,9-11,20,27,36,42,48,87,96,134,173; config.toml 175,177.

Key: line 96 PATCH https://api.retellai.com/update-agent = provider WRITE; line 134 POST .../outbound-calling = indirect call-create egress; lines 87/173 GET get-agent = reads. No Telnyx/Twilio/ElevenLabs/OpenRouter. No DB-row writes (only auth.getUser + retell_agents select).

EVIDENCE: findstr /n "fetch(" -> 87,96,134,173; findstr /n /i "telnyx twilio elevenlabs openrouter" -> none; findstr /n "_shared" -> none. config.toml:177 verify_jwt = true.

Validation: all fetch sites enumerated, vendor-host grep negative, gate ordering traced. Confidence HIGH. Follow-ups: read callee outbound-calling/index.ts to confirm it issues the real Retell create-phone-call (line 134 target); deploy-drift not checked (no live calls).

## Artifact

**Findings**

FILE: supabase/functions/retell-force-webhook/index.ts (197 lines). Imports only std serve (line 1) and supabase-js createClient (line 2); NO _shared helpers imported (grep '_shared' returns no match, exit 1).

1) EGRESS: YES, but all provider egress is unreachable at runtime because a hardcoded 503 gate fires first. Four fetch() call sites: (a) line 87 GET https://api.retellai.com/get-agent/{agent_id} = provider READ; (b) line 96 PATCH https://api.retellai.com/update-agent/{agent_id} with body {webhook_url: WEBHOOK_URL} = PROVIDER WRITE (mutates Retell agent webhook config); (c) line 134 POST ${supabaseUrl}/functions/v1/outbound-calling action=create_call = INDIRECT provider-call egress (delegates the actual create-phone-call to the canonical outbound-calling function); (d) line 173 GET https://api.retellai.com/get-agent/{agent_id} = provider READ. NONE of the named write endpoints (create-phone-call, create-web-call, update-call, create-batch-call, register-phone-call) are called directly; NO Telnyx, Twilio (messages.create/calls.create), ElevenLabs, or OpenRouter URLs appear anywhere (grep negative). DB-row WRITES: none (no insert/update/delete). DB READS only: supabase.auth.getUser(token) line 48; .from('retell_agents').select(...) lines 70-75.

2) verify_jwt: true. config.toml line 175 = '[functions.retell-force-webhook]', line 176 = comment, line 177 = 'verify_jwt = true'.

3) LAUNCH-QUARANTINED 503 GATE: EXISTS. Helper isRetellMaintenanceRouteTenantCertified() defined lines 9-11, body is 'return false;' (hardcoded false, cannot be flipped by env). Call site line 20: 'if (!isRetellMaintenanceRouteTenantCertified()) {'. 503 return line 27: 'status: 503' with error_code RETELL_MAINTENANCE_ROUTE_NOT_TENANT_CERTIFIED (line 24). Gate call (line 20) is BEFORE the first egress line (line 87 GET, line 96 PATCH, line 134 outbound-calling, line 173 GET). Because the helper is hardcoded false, the 503 always returns and NO egress line can ever execute.

4) ANON-BROWSER REACHABLE: NO. Access-Control-Allow-Origin '*' IS present (line 5), BUT the handler does its own identity check: requires Authorization header + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (line 36), strips Bearer token (line 41), rejects service-role tokens (line 42 'token === serviceRoleKey'), and validates the user JWT via supabase.auth.getUser(token) (line 48), 401 on authError/no user (line 49-52). Gateway verify_jwt=true (line 177) additionally requires a JWT before the function runs. CORS '*' AND an in-function check => NOT anon reachable. (Also moot: the line-20 503 gate precedes the auth block.)

5) BYPASSES LAUNCH LOCK: NO egress path bypasses the 503 gate. The only early-return before the gate is the OPTIONS preflight (lines 14-16) which returns a null body and performs NO egress. The try/catch (lines 32-196) and catch-all (lines 191-196) are entirely AFTER the gate. No env flag, no cron branch, no alternate early-return egress path.

**evidence**

- retell-force-webhook/index.ts:5 'Access-Control-Allow-Origin': '*',
- retell-force-webhook/index.ts:9-11 function isRetellMaintenanceRouteTenantCertified(): boolean { return false; }
- retell-force-webhook/index.ts:20 if (!isRetellMaintenanceRouteTenantCertified()) {
- retell-force-webhook/index.ts:27 status: 503,
- retell-force-webhook/index.ts:36 if (!authHeader || !supabaseUrl || !serviceRoleKey) {
- retell-force-webhook/index.ts:42 if (!token || token === serviceRoleKey) {
- retell-force-webhook/index.ts:48 const { data: { user }, error: authError } = await supabase.auth.getUser(token);
- retell-force-webhook/index.ts:87 await fetch(`https://api.retellai.com/get-agent/${agent_id}`
- retell-force-webhook/index.ts:96 await fetch(`https://api.retellai.com/update-agent/${agent_id}`, { method: 'PATCH' ... webhook_url: WEBHOOK_URL
- retell-force-webhook/index.ts:134 await fetch(`${supabaseUrl}/functions/v1/outbound-calling`, { ... action: 'create_call'
- retell-force-webhook/index.ts:173 await fetch(`https://api.retellai.com/get-agent/${agent_id}`
- config.toml:175 [functions.retell-force-webhook]
- config.toml:177 verify_jwt = true
- CMD: findstr /n "fetch(" index.ts -> lines 87,96,134,173 only
- CMD: findstr /n /i "retellai.com telnyx twilio elevenlabs openrouter ..." index.ts -> only retellai.com lines 87,96,173
- CMD: findstr /n "_shared" index.ts -> no match (exit 1)

**validation**

Enumerated every fetch() via findstr (4 hits, lines 87/96/134/173). Grepped for all named provider write endpoints and vendor hosts (telnyx/twilio/elevenlabs/openrouter): zero matches. Confirmed imports via findstr (only std serve + supabase-js). Confirmed _shared is never imported (grep exit 1). Read config.toml lines 168-188 to confirm line 177 verify_jwt=true under section header line 175. Traced gate (line 20) ordering vs first egress (line 87).

**open_questions**

- Does the downstream callee supabase/functions/outbound-calling/index.ts perform the real Retell create-phone-call (i.e., is line 134 a live indirect provider write if the gate were ever disabled)? Not read in this node.
- Does the deployed function match this source revision (deploy drift)? Not verified - no live calls permitted.

**what_i_did_not_check**

- The callee outbound-calling/index.ts (line 134 target) - did not read it to confirm it issues a provider call-create.
- Deployed/runtime state of the function (source-vs-deploy drift).
- The _shared helpers listed in the task (api-auth.ts, utils.ts, control-plane/, retell-provider-contract.ts) - confirmed NOT imported by this file, so not analyzed for this node.
- Whether retell_agents.status could be anything other than 'active' to alter the ownership branch (lines 77-81) - irrelevant since gate precedes it.

**confidence**: high