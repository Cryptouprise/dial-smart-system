# ce-egress-demo-aiassistant

- status: completed
- tldr: demo-call: real egress, no launch gate, anon-reachable. quick-test-call: no egress, static 503 stub. ai-assistant: egress in code but hard-gated off (always 503).

RESEARCH ONLY deep-pass of 3 functions complete. demo-call: REAL egress (Retell create-phone-call index.ts:350 + follow-up SMS :410 + update-retell-llm mutation :183); verify_jwt=true (config.toml:372); NO launch gate (503s are config/env checks at 231/302/313); CORS '*' :4, no in-function identity check -> anon-browser reachable. quick-test-call: NO egress, static 940B stub, unconditional 503 TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED :19-22, verify_jwt=true (config.toml:6). ai-assistant: egress in code (retell create-phone-number :1931, Twilio Messages.json :1053/:1218/:1329, LLM :2967) but UNREACHABLE - hard gate isAiAssistantToolSurfaceTenantCertified() returns false :2878-2880, 503 :2898 before all egress; 2nd 503 :3003-3013 is post-LLM/pre-tool dead code; real in-function auth :2904-2948. No egress path bypasses the gate.

## Artifact

**Findings**

demo-call: real egress (Retell create-phone-call index.ts:350; follow-up SMS via sms-messaging index.ts:410; provider mutation update-retell-llm:183). verify_jwt=true (config.toml:372). NO launch gate; the three 503s are config/env checks (231 env, 302-306 DEMO_AGENT_CONFIG_INVALID, 313 bad from-number). Dedicated/demo gate configLooksLikeDedicatedDemo 149-161 called at 296 is an agent-config safety check, not a launch lock. CORS '*' line 4; verify_jwt only needs public anon key; no in-function identity check -> anon-browser reachable. quick-test-call: NO egress at all (940B static stub); verify_jwt=true (config.toml:6); unconditional 503 TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED at 19-22; CORS '*' line 2 but inert. ai-assistant: egress in code (retell create-phone-number:1931; Twilio Messages.json 1053/1218/1329; LLM ai.gateway.lovable.dev 2967/3054) but UNREACHABLE: hard gate isAiAssistantToolSurfaceTenantCertified() returns false (2878-2880), 503 AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED at 2898, runs before all egress. Second 503 site 3003-3013 (AI_ASSISTANT_SMS_EGRESS_NOT_CERTIFIED, set 2997) is pre-SMS-egress but post-LLM and dead code due to first gate. Real in-function identity check present (2904-2908 auth required; 2939 service-role branch; 2943 supabase.auth.getUser).

**evidence**

- supabase/config.toml:372
- supabase/config.toml:6
- supabase/config.toml:41
- supabase/functions/demo-call/index.ts:350
- supabase/functions/demo-call/index.ts:410
- supabase/functions/demo-call/index.ts:183
- supabase/functions/demo-call/index.ts:4
- supabase/functions/demo-call/index.ts:231
- supabase/functions/demo-call/index.ts:296
- supabase/functions/demo-call/index.ts:302
- supabase/functions/demo-call/index.ts:313
- supabase/functions/quick-test-call/index.ts:2
- supabase/functions/quick-test-call/index.ts:19
- supabase/functions/quick-test-call/index.ts:22
- supabase/functions/ai-assistant/index.ts:2878
- supabase/functions/ai-assistant/index.ts:2891
- supabase/functions/ai-assistant/index.ts:2898
- supabase/functions/ai-assistant/index.ts:2997
- supabase/functions/ai-assistant/index.ts:3010
- supabase/functions/ai-assistant/index.ts:2904
- supabase/functions/ai-assistant/index.ts:2939
- supabase/functions/ai-assistant/index.ts:2943
- supabase/functions/ai-assistant/index.ts:1931
- supabase/functions/ai-assistant/index.ts:1053
- supabase/functions/ai-assistant/index.ts:2967

**validation**

Read full demo-call/index.ts (438 lines) and quick-test-call/index.ts (25 lines); read ai-assistant/index.ts serve handler 2860-3092 and grepped egress endpoints (retell/twilio/lovable), 503 sites, CORS, and auth across all 3 files. Line numbers cross-checked against config.toml.

**open_questions**

- Whether the anon key shipped to the demo-call frontend is exposed in a public web page (would confirm practical anon reachability, not just theoretical).
- Whether sms-messaging (called by demo-call:410 with service role) is itself launch-gated.

**what_i_did_not_check**

- sms-messaging function's own gate/egress (called by demo-call:410)
- ai-assistant executeToolCall body 670-970 for any non-SMS provider mutation not surfaced by grep (e.g. launch_now campaign dispatch path 2216-2360)
- Whether anon key is publicly embedded in the demo-call frontend bundle
- Other config.toml entries at lines 11/82/107/124/127/135/196/264 that share the 'launch-quarantined in-function' comment but are outside this node's 3 functions

**confidence**: high