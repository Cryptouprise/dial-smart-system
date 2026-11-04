# ce-anon-true-authC-gap2-project-jwt-enforcement

- status: completed
- tldr: No project-level JWT gate on disk; only per-function config.toml. config.toml is deploy-time-only, so the 11 audited functions' live verify_jwt is UNCONFIRMED.

ce-anon-true-authC-gap2-project-jwt-enforcement DONE (research-only). No project-level JWT gate exists on disk. Only project-settings artifact is supabase/.temp/linked-project.json (ref=emonjusymdripmkvtttc, name 'Number rotator', org=baujfpvrrvhmfxofvzrk) with no JWT fields. No supabase/config.json anywhere (recursive, node_modules excluded). supabase/.temp holds only cli-latest + linked-project.json. .env/.env.example hold only public anon keys (no service-role/JWT secret). ~/.mcp.json supabase = HTTP MCP with project_ref + Bearer PAT only. config.toml [auth] L29-31 is local-dev only. So the parent node's per-function verify_jwt values are the only JWT-gate surface; no independent project-level gate. DRIFT: config.toml is NOT automatically the deployed source of truth - verify_jwt applies only at deploy (deploy_fn.py:16,25; _deploy_voice.py:12-13; SHIP-RUNBOOK step 3). Gates commit a8393da5 (2026-07-13) postdates live's last mass deploy 2026-07-01 (LIVE-VS-MAIN-GATES.md:9-11), and none of the 11 audited functions is in the 11/02 deploy list, so their live verify_jwt is UNCONFIRMED (repo-side only). Live verify_jwt is known only for the functions pulled from the live API (functions-live/README.md: twilio-sms-webhook=false, sms-messaging=false, ai-sms-processor=true, pipeline-management=true, api-gateway=false). Confidence: medium.

## Artifact

**Findings**

