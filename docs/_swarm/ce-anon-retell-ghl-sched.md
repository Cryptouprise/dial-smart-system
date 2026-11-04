# ce-anon-retell-ghl-sched

- status: completed
- tldr: 7 edge functions audited: all CORS-wildcard (reconciler none), none anon-reachable; gates are HMAC, service-role bearer, cron token, or getUser.

Audited 7 dial-smart-system edge functions for anon reachability to privileged side effects. Result: all 7 have CORS wildcard (retell-reconciler has NO CORS literal), and NONE is anon-reachable. retell-call-webhook provider path is HMAC-gated (401 at L589-595); health_check is separately gated by service-role equality/getUser (L534-539). retell-reconciler requires exact service-role bearer or RETELL_RECONCILER_CRON_TOKEN (constant-time, L265-277). automation-scheduler requires service-role bearer or AUTOMATION_SCHEDULER_CRON_TOKEN (scheduler-auth.ts:34-49, 401 at L54-59). call-dispatcher and outbound-calling fall back to supabase.auth.getUser(token) (401 on failure) with a service-role short-circuit; the anon key fails getUser. retell-inbound-webhook and ghl-webhook-trigger are hard-disabled with an unconditional 503 before any side effect. Full pipe rows and file:line evidence are in the node artifact.
