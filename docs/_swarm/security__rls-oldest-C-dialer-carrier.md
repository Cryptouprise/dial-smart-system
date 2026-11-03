# security::rls-oldest-C-dialer-carrier

- status: completed
- tldr: All 22 dialer/carrier tables enable RLS but are user-scoped/org-blind; predictive_dialing_stats INSERT permissive; dnc_list not org-wide.

DONE: RLS audit of 7 dialer/carrier migration files (22 tables). Every table: RLS enabled at creation (line quoted), every CREATE POLICY listed with FOR/USING/WITH CHECK + file:line, classified auth.uid()-based / permissive / org-blind.

TOUCHED: none (read-only). Deliverable = node artifact.

EVIDENCE: read each of the 7 files in full. Key refs: 20251109171900:20 (RLS system_settings), :61-63 (predictive_dialing_stats INSERT WITH CHECK(true) = PERMISSIVE); 20251109172000:48-50 (dnc_list FOR ALL USING auth.uid()=user_id); 20251201000000:28-42 (phone_providers 4 policies), :67-81 (provider_numbers), :101-103 (carrier_configs), :134-136 & :198-200 (service_role-gated inserts); 20251201051159:74-77 (RLS all 4 sms_* tables), :80-129; 20251201052229:66-92 (DUPLICATE policy names vs file 1/2); 20251201054755:56-58, :61-101.

RESULT: All 22 tables have RLS enabled at creation and all policies are auth.uid()-based or permissive. CRITICAL: none of these tables has an organization_id column -> ALL are ORG-BLIND (user-scoped only). Permissive items: predictive_dialing_stats INSERT WITH CHECK(true); call_signatures + sms_messages service-role INSERT (auth.jwt()->>'role'='service_role'). Flagged per request: sms_conversations/sms_messages/sms_context_history/ai_sms_settings, phone_providers, provider_numbers, carrier_configs, dnc_list — all user-scoped and org-blind; dnc_list suppression is per-user (UNIQUE(user_id, phone_number)), not org-wide. Also flagged: duplicate table + duplicate-policy-name collisions between 20251201052229 and 20251109* migrations, and retell child tables allow cross-tenant FK references.

COULD_NOT: verify live DB pg_policies state or apply-order outcome (no DB access; static audit only); review later org-scope migrations (out of scope).

CONFIDENCE: medium — full read of all in-scope files; residual uncertainty is live-DB state and later superseding migrations.

## Artifact

**Findings**

RLS AUDIT — dialer/carrier migrations. EVERY table below has RLS ENABLED at creation and EVERY policy is either auth.uid()-based (auth.uid() = user_id) or permissive (WITH CHECK(true) / role-gated). CRITICAL: NO table in these 7 files has an organization_id / org column, so ALL of them are ORG-BLIND by construction. Policies are owner-scoped (user_id) only.

== FILE 1: 20251109171900_concurrency_management.sql ==
- system_settings: RLS ENABLED line 20. Policy 'Users can manage their own system settings' FOR ALL USING(auth.uid()=user_id) L23-25. Class=auth.uid()-based, org-blind. WITH CHECK omitted -> defaults to USING.
- predictive_dialing_stats: RLS ENABLED line 53. Policy 'Users can view their own dialing stats' FOR SELECT USING(auth.uid()=user_id) L56-58. Policy 'System can insert dialing stats' FOR INSERT WITH CHECK(true) L61-63 -> PERMISSIVE INSERT (any role can insert arbitrary rows).
- dialing_queue_priorities: RLS ENABLED line 82. Policy FOR ALL USING(auth.uid()=user_id) L85-87.

== FILE 2: 20251109172000_advanced_dialer_features.sql ==
- advanced_dialer_settings: RLS L17. FOR ALL USING(auth.uid()=user_id) L20-22.
- dnc_list [FLAGGED]: RLS L45. Policy 'Users can manage their own DNC list' FOR ALL USING(auth.uid()=user_id) L48-50. auth.uid()-based, org-blind. UNIQUE(user_id, phone_number) L41 => suppression is PER-USER only, NOT org-wide. FOR ALL includes DELETE and no audit/immutability. Later migrations 20260713062000_dnc_tenant_uniqueness_contract.sql and 20260713073000_irreversible_dnc_browser_boundary.sql exist (out of scope) that likely harden this.
- timezone_rules: RLS L71. FOR ALL USING(auth.uid()=user_id) L74-76.
- caller_id_pool: RLS L109. SELECT USING(auth.uid()=user_id) L112-114; plus 'System can manage caller ID pool' FOR ALL USING(auth.uid()=user_id) L117-119 (name misleading, still user-scoped, redundant).
- contact_list_filters: RLS L140. FOR ALL USING(auth.uid()=user_id) L143-145.

