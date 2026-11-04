# sr::dialing::gap-rls-backstop

- status: completed
- tldr: RLS is enabled on all 11 tables and IS enforced on the browser path (anon+JWT); only edge functions bypass it. Triggers/constraints are the real cross-tenant backstop.

DONE: Audited RLS + client paths + org-scoping constraints for campaigns, dialing_queues, campaign_leads, voice_broadcasts, broadcast_queue, leads, call_logs, demo_sessions, demo_call_logs, organization_users, dnc_list.

TOUCHED: none (read-only research). Node sr::dialing::gap-rls-backstop completed with typed artifact.

EVIDENCE: certification/recovery-lineage-v12/migrations/20260712000000_live_public_schema_baseline.sql (ROW SECURITY 12449-13114; GRANT ALL to anon/authenticated 13240-14815; RESTRICTIVE demo block 10561) and supabase/migrations/20260712070000, 20260713064000, 20260713071000, 20260713073000, 20260713062000, 20261029142121, 20251209070143, 20260108_phase2_*, 20260601173321; client path src/integrations/supabase/client.ts:4-11 (anon) vs supabase/functions/*/index.ts (service_role).

RESULT: (a) RLS is ENABLED on all 11 tables, each with policies; campaigns/leads/call_logs/dnc_list/dialing_queues are now TENANT-scoped (user_in_organization), while campaign_leads/voice_broadcasts/broadcast_queue stay USER-scoped and demo_* are service_role-only + RESTRICTIVE read-block. (b) RLS is NOT moot: the browser uses the anon key + user JWT and hits these tables directly (RLS enforced); only edge functions use service_role (RLS bypassed). (c) Real role-independent backstops exist and fire for service_role too: SECURITY DEFINER BEFORE triggers (enforce_tenant_owned_core_resource, enforce_campaign_lead_tenant, enforce_dialing_queue_tenant, enforce_dnc_tenant_contract, call_log_evidence_guard, dnc_suppression_identity_guard) plus NOT NULL organization_id, FK->organizations, UNIQUE(organization_id, phone_number_normalized) on dnc_list, UNIQUE(organization_id,user_id) on organization_users, UNIQUE(campaign_id,lead_id) on dialing_queues/campaign_leads. Weakest links: broadcast_queue (no org column, no tenant trigger) and voice_broadcasts (org NOT NULL but no membership trigger) are unprotected against a mis-filtered service_role write; campaign_leads has no org column at all.

COULD_NOT: cannot confirm the live DB actually has the 2026-07-13/2026-10-29 migrations applied (repo presence does not prove applied state); no SQL was run against the project.

CONFIDENCE: medium

## Artifact

**Findings**

(b) MAIN CORRECTION: RLS is NOT moot. The browser app uses the anon/publishable key + user JWT (src/integrations/supabase/client.ts:4-11) and queries/writes these tables DIRECTLY, so RLS is the live enforcement for all frontend reads and writes; the service_role bypass applies only to edge functions. (b) Two paths: edge functions overwhelmingly use SUPABASE_SERVICE_ROLE_KEY (RLS bypassed; e.g. call-dispatcher/index.ts:261, predictive-dialing-engine/index.ts:33, demo-call/index.ts:229); the browser uses the anon key + user JWT (RLS enforced; e.g. BroadcastQueueManager.tsx:107 direct anon .update() on broadcast_queue; CampaignManager.tsx:557 and LeadImportDialog.tsx:375/479 insert campaigns/leads/campaign_leads). A few edge functions also build anon clients (billing-portal:101, coach-decide:83, coach-suggest:89, ghl-shadow-ingest:46, pipeline-management:40). (b) In the 2026-07-12 live baseline ALL 11 tables granted ALL to anon and authenticated, so for the browser path RLS was the sole gate; later boundary migrations narrowed grants on dialing_queues, call_logs and dnc_list. (a) RLS is ENABLED on all 11 tables (baseline ROW SECURITY lines 12449/12491/12515/12533/12569/12575/12581/12611/12743/12818/13114; re-asserted in boundary migrations) and every table has policies. Current policy character: campaigns/leads/call_logs/dnc_list/dialing_queues are TENANT-scoped via public.user_in_organization(auth.uid(), organization_id) (20260712070000:216-311, 20260713064000:41-58, 20260713071000:40-44, 20260713073000:40-53); campaign_leads, voice_broadcasts and broadcast_queue remain USER-scoped (auth.uid()=user_id / campaign ownership) and were never org-scoped; demo_sessions/demo_call_logs are service_role-only plus a RESTRICTIVE anon/authenticated read block (20260601173321:7-12). No FORCE ROW LEVEL SECURITY was found for these tables. (c) Role-independent backstops DO exist and fire even for service_role: BEFORE INSERT/UPDATE SECURITY DEFINER triggers enforce_tenant_owned_core_resource (campaigns/leads/phone_numbers/call_logs; requires NOT NULL organization_id + user_id membership, blocks org/owner change), enforce_call_log_tenant_graph, enforce_campaign_lead_tenant, enforce_campaign_phone_tenant, enforce_dialing_queue_tenant, enforce_dnc_tenant_contract, call_log_evidence_guard, dnc_suppression_identity_guard, dialing_queue_provider_evidence_delete_guard. (c) Constraint catches: NOT NULL organization_id, FK organization_id->organizations, UNIQUE(organization_id, phone_number_normalized) on dnc_list, UNIQUE(organization_id,user_id) on organization_users, UNIQUE(campaign_id,lead_id) on dialing_queues and campaign_leads. (c) WEAKEST LINKS: broadcast_queue has NO organization_id, NO user_id and NO tenant trigger, only FKs broadcast_id->voice_broadcasts(id) ON DELETE CASCADE and lead_id->leads(id) ON DELETE SET NULL (20251209070143:54-55); a service_role insert/update with an arbitrary cross-tenant broadcast_id or lead_id would succeed, protected only by the browser RLS policy chain. voice_broadcasts has organization_id NOT NULL but NO membership trigger, so a service_role write can stamp any existing organization_id. campaign_leads has no organization_id column at all (baseline:3335-3343), so it cannot be org-scoped by RLS; only FK + enforce_campaign_lead_tenant trigger guard it. demo_sessions/demo_call_logs carry no tenant model and their anon GRANT ALL is neutralized only by the RESTRICTIVE policy.

**evidence**

- certification/recovery-lineage-v12/migrations/20260712000000_live_public_schema_baseline.sql ROW SECURITY (RLS enabled) lines 12449 broadcast_queue, 12491 call_logs, 12515 campaign_leads, 12533 campaigns, 12569 demo_call_logs, 12575 demo_sessions, 12581 dialing_queues, 12611 dnc_list, 12743 leads, 12818 organization_users, 13114 voice_broadcasts
- same baseline GRANT ALL ON TABLE <t> TO anon/authenticated/service_role lines 13240-13242, 13832-13834, 13895-13897, 13913-13915, 13949-13951, 13976-13978, 14030-14032, 14039-14041, 14084-14086, 14372-14374, 14813-14815
- same baseline RESTRICTIVE demo_sessions read block at line 10561; campaign_leads columns (id, campaign_id, lead_id, added_at; NO organization_id/user_id) at 3335-3343; UNIQUE(campaign_id,lead_id) at 6458
- supabase/migrations/20260712070000_multi_organization_routing_contract.sql:197-200 ENABLE RLS; 216-228 campaigns tenant policies; 244-256 leads; 299-311 call_logs; 398-416 enforce_tenant_owned_core_resource; 457-460 call_logs_same_tenant_graph; 494-497 campaign_leads_same_tenant; 532-535 campaign_phone_pools_same_tenant; 564-567 dialing_queues_same_tenant
- supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:7 ENABLE; 30-31 REVOKE ALL from anon/authenticated; 41-58 Members view tenant dialing queues; 60-61 GRANT SELECT only; 189-193 delete guard
- supabase/migrations/20260713071000_call_log_evidence_boundary.sql:6; 29-30 REVOKE; 40-44 tenant read policy; 46-47 GRANT SELECT only; 104-107 call_log_evidence_guard
- supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:6; 29-30; 40-53 view/add tenant policies; 55-57 SELECT+INSERT only, service_role DELETE revoked; 85-88 dnc_suppression_identity_guard
- supabase/migrations/20260713062000_dnc_tenant_uniqueness_contract.sql:174-178 organization_id NOT NULL + UNIQUE(organization_id, phone_number_normalized); 206-210 enforce_dnc_tenant_contract
- supabase/migrations/20261029142121_phase1_org_scope.sql:8-11 organization_id FK RESTRICT; 62-69 set_organization_from_user; 111-119 tenant_scope_guard (service_role exempt at 98-100); 122-125 NOT NULL org on leads/campaigns/phone_numbers/call_logs
- supabase/migrations/20251209070143_d04c49b6-0c3d-4390-b508-fde055c427aa.sql:76-77 ENABLE voice_broadcasts/broadcast_queue; 80-95 broadcast_queue policy via voice_broadcasts.user_id; 54 broadcast_id FK ON DELETE CASCADE; 55 lead_id FK ON DELETE SET NULL
- supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:166-207 voice_broadcasts organization_id NOT NULL + org policies
- supabase/migrations/20260108_phase2_organizations.sql:64 UNIQUE(organization_id,user_id); 73 ENABLE organization_users; 130-166 org RLS
- supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:23-34 dialing_queues UNIQUE(campaign_id, lead_id)
- supabase/migrations/20260201201405_c44606be-d9b7-4384-94d9-be79fd6fe5ad.sql:66-68 ENABLE demo_*; 74-88 service_role-only policies
- supabase/migrations/20260601173321_ff6ff43a-ccf4-409e-9df7-29b6b1e818c2.sql:7-12 RESTRICTIVE block on demo_sessions reads
- src/integrations/supabase/client.ts:4-11 browser client uses publishable/anon key; src/components/BroadcastQueueManager.tsx:107-110 direct anon .update() on broadcast_queue; src/components/CampaignManager.tsx:557 anon insert into campaigns; src/components/LeadImportDialog.tsx:375 and 479 anon inserts into leads/campaign_leads; src/components/VoiceBroadcastManager.tsx:297 anon update; src/components/CallSimulator.tsx:920 anon SELECT dialing_queues
- supabase/functions/*/index.ts service_role usage: call-dispatcher:261, predictive-dialing-engine:33, demo-call:229; anon-key clients: billing-portal:101, coach-decide:83, coach-suggest:89, ghl-shadow-ingest:46, pipeline-management:40

