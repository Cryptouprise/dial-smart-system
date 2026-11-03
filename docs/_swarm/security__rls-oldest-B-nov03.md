# security::rls-oldest-B-nov03

- status: completed
- tldr: All 11 tables in these 8 migrations have RLS enabled; policies auth.uid()-based and org-blind; 2 permissive inserts later dropped; has_role SECURITY DEFINER reads user_roles.

DONE: RLS audit of 8 2025 migrations in C:/Users/charl/dial-smart-system/supabase/migrations.

TOUCHED: none (research only; wrote no files, no DB/API calls).

EVIDENCE: read all 8 files in full; every CREATE TABLE paired with explicit ENABLE ROW LEVEL SECURITY. Key refs: 20250619152448:3/80 (rotation_settings), :16/85 + :88-89 permissive insert, :27/92, :41/97, :56/106 + :107-110 permissive, :67/113; 20251103034349:42/52 + :55-57/:60-62 (user_roles), :65-74 has_role SECURITY DEFINER, :98/110 + :113-127 (user_credentials), :83-94 (system_health_logs admin gate), :22-36 (phone_numbers), :140-153 (dialing_queues); 20251103034801:6/19, :39/52, :72/86 (dispositions/pipeline_boards/lead_pipeline_positions all auth.uid()); 20251103035736:8,10-12,16-18; 20251103035810:7-16; 20251103035829:3-13 (update_updated_at_column SECURITY DEFINER); 20251106205513:2-3 and 20251107211945:2-19 (phone_numbers ALTER only).

RESULT:
1) RLS at creation: ALL created tables have RLS explicitly ENABLED (rotation_settings A:80, rotation_history A:85, number_orders A:92, dialing_queues A:97, system_health_logs A:106, yellowstone_settings A:113, user_roles B:52, user_credentials B:110, dispositions C:19, pipeline_boards C:52, lead_pipeline_positions C:86). No table created without RLS.
2) Policies: CRUD policies are auth.uid()=user_id or join-based via campaigns/leads. Permissive-at-creation: rotation_history INSERT WITH CHECK(true) (A:88-89, later dropped 20251103035736:8) and system_health_logs SELECT/INSERT WITH CHECK(true) (A:107-110, later dropped 20251103034349:83-84). user_roles adds 'Service role can manage roles' FOR ALL USING(auth.jwt()->>'role'='service_role') (B:60-62).
3) Classification: auth.uid()-based (single-tenant) throughout; ORG-BLIND vs later multi-org model (no organization_id at creation).
4) SECURITY DEFINER: has_role() reads user_roles and is used inside the system_health_logs RLS policy (B:65-74, recreated D:22-31/E:7-16; bypasses user_roles RLS, search_path pinned public). update_updated_at_column() (F:3-13) SECURITY DEFINER fires on triggers for user_credentials/rotation_settings/dialing_queues/yellowstone_settings/dispositions/pipeline_boards; reads no tables. NO SECURITY DEFINER function here reads user_credentials. Credential values never printed.

COULD_NOT: determine live DB RLS state or GRANT/EXECUTE privileges from static files; later org-scope/lockdown migrations not audited.

CONFIDENCE: high.

FOLLOW-UPS for critique gate: (a) whether user_credentials credential_value_encrypted is client-readable via PostgREST (later 20260713063000 quarantine migration hints yes); (b) EXECUTE grants on has_role (role-probing); (c) whether 20260108_phase2_* backfilled org_id and rewrote these user_id policies.

## Artifact

**Findings**

Audit of 8 migrations. ALL tables created in these files have RLS explicitly ENABLED at creation. Per-table (file:line):

