# security::secdef-rls-bypass::g05

- status: completed
- tldr: 5 migrations: no GRANT/REVOKE; 7 SECURITY DEFINER fns, none check auth.uid(), 5/7 lack search_path; views are owner-rights. All HIGH risk.

RESEARCH-ONLY audit of 5 migrations complete. Findings: ZERO GRANT/REVOKE in any of the 5 files; 7 distinct SECURITY DEFINER functions (get_funnel_trend has 2 definitions) and NONE of them check auth.uid() or org/tenant - all trust a caller-supplied p_user_id, and update_variant_stats has no tenant filter at all (WHERE id = p_variant_id). 5 of 7 lack SET search_path (hijack risk). Both call_outcome_dimensions views are plain owner-rights (no security_invoker) with no auth.uid() filter. Verdicts: 8 findings, all HIGH except get_telnyx_assistant_for_call (MEDIUM-HIGH, needs victim user_id).

## Artifact

**Findings**

AUDIT of 5 migrations (20260210_campaign_strategist.sql, 20260210_lead_journey_intelligence.sql, 20260210_phases_5_8_learning.sql, 20260213025718_dbc7682b...sql, 20260223190717_19da5c05...sql). KEY FACTS: (1) ZERO GRANT/REVOKE statements exist in any of the five files (findstr over GRANT|REVOKE|EXECUTE matched only RLS and trigger EXECUTE FUNCTION lines). So no function in scope is explicitly granted EXECUTE in-file. (2) 8 SECURITY DEFINER function definitions across the files; 7 distinct names (get_funnel_trend defined twice). (3) NONE of the 7 has any explicit org/tenant check against auth.uid(); every one trusts a caller-supplied p_user_id (or p_variant_id with no tenant filter at all). (4) 5 of 7 lack 'SET search_path' entirely (mutable search_path on SECURITY DEFINER = hijack risk). (5) Both views (call_outcome_dimensions) are plain owner-rights views with no security_invoker and no auth.uid() filter. ROW: [name | file:line(def)/SECURITY DEFINER line | lang/vol | returns trigger? | GRANT/REVOKE | tables | tenant check] -> get_funnel_trend | campaign_strategist.sql:268 / :284 | plpgsql VOLATILE | no (returns TABLE) | NONE | reads funnel_snapshots (FROM :302, WHERE user_id=p_user_id :303) | NONE vs auth.uid(); p_user_id trusted (line 303) | VERDICT HIGH (cross-tenant read of any user's funnel metrics if executable by authenticated/anon). get_funnel_trend (REDEFINITION) | 20260213025718:39 / :55, SET search_path public :56 | plpgsql VOLATILE | no | NONE | reads funnel_snapshots (:73-75) | NONE; p_user_id trusted | HIGH (same). seed_default_playbook | lead_journey_intelligence.sql:155 / :158 | plpgsql VOLATILE | no (returns INTEGER) | NONE | reads followup_playbook (EXISTS :164), WRITES followup_playbook (INSERT :172,:185,:194,:204,:215,:224,:234) | NONE; p_user_id trusted (WHERE user_id=p_user_id :164, inserts :172+) | HIGH (cross-tenant INSERT/seed into another user's empty playbook). select_script_variant | phases_5_8_learning.sql:142 / :148 (NO SET search_path) | plpgsql VOLATILE | no (returns TABLE) | NONE | reads agent_script_variants (:158,:171) | NONE; p_user_id trusted (:158,:172) | HIGH (cross-tenant read of another user's prompts/model config) + search_path-hijack. update_variant_stats | phases_5_8_learning.sql:195 / :203 (NO SET search_path) | plpgsql VOLATILE | no (returns VOID) | NONE | WRITES agent_script_variants (UPDATE :210, WHERE id=p_variant_id :227) | NONE - no tenant filter AT ALL (:227) | HIGH (cross-tenant WRITE / integrity tampering on any variant) + search_path-hijack. calibrate_lead_scoring_weights | phases_5_8_learning.sql:235 / :238 (NO SET search_path) | plpgsql VOLATILE | no (returns JSONB) | NONE | reads lead_score_outcomes (:253,:273,:290,:307), WRITES lead_scoring_weights (INSERT..ON CONFLICT :323-324) | NONE; p_user_id trusted | HIGH (cross-tenant read+write) + search_path-hijack. rebalance_variant_weights | phases_5_8_learning.sql:353 / :359 (NO SET search_path) | plpgsql VOLATILE | no (returns JSONB) | NONE | reads+WRITES agent_script_variants (SELECT :369,:388,:399; UPDATE :393) | NONE; p_user_id trusted (:371,:389,:400) | HIGH (cross-tenant write) + search_path-hijack. get_telnyx_assistant_for_call | 20260223190717:193 / :195 SET search_path public :195 | plpgsql VOLATILE | no (returns TABLE) | NONE | reads telnyx_assistants (:201,:207) | NONE vs auth.uid(); p_user_id trusted (:202,:208). If p_assistant_id supplied, filters ta.id=p_assistant_id AND ta.user_id=p_user_id (AND'd) so requires knowing victim user_id | MEDIUM-HIGH (cross-tenant read of assistant instructions/greeting if executable). ADJACENT: trigger bodies reference public.update_updated_at_column() (EXECUTE FUNCTION at 20260223190717:174/178/182/186/190) - not defined in these files. Both call_outcome_dimensions views (campaign_strategist.sql:229; 20260213025718:3) are plain owner-rights views joining call_logs/leads/lead_journey_state with NO security_invoker and NO auth.uid() filter -> potential RLS bypass via view owner rights.

**evidence**

