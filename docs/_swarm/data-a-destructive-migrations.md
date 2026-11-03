# data-a-destructive-migrations

- status: completed
- tldr: Lane (a) done: ranked 6 dangerous migrations - full-table DELETE of lead_pipeline_positions worst; phase2 SET NOT NULL replay aborts; no writes.

REVIEW LANE (a) DANGEROUS MIGRATIONS complete. Read app-map section 8 first; research-only, no writes. Opened every flagged file (3 DROP TABLE, 14 DELETE/TRUNCATE, 14 ALTER COLUMN). Ranked output delivered in the node artifact.

TOP DANGERS (file:line):
1. 20260407220336:1 DELETE FROM lead_pipeline_positions; NO WHERE - full-table wipe, re-wipes every replay. Worst.
2. 20251214221955:3-119 dedup deletes REAL duplicate leads + FK reassignments (idempotent, destroys data each run; :122 DROP TABLE duplicate_leads = temp cleanup, safe).
3. 20260713062000:147 DELETE FROM dnc_list WHERE organization_id IS NULL (+dup :158) - deletes compliance/DNC data.
4. The two phase2 files (20260108_add_org_to_core/additional): SET NOT NULL after a backfill from organizations WHERE slug='default-org'; if that org is gone (20261029142121 replaced it with default_organization_for_user) then default_org_id=NULL -> UPDATE no-ops -> SET NOT NULL ABORTS replay. Both temp-table DROPs are safe.
5. 20261029142121:122-125 SET NOT NULL after membership-based backfill; aborts if any row's user_id lacks org membership.

Guarded/contract files (20260712070000, 20260712010000, 20260712030000, 20260713070000) backfill first or RAISE with a HINT - replay-safe by design. Function-body-only DELETEs (20260111152528, 20260409030000, 20260410135538) do not run at migration time.

Confidence: high on tiers 1-3 (read in full); medium on 20260713070000 (grep+sample). Validation: all 3 DROP TABLE confirmed temp cleanup; every cited line read directly. No repo writes.

Blockers/follow-ups: could not confirm live row counts or applied-state (schema_migrations not queried). The two phase2 replays and the DNC delete are the priority items for the fix lane.

## Artifact

**Findings**