== FILE 3: 20251201000000_multi_carrier_integration.sql ==
- phone_providers [FLAGGED]: RLS L25. 4 policies all auth.uid()=user_id: SELECT L28-30, INSERT WITH CHECK L32-34, UPDATE USING L36-38, DELETE USING L40-42. config_json + api_key_reference (reference only, not secret). org-blind.
- provider_numbers [FLAGGED]: RLS L65. SELECT L67-69, INSERT WITH CHECK L71-73, UPDATE L75-77, DELETE L79-81, all auth.uid()=user_id. org-blind (numbers are shared org assets but scoped per-user).
- carrier_configs [FLAGGED]: RLS L99. 'Users can manage their carrier configs' FOR ALL USING(auth.uid()=user_id) L101-103. org-blind.
- call_signatures: RLS L123. SELECT USING(auth.uid()=user_id) L125-127; INSERT WITH CHECK(auth.uid()=user_id) L129-131; INSERT 'Service role can insert signatures' WITH CHECK(auth.jwt()->>'role'='service_role') L134-136 (role-gated permissive insert). No UPDATE/DELETE -> default-deny.
- rvm_queue: RLS L162. FOR ALL USING(auth.uid()=user_id) L164-166.
- sms_messages [FLAGGED] (file-3 definition): RLS L191. 'Users can manage their SMS messages' FOR ALL USING(auth.uid()=user_id) L193-195; 'Service role can insert SMS' FOR INSERT WITH CHECK(auth.jwt()->>'role'='service_role') L198-200. org-blind.
- follow_ups: RLS L225. FOR ALL USING(auth.uid()=user_id) L227-229.

== FILE 4: 20251201051159_81f3b9b8....sql ==
All 4 RLS ENABLED together L74-77.
- sms_conversations [FLAGGED]: SELECT L80-82, INSERT WITH CHECK L84-86, UPDATE USING L88-90, DELETE USING L92-94, all auth.uid()=user_id. user_id L4 = UUID NOT NULL but NO FK to auth.users. org-blind.
- sms_messages [FLAGGED]: SELECT L97-99, INSERT WITH CHECK L101-103, UPDATE USING L105-107. No DELETE -> deny. COLLISION: CREATE TABLE IF NOT EXISTS sms_messages L16 duplicates FILE 3's sms_messages; effective column set depends on apply order (file 3 = earlier).
- sms_context_history [FLAGGED]: SELECT L110-112, INSERT WITH CHECK L114-116. No UPDATE/DELETE -> deny. Stores conversation AI context (context_window/summary); org-blind.
- ai_sms_settings [FLAGGED]: SELECT L119-121, INSERT WITH CHECK L123-125, UPDATE USING L127-129. No DELETE. org-blind.