FILE A = 20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql
1) rotation_settings: CREATE TABLE A:3; ENABLE RLS A:80; POLICY 'Users can manage their own rotation settings' FOR ALL USING (auth.uid()=user_id) A:81-82. Class: auth.uid()-based (single-user; org-blind). No WITH CHECK on FOR ALL.
2) rotation_history: CREATE TABLE A:16; ENABLE RLS A:85; POLICY SELECT USING(auth.uid()=user_id) A:86-87; POLICY 'System can insert rotation history' FOR INSERT WITH CHECK (true) A:88-89 -> PERMISSIVE/org-blind (any row). SUPERSEDED: dropped in FILE C:8.
3) number_orders: CREATE TABLE A:27; ENABLE RLS A:92; POLICY FOR ALL USING(auth.uid()=user_id) A:93-94. Class: auth.uid()-based.
4) dialing_queues: CREATE TABLE A:41; ENABLE RLS A:97; POLICY FOR ALL USING (auth.uid() IN (SELECT user_id FROM campaigns WHERE id=dialing_queues.campaign_id)) A:98-103. Class: auth.uid()-based via join. Replaced in FILE B:138/140-153.
5) system_health_logs: CREATE TABLE A:56; ENABLE RLS A:106; POLICY SELECT USING(true) A:107-108 -> PERMISSIVE; POLICY FOR INSERT WITH CHECK(true) A:109-110 -> PERMISSIVE. Both dropped in FILE B:83-84.
6) yellowstone_settings: CREATE TABLE A:67; ENABLE RLS A:113; POLICY FOR ALL USING(auth.uid()=user_id) A:114-115. Class: auth.uid()-based. NOTE: column api_key_encrypted TEXT A:70 (value never read/printed).

FILE B = 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql
7) phone_numbers (pre-existing): ADD user_id B:7, backfill B:10, SET NOT NULL B:13; DROP 4 insecure policies B:16-19; CREATE 4 policies SELECT/INSERT/UPDATE/DELETE all auth.uid()=user_id B:22-36. Class: auth.uid()-based (fixed from previously-permissive).
8) user_roles: CREATE TABLE IF NOT EXISTS B:42; ENABLE RLS B:52; POLICY SELECT USING(auth.uid()=user_id) B:55-57; POLICY 'Service role can manage roles' FOR ALL USING (auth.jwt()->>'role'='service_role') B:60-62. Class: auth.uid()-based for users + JWT-claim trust gate for service_role (no TO clause). Data INSERT first user as admin B:77-79.
9) user_credentials: CREATE TABLE IF NOT EXISTS B:98 (columns incl credential_key, credential_value_encrypted TEXT B:102-103); ENABLE RLS B:110; 4 policies SELECT/INSERT/UPDATE/DELETE auth.uid()=user_id B:113-127. Class: auth.uid()-based (org-blind). Credential VALUES not printed.
10) system_health_logs re-policy: SELECT USING(public.has_role(auth.uid(),'admin')) B:87-89; INSERT WITH CHECK(auth.jwt()->>'role'='service_role') B:92-94.
11) dialing_queues re-policy B:140-153 (EXISTS campaigns.user_id=auth.uid AND EXISTS leads.user_id=auth.uid). 12) campaign_leads re-policies B:156-201 (all auth.uid() join-based).

FILE C = 20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql
13) dispositions: CREATE TABLE IF NOT EXISTS C:6; ENABLE RLS C:19; 4 policies CRUD auth.uid()=user_id C:22-36.
14) pipeline_boards: CREATE TABLE C:39; ENABLE RLS C:52; 4 policies auth.uid()=user_id C:55-69.
15) lead_pipeline_positions: CREATE TABLE C:72; ENABLE RLS C:86; 4 policies auth.uid()=user_id C:89-103.

FILE D = 20251103035736: fixes rotation_history insert (drop permissive C-equiv D:8; add service_role D:10-12 and auth.uid() D:16-18).
FILE E = 20251103035810: recreates has_role SECURITY DEFINER SET search_path=public E:7-16.
FILE F = 20251103035829: recreates update_updated_at_column() SECURITY DEFINER SET search_path=public F:3-13 (trigger fn).
FILE G = 20251106205513 + FILE H = 20251107211945: only ALTER phone_numbers (add retell_phone_id G:2-3; add STIR/SHAKEN/spam columns + index H:2-19); NO RLS changes.

