# ce-anon-true-authC-retell-phone-management

- status: completed
- tldr: retell-phone-management: CORS wildcard, getUser auth is DEAD (unconditional 503 return L28-36 before try); no 401/403, only 500; no reachable priv effect

Audit of supabase/functions/retell-phone-management/index.ts complete. Row: retell-phone-management | cors_wildcard=yes@6 | in_func_auth=yes@56-66 (dead: unreachable behind L28-36) | auth_kind=getUser | auth_rejects_on_failure=no (throws@63 -> 500@290, never 401/403) | anon_reachable=yes but inert (static 503@28-36) | priv_side_effect=none (L28-36 returns before try) | note=L28-36 unconditional return of 503 PROVIDER_ADMIN_NOT_CERTIFIED short-circuits all auth/API/DB paths.

Key: the whole handler is disabled by an unconditional return at L28-36, placed BEFORE the try block (L38). So the getUser auth at L62 never runs; the 401 question is moot. Even if re-enabled, auth failure throws at L63 and the catch at L287-292 returns 500, not 401/403, so auth failures are indistinguishable from server errors. CORS is wildcard '*' (L6).

## Artifact

**Findings**

retell-phone-management | cors_wildcard=yes@6 | in_func_auth=yes@56-66 (dead: unreachable behind L28-36) | auth_kind=getUser | auth_rejects_on_failure=no (throws@63 -> 500@290, never 401/403) | anon_reachable=yes (but returns only static 503@28-36) | priv_side_effect=none (L28-36 returns before try; Retell fetch + phone_numbers insert/update@94-265 unreachable) | note="return new Response(JSON.stringify({success:false,disabled:true,error_code:'PROVIDER_ADMIN_NOT_CERTIFIED',...}), {status:503, ...}) @L28-36 - unconditional short-circuit before auth/API/DB"

Detail: CORS uses wildcard '*' (L6). Auth code at L56-66 reads token (L56), branches on token === SUPABASE_SERVICE_ROLE_KEY (L58), else calls supabase.auth.getUser(token) (L62). getUser failure THROWS Error('Authentication required') (L63), caught at L287-292 and returned as HTTP 500 (L290) - never 401/403. Decisive fact: an unconditional return at L28-36 (status 503, PROVIDER_ADMIN_NOT_CERTIFIED) sits BEFORE the try block that opens at L38, so no request ever reaches auth, JSON parsing, Retell API calls (L94-279), or phone_numbers DB writes (L205-253).

**evidence**

- index.ts:6
- index.ts:28-36
- index.ts:38
- index.ts:56-66
- index.ts:62
- index.ts:63
- index.ts:287-292
- index.ts:205-253

**validation**

Read the entire 294-line file (L1-160 and L160-294). Verified by indentation and control flow that the return block L28-36 sits outside and before try { at L38, making it unconditional for every non-OPTIONS request. Confirmed the only other early return is OPTIONS at L24-26 and the catch at L287-292 returns 500.

**open_questions**

- Does the deployed artifact on Supabase match this source (is the L28-36 kill switch actually live, or was it added locally and never deployed)?
- Is verify_jwt enabled in supabase/config.toml for this function, which would add platform-level JWT gating in front of the handler?
- Should the L63 auth failure be changed to a 401 once the function is re-enabled?

**edge_cases_considered**

- Non-OPTIONS methods all hit the same L28-36 return, so GET/POST/PUT/DELETE are uniformly neutered.
- OPTIONS preflight (L24-26) returns CORS headers with no body, also no privileged effect.
- Service-role bearer path (L58) is equally unreachable; no internal-service bypass survives the L28-36 kill switch.

**what_i_did_not_check**

- supabase/config.toml verify_jwt setting for this function (platform-level auth outside the file).
- Deployed state: whether the live Supabase function contains the L28-36 kill switch or a prior version with reachable Retell/DB side effects.
- Git history to determine when L28-36 was introduced and whether prior revisions exposed privileged effects.
- The shared helper authorizeOrganizationContext in ../_shared/tenant-context.ts (L3, L67) for its own auth/tenant checks.

**confidence**: high