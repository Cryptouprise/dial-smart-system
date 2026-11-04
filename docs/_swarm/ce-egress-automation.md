# ce-egress-automation

- status: completed
- tldr: All 4 launch-quarantined (503 before egress); ai-engine/workflow-executor/disposition-router have egress behind the gate, ghl-webhook-trigger only enqueues; no gate bypass.

ce-egress-automation done (read-only). All 4 functions are launch-quarantined with an unconditional 503 before any egress. Egress: ai-autonomous-engine YES (raw fetch to sms-messaging/outbound-calling/ai-sms-processor + OpenRouter LLM; verify_jwt=true); workflow-executor YES (functions.invoke outbound-calling/sms-messaging/ai-sms-processor + fetch assistable-make-call; verify_jwt=false); disposition-router YES (invoke sms-messaging/workflow-executor/calendar-integration; verify_jwt=false); ghl-webhook-trigger NO direct egress (only inserts broadcast_queue; verify_jwt=false). Gate helpers are hardcoded return false (no env flag); each 503 runs after OPTIONS and before try/service-role construction, so no egress path bypasses it. ghl-webhook-trigger is the only one answerable anonymously (CORS '*', no auth reached) but 503s before any work; its webhook_key/HMAC checks are dead code and ghl-webhook-signature.ts is not imported. None of the 4 import ghl-webhook-signature/api-auth/control-plane/tenant-context.

## Artifact

**Findings**

All four functions are launch-quarantined and return an unconditional 503 before any egress. EGRESS: ai-autonomous-engine YES (behind gate) - fetchFunctionJson does raw fetch to functions/v1/sms-messaging (:673), outbound-calling (:752), ai-sms-processor (:779), plus OpenRouter LLM egress (:1244,:1465,:2342,:3259,:3716,:3978), and it queues+executes paid actions; verify_jwt=true (config.toml:325). workflow-executor YES - functions.invoke('outbound-calling') :1468, 'sms-messaging' :1542, 'ai-sms-processor' :1607, raw fetch assisstable-make-call :1678; webhook step fail-closed :1740-1748; verify_jwt=false (config.toml:210). disposition-router YES - invoke sms-messaging :690, workflow-executor :664, calendar-integration :747; verify_jwt=false (config.toml:215). ghl-webhook-trigger NO direct egress - no provider call and no functions.invoke, only inserts a broadcast_queue row :313-327 feeding voice-broadcast; verify_jwt=false (config.toml:384). GATES: ai-autonomous-engine isAutonomousEngineTenantCertified() hardcoded return false :5498-5500, checked :5511, 503 :5518; workflow-executor isWorkflowAutomationCertified() hardcoded false :34-36, checked :220, 503 :227; disposition-router isDispositionAutomationTenantCertified() hardcoded false :76-78, checked :89, 503 :97; ghl-webhook-trigger unconditional 503 :88-96 (status :94). Each 503 is returned after OPTIONS and before try/service-role construction, so it precedes the first egress line. ANON REACHABILITY: all use CORS '*'; ai-autonomous-engine requires Bearer == service-role else 401 :5534-5543; workflow-executor and disposition-router require Bearer service-role OR supabase.auth.getUser (:257-282 / :116-129). ghl-webhook-trigger answers anonymously (no auth runs) but only with the 503 stub; its webhook_key/HMAC logic is dead and ghl-webhook-signature.ts is NOT imported. BYPASS: none - every gate is top-level unconditional (helper hardcoded false, no env flag) and only the OPTIONS path returns 200 with no egress. None of the four import ghl-webhook-signature/api-auth/control-plane/tenant-context.

**evidence**

- config.toml:325 ai-autonomous-engine verify_jwt=true; config.toml:384 ghl-webhook-trigger false; config.toml:210 workflow-executor false; config.toml:215 disposition-router false
- ai-autonomous-engine/index.ts:5498-5500 helper returns false; :5511 check; :5518 status 503; :5503 OPTIONS; :5523 try; egress :417 raw fetch functions/v1; :673 sms-messaging; :752 outbound-calling; :779 ai-sms-processor; LLM :1244,:1465,:2342,:3259,:3716,:3978; auth :5534-5543
- ghl-webhook-trigger/index.ts:88-96 unconditional 503 (status :94); :78 OPTIONS; :98 try; :313-327 broadcast_queue insert; :128 webhook_key check dead; :138 rate limit dead; CORS :5; imports :1-2
- workflow-executor/index.ts:34-36 helper returns false; :220 check; :227 status 503; :216 OPTIONS; :232 try; egress :1468 outbound-calling; :1542 sms-messaging; :1607 ai-sms-processor; :1678 fetch assistable-make-call; webhook disabled :1740-1748; auth :257-282
- disposition-router/index.ts:76-78 helper returns false; :89 check; :97 status 503; :81 OPTIONS; :101 try; egress :664 workflow-executor; :690 sms-messaging; :747 calendar-integration; auth :116-129
- agentgrep over the four index.ts for 'ghl-webhook-signature|api-auth|control-plane|tenant-context|functions.invoke|functions/v1/' => 8 matches, all functions.invoke/fetch; 0 matches for shared auth/signature modules

**validation**

Read-only static inspection. Fully read ai-autonomous-engine (5644 lines incl. handler 5498-5644), ghl-webhook-trigger (423), workflow-executor (1891), disposition-router (870). verify_jwt values read from config.toml at lines 325/384/210/215. Cross-checked egress and shared-auth imports via agentgrep regex. No files modified.

**open_questions**

- Is the voice-broadcast worker consuming broadcast_queue itself disabled/gated?
- Do downstream functions (sms-messaging, outbound-calling, ai-sms-processor, assistable-make-call, calendar-integration) carry their own gates?
- Is the ai-autonomous-engine pg_cron job actually removed by the forward safety migration the config comment claims?
- Does any scheduler/wrapper route into these four differently from their own gates?

**edge_cases_considered**

- OPTIONS preflight returns 200 in all four before the gate, but performs no egress, so not a bypass.
- service-role/internal identity branch is evaluated AFTER the 503 gate in workflow-executor and disposition-router, so it cannot skip the gate.
- ghl-webhook-trigger queue insertion counted as indirect egress capability even though the function dials nothing itself.
- Dead code below ghl-webhook-trigger's early return (webhook_key/rate-limit) is unreachable.

**what_i_did_not_check**

- Internals of downstream egress targets (sms-messaging, outbound-calling, ai-sms-processor, assistable-make-call, calendar-integration) and whether they carry their own gates.
- Whether the broadcast_queue consumer / voice-broadcast dialer is currently disabled (affects reachability of ghl-webhook-trigger indirect egress if un-quarantined).
- The forward safety migration that config comments say removes the ai-autonomous-engine pg_cron job.
- Whether _shared/api-auth.ts or control-plane/authorization.ts is used by a wrapping caller distinct from the four files.
- Runtime/behavioral confirmation (static pass only; no deployment, no invocation).

**confidence**: high