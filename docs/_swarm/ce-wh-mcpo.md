# ce-wh-mcpo

- status: completed
- tldr: mcp-observer: no CORS wildcard; tenant-bound api-key auth; launch-quarantined (anon unreachable); post-guard control-plane-mutation.

mcp-observer audit done. FUNC mcp-observer | cors_wildcard=absent | in_func_auth=yes@zapier-observer/handler.ts:374 | auth_kind=api-key | anon_reachable=no | priv_side_effect=control-plane-mutation. No CORS wildcard in call chain; real tenant-bound api-key 401; launch-quarantined (MCP_OBSERVER_LAUNCH_CERTIFIED=false) before parse/auth/db/network; post-guard effect is service-role control-plane receipt claim.

## Artifact

**Findings**

FUNC mcp-observer | cors_wildcard=absent | in_func_auth=yes@zapier-observer/handler.ts:374 | auth_kind=api-key | anon_reachable=no | priv_side_effect=control-plane-mutation. CORS: no Access-Control-Allow-Origin wildcard anywhere in call chain (JSON_HEADERS at zapier-observer/handler.ts:28-32 has no CORS key; grep 'Access-Control-Allow-Origin' over mcp-observer/*.ts, zapier-observer/*.ts, _shared/utils.ts = rc 1, no match). In-function auth: real rejection - extractZapierApiKeyCredential requires Bearer + dsk_live_[A-Za-z0-9]{32} (auth.ts:50-56); resolveServerIdentity null -> 401 AUTHENTICATION_FAILED (handler.ts:373-379). auth_kind=api-key (tenant-bound). anon_reachable=no: index.ts:21 MCP_OBSERVER_LAUNCH_CERTIFIED=false and index.ts:41-43 early-return 503 disabled BEFORE parse/auth/db/network; plus handler.ts:326 disabled guard; also anon key never resolves to a tenant identity -> 401. priv_side_effect=control-plane-mutation: after guard, submitMcpCommand -> claimAndExecute -> config.client.rpc('claim_external_observer_command') (observer-runtime.ts:948-967) service-role durable receipt claim + tenant-scoped reads (client built with service-role key at index.ts:44-46).

**evidence**

- mcp-observer/index.ts:21  const MCP_OBSERVER_LAUNCH_CERTIFIED: boolean = false;
- mcp-observer/index.ts:41-43  if (!MCP_OBSERVER_LAUNCH_CERTIFIED) { return mcpObserverDisabledResponse(); }
- zapier-observer/handler.ts:326  if (!deps.enabled) return apiKeyObserverDisabledResponse(deps.channel);
- zapier-observer/handler.ts:373-378  const resolved = await deps.resolveServerIdentity(credential); if (resolved === null) { return jsonResponse(401, ...); }
- zapier-observer/auth.ts:50-56  !authorizationHeader.startsWith('Bearer ') ... if (!ZAPIER_API_KEY_PATTERN.test(credential)) throw ...
- zapier-observer/handler.ts:28-32  const JSON_HEADERS = Object.freeze({ 'Cache-Control', 'Content-Type', 'X-Content-Type-Options' });  // no CORS
- config.toml:430-434  [functions.mcp-observer] ... verify_jwt = false
- observer-runtime.ts:948-967  await config.client.rpc('claim_external_observer_command', {...})

**validation**

Read index.ts, handler.ts, zapier-observer/handler.ts, zapier-observer/auth.ts, observer-runtime.ts. Grep for Access-Control-Allow-Origin (rc=1 no match) over the ts files + _shared/utils.ts (confirmed EXISTS). Confirmed config.toml:430-434. Read-only, no writes.

**open_questions**

- Whether anon_reachable stays 'no' once MCP_OBSERVER_LAUNCH_CERTIFIED flips: the tenant-bound api-key 401 still gates, but not exercised in this snapshot.

**what_i_did_not_check**

- _shared/control-plane/authorization.ts role/scope internals beyond call site
- _shared/control-plane/observer-executor.ts and schemas.ts details
- Live deployment parity of config.toml verify_jwt
- RLS policies on api_keys/external_control_installations and claim_external_observer_command SQL body

**confidence**: high