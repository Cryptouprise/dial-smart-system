# ce-wh-mcp

- status: completed
- tldr: mcp: wildcard CORS from mcp-js runtime; real in-function OAuth-bearer 401 gate protects all tool paths; anon_reachable=no; reads only (user-bearer RLS).

FUNC=mcp | cors_wildcard=yes@dist/cors-Ftb-tw1d.js:887 | in_func_auth=yes@dist/cors-Ftb-tw1d.js:811-816 | auth_kind=other (OAuth bearer JWT via issuer JWKS) | anon_reachable=no | priv_side_effect=none (RLS-scoped reads via caller bearer) | note=guard: "if (!token) { ... challengeResponse(runtime.auth, request, runtime.options, 401) }" then "if (!authResult.ok) return authResult.response".

EVIDENCE:
supabase/functions/mcp/index.ts:6  import mcp from "npm:...src/lib/mcp/index.ts";
supabase/functions/mcp/index.ts:8  Deno.serve(createSupabaseHandler(mcp, { functionName: "mcp" }));
src/lib/mcp/index.ts:16  auth: auth.oauth.issuer({
src/lib/mcp/index.ts:18  acceptedAudiences: "authenticated",
supabase/config.toml:446-449  [functions.mcp] ... verify_jwt = false
dist/cors-Ftb-tw1d.js:811  if (!token) {   -> :815 challengeResponse(..., 401)
dist/rest-Be8uOb6r.js:21-22  const authResult = await authorizer.authorize(...); if (!authResult.ok) return authResult.response;
dist/cors-Ftb-tw1d.js:887  response.headers.set("Access-Control-Allow-Origin", "*");
dist/stacks/supabase/index.js:71  case "metadata": return metadataHandler(req);  (unauthenticated, non-privileged)
src/lib/mcp/tools/shared.ts:24-26  createClient(url, publishableKey, { headers: { Authorization: `Bearer ${token}` } })

## Artifact

**Findings**

mcp | cors_wildcard=yes@node_modules/@lovable.dev/mcp-js/dist/cors-Ftb-tw1d.js:887 | in_func_auth=yes@dist/cors-Ftb-tw1d.js:811-816 | auth_kind=other (OAuth bearer JWT validated in-function via issuer JWKS) | anon_reachable=no | priv_side_effect=none (RLS-scoped read via user bearer; no service-role write, no paid call) | note=guard: 'if (!token) { ... challengeResponse(runtime.auth, request, runtime.options, 401) }' + 'if (!authResult.ok) return authResult.response'

DETAIL: (1) CORS '*' is NOT inline in the repo function and does NOT come from _shared/utils.ts corsHeaders; it is set by the bundled @lovable.dev/mcp-js runtime at dist/cors-Ftb-tw1d.js:887 (withCors -> response.headers.set('Access-Control-Allow-Origin','*')) and :895 (corsPreflightResponse). The repo entry supabase/functions/mcp/index.ts imports only src/lib/mcp/index.ts and @lovable.dev/mcp-js@0.24.0/stacks/supabase; it does not reference _shared. (2) In-function auth IS real: src/lib/mcp/index.ts:16-19 declares auth.oauth.issuer({issuer, acceptedAudiences:'authenticated'}); enforcement is createRequestAuthorizer at dist/cors-Ftb-tw1d.js:805-880 which returns a 401 challenge response when the bearer is missing (:811-816) or invalid (:860-868), and verifies JWT signature/issuer/audience via verifyJwtClaims (:591-599). verify_jwt=false in config.toml:449 does NOT count, but the in-function OAuth gate does. Guard is applied before tool execution on all three privileged surfaces: MCP protocol (mcp-BarAJ9N0.js:75-77), REST list-tools (list-tools-BrSIMpBi.js:32-34), REST invoke-tool (rest-Be8uOb6r.js:19-22). (3) A genuinely UNAUTHENTICATED path exists ONLY for /.well-known/oauth-protected-resource: stacks/supabase/index.js:19 routes it to metadataHandler, dispatched at :71 with no authorizer, and protocols/oauth-metadata.js:28-31 has no auth gate (GET/HEAD only). This metadata endpoint is non-privileged (static RFC 9728 document). (4) anon_reachable=no: an anon-key-only browser gets 401 from the authorizer on every tool surface; it can only fetch metadata. (5) priv_side_effect after the guard: tools build a Supabase client with the publishable/anon key + the CALLER'S bearer (tools/shared.ts:24-26) and only .select() (leads.ts:19,41 readOnlyHint; campaigns.ts:22; phone-number-health.ts:22). No service-role client, no insert/update/delete/rpc, no paid provider call (grep across tools/*.ts found zero write/paid patterns; provider names only appear as literals in descriptions/select columns).

**evidence**

- supabase/functions/mcp/index.ts:6  import mcp from "npm:C:\\Users\\charl\\dial-smart-system\\src\\lib\\mcp\\index.ts";
- supabase/functions/mcp/index.ts:8  Deno.serve(createSupabaseHandler(mcp, { functionName: "mcp" }));
- src/lib/mcp/index.ts:16  auth: auth.oauth.issuer({
- src/lib/mcp/index.ts:17  issuer: `https://${projectRef}.supabase.co/auth/v1`,
- src/lib/mcp/index.ts:18  acceptedAudiences: "authenticated",
- supabase/config.toml:446  [functions.mcp]
- supabase/config.toml:449  verify_jwt = false
- node_modules/@lovable.dev/mcp-js/dist/cors-Ftb-tw1d.js:811  if (!token) {
- node_modules/@lovable.dev/mcp-js/dist/cors-Ftb-tw1d.js:815  response: challengeResponse(runtime.auth, request, runtime.options, 401)
- node_modules/@lovable.dev/mcp-js/dist/cors-Ftb-tw1d.js:887  response.headers.set("Access-Control-Allow-Origin", "*");
- node_modules/@lovable.dev/mcp-js/dist/rest-Be8uOb6r.js:21  const authResult = await authorizer.authorize(request, recorder);
- node_modules/@lovable.dev/mcp-js/dist/rest-Be8uOb6r.js:22  if (!authResult.ok) return authResult.response;
- node_modules/@lovable.dev/mcp-js/dist/stacks/supabase/index.js:71  case "metadata": return metadataHandler(req);
- node_modules/@lovable.dev/mcp-js/dist/protocols/oauth-metadata.js:31  if (request.method !== "GET" && request.method !== "HEAD") return withCors(methodNotAllowed("GET, HEAD, OPTIONS"));
- src/lib/mcp/tools/shared.ts:24  return createClient(supabaseUrl, publishableKey, {
- src/lib/mcp/tools/shared.ts:25  global: { headers: { Authorization: `Bearer ${token}` } },
- src/lib/mcp/tools/leads.ts:19  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },

**validation**

Read all four relevant source layers: repo entry (supabase/functions/mcp/index.ts), repo MCP definition (src/lib/mcp/index.ts), repo tools + tools/shared.ts, and the pinned bundled runtime @lovable.dev/mcp-js@0.24.0 (package.json version = 0.24.0, matching the entry's npm:@lovable.dev/mcp-js@0.24.0/stacks/supabase specifier). Grepped the whole dist for Access-Control-Allow-Origin / WWW-Authenticate / 401 / bearer and grepped tools/*.ts for insert|update|delete|upsert|rpc|service_role|fetch|axios|stripe|telnyx|twilio. Confirmed config.toml [functions.mcp] verify_jwt=false with the stated comment. Confirmed repo function imports nothing from _shared (no corsHeaders usage).

**open_questions**

- Does Supabase's platform layer add any CORS headers of its own in front of this function, or is the wildcard entirely from the mcp-js runtime? (platform behavior not observable from the repo)
- Was the deployed version of this function built from this exact pinned 0.24.0 bundle, or has it drifted since last deploy?

**what_i_did_not_check**

- I did not execute the function or issue live HTTP requests, so the 401/CORS behavior is inferred from the pinned source, not observed at runtime.
- I did not inspect every tool file in full (account-summary.ts, recent-calls.ts, campaigns.ts, phone-number-health.ts) line-by-line; the write/paid-call conclusion for those rests on grep plus shared.ts's read-only client construction.
- I did not check whether RLS policies on the queried tables (leads, campaigns, phone_numbers, calls) actually restrict rows to the caller, i.e. whether a valid OAuth token can read another user's rows.
- I did not verify whether any client_id/OAuth-client-claim value is enforced to confine tokens to the lovable MCP client specifically.
- I did not review the mcp-observer function or any sibling functions.

**confidence**: high