SECURITY DEFINER funtions that bypass RLS:
- has_role(uuid,app_role) SECURITY DEFINER, search_path pinned public, READS user_roles (B:65-74, recreated D:22-31, E:7-16). Bypasses user_roles RLS; also invoked INSIDE a RLS policy (system_health_logs B:87-89). search_path is PINNED (mitigates mutable-search_path warning) but a definer function trusted in a policy is a privilege boundary.
- update_updated_at_column() SECURITY DEFINER F:3-13, search_path pinned public; fires on triggers for user_credentials (B:130-133), rotation_settings (A:140-142), dialing_queues (A:144-146), yellowstone_settings (A:148-150), dispositions (C:106-109), pipeline_boards (C:111-114). Does NOT read any table.
- NO SECURITY DEFINER function in these 8 files reads user_credentials (searched). Value columns never printed.

Classification summary: all tables created here are RLS-enabled and user-scoped by auth.uid()=user_id (single-tenant user model) = 'auth.uid()-based', functionally ORG-BLIND relative to the later multi-org model. Only permissive-by-design entries at creation were rotation_history INSERT WITH CHECK(true) (A:88-89, later dropped D:8) and system_health_logs SELECT/INSERT WITH CHECK(true) (A:107-110, later dropped B:83-84).

**evidence**

- C:/Users/charl/dial-smart-system/supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:3,16,27,41,56,67 (CREATE TABLE) and :80,85,92,97,106,113 (ENABLE ROW LEVEL SECURITY)
- 20250619152448-...:81-82,86-89,93-94,98-103,107-110,114-115 (CREATE POLICY)
- 20251103034349_...:7,10,13,16-19,22-36 (phone_numbers), :42,52,55-57,60-62 (user_roles + jwt gate), :65-74 (has_role SECURITY DEFINER), :83-94 (system_health_logs admin gate), :98,110,113-127 (user_credentials)
- 20251103034801_...:6,19,22-36 (dispositions), :39,52,55-69 (pipeline_boards), :72,86,89-103 (lead_pipeline_positions)
- 20251103035736_...:8,10-12,16-18 (rotation_history insert fix), :22-31 (has_role recreate)
- 20251103035810_...:7-16 (has_role recreate) ; 20251103035829_...:3-13 (update_updated_at_column SECURITY DEFINER)
- 20251106205513_...:2-3 and 20251107211945_...:2-19 (phone_numbers ALTER only; no RLS)
- grep for SECURITY DEFINER across the 8 files: only has_role (A-equivalent B:67,D:24,E:9) and update_updated_at_column (F:6)

**validation**

Read each of the 8 files in full with the read tool. Confirmed every CREATE TABLE is followed by an explicit ALTER TABLE ... ENABLE ROW LEVEL SECURITY and enumerated every CREATE POLICY. Verified no CREATE TABLE in these files lacks RLS (0 null-RLS tables). Cross-checked superseding migrations (rotation_history insert dropped in FILE D; system_health_logs permissive policies dropped in FILE B). Scanned for SECURITY DEFINER occurrences. No credential values were read or printed.

**open_questions**

- Do the 4 user_credentials policies permit a user to read credential_value_encrypted directly via PostgREST (column-level exposure), given no column privileges/grants were restricted in these files? Later migration 20260713063000_quarantine_browser_readable_credentials.sql suggests a known exposure; not audited here.
- has_role is SECURITY DEFINER and referenced inside the system_health_logs RLS policy (B:87-89). Whether EXECUTE is granted to anon/authenticated (so a caller could invoke it to probe role membership) is not determinable from these files.
- These tables have no organization_id at creation, so they are org-blind; whether later org-scope migrations (20260108_phase2_*) backfilled org_id and rewrote these policies is out of scope of this node.

**what_i_did_not_check**

- Later migrations that rewrite/absorb these tables' RLS (20260108_phase2_*, 20260713* lockdown migrations).
- Live database state: whether RLS is actually enabled and policies match what these files declare (audited files only, not applied DB).
- GRANT/EXECUTE privileges on has_role and update_updated_at_column.
- Whether phone_numbers/yellowstone_settings/user_credentials credentials are additionally protected by column privileges or views.
- The full role-membership model and whether 'manager' role is enforced anywhere.

**confidence**: high