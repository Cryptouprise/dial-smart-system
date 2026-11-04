# security::rls-oldest-O-kill-anon-jwt

- status: completed
- tldr: Live anon JWT in pg_cron migration: both jobs unscheduled + Vault-backed in 2026-07-13 migrations, but the anon key was never rotated and still sits in 4 version-controlled files.

Node security::rls-oldest-O-kill-anon-jwt COMPLETE. Flagged leak confirmed and (partly) remediated in-repo. Fact: supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:17 embeds a live anon-role JWT (role=anon, ref=emonjusymdripmkvtttc, iat 1748736247, exp 2064312247 ~2035) in the pg_cron job automation-scheduler-job. The SAME byte-identical token also sits in a second migration, 20260703224351_unattended_safety_backstops.sql:216 (job campaign-health-autofix), and hardcoded in src/integrations/supabase/client.ts:6 and src/components/AutomationEngine.tsx:53. (a) Both raw-JWT cron jobs are unscheduled by later migrations: 20260713050000_automation_scheduler_cron_auth.sql (unschedule + Vault-backed replacement, service_role-only) and 20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26 (removes campaign-health-autofix with no enable switch). (b) The schedule secret WAS moved out of the migration into vault.decrypted_secrets with a dedicated X-DialSmart-Automation-Cron-Token header, but the anon KEY itself was NEVER rotated - no rotation exists anywhere in the repo (grep for rotat/anon key returns only unrelated phone-number rotation). So the live key remains version-controlled in 4 files. (c) exp ~2064312247 (~2035-05-31), role claim = anon. Token value not reproduced.

## Artifact

**Findings**

1) Confirmed version-controlled live anon-role JWT in a pg_cron HTTP header: supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:17 (cron job automation-scheduler-job, net.http_post to /functions/v1/automation-scheduler on project emonjusymdripmkvtttc). Claims: role=anon, iss=supabase, ref=emonjusymdripmkvtttc, iat=1748736247 (~2025-05-31), exp=2064312247 (~2035-05-31), far from expiry = the project's current live anon/publishable key. Token value NOT reproduced.
2) The SAME byte-identical token is embedded in a SECOND migration the earlier flag missed: supabase/migrations/20260703224351_unattended_safety_backstops.sql:216 (cron job campaign-health-autofix, /functions/v1/campaign-health-monitor).
3) (a) Job presence/replacement: automation-scheduler-job IS unscheduled and replaced by the later migration supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql (lines 20-22 unschedule; 42-61 Vault-backed re-schedule; 74-79 defensive unschedule on apply). The other raw-JWT job campaign-health-autofix IS unscheduled by supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26 (removes ai-autonomous-engine-job, safety-backstops, campaign-health-autofix with no enable switch). Both raw-anon-JWT cron jobs are removed by the 2026-07-13 migration set.
4) (b) Secret moved out of the migration: YES for the schedule. 20260713050000 moves URL/key/token into vault.decrypted_secrets (dial_smart_project_url, dial_smart_publishable_key, dial_smart_automation_scheduler_cron_token), switches the auth header from Authorization: Bearer <anon> to apikey + dedicated header X-DialSmart-Automation-Cron-Token, and gates enablement to service_role. HOWEVER the anon KEY ITSELF is NOT rotated: grep of all migrations for rotat/anon key returns only unrelated phone-number rotation; no migration reissues the anon key.
5) The unrotated live key still sits hardcoded in version control in 4 files: the 2 migrations above, plus src/integrations/supabase/client.ts:6 (SUPABASE_PUBLISHABLE_KEY) and src/components/AutomationEngine.tsx:53 (apikey).
6) Severity: the credential is the anon/publishable role, public by design and gated by RLS, so blast radius is bounded; but it previously authorized an edge function acting with service privileges, which is why the later migration replaced it with a dedicated cron-only token.

**evidence**

- supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:16-17
- supabase/migrations/20260703224351_unattended_safety_backstops.sql:215-216
- supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:20-22,42-61,74-79
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26
- supabase/migrations/20260713063000_quarantine_browser_readable_credentials.sql (adjacent hardening, not key rotation)
- grep 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' over supabase/migrations -> exactly 2 hits, both dated before 20260713
- grep 'rotat|anon key|public anon' over supabase/migrations -> no anon-key rotation
- token-signature grep of source -> src/integrations/supabase/client.ts:6 and src/components/AutomationEngine.tsx:53

**validation**

findstr/agentgrep across supabase/migrations and the wider dial-smart-system tree for job names automation-scheduler-job / campaign-health-autofix, URL functions/v1/automation-scheduler, cron.schedule / cron.unschedule, the JWT prefix, the token signature suffix, and rotation terms. Confirmed unschedule + Vault replacement migrations exist for both jobs and that no rotation migration exists.

**open_questions**

- Are 20260713050000 and 20260713061000 actually applied in the live production DB (cron.job empty of those names)?
- Was the anon/publishable key rotated in the Supabase dashboard (outside repo scope), and do the 4 hardcoded copies now mismatch the live key?
- Are the three vault.decrypted_secrets populated in prod so the replacement scheduler is functional rather than silently disabled?

**edge_cases_considered**

- A migration present in the repo is not proof it ran in production.
- The same token is reused across multiple cron jobs and frontend bundles, so fixing one schedule does not remove the secret from version control.
- Anon key is public by design, so severity is lower than a service_role leak.

**what_i_did_not_check**

- Did not query the live production cron.job table or Supabase project to confirm the legacy jobs are gone and no other anon-JWT job remains.
- Did not inspect the 8+ duplicate copies of this migration under Documents/Codex/2026-07-11/*/work/*/supabase/migrations, which likely replicate the same leak.
- Did not scan .env files, CI config, edge-function source, or other client repos for the same live anon key.
- Did not verify whether this anon key value still matches the project's currently-issued key (requires a Supabase API call).

**confidence**: high