# sr::ai-internal

- status: completed
- tldr: 9 AI engines audited: 8/9 service-role + hard-disabled (return false->503); only ai-sms-processor live; 2 config files have no auth.

Audited 9 AI internal engines in dial-smart-system for service-role use, hardcoded disable gates, and caller/org verification. 8/9 use service role + are hard-disabled via is*Certified(){return false}->503. Only ai-sms-processor is live (no gate). Two files (ai-assistant-config, ai-configuration-complete) use no service role and have NO auth. Full per-file table in node artifact.

## Artifact

**Findings**

Service-role auth audit of 9 AI internal engines. 8/9 read SUPABASE_SERVICE_ROLE_KEY and createClient with it; 8/9 carry a hardcoded is*Certified(){return false} gate that returns 503 (disabled at entry). Only ai-sms-processor is live (no gate). Two files (ai-assistant-config, ai-configuration-complete) never use service role at all and have NO caller auth. Per-file table below.

**evidence**

- ai-assistant/index.ts:2935 | service-role Y | disabled Y | VERIFIED | gate isAiAssistantToolSurfaceTenantCertified()@2878 return false, 503@2898; getUser@2943; org via authorizeOrganizationContext@2956 (_shared/tenant-context.ts:72-77 checks organization_users membership) -- but code unreachable while gate off
- ai-autonomous-engine/index.ts:5545 | service-role Y | disabled Y | SERVICE-ONLY-TRUST | gate isAutonomousEngineTenantCertified()@5498 false, 503@5518; only token===supabaseKey accepted @5538 (no user JWT)
- ai-brain/index.ts:4688 | service-role Y | disabled Y | VERIFIED | gate isAiBrainTenantCertified()@10 false, 503@4662; getUser@4702; internal branch trusts body userId ONLY when internal:true && token===supabaseKey @4695
- ai-sms-processor/index.ts:159 | service-role Y | disabled N | VERIFIED | no gate; getUser@174; internal path token===serviceRoleKey@167; org derived from organization_users membership via loadMemberOrgIds@57 -> resolveOrganizationId@198 (explicit request.organization_id checked against memberOrgIds, not blindly trusted)
- ai-error-analyzer/index.ts:73 | service-role Y | disabled Y | VERIFIED | gate isAiErrorAnalyzerCertified()@45 false, 503@56; getUser@85; no org_id used (error payload scoped to caller user)
- ai-assistant-config/index.ts | service-role N (LOVABLE_API_KEY only) | disabled Y | UNVERIFIED-CLIENT-ORG | gate isAiConfigurationAssistantCertified()@193 false, 503@204; NO Authorization check; body userId@210 trusted
- ai-configuration-complete/index.ts | service-role N (LOVABLE_API_KEY only) | disabled Y | UNVERIFIED-CLIENT-ORG | gate isAiConfigurationCompletionCertified()@331 false, 503@342; NO Authorization check; body userId@348 trusted
- autonomous-prioritization/index.ts:47 | service-role Y | disabled Y | VERIFIED | gate isAutonomousPrioritizationTenantCertified()@19 false, 503@31; getUser@51
- ml-learning-engine/index.ts:74 | service-role Y | disabled Y | VERIFIED | gate isMlLearningTenantCertified()@50 false, 503@61; getUser@85

**validation**

Read each file's serve() entry, gate function body, and createClient/auth lines directly via file reads and findstr. Confirmed each is*Certified() body is literally `return false;`. Confirmed ai-sms-processor has zero 'Certified' matches (no gate). Confirmed ai-assistant-config/ai-configuration-complete have zero SERVICE_ROLE_KEY matches.

**open_questions**

- Do the disabled engines have accurate gate reasons, or could any be safely re-enabled (ai-sms-processor pattern shows the org-membership derivation already exists in tenant-context.ts)?
- ai-assistant-config / ai-configuration-complete: is org scoping truly absent anywhere, or handled entirely client-side? No server auth exists in these files.

**what_i_did_not_check**

- Deep bodies of ai-brain tool execution and ai-assistant executeToolCall: whether every tool call is org-bound after the gate is removed
- Whether the frontend actually passes service keys to the internal branches of ai-brain/ai-sms-processor/ai-assistant
- Other repository functions outside the 9 named
- ai-sms-processor org derivation edge cases for legacy NULL-organization rows

**confidence**: high