- 20260210_campaign_strategist.sql:268 CREATE OR REPLACE FUNCTION get_funnel_trend(p_user_id UUID, p_days INTEGER DEFAULT 14)
- 20260210_campaign_strategist.sql:284 SECURITY DEFINER
- 20260210_campaign_strategist.sql:285 SET search_path TO 'public'
- 20260210_campaign_strategist.sql:302-303 FROM funnel_snapshots fs WHERE fs.user_id = p_user_id
- 20260210_lead_journey_intelligence.sql:155 CREATE OR REPLACE FUNCTION seed_default_playbook(p_user_id UUID)
- 20260210_lead_journey_intelligence.sql:158 SECURITY DEFINER
- 20260210_lead_journey_intelligence.sql:164 IF EXISTS (SELECT 1 FROM followup_playbook WHERE user_id = p_user_id LIMIT 1)
- 20260210_lead_journey_intelligence.sql:172 INSERT INTO followup_playbook (user_id, ...) VALUES (p_user_id, ...)
- 20260210_phases_5_8_learning.sql:142 CREATE OR REPLACE FUNCTION select_script_variant(
- 20260210_phases_5_8_learning.sql:148 SECURITY DEFINER
- 20260210_phases_5_8_learning.sql:195 CREATE OR REPLACE FUNCTION update_variant_stats(
- 20260210_phases_5_8_learning.sql:203 SECURITY DEFINER
- 20260210_phases_5_8_learning.sql:227 WHERE id = p_variant_id
- 20260210_phases_5_8_learning.sql:235 CREATE OR REPLACE FUNCTION calibrate_lead_scoring_weights(p_user_id UUID)
- 20260210_phases_5_8_learning.sql:238 SECURITY DEFINER
- 20260210_phases_5_8_learning.sql:323-324 INSERT INTO lead_scoring_weights (user_id, ...) VALUES (p_user_id, ...)
- 20260210_phases_5_8_learning.sql:353 CREATE OR REPLACE FUNCTION rebalance_variant_weights(
- 20260210_phases_5_8_learning.sql:359 SECURITY DEFINER
- 20260210_phases_5_8_learning.sql:393 UPDATE agent_script_variants SET traffic_weight = ...
- 20260213025718_dbc7682b-121d-4004-a5a3-3b5b6df68372.sql:39 CREATE OR REPLACE FUNCTION get_funnel_trend(...)
- 20260213025718_dbc7682b-121d-4004-a5a3-3b5b6df68372.sql:55 SECURITY DEFINER ; :56 SET search_path TO 'public'
- 20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:193 CREATE OR REPLACE FUNCTION public.get_telnyx_assistant_for_call(p_user_id UUID, p_assistant_id UUID DEFAULT NULL)
- 20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:195 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
- 20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:201-202 FROM telnyx_assistants ta WHERE ta.id = p_assistant_id AND ta.user_id = p_user_id
- findstr /n /i 'GRANT REVOKE SECURITY DEFINER EXECUTE' over the 5 files: only RLS lines + trigger 'EXECUTE FUNCTION' + SECURITY DEFINER headers returned; NO GRANT/REVOKE statements exist
- findstr /n /i 'auth.uid' over the 5 files: matches ONLY on CREATE POLICY lines; zero occurrences inside any function body
- 20260210_campaign_strategist.sql:229 CREATE OR REPLACE VIEW call_outcome_dimensions AS
- 20260213025718_dbc7682b-121d-4004-a5a3-3b5b6df68372.sql:3 CREATE OR REPLACE VIEW call_outcome_dimensions AS

**validation**

Read all 5 files in full (line counts verified: 307, 255, 414, 78, 213). Grep for GRANT/REVOKE/SECURITY DEFINER/EXECUTE and for auth.uid across exactly the 5 in-scope files. Cross-checked every SECURITY DEFINER header against its body text for the presence/absence of a tenant predicate. No secrets printed; only schema/DDL text. No commands run against any live database (read-only repo audit).

**open_questions**

- Does the deployed DB grant EXECUTE on these 7 functions to anon/authenticated (Postgres default PUBLIC EXECUTE, or Supabase default privileges)? In-file there is no GRANT, so exposure depends on defaults and on later revoke migrations outside scope.
- Do later in-scope-adjacent migrations (20260701132102_lock_down_privileged_rpcs_and_definer_views.sql, 20260701132334_pin_function_search_path.sql, 20261029*_phase1_org_scope/scope_guard_fix) revoke EXECUTE, pin search_path, or add auth.uid() guards to these 7 functions? Not checked (outside the 5 named files).
- What is the actual definition of public.update_updated_at_column() (trigger fn)? Defined elsewhere, not in these files.
- Are the call_outcome_dimensions views deployed with security_invoker or owner-rights, and does RLS on call_logs/leads actually apply through them?

**what_i_did_not_check**

- Live pg_proc.proacl / prosecdef / proconfig for these functions - repo files only; deployed DB may differ (a later migration may have revoked EXECUTE or pinned search_path).
- Later hardening migrations in the same repo (e.g. 20260701132102, 20260701132334, 20261029142121_phase1_org_scope) that may retroactively fix these findings - explicitly out of the 5-file scope but materially relevant to exploitability.
- Definition/body of update_updated_at_column (referenced trigger fn) - authored in another migration.
- Table-level RLS policies for funnel_snapshots, lead_score_outcomes, call_logs, leads, agent_script_variants as deployed - only the NEW policies created in these files were read.
- Whether 'authenticated'/'anon' roles actually hold EXECUTE at runtime (depends on Supabase default privileges + any prior/later REVOKE not in scope).
- Non-SECURITY-DEFINER functions and any function-level SET clauses inherited from earlier definitions of the same names.
- The 20260210_ai_intelligence_upgrade.sql and 20260210_autonomous_engine_upgrade.sql files in the same folder - NOT in scope, not read.

**confidence**: medium