FACT: No on-disk artifact encodes a PROJECT-LEVEL JWT gate or override. Supabase's JWT gate is per-function only, and on this machine it is expressed solely in supabase/config.toml. (1) The only project-settings artifact present is supabase/.temp/linked-project.json = {ref: emonjusymdripmkvtttc, name: 'Number rotator', organization_id/slug: baujfpvrrvhmfxofvzrk} - no JWT/enforcement fields. (2) No supabase/config.json exists anywhere in the repo (recursive search, node_modules excluded, 0 hits); supabase/ root contains exactly one config file: config.toml (no config.local.toml). (3) supabase/.temp/ contains only cli-latest ('v3.0.0') and linked-project.json. (4) .env holds only public keys (SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL) - no service-role key, no JWT secret, no project-level JWT toggle. .env.example likewise only VITE_* anon keys. (5) ~/.mcp.json's supabase entry is an HTTP MCP (url=https://mcp.supabase.com/mcp?project_ref=emonjusymdripmkvtttc, Authorization: Bearer sbp_...) - credentials only, no JWT config. (6) config.toml's [auth] block (L29-31) is LOCAL-dev only (enabled=true, site_url=http://localhost:3000); there is no project-level JWT-enforcement key in config.toml. CONCLUSION: the parent node's per-function verify_jwt values in config.toml are the ONLY JWT-gate surface that exists on disk; there is no evidence of an independent project-level gate that would change anon reachability. DRIFT (FACT): config.toml is NOT automatically the deployed source of truth. verify_jwt is applied only when a function is deployed (Supabase CLI merges config.toml [functions.<slug>] verify_jwt at deploy time, or --no-verify-jwt overrides to false). Evidence: scripts/ship/deploy_fn.py passes flags explicitly; scripts/ship/_deploy_voice.py JOBS maps per-slug flags; docs/wholesale/SHIP-RUNBOOK.md step 3 shows per-function verify_jwt set at the 11/02 deploy. Per docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md the gates/config were introduced in commit a8393da5 (2026-07-13) while live was last mass-deployed 2026-07-01, 12 days earlier. NONE of the 11 audited functions appears in the 11/02 deploy list (voice-*, coach-*, sms-messaging, twilio-sms-webhook, ai-sms-processor, stripe-webhook, billing-portal), so their live verify_jwt values are NOT confirmed live - they are repo-side only. Live verify_jwt IS known only for functions actually pulled from the live API: supabase/functions-live/README.md records twilio-sms-webhook=false, sms-messaging=false, ai-sms-processor=true, pipeline-management=true, api-gateway=false (source: mcp get_edge_function / Management API). THEORY (not from disk): Supabase exposes no project-wide 'verify_jwt for all functions' override that would supersede per-function values; anon reachability is therefore governed by each function's own value, and per sibling node ce-anon-absent-* the public anon key is itself a valid JWT that PASSES verify_jwt=true, so the project-level question does not change anon reachability.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/.temp/linked-project.json:1 -> {"ref":"emonjusymdripmkvtttc","name":"Number rotator","organization_id":"baujfpvrrvhmfxofvzrk","organization_slug":"baujfpvrrvhmfxofvzrk"} (no JWT fields)
- C:/Users/charl/dial-smart-system/supabase/ (ls) -> contains only .temp, config.toml, functions, functions-live, migrations, tests; NO config.json / config.local.toml
- Recursive 'config.json' search in C:/Users/charl/dial-smart-system (node_modules excluded) -> 0 results
- C:/Users/charl/dial-smart-system/supabase/.temp/ -> only cli-latest (content 'v3.0.0') and linked-project.json
- C:/Users/charl/dial-smart-system/.env -> key names only: SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, VITE_SUPABASE_PROJECT_ID, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL (no service-role/JWT secret)
- C:/Users/charl/dial-smart-system/.env.example -> VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SENTRY_DSN, VITE_ENVIRONMENT, VITE_APP_VERSION, VITE_ENABLE_MONITORING, VITE_ENABLE_MULTI_TENANCY
- C:/Users/charl/.mcp.json -> mcpServers.supabase = {type: http, url: https://mcp.supabase.com/mcp?project_ref=emonjusymdripmkvtttc, headers.Authorization: Bearer sbp_...} (masked)
- C:/Users/charl/dial-smart-system/supabase/config.toml:29-31 -> [auth] enabled=true, site_url=http://localhost:3000 (local-dev block; no project-level JWT enforcement key anywhere in config.toml)
- C:/Users/charl/dial-smart-system/scripts/ship/deploy_fn.py:16,25 -> 'npx supabase@2.122.0 functions deploy <slug> --project-ref <REF>' + flags (per-deploy verify_jwt; config.toml read by CLI at deploy time)
- C:/Users/charl/dial-smart-system/scripts/ship/_deploy_voice.py:12-13 -> JOBS = [(voice-call-events,[--no-verify-jwt]),(voice-token,[]),(voice-call,[]),(voice-call-action,[])]
- C:/Users/charl/dial-smart-system/docs/wholesale/SHIP-RUNBOOK.md:106-124 -> 'Step 3: deploy the 14 functions ... with these JWT flags - DONE 11/02'; per-function verify_jwt table
- C:/Users/charl/dial-smart-system/docs/wholesale/SHIP-RUNBOOK.md:33 -> '14 edge functions | DEPLOYED 11/02, all ACTIVE with the correct verify_jwt flags'
- C:/Users/charl/dial-smart-system/docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:9-11 -> gates introduced commit a8393da5 (2026-07-13); every gated function on live last deployed 2026-07-01 18:15 UTC, 12 days before the gating commit
- C:/Users/charl/dial-smart-system/supabase/functions-live/README.md:6,22-32 -> live snapshots source = mcp get_edge_function; per-function live verify_jwt: twilio-sms-webhook=false, sms-messaging=false, ai-sms-processor=true, pipeline-management=true, api-gateway=false

**validation**

Enumerated every on-disk project-settings surface the task named: supabase/.temp/linked-project.json (read), supabase/config.json (recursive search = absent), .env + .env.example (key names extracted via PowerShell, values not printed), docs describing the live project (LIVE-VS-MAIN-GATES.md, SHIP-RUNBOOK.md, FINDINGS.md, functions-live/README.md), plus two extra surfaces (~/.mcp.json supabase entry, config.toml [auth] block). Confirmed the deploy-time-only nature of verify_jwt by reading scripts/ship/deploy_fn.py and _deploy_voice.py and cross-checking SHIP-RUNBOOK step 3. Cross-referenced the 11/02 deploy list against the 11 audited function names to establish which functions' live verify_jwt is unverified. Did not call any live API (research-only).

**open_questions**

- What was the live verify_jwt value at the 2026-07-01 deploy for the 11 audited functions? Determining this needs git history of supabase/config.toml before 2026-07-01 (unobtainable here; git log hung >2.5 min) or a live get_edge_function / Management API read of each function's verify_jwt.
- Does the Supabase platform expose ANY project-level JWT-enforcement surface (dashboard or Management API) capable of overriding per-function verify_jwt? Not answerable from on-disk artifacts; requires Supabase product docs/API.
- Do the sibling repos in the same organization (elite-solar-supervised-test, observer-control-plane, operator-command-center, provider-binding-center, call-campaign-genius, pr69-merge, dialer-ghl-buddy) hold any project-level JWT artifact not present in dial-smart-system?

**edge_cases_considered**

- Function absent from config.toml would fall back to the platform default (verify_jwt=true); not the case here (parent node confirmed all 11 present).
- config.toml [auth] block is local-dev scaffolding, not a deployed project setting - distinguished explicitly.
- verify_jwt changes only on deploy; a config.toml edit with no deploy is inert on live (the core drift hazard).
- Live verify_jwt is genuinely known for the functions that WERE redeployed 11/02 and for the ones pulled via get_edge_function, even though it is unknown for the rest.

**what_i_did_not_check**

- git history of supabase/config.toml (git log hung >2.5 min in this OneDrive-hosted repo; cancelled both attempts) - cannot prove the pre-07-01 config.toml verify_jwt values, which is exactly what would settle the drift question.
- Live API read of verify_jwt for the 11 audited functions (research-only: no API calls permitted).
- Supabase official documentation on whether a project-wide JWT gate/override exists.
- Other repos sharing org baujfpvrrvhmfxofvzrk (elite-solar-supervised-test, observer-control-plane, operator-command-center, provider-binding-center, call-campaign-genius, pr69-merge, dialer-ghl-buddy) for a project-level config artifact.
- The dashboard/Management API 'JWT verification' settings for project emonjusymdripmkvtttc (not on disk).

**confidence**: medium