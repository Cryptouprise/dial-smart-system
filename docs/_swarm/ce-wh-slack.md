# ce-wh-slack

- status: completed
- tldr: slack-webhook: no CORS, HMAC v0 auth, launch-quarantined, anon_reachable=no

slack-webhook audit complete.
FUNC | cors_wildcard=absent | in_func_auth=yes@handler.ts:405-419 | auth_kind=hmac | anon_reachable=no | priv_side_effect=control-plane-mutation | note=index.ts:24 SLACK_OBSERVER_LAUNCH_CERTIFIED=false -> 503 before any read; else Slack v0 HMAC 401.

EVIDENCE
index.ts:24  const SLACK_OBSERVER_LAUNCH_CERTIFIED: boolean = false;
index.ts:51  if (!SLACK_OBSERVER_LAUNCH_CERTIFIED) { return slackObserverDisabledResponse(); }
handler.ts:412-418  if (!authenticated.ok) { return jsonResponse(401, ephemeralBody("Slack request authentication failed.",...)); }
slack-request-auth.ts:149-176  /^v0=[0-9a-f]{64}$/ + crypto.subtle.verify("HMAC", key, signature, baseString)
supabase/config.toml:428  verify_jwt = false
_shared/utils.ts:11-12  export const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... }  (NOT imported by slack-webhook)
index.ts:57,59  getSigningSecret: () => Deno.env.get("SLACK_SIGNING_SECRET") ?? "" ... observerRuntime().submitSlackCommand(submission)

Validation: grepped index.ts+handler.ts for corsHeaders/Access-Control-Allow-Origin/utils -> 0 matches (CORS absent, utils not imported). config.toml L423-428 confirms verify_jwt=false.
Confidence: high.
Not checked: observer-runtime.ts:1134 submitter internals (db-write vs rpc); handler.test.ts / Deno suite; platform-level CORS injection.
Blockers: none.

## Artifact

**Findings**

slack-webhook is a launch-quarantined Slack observer adapter. (1) CORS: no Access-Control-Allow-Origin is emitted; the function never imports _shared/utils.ts, so corsHeaders (ACAO '*') is NOT applied. (2) In-function auth is real: Slack v0 signing-secret HMAC over exact raw bytes via verifySlackRequestSignature, 401 on failure. verify_jwt=false in config.toml (Slack cannot send a Supabase JWT). (3) auth_kind=hmac. (4) anon_reachable=no: SLACK_OBSERVER_LAUNCH_CERTIFIED=false forces slackObserverDisabledResponse() (503) before body/secret/db/network; even if enabled, the HMAC guard blocks unsigned callers. (5) priv_side_effect=control-plane-mutation (submitObserverCommand -> observer-runtime.submitSlackCommand over a service-role client), but it is unreachable in the deployed state because of the quarantine.

**evidence**

- index.ts:24  const SLACK_OBSERVER_LAUNCH_CERTIFIED: boolean = false;
- index.ts:50-53  serve((request) => { if (!SLACK_OBSERVER_LAUNCH_CERTIFIED) { return slackObserverDisabledResponse(); }
- handler.ts:405-419  const authenticated = await verifySlackRequestSignature({...}); if (!authenticated.ok) { return jsonResponse(401, ephemeralBody('Slack request authentication failed.', { error_code: 'SLACK_REQUEST_AUTH_FAILED' })); }
- slack-request-auth.ts:113-181  verifySlackRequestSignature: /^v0=[0-9a-f]{64}$/ + crypto.subtle.verify('HMAC', key, signature, baseString) returning signature_mismatch on failure
- supabase/config.toml:423-428  [functions.slack-webhook] ... verify_jwt = false
- _shared/utils.ts:10-14  // Standard CORS headers / export const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... } (defined but NOT imported by slack-webhook)
- index.ts:57-60  getSigningSecret: () => Deno.env.get('SLACK_SIGNING_SECRET') ?? '', ... submitObserverCommand: (submission) => observerRuntime().submitSlackCommand(submission)
- index.ts:42  createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

**validation**

Read all four files in full (index.ts, handler.ts, slack-request-auth.ts, utils.ts). Grepped slack-webhook/index.ts + handler.ts for 'corsHeaders|Access-Control-Allow-Origin|origin' and for 'utils' -> 0 matches, confirming CORS absent and utils not imported. Confirmed config.toml [functions.slack-webhook] verify_jwt=false at L428 and utils.ts corsHeaders at L10-14.

**open_questions**

- Does the deployed Edge bundle match this source (config.toml comment claims launch-quarantine, source agrees)?
- What exact privileged op does observer-runtime.ts:1134 submitSlackCommand perform (service-role DB write vs RPC) once quarantine is lifted?

**what_i_did_not_check**

- Did not open observer-runtime.ts:1134 body to classify the submitter's DB call precisely (service-role-db-write vs rpc).
- Did not verify the handler.test.ts assertions or run the Deno test suite.
- Did not check whether any slack-webhook OPTIONS/preflight handler or platform-level CORS is injected by the Supabase Edge gateway.

**confidence**: high