== FILE 5: 20251201052229_3e1dc2ae....sql ==
DUPLICATE table creation (advanced_dialer_settings, system_settings, predictive_dialing_stats, dnc_list all already exist from FILE 1/2) + DUPLICATE POLICY NAMES. RLS re-enabled L60-63.
- advanced_dialer_settings: 'Users can manage their own dialer settings' FOR ALL USING(auth.uid()=user_id) L66-69.
- system_settings: 'Users can manage their own system settings' FOR ALL USING(auth.uid()=user_id) L72-75 => SAME NAME as FILE 1 L23 on same table.
- predictive_dialing_stats: 'Users can view their own dialing stats' FOR SELECT USING(auth.uid()=user_id) L78-81 (SAME NAME as FILE 1 L56); 'Users can insert their own dialing stats' FOR INSERT WITH CHECK(auth.uid()=user_id) L83-86 (differs from FILE1's permissive WITH CHECK(true)).
- dnc_list: 'Users can manage their own DNC list' FOR ALL USING(auth.uid()=user_id) L89-92 => SAME NAME as FILE 2 L48.
IMPACT: Postgres errors on CREATE POLICY when the name already exists; so at most one of each colliding pair exists in a live DB. Whether predictive_dialing_stats retains the PERMISSIVE WITH CHECK(true) insert (FILE 1 L63) depends on which migration actually applied.

== FILE 6: 20251201052846_e84cacb2....sql == Nothing but two ALTER TABLE ai_sms_settings adds (ai_provider L2-3, retell_llm_id/retell_voice_id L6-8). No tables, no policies, no RLS change.

== FILE 7: 20251201054755_481b278e....sql ==
RLS ENABLED L56-58.
- retell_business_profiles: SELECT L61-63, INSERT WITH CHECK L65-67, UPDATE USING L69-71, DELETE USING L73-75, all auth.uid()=user_id. Stores registration number/address/contact/website; user_id NOT FK. org-blind.
- retell_verified_numbers: SELECT L78-80, INSERT WITH CHECK L82-84, UPDATE USING L86-88. No DELETE -> deny. org-blind.
- retell_branded_calls: SELECT L91-93, INSERT WITH CHECK L95-97, UPDATE USING L99-101. No DELETE. org-blind.
- Integrity gap (THEORY): child rows reference business_profile_id FK only; policy checks auth.uid()=user_id, so user A can create a row pointing at user B's profile id (FK only needs existence; parent RLS not enforced on FK). Cannot read B's data but can create dangling cross-tenant references.
- L104-110: CREATE OR REPLACE FUNCTION public.update_updated_at_column() SECURITY DEFINER SET search_path=public — globally redefines the shared trigger helper (side effect on any table using it; content is benign, only sets NEW.updated_at).

SUMMARY OF FLAGS REQUESTED: sms_conversations, sms_messages (both definitions), sms_context_history, ai_sms_settings, phone_providers, provider_numbers, carrier_configs, dnc_list — ALL are auth.uid()-based (user_id) and ORG-BLIND; none use USING(true) except predictive_dialing_stats' INSERT (WITH CHECK(true)) and the two service_role-gated INSERTs (auth.jwt role = service_role) on call_signatures and sms_messages.

**evidence**

- 20251109171900_concurrency_management.sql:20 (system_settings RLS), :23-25 (policy FOR ALL USING auth.uid()=user_id), :53/:56-58, :61-63 (WITH CHECK(true)), :82/:85-87
- 20251109172000_advanced_dialer_features.sql:17/:20-22, :45/:48-50 (dnc_list), :71/:74-76, :109/:112-119 (caller_id_pool), :140/:143-145
- 20251201000000_multi_carrier_integration.sql:25/:28-42 (phone_providers), :65/:67-81 (provider_numbers), :99/:101-103 (carrier_configs), :123/:125-136 (call_signatures, incl. service_role insert), :162/:164-166, :191/:193-200 (sms_messages), :225/:227-229
- 20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:74-77 (RLS all 4), :80-94 (sms_conversations), :97-107 (sms_messages), :110-116 (sms_context_history), :119-129 (ai_sms_settings), :4 (user_id no FK)
- 20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:60-63, :66-92 (duplicate policy names system_settings/dnc_list/predictive_dialing_stats)
- 20251201052846_e84cacb2-637d-4b88-a439-eb685686b0ab.sql:2-8 (no tables/policies)
- 20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:56-58 (RLS), :61-75 (business_profiles), :78-88 (verified_numbers), :91-101 (branded_calls), :104-110 (SECURITY DEFINER helper redefinition)

**validation**

Read every one of the 7 target files in full (read tool, complete file contents with line numbers). Cross-checked RLS-enable statements, every CREATE POLICY block (FOR/TO/USING/WITH CHECK), and column definitions for org/tenant columns. Verified policy-name collisions between FILE 1/2 and FILE 5 by comparing policy names + table targets. No secrets printed (api_key_reference is a reference string, not a value). No live DB connection used; findings are static from migration source.

**open_questions**

- Actual live DB state: do the FILE 1/2 policies or the FILE 5 duplicates exist? Requires querying pg_policies (out of scope/RESEARCH-ONLY, no DB access).
- Did FILE 5 error on the duplicate CREATE POLICY statements, and was FILE 5 applied before FILE 1/2 (which would flip which permissive insert exists)?
- Which sms_messages definition (FILE 3 vs FILE 4) is the effective schema in the live DB?
- Do later org-scope migrations (20261029142121_phase1_org_scope.sql, 20260108_phase2_*) add organization_id + org-based policies to these tables, superseding this org-blind state?

**what_i_did_not_check**

- Live database pg_policies / information_schema state (no DB access; audit is static only)
- All other migrations that CREATE/ALTER/DROP these same tables or policies after 20251201 (e.g. 20260713062000_dnc_tenant_uniqueness_contract.sql, 20260713073000_irreversible_dnc_browser_boundary.sql, 20261029142121_phase1_org_scope.sql, 20260108_phase2_*)
- Whether RLS is FORCE-ROW-LEVEL-SECURITY (FORCE) anywhere, and whether table owners bypass RLS
- GRANT/privileges (anon/authenticated/service_role table-level grants) which combine with RLS
- Whether any table here is also a view or exposed via Supabase auto-rest API under a permissive schema
- Edge functions / RPCs (SECURITY DEFINER) that read/write these tables and may bypass RLS

**confidence**: medium