RANKED MOST-DANGEROUS MIGRATIONS (file:line, FACT unless marked THEORY). TIER 1 (unconditional real-data destruction): 1) 20260407220336:1 `DELETE FROM lead_pipeline_positions;` NO WHERE - wipes every tenant's pipeline positions, re-wipes each replay. 2) 20251214221955:3-119 dedup - deletes lead_nudge_tracking + lead_reachability_scores, reassigns lead_id FKs across 7 tables, then DELETE FROM leads (keeps oldest duplicate phone/user) - deletes REAL leads; :122 DROP TABLE duplicate_leads = temp cleanup safe. 3) 20260713062000:147 DELETE FROM dnc_list WHERE organization_id IS NULL (+dup delete :158) - removes DNC/compliance data. 4) 20251214231612:2-11 targeted DELETE for hardcoded phone +12145291531. TIER 2 (SET NOT NULL after default-org backfill, can ABORT replay): 5) 20260108_phase2_add_org_to_additional_tables - :11 SELECT id FROM organizations WHERE slug='default-org'; if absent, default_org_id NULL -> UPDATE no-ops -> SET NOT NULL fails at :27 dnc_list,:57 ai_sms_settings,:87 autonomous_settings,:112 agent_scripts,:147 calendar_integrations,:182 follow_up_sequences,:217 disposition_metrics,:245 pipeline_boards; :271 temp cleanup safe. 6) 20260108_phase2_add_org_to_core_tables same at :12; SET NOT NULL :32 campaigns,:81 leads,:127 phone_numbers,:173 voice_broadcasts,:219 workflows,:265 call_logs,:297 dispositions; :334 temp safe. KEY HAZARD: 20261029142121 replaced 'default-org' with default_organization_for_user(), so both phase2 files likely ABORT on replay. 7) 20261029142121:122-125 SET NOT NULL after backfill :33-44 via default_organization_for_user; fails if a row's user_id lacks membership (self-documented :4-5: 5 NULL leads, 519 NULL call_logs); FKs RESTRICT :8-11. TIER 3 (guarded, abort safely): 8) 20260712070000 - DO block :103-136 drops all org FKs on campaigns/leads/phone_numbers/call_logs, re-adds RESTRICT FK + ALTER COLUMN SET NOT NULL :138-153, guarded by RAISE :95; function-internal DELETE :1168 scoped. 9) 20260712010000 COALESCE backfill :14-33 then SET NOT NULL :35-41 replay-safe; DROP CONSTRAINT IF EXISTS :44 before ADD :46-48. 10) 20260712030000:6-15 ADD COLUMN + gen_random_uuid backfill + SET NOT NULL, replay-safe. 11) 20260713070000 ADD COLUMN IF NOT EXISTS then SET NOT NULL :213-243 - THEORY replay-safe only if seed rows exist. TIER 4 (additive / function-body-only): 12) 20260111152528 DELETE only inside cleanup_old_guardian_alerts() body :28; but CREATE POLICY without IF NOT EXISTS :5-18 fails on replay. 13) 20260712040000 DROP CONSTRAINT IF EXISTS :36 + re-ADD :39 safe. 14) 20260713130000 flagged DELETE is GRANT + BEFORE DELETE RAISE triggers :516,608. 15) 20260409030000:121 and 20260410135538:134 DELETE only inside retention functions. 16) 20260420232011:1-11 scoped test delete+upsert. 17) 20251103034349:10,13 UPDATE first-user backfill + SET NOT NULL (arbitrary ownership smell). 18) 20260409210001:2 additive DEFAULT. 19) 20260719100000:8-9 ADD COLUMN no default then SET NOT NULL :20-21 + DROP NOT NULL :19; fails if table non-empty. 20) 20260713072000:15-16,121-122 same non-empty-table SET NOT NULL risk. RECON VERIFIED: all three DROP TABLE occurrences are temp-table cleanup.

**evidence**

- 20260407220336_3e4797af:1
- 20251214221955_8054901e:3-119,122
- 20260713062000_dnc_tenant_uniqueness_contract.sql:147,158
- 20251214231612_dbda3e98:2-11
- 20260108_phase2_add_org_to_additional_tables.sql:11,27,57,87,112,147,182,217,245,271
- 20260108_phase2_add_org_to_core_tables.sql:12,32,81,127,173,219,265,297,334
- 20261029142121_phase1_org_scope.sql:4-5,33-44,122-125
- 20260712070000_multi_organization_routing_contract.sql:95,103-153,1168
- 20260712010000_canonical_ai_action_queue_contract.sql:14-48
- 20260712030000_workflow_external_effect_ledger.sql:6-15
- 20260713070000_agent_pricing_schema_contract.sql:213-243
- 20260111152528_3d9ff18b:5-18,28
- 20260712040000_sms_delivery_safety.sql:29-39
- 20260719100000:8-9,19-21
- 20260713072000:15-16,121-122
- 20251103034349_d8aa891c:10,13

**validation**

Every cited line read directly from C:/Users/charl/dial-smart-system/supabase/migrations. DROP TABLE confirmed temp cleanup in all 3 files. All DELETE- and ALTER-flagged files opened individually. No writes.

**open_questions**

- Do live tables campaign_contact_releases / retell_agents hold rows (tier-4 SET NOT NULL risk)?
- Does the live DB still have organizations.slug='default-org' (determines phase2 replay)?

**what_i_did_not_check**

- Full body of 20260713070000 (grep+sample only) - THEORY on replay safety
- Whether migrations are already applied (live schema_migrations)
- Non-destructive context of the remaining ALTER-flagged files
- Ordering interactions between the 20260108 phase2 pair and 20261029142121

**confidence**: high