**validation**

Static read of all 199 repo migrations plus the captured live public schema baseline (20260712000000). Cross-checked: (1) ROW SECURITY entries for all 11 tables; (2) GRANT/ACL lines to anon/authenticated/service_role; (3) per-table CREATE POLICY; (4) UNIQUE/FK/NOT NULL constraints; (5) BEFORE-trigger tenant guards; (6) actual client construction in src (anon) vs supabase/functions (service_role) and grep of direct table accesses in src. No SQL was executed against any database.

**open_questions**

- Was the live DB actually migrated past 2026-07-13, so grants on dialing_queues/call_logs/dnc_list are narrowed in production? Repo state does not prove applied state.
- Which recovery lineage (v10/v11/v12) is live-certified, and does the running DB match it?
- Are there out-of-band (dashboard-created) policies on the live project?
- Is there a frontend hook layer (useVoiceBroadcasts/useCampaigns) doing direct anon writes beyond the paths seen?

**edge_cases_considered**

- Browser path uses anon key + user JWT, so RLS applies (refutes the GAP premise that RLS is moot).
- service_role has BYPASSRLS, so RLS is genuinely inert on edge-function paths.
- SECURITY DEFINER BEFORE triggers fire regardless of role, so they are the real role-independent backstop.
- Demo tables are public-facing (anon), so they need the RESTRICTIVE guard, not only a service-role policy.
- Tables with organization_id but no membership trigger (voice_broadcasts) can accept a cross-tenant service-role write.
- Tables with no organization_id at all (campaign_leads, broadcast_queue) cannot be org-scoped by RLS or trigger.

**what_i_did_not_check**

- Live DB introspection - did not run SQL against the Supabase project; all RLS/grant/trigger claims come from repo files and the captured baseline.
- Whether the 20260713*/20261029 migrations are actually applied in production.
- The v10 and v11 recovery lineages (only spot-checked v12).
- Per-function audit of all ~95 edge functions for anon-key usage (grep-based only) and every RPC's search_path/privilege handling.
- Storage bucket policies and the frontend hook layer for direct anon writes.
- Whether any out-of-band dashboard-created policies exist on the live project.

**confidence**: medium