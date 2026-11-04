# ce-wh-mailgun

- status: completed
- tldr: elite-email-mailgun-events: CORS absent, HMAC-gated (401 on fail), anon_reachable=no, priv=service-role-db-write; verify_jwt=false

AUDIT elite-email-mailgun-events (read-only, source audit).

FUNC elite-email-mailgun-events | cors_wildcard=absent | in_func_auth=yes@handler.ts:365-376 | auth_kind=hmac | anon_reachable=no | priv_side_effect=service-role-db-write | note="if (!verified) return noStoreResponse(401, { accepted:false, error_code:'INVALID_MAILGUN_WEBHOOK' })"

EVIDENCE:
supabase/functions/elite-email-mailgun-events/handler.ts:365  const verified = await parseAndVerifyMailgunEvent(
supabase/functions/elite-email-mailgun-events/handler.ts:371-376  if (!verified) { return noStoreResponse(401, { accepted:false, error_code: "INVALID_MAILGUN_WEBHOOK" }); }
supabase/functions/elite-email-mailgun-events/handler.ts:272-275  const expectedSignature = await hmacHex(signingKey, `${timestamp}${token}`); return constantTimeHexEqual(expectedSignature, suppliedSignature) ? { token, event } : null;
supabase/functions/elite-email-mailgun-events/handler.ts:448  if (getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_ENABLED") !== "true") { throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_DISABLED");
supabase/functions/elite-email-mailgun-events/index.ts:103-105  } catch { runtimePromise = null; return unavailable(); }
supabase/functions/elite-email-mailgun-events/index.ts:58-59  const { data, error } = await supabase.rpc("record_elite_email_mailgun_event_receipt", {
supabase/config.toml:77-82  [functions.elite-email-mailgun-events] ... verify_jwt = false

CORS: absent (no Access-Control-Allow-Origin in index.ts/handler.ts; only shared import _shared/bounded-json.ts has none; grep of functions/ found no match in this function). Quarantine noted: disabled unless ELITE_EMAIL_MAILGUN_EVENTS_ENABLED='true' + both server HMAC keys present; else 503 unavailable(). priv_side_effect is downstream of the HMAC guard and only on a valid config.

## Artifact

**Findings**

CORS absent (no Access-Control-Allow-Origin in index.ts/handler.ts; only shared import bounded-json.ts has none) -> cors_wildcard=absent. In-function auth = Mailgun HMAC (timestamp+token) constant-time verify; rejects 401 INVALID_MAILGUN_WEBHOOK (handler.ts:365-376, 223-276) -> auth_kind=hmac. anon_reachable=no: HMAC gate blocks unauthenticated callers AND function is quarantine-disabled by default (ELITE_EMAIL_MAILGUN_EVENTS_ENABLED must equal 'true' else throws at handler.ts:448; buildRuntime needs SUPABASE_URL/SERVICE_ROLE_KEY + both HMAC keys; any failure -> 503 unavailable() at index.ts:103-105). priv_side_effect=service-role-db-write reached AFTER the guard: supabase.rpc('record_elite_email_mailgun_event_receipt') with service-role key (index.ts:46-87, 400-405). config verify_jwt=false (config.toml:77-82).

**evidence**

- supabase/functions/elite-email-mailgun-events/handler.ts:365  const verified = await parseAndVerifyMailgunEvent(
- supabase/functions/elite-email-mailgun-events/handler.ts:371-376  if (!verified) { return noStoreResponse(401, { accepted: false, error_code: "INVALID_MAILGUN_WEBHOOK" }); }
- supabase/functions/elite-email-mailgun-events/handler.ts:272-275  const expectedSignature = await hmacHex(signingKey, `${timestamp}${token}`); return constantTimeHexEqual(expectedSignature, suppliedSignature) ? { token, event } : null;
- supabase/functions/elite-email-mailgun-events/handler.ts:448-450  if (getEnvironment("ELITE_EMAIL_MAILGUN_EVENTS_ENABLED") !== "true") { throw new Error("ELITE_EMAIL_MAILGUN_EVENTS_DISABLED"); }
- supabase/functions/elite-email-mailgun-events/index.ts:103-105  } catch { runtimePromise = null; return unavailable(); }
- supabase/functions/elite-email-mailgun-events/index.ts:46-55  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, ... } });
- supabase/functions/elite-email-mailgun-events/index.ts:58-59  const { data, error } = await supabase.rpc("record_elite_email_mailgun_event_receipt", {
- supabase/config.toml:77-82  [functions.elite-email-mailgun-events] ... verify_jwt = false

**validation**

Read index.ts and handler.ts in full; grepped functions/ for 'Access-Control-Allow-Origin' (no match in this function's files); read _shared/bounded-json.ts (no CORS); read supabase/config.toml function entry confirming verify_jwt=false.

**open_questions**

- Whether ELITE_EMAIL_MAILGUN_EVENTS_ENABLED and both HMAC keys are currently set in the deployed Supabase project environment (source only; runtime env not inspected).
- Whether the deployed artifact matches this source snapshot.

**what_i_did_not_check**

- Live deployed function env vars / secrets presence (read-only repo audit; no Supabase Management API call made).
- Whether functions-live/ snapshot differs from supabase/functions/ for this function.
- The record_elite_email_mailgun_event_receipt RPC body and its own authorization/RLS semantics.

**confidence**: high