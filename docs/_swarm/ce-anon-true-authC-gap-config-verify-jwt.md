# ce-anon-true-authC-gap-config-verify-jwt

- status: completed
- tldr: verify_jwt: 10/11 audited funcs = true (platform gate ON); only telnyx-outbound-ai = false @L401 (in-function auth is sole gate)

Closed node ce-anon-true-authC-gap-config-verify-jwt atomically. All 11 audited functions are present in supabase/config.toml. Exactly ONE has verify_jwt=false: telnyx-outbound-ai @L401 (platform gate OFF; in-function auth is the sole edge gate; its get_call/end_call/health_check 401-on-getUser path is LIVE, only make_call is kill-switched). The other 10 are verify_jwt=true (platform gate ON): retell-agent-management L115, retell-llm-management L118, retell-phone-management L121, twilio-integration L149, retell-force-webhook L177, retell-business-verification L182, telnyx-ai-assistant L398, telnyx-knowledge-base L411, telnyx-insights L416, telnyx-scheduled-events L421. No audited function is absent, so the verify_jwt=true default never applies here. Prior 'true' facts and the false@L401 fact all reconciled/confirmed.

## Artifact

**Findings**

All 11 audited functions are present in C:/Users/charl/dial-smart-system/supabase/config.toml. Exactly ONE has verify_jwt=false: telnyx-outbound-ai (L401). The other 10 have verify_jwt=true (platform gate ON, anon unreachable at the edge). ADDENDUM PIPE TABLE: retell-agent-management | verify_jwt=yes@config.toml:L115 | platform_gate=on | section header L114; platform JWT gate sits in front of handler. retell-business-verification | verify_jwt=yes@config.toml:L182 | platform_gate=on | section header L179, comment L180-181; gated before auth/db. retell-force-webhook | verify_jwt=yes@config.toml:L177 | platform_gate=on | section header L175, comment L176. retell-llm-management | verify_jwt=yes@config.toml:L118 | platform_gate=on | section header L117. retell-phone-management | verify_jwt=yes@config.toml:L121 | platform_gate=on | section header L120. telnyx-ai-assistant | verify_jwt=yes@config.toml:L398 | platform_gate=on | section header L395, comment L396-397; matches prior fact. telnyx-insights | verify_jwt=yes@config.toml:L416 | platform_gate=on | section header L413, comment L414-415 (prior fact cited range L413-416). telnyx-knowledge-base | verify_jwt=yes@config.toml:L411 | platform_gate=on | section header L408, comment L409-410 (prior fact cited range L408-411). telnyx-outbound-ai | verify_jwt=no@config.toml:L401 | platform_gate=OFF | FLAGGED: in-function auth/guard is the SOLE edge gate; comments 'Exact JWT/service auth in-function; Telnyx egress remains launch-quarantined'; only make_call is kill-switched, so get_call/end_call/health_check 401-on-getUser path is LIVE not dead code. telnyx-scheduled-events | verify_jwt=yes@config.toml:L421 | platform_gate=on | section header L418, comment L419-420 (prior fact cited range L418-421). twilio-integration | verify_jwt=yes@config.toml:L149 | platform_gate=on | section header L148. Reconciliation: all 10 prior 'true' facts CONFIRMED; telnyx-outbound-ai=false@L401 CONFIRMED. No audited function is ABSENT from config.toml, so the default (verify_jwt=true platform behavior) does not apply to any audited function. Line-number nuance: for telnyx-* rows the prior facts cited the SECTION-HEADER range; the actual verify_jwt assignment line is the last line of each cited range (insights L416, knowledge-base L411, scheduled-events L421, ai-assistant L398).

**evidence**

- C:/Users/charl/dial-smart-system/supabase/config.toml:115 -> verify_jwt = true (under [functions.retell-agent-management] L114)
- C:/Users/charl/dial-smart-system/supabase/config.toml:118 -> verify_jwt = true (under [functions.retell-llm-management] L117)
- C:/Users/charl/dial-smart-system/supabase/config.toml:121 -> verify_jwt = true (under [functions.retell-phone-management] L120)
- C:/Users/charl/dial-smart-system/supabase/config.toml:149 -> verify_jwt = true (under [functions.twilio-integration] L148)
- C:/Users/charl/dial-smart-system/supabase/config.toml:177 -> verify_jwt = true (under [functions.retell-force-webhook] L175)
- C:/Users/charl/dial-smart-system/supabase/config.toml:182 -> verify_jwt = true (under [functions.retell-business-verification] L179)
- C:/Users/charl/dial-smart-system/supabase/config.toml:398 -> verify_jwt = true (under [functions.telnyx-ai-assistant] L395)
- C:/Users/charl/dial-smart-system/supabase/config.toml:401 -> verify_jwt = false  # Exact JWT/service auth in-function; Telnyx egress remains launch-quarantined (under [functions.telnyx-outbound-ai] L400)
- C:/Users/charl/dial-smart-system/supabase/config.toml:411 -> verify_jwt = true (under [functions.telnyx-knowledge-base] L408)
- C:/Users/charl/dial-smart-system/supabase/config.toml:416 -> verify_jwt = true (under [functions.telnyx-insights] L413)
- C:/Users/charl/dial-smart-system/supabase/config.toml:421 -> verify_jwt = true (under [functions.telnyx-scheduled-events] L418)
- grep findstr /N 'verify_jwt' and 'functions' on config.toml (full line map, 90 verify_jwt lines, 93 function sections)

**validation**

Read superset regions L114-123, L146-185, L393-424 directly to bind each verify_jwt to its enclosing [functions.*] header. Cross-checked against full findstr line map. 11/11 audited functions located; 10 true + 1 false.

**open_questions**

- Does the Supabase platform honor verify_jwt=false exactly as 'no platform JWT gate' in this deployed version, or is there any project-level override (config.toml is the only surface checked here)?

**edge_cases_considered**

- Function absent from config.toml (would default to verify_jwt=true) - checked all 11, none absent
- Multiple verify_jwt keys under one section - none; each section has exactly one immediately following verify_jwt
- Comment-only lines between section header and verify_jwt (seen on telnyx-knowledge-base/insights/scheduled-events, retell-force-webhook/business-verification) - verify_jwt still the section's value
- Prior facts citing ranges (L413-416 etc.) vs actual assignment line - reconciled to the final line of each range

**what_i_did_not_check**

- Whether live deployed function config matches this config.toml (deployment drift) - no API calls permitted
- The actual in-function auth code inside telnyx-outbound-ai that is now the sole gate (separate node)
- project-level Supabase settings outside supabase/config.toml (e.g. dashboard JWT enforcement)

**confidence**: high