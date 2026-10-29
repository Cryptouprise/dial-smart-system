# RED-TEAM a build draft before the foreman applies it (lane: ultra, research contract)

You are reviewing a code draft (the `=== FILE:` blocks in the MATERIAL) that another worker produced from a brief. The foreman
will apply it to a LIVE production database and deploy the edge functions. Find everything that would fail, leak, or regress.
The ONLY sources of truth about the live system are `LIVE-SCHEMA.md` and the migration `20261029142121_phase1_org_scope.sql`
(already applied live). The brief the draft answered is also in the material (`briefs/*.md`) - judge the draft against it.

## Known house facts (treat as true)
- Live `user_in_organization` has ONE argument: `user_in_organization(org_id uuid)`; it reads auth.uid() itself. A two-argument
  call `user_in_organization(auth.uid(), org_id)` does NOT exist live and will fail at CREATE POLICY / function call time.
- Live `is_org_admin(org_id uuid)`, `is_platform_operator()`, `merge_custom_fields(uuid, jsonb)` exist. `agent_scripts` does NOT exist live.
- Live `dnc_list` has `phone_number` only (no `phone_number_normalized`) but now HAS `organization_id` (phase 1).
- Core tables (leads, campaigns, call_logs, phone_numbers, dnc_list, dispositions, pipeline_boards, lead_pipeline_positions) now
  have: per-user policies (auth.uid()=user_id) PLUS "Company members can view/insert/update" + "Company admins can delete" policies,
  a BEFORE INSERT trigger `set_organization_from_user` (fills organization_id from the user's membership) and `tenant_scope_guard`
  (browser roles may only write their own company; organization_id may not change). organization_id is NOT NULL on leads,
  campaigns, phone_numbers, call_logs. `call_logs.user_id` is NOT NULL and `call_logs.caller_id` is NOT NULL.
- Migrations are applied through Supabase `apply_migration`, which runs the whole file in one transaction: a draft must NOT contain
  its own BEGIN/COMMIT.
- Edge functions: Deno; secrets via Deno.env.get; webhooks must return 200 fast; user-facing functions verify the caller's JWT.
  Twilio webhooks must validate X-Twilio-Signature. The live `disposition-router` is the deployed version (the repo's main copy has a
  503 "not tenant certified" gate that live may not have - flag any dependency on it).
- Supabase Realtime needs the table added to publication `supabase_realtime` and a REPLICA IDENTITY that includes the row.
- Frontend: React 18, shadcn in `@/components/ui/*`, supabase client `@/integrations/supabase/client`, toast `@/hooks/use-toast`.

## OUTPUT (nothing else)
### 1. BLOCKERS (would fail to apply/deploy, or leak data across companies, or break something the live app does today)
Table: # | file | line in the draft (count lines inside that FILE block) | what is wrong (one sentence, cite the house fact or
LIVE-SCHEMA line) | exact fix (the corrected statement/snippet, complete).
### 2. BRIEF GAPS (things the brief asked for that the draft does not do, or does differently)
Table: # | brief requirement (quote 5-15 words) | what the draft did | fix.
### 3. RISKS (works but fragile: unverified SDK calls, missing index, race, timeout, cost)
Table: # | file:line | risk | mitigation.
### 4. VERDICT: APPLY-AS-IS / APPLY-WITH-FIXES (list the blocker numbers) / REDRAFT (why).
Be literal and complete: a blocker you miss ships to production.
