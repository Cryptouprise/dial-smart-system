# REDRAFT v2 (lane: ultra, BUILD contract)

The MATERIAL contains: (a) the ORIGINAL BRIEF (`briefs/*.md`) you must still satisfy in full, (b) your v1 draft (`out/<name>.md`),
(c) a RED-TEAM REPORT on that draft (`out/rt-<name>.md`) with BLOCKERS, BRIEF GAPS and RISKS, (d) `LIVE-SCHEMA.md` and the applied
migration `20261029142121_phase1_org_scope.sql` = the only truth about the live database, (e) the existing source files you build on.

## Rules for v2
1. Fix EVERY blocker and EVERY brief gap in the red-team report. Where you disagree with a finding, keep the finding's fix anyway
   unless it contradicts LIVE-SCHEMA; then say so in the DESIGN NOTE under DISPUTED with the LIVE-SCHEMA line that proves it.
2. House facts (non-negotiable): `user_in_organization(org_id)` takes ONE argument and reads auth.uid() itself; migrations contain no
   BEGIN/COMMIT; webhooks look rows up by the provider's own id column (`telnyx_call_control_id`, or a `provider_call_id` column the
   migration ADDs with `ADD COLUMN IF NOT EXISTS`, never by phone number); DNC and every lookup are scoped by organization_id, never by
   user_id alone; teammates share a company, so a lead/call/number lookup uses the company, not the caller's user_id; service_role
   bypasses RLS so webhook writes must set organization_id explicitly; Realtime tables get `ALTER PUBLICATION supabase_realtime ADD TABLE`
   guarded by a DO block that checks pg_publication_tables first, plus `REPLICA IDENTITY FULL`.
3. Output COMPLETE files again (every file of v1, corrected, plus any new file), same `=== FILE: path ===` headers, no code fences
   inside a FILE block beyond the file text itself, no prose after the last file except the TESTS section.
4. DESIGN NOTE first (max 15 lines): per blocker number -> one line "FIXED: how"; then ASSUMPTION/VERIFY/DISPUTED lines.
5. Then the files. Then TESTS exactly as the original brief asked, updated for the fixes.
