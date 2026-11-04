# ce-anon-true-authC-gap-rls-migrations

- status: completed
- tldr: All 9 tables have RLS on; but service-role bypass makes the unscoped profile update cross-tenant reachable if the gate flips.

RLS migration audit of the 9 privileged tables is DONE. All 9 exist and all 9 have RLS enabled. Summary (TABLE | rls_enabled | user_scoped_policy):
- retell_business_profiles | yes | yes (auth.uid()=user_id, all CRUD) — but function uses service role, so RLS is bypassed
- retell_verified_numbers | yes | yes (S/I/U by user_id; no DELETE)
- retell_branded_calls | yes | yes (S/I/U by user_id; no DELETE)
- retell_agents | yes | org-scoped (SELECT-only user_in_organization; REVOKE ALL from anon/authenticated)
- telnyx_insight_templates | yes | yes (full CRUD by user_id)
- telnyx_conversation_insights | yes | yes (S/I by user_id; no UPDATE/DELETE)
- telnyx_scheduled_events | yes | yes (full CRUD by user_id)
- call_logs | yes | org-scoped (SELECT-only user_in_organization; REVOKE ALL; service_role DELETE revoked)
- phone_numbers | yes | org-scoped (SELECT-only user_in_organization; REVOKE ALL)

DIRECT ANSWER (FACT): retell-business-verification/index.ts:67 builds its client with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. The update at index.ts:136-139 (.update().eq('id', business_profile_id), NO user_id filter) executes with no tenant predicate. If the gate (index.ts:34-36, currently hard-coded false) were flipped true, an authenticated user could pass another user's business_profile_id in submit_verification and set that foreign row's status='submitted'. RLS is NOT a backstop here; the service-role client is the only protection and it carries no tenant scoping. Cross-tenant write gated only by the disabled flag plus needing a foreign profile UUID.

Evidence: raw migration SQL (20251201054755:56-101; 20260223160016:17-27; 20260223_telnyx_voice_ai_platform:109-148; 20260713071000:6-107; 20260713072000:3-13,211-268) plus the edge function source.

## Artifact

**Findings**

RLS migration audit for the 9 privileged tables touched by the audited edge functions. All 9 tables EXIST and ALL 9 have RLS ENABLED. The 6 retell/telnyx app tables use user_id-scoped policies (auth.uid() = user_id); the 3 core inventory tables (call_logs, phone_numbers, retell_agents) are org-scoped SELECT-only with REVOKE ALL from anon/authenticated. KEY RESULT: retell_business_profiles RLS is user_id-scoped, BUT the audited function retell-business-verification/index.ts builds its client with SUPABASE_SERVICE_ROLE_KEY (index.ts:67), which BYPASSES RLS. Therefore RLS is NOT a backstop for the unscoped update at index.ts:136-139 (.update().eq('id', business_profile_id) with NO user_id filter). If the gate were true, an authenticated caller could submit any other user's business_profile_id and have that foreign row set to status='submitted'. DELIVERABLE TABLE (TABLE | rls_enabled | user_scoped_policy=yes/no | note): retell_business_profiles | yes | yes | RLS on 20251201054755:56; SELECT/INSERT/UPDATE/DELETE by auth.uid()=user_id :61-75. retell_verified_numbers | yes | yes | RLS :57; SELECT/INSERT/UPDATE by auth.uid()=user_id :78-88; no DELETE policy. retell_branded_calls | yes | yes | RLS :58; SELECT/INSERT/UPDATE by auth.uid()=user_id :91-101; no DELETE policy. retell_agents | yes | org-scoped | no repo DDL (20260713072000:3-13); RLS on :212; SELECT-only TO authenticated USING user_in_organization(auth.uid(),organization_id) :259-263; REVOKE ALL from anon/authenticated :238-248. telnyx_insight_templates | yes | yes | RLS 20260223_telnyx_voice_ai_platform:109; full CRUD by auth.uid()=user_id :111-118. telnyx_conversation_insights | yes | yes | RLS 20260223160016:17; SELECT/INSERT by auth.uid()=user_id :20-27; no UPDATE/DELETE policy. telnyx_scheduled_events | yes | yes | RLS 20260223_telnyx_voice_ai_platform:139; full CRUD by auth.uid()=user_id :141-148. call_logs | yes | org-scoped (NOT user_id) | RLS 20260713071000:6; SELECT TO authenticated USING user_in_organization(auth.uid(),organization_id) :40-44; REVOKE ALL from anon/authenticated :29-36; service_role DELETE revoked :47-48; trigger protect_call_log_evidence :53-107. phone_numbers | yes | org-scoped (NOT user_id) | RLS 20260713072000:211; SELECT-only org-scoped :253-257; REVOKE ALL from anon/authenticated :238-248; service_role full CRUD :267; trigger protect_provider_resource_identity :151-209. DIRECT ANSWER: YES (conditional). If the gate were flipped true, the unscoped :136-139 update WOULD let an authenticated user mutate another user's retell_business_profiles row. RLS is NOT a backstop on that path; the service-role client is the only protection and it imposes no tenant filter. Gated only by (a) the disabled gate and (b) needing to know a foreign profile UUID.

**evidence**

- dial-smart-system/supabase/functions/retell-business-verification/index.ts:34-36 gate hard-coded false
- dial-smart-system/supabase/functions/retell-business-verification/index.ts:60-67 createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY) => service role, bypasses RLS
- dial-smart-system/supabase/functions/retell-business-verification/index.ts:136-139 update({status:'submitted'}).eq('id', business_profile_id) with NO .eq('user_id', user.id)
- dial-smart-system/supabase/functions/retell-business-verification/index.ts:122-131 insert retell_verified_numbers with user_id: user.id but caller-supplied business_profile_id
- dial-smart-system/supabase/migrations/20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:56-58 ENABLE RLS on the three retell tables
- dial-smart-system/supabase/migrations/20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:61-101 auth.uid()=user_id policies
- dial-smart-system/supabase/migrations/20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:4,26,41 user_id UUID NOT NULL
- dial-smart-system/supabase/migrations/20260223160016_03a27061-0e47-427c-af74-073e12d8aa57.sql:17-27 telnyx_conversation_insights RLS; SELECT/INSERT by user_id
- dial-smart-system/supabase/migrations/20260223_telnyx_voice_ai_platform.sql:109-148 telnyx_insight_templates + telnyx_scheduled_events RLS, full CRUD by user_id
- dial-smart-system/supabase/migrations/20260713071000_call_log_evidence_boundary.sql:6,29-48,40-44 call_logs RLS, REVOKE ALL, SELECT-only org-scoped, service_role DELETE revoked
- dial-smart-system/supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:3-13 retell_agents DDL absent from repo
- dial-smart-system/supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:211-268 phone_numbers + retell_agents RLS, REVOKE ALL, org-scoped SELECT-only, service_role full CRUD
- dial-smart-system/supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:151-209 protect_provider_resource_identity trigger

**validation**

Read raw migration SQL for all 9 tables and the edge function source; cross-checked grep for ENABLE ROW LEVEL SECURITY (248 hits) and table-name greps. RESEARCH ONLY: nothing written, no DB access.

**open_questions**

- Live prod pg_policies vs repo migrations?
- Other audited functions (telnyx-insights, telnyx-outbound-ai) not re-read for the same unscoped-update pattern?
- Definitions of user_in_organization() helper not inspected?

**edge_cases_considered**

- Gate currently false (index.ts:34-36); exploitability contingent on a future flip.
- Cross-tenant write needs a foreign business_profile_id UUID; not returned by any caller-scoped read in this function.
- The verified-numbers INSERT also bypasses the INSERT policy (service role), so only the profile-id FK constrains it.
- retell_business_profiles has no tenant-immutability trigger, unlike call_logs/phone_numbers/retell_agents.
- org-scoped tables are unaffected: authenticated can only SELECT and only same-org rows.

**what_i_did_not_check**

- Live production pg_policies/pg_roles (no DB access; repo migrations only).
- telnyx-insights and telnyx-outbound-ai index.ts service-role usage and any unscoped writes.
- RLS posture of other referenced tables (leads, campaigns, organizations, provider_callback_receipts).
- Frontend callers reaching submit_verification directly.

**confidence**: high