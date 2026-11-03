# security::secdef-rls-bypass::g13

- status: completed
- tldr: 18 SECDEF functions audited; 2 low-severity caller-check gaps flagged, 1 fail-open trigger bug already fixed; most functions gate on membership correctly.

DONE: Audited every SECURITY DEFINER function (incl. trigger functions) in the 10 named migrations under C:/Users/charl/dial-smart-system/supabase/migrations. 18 functions catalogued (12 SECDEF, 5 triggers/INVOKER, 1 defined twice across the DEFINER->INVOKER fix).

TOUCHED: none (research only; read-only). No files written, no live DB access.

KEY FINDINGS:
- GOOD caller checks: org_has_pack (:17), set_org_packs (:53 admin), enforce_organization_scope v2 (:15, INVOKER fix), coach_recent_corrections (:214-221), coach_move_stage (:292-314), org_access_allowed (:134-138), d2d_company_members (:35), plus trigger-only scoping (d2d_scope_knock, set_organization_from_user).
- FLAG (low): default_organization_for_user(uuid) has NO caller check (returns any user's default org); was GRANTed to authenticated but REVOKEd by file 3:23, so mitigated if the fix migration is applied.
- FLAG (low): org_in_good_standing(uuid) has no membership gate; any authenticated caller can probe any org uuid's billing/subscription standing (info-disclosure only).
- FIXED BUG: enforce_organization_scope v1 (file 2:93) was SECURITY DEFINER so its current_user role test never fired (fail-open); file 3:4 replaces it with SECURITY INVOKER.
- Service_role-only functions (append_call_live_transcript :178, coach_move_stage :333) correctly have no authenticated grant plus internal org/call checks.

VALIDATION: full line-numbered reads of all 10 files (no truncation), grants cross-checked to cited lines, confirmed file 6 defines zero functions. Static analysis only.

BLOCKERS/FOLLOW-UPS: could not verify (no DB access) whether 20261029150000_phase1_scope_guard_fix.sql is applied live — if not, both flagged items are live. Also did not read the bodies of user_in_organization/is_org_admin/is_platform_operator (defined outside scope), nor enumerate global/default privileges. See complete_node artifact for the full per-function table.

## Artifact

**Findings**

SECURITY DEFINER inventory across the 10 target migrations. 16 functions total; 12 are SECURITY DEFINER (11 plain + 1 later fixed to INVOKER), plus enforce_organization_scope() appears twice (DEFINER in file 2, replaced INVOKER in file 3). Each entry: name | file:line(create) | language/volatility | returns-trigger? | grants(file:line,role) | tables read/written | explicit caller check.

(1) org_has_pack(uuid,text) | 20261029010000_industry_packs.sql:9 | sql/STABLE/SECDEF | no (boolean) | :33 REVOKE PUBLIC, :34 REVOKE anon, :35 GRANT authenticated+service_role | READS public.organizations (:20) | YES caller check: public.user_in_organization(p_org_id) at :17. GOOD.
(2) set_org_packs(uuid,text[]) | 20261029010000:42 | plpgsql/SECDEF | no (jsonb) | :86 REVOKE PUBLIC, :87 REVOKE anon, :88 GRANT authenticated+service_role | WRITES public.organizations (:70 UPDATE) | YES caller check: public.is_org_admin(p_org_id) at :53 (admin-only). GOOD. Validates pack ids against allowlist (:49-68).
(3) default_organization_for_user(uuid) | 20261029142121_phase1_org_scope.sql:18 | sql/STABLE/SECDEF | no (uuid) | :28 REVOKE PUBLIC, :29 REVOKE anon, :30 GRANT authenticated+service_role; THEN 20261029150000_phase1_scope_guard_fix.sql:23 REVOKE EXECUTE FROM authenticated | READS public.organization_users (:23) | NO caller check: takes p_user_id, returns that user's membership org, NEVER compares auth.uid()=p_user_id and NEVER checks the caller is a member. A signed-in user could call it for an arbitrary uuid and learn that user's default organization_id. INFO-LEAK, WINDOWED: authenticated grant at :30 was revoked by file 3 :23, so live exposure only if file 3 not applied; post-file-3 only service_role/postgres. FLAG (low severity, mitigated).
(4) set_organization_from_user() | 20261029142121:47 | plpgsql/SECDEF | YES trigger (BEFORE INSERT) | :58 REVOKE PUBLIC, :59 REVOKE anon, :60 REVOKE authenticated (no role can call) | calls default_organization_for_user(NEW.user_id); writes NEW.organization_id | N/A (trigger, NEW.user_id). OK.
(5) enforce_organization_scope() v1 | 20261029142121:93 | plpgsql/SECURITY DEFINER | YES trigger | :110 REVOKE ALL FROM PUBLIC,anon,authenticated | calls user_in_organization | KNOWN BUG: body tests current_user IN ('authenticated','anon') (:98) but inside a SECURITY DEFINER body current_user is the owner (postgres) so the browser-role guard NEVER fired => FAIL-OPEN. Explicitly fixed next file.
(6) enforce_organization_scope() v2 (fix) | 20261029150000_phase1_scope_guard_fix.sql:4 | plpgsql/SECURITY INVOKER (CREATE OR REPLACE) | YES trigger | :21 REVOKE ALL FROM PUBLIC,anon,authenticated | calls public.user_in_organization(NEW.organization_id) (:15) | NOW CORRECT: INVOKER makes current_user the real session role; guard fires; also blocks organization_id change on UPDATE (:12) and requires membership on INSERT/UPDATE (:15-16). GOOD.
(7) append_call_live_transcript(uuid,uuid,text,text,boolean,timestamptz) | 20261029170000_browser_phone.sql:126 | plpgsql/SECDEF | no (integer) | :175 REVOKE PUBLIC, :176 REVOKE anon, :177 REVOKE authenticated, :178 GRANT service_role ONLY | READS public.call_logs (:154), READS+WRITES public.call_live_transcripts (:163,:168) | No caller-membership check, but access is restricted to service_role/postgres by grant; instead verifies the call belongs to the passed org (:153-159). OK by service_role-only posture.
(8) coach_proposal_decide_guard() | 20261029180000_live_coach.sql:118 | plpgsql/SECURITY INVOKER | YES trigger (BEFORE UPDATE) | :165 REVOKE ALL FROM PUBLIC,anon,authenticated | none read (NEW/OLD) + auth.uid() | N/A trigger; INVOKER so current_user/browser-role test valid; forces decided_by=auth.uid() (:157) and pending-only decisions. GOOD.
(9) coach_recent_corrections(uuid,text,integer) | 20261029180000:178 | plpgsql/STABLE/SECDEF | no (TABLE) | :258 REVOKE PUBLIC,anon, :259 GRANT authenticated+service_role | READS public.call_live_transcripts (:237), public.coach_proposals (:249) | YES caller check: role from auth.role()/session_user (:214); unless service_role/postgres requires auth.uid() NOT NULL (:216) AND user_in_organization(p_org_id) (:219). GOOD.
(10) coach_move_stage(uuid,uuid,uuid) | 20261029180000:270 | plpgsql/SECDEF | no (jsonb) | :332 REVOKE PUBLIC,anon,authenticated, :333 GRANT service_role ONLY | READS public.leads (:302), public.pipeline_boards (:308), DELETES+INSERTS public.lead_pipeline_positions (:316,:320) | YES membership check for non-service roles (:292-299) plus lead-must-match-org (:303) plus board-in-org (:310-311). GOOD.
(11) guard_organization_billing_columns() | 20261029200000_billing_lock.sql:41 | plpgsql/SECURITY INVOKER | YES trigger (BEFORE UPDATE, trg_guard_organization_billing_columns :87) | :80 REVOKE PUBLIC, :81 REVOKE anon, :82 REVOKE authenticated | NEW/OLD; calls is_platform_operator() (:52) | N/A trigger; INVOKER (current_user genuine) blocks tenants from writing billing_*/grace columns. GOOD.
(12) org_in_good_standing(uuid) | 20261029200000:94 | sql/STABLE/SECDEF | no (boolean) | :119 REVOKE PUBLIC, :120 REVOKE anon, :121 GRANT authenticated+service_role | READS public.organizations (:111) | NO caller check: takes any p_org_id and returns that org's subscription/standing. Any authenticated user can probe any org uuid and learn billing_enabled/subscription_status/unlimited_access. Low-sensitivity info-disclosure; intended as a predicate, but no membership gate. FLAG (low).
(13) org_access_allowed(uuid) | 20261029200000:127 | sql/STABLE/SECDEF | no (boolean) | :144 REVOKE PUBLIC, :145 REVOKE anon, :146 GRANT authenticated+service_role | calls is_platform_operator(), user_in_organization(p_org_id), org_in_good_standing(p_org_id) | YES caller check: operator OR (membership AND standing) (:134-138). GOOD.
(14) d2d_touch_updated_at() | 20261102234500_door_to_door_core.sql:105 | plpgsql, NO SECURITY DEFINER (= INVOKER default) | YES trigger | :114 REVOKE ALL FROM PUBLIC,anon,authenticated | NEW only | N/A. OK.
(15) d2d_scope_knock() | 20261102234500:124 | plpgsql/SECDEF | YES trigger (BEFORE INSERT) | :145 REVOKE ALL FROM PUBLIC,anon,authenticated | READS public.d2d_properties (:130) | N/A trigger; forces NEW.organization_id := property's org and rejects cross-org (:136-137). GOOD.
(16) d2d_apply_knock() | 20261102234500:153 | plpgsql/SECDEF | YES trigger (AFTER INSERT) | :171 REVOKE ALL FROM PUBLIC,anon,authenticated | WRITES public.d2d_properties (:158 UPDATE) | N/A trigger; acts on NEW.property_id. OK.
(17) d2d_knock_books_appointment() | 20261103020000_door_to_door_workspace.sql:144 | plpgsql/SECDEF | YES trigger (AFTER INSERT) | :159 REVOKE ALL FROM PUBLIC,anon,authenticated | WRITES public.d2d_appointments (:152 INSERT) | N/A trigger; inserts from NEW org/property/user. OK.
(18) d2d_company_members(uuid) | 20261103023000_door_to_door_members.sql:8 | sql/STABLE/SECDEF | no (TABLE) | :39 REVOKE PUBLIC,anon, :40 GRANT authenticated ONLY (not service_role) | READS public.organization_users (:32), auth.users (:33) | YES caller check: WHERE also requires public.user_in_organization(p_organization_id) (:35) so non-members get zero rows. GOOD. Note search_path includes 'auth' (:19).

No secrets are present in any file (no credentials/keys printed). 20261029190000_sms_per_organization.sql defines ZERO functions (tables/backfill/triggers/policies only) — no SECDEF added there.

**evidence**

- 20261029010000_industry_packs.sql:9-38 (org_has_pack create + grants 33-35 + membership check :17)
- 20261029010000_industry_packs.sql:42-91 (set_org_packs + grants 86-88 + is_org_admin check :53)
- 20261029142121_phase1_org_scope.sql:18-30 (default_organization_for_user, no caller check, grants :28-30)
- 20261029142121_phase1_org_scope.sql:47-60 (set_organization_from_user trigger, grants :58-60)
- 20261029142121_phase1_org_scope.sql:93-110 (enforce_organization_scope DEFINER v1, current_user bug :98, revoke :110)
- 20261029150000_phase1_scope_guard_fix.sql:4-21 (enforce_organization_scope INVOKER v2) and :23 REVOKE default_organization_for_user FROM authenticated
- 20261029170000_browser_phone.sql:126-178 (append_call_live_transcript, service_role-only :178, org-of-call check :153-159)
- 20261029180000_live_coach.sql:118-165 (coach_proposal_decide_guard INVOKER)
- 20261029180000_live_coach.sql:178-259 (coach_recent_corrections, role+membership check :214-221, grants :258-259)
- 20261029180000_live_coach.sql:270-333 (coach_move_stage, service_role-only :333, checks :292-314)
- 20261029200000_billing_lock.sql:41-82 (guard_organization_billing_columns INVOKER)
- 20261029200000_billing_lock.sql:94-121 (org_in_good_standing, no caller check, reads organizations :111)
- 20261029200000_billing_lock.sql:127-146 (org_access_allowed, membership+standing :134-138)
- 20261102234500_door_to_door_core.sql:105-114 (d2d_touch_updated_at, no SECDEF)
- 20261102234500_door_to_door_core.sql:124-149 (d2d_scope_knock) and :153-175 (d2d_apply_knock)
- 20261103020000_door_to_door_workspace.sql:144-163 (d2d_knock_books_appointment)
- 20261103023000_door_to_door_members.sql:8-40 (d2d_company_members, member gate :35)

**validation**

Full-file reads of all 10 migrations via read tool (line-numbered, no truncation left: verified each file end). Cross-referenced grants to within-cited lines. Confirmed file 6 (sms_per_organization) contains no CREATE FUNCTION. Confirmed the enforce_organization_scope DEFINER->INVOKER progression across files 2 and 3 and that file 3:23 revokes default_organization_for_user from authenticated. No live DB query, no execution, read-only.

**open_questions**

- Is 20261029150000_phase1_scope_guard_fix.sql (the fix + the revoke of default_organization_for_user from authenticated) actually APPLIED to the live project emonjusymdripmkvtttc? If not, the default_organization_for_user info-leak and the enforce_organization_scope fail-open are live. Could not verify migration-application order from files alone.
- Is supabase_migrations.schema_migrations confirming 20261029200000_billing_lock.sql applied after phase1 files (the header claims it was renumbered to 20261029160000 but the on-disk filename is 20261029200000)? Version-vs-filename mismatch noted; not verified against live.
- Does org_in_good_standing() need a membership gate, or is org-uuid billing standing considered non-sensitive by design? Design decision, flagging only.

**what_i_did_not_check**

- The bodies of user_in_organization(uuid), is_org_admin(uuid), is_platform_operator(), auth.role() semantics, merge_custom_fields(uuid,jsonb) — these are defined in OTHER migrations outside the 10-file scope; I assumed they check auth.uid() internally as the comments claim (did not read their definitions).
- Whether these migrations were actually applied in order on the live project (no DB/schema access; deployment ordering inferred from file comments only).
- Global/default privileges and role membership grants (e.g. whether PUBLIC or a custom role retains EXECUTE via an ALTER DEFAULT PRIVILEGES not in these files) — not audited.
- Table-level GRANTs to anon on the d2d_* and sms_* tables (RLS is enabled, but base table privileges and any anon/default grants outside these files were not enumerated).
- RLS policies on organizations/auth.users and other referenced tables defined elsewhere — not in scope.
- No runtime execution, EXPLAIN, or `SET ROLE` test — static read-only analysis only.

**confidence**: high