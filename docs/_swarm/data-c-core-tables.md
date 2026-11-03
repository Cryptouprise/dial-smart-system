# data-c-core-tables

- status: completed
- tldr: Core tables: dialing_queues + scheduled_follow_ups lack org FK; dialing_queues lacks composite poll index; call_logs lacks created_at ORDER indexes. Cited file:line.

Lane (c) CORE TABLE HEALTH done. For leads, campaigns, dialing_queues, call_logs, scheduled_follow_ups, organizations: PK / org-FK / hot-query index all traced to file:line. Headline flags: (1) dialing_queues and scheduled_follow_ups have NO organization_id FK (tenant inferred via join only); (2) dialing_queues has only single-column indexes (campaign_id/status/scheduled_at) - no composite matching its campaign_id+status ORDER scheduled_at poll (call-dispatcher/index.ts:1574-1580); (3) call_logs has an org FK but NO (user_id,created_at) or full (organization_id,created_at) index for its ORDER created_at history/live queries, only a partial credit index; (4) duplicate redundant org indexes on leads/campaigns/call_logs; (5) types.ts is stale (no dialing_queues block, call_logs org FK missing). org/leads/campaigns otherwise healthy.

## Artifact

**Findings**

CORE TABLE HEALTH (6 tables). PK/FK/index facts from migrations; hot queries from code. Per-table: ORGANIZATIONS: PK id UUID PRIMARY KEY (20260108_phase2_organizations.sql:10), slug UNIQUE (:12); root tenant so no parent FK; indexes idx_organizations_slug(:44), status partial(:45), created(:46). Healthy. LEADS: PK id (types.ts:4733 block; base CREATE TABLE absent from supabase/migrations - PK inferred from inbound FKs dialing_queues.lead_id->leads(id) 20250619152448:122-124); org FK leads_organization_id_fkey REFERENCES organizations RESTRICT + composite (organization_id,user_id)->organization_users (20260712070000:142-167, NOT NULL :145); indexes status/lead_source/created_at/tags GIN (20260107024232:65-68), idx_leads_organization (:83 of phase2), leads_phone_user_unique(phone_number,user_id) (20260110004737:5-6), idx_leads_organization_id (20260712070000:16). Hot org+status and phone-upsert covered. ISSUE minor: duplicate org indexes (idx_leads_organization AND idx_leads_organization_id, re-created at 20260720235049:49). CAMPAIGNS: PK id inferred (types.ts:2129); org FK + composite membership FK, NOT NULL (20260712070000:138-162); idx_campaigns_organization (:35 phase2) + duplicate idx_campaigns_organization_id (:15). Covered. CALL_LOGS: PK id inferred (types.ts:1655); FKs campaign_id->campaigns, lead_id->leads (types.ts:1784-1796); org FK RESTRICT + membership FK NOT NULL (20260712070000:150-177). Hot queries: org+status ORDER created_at DESC (useRealtimeCallStatus:86-89); user_id ORDER created_at DESC (useCallHistory:149-150); lead_id+org ORDER created_at DESC (useCallTracking:57-59). GAP: NO (user_id,created_at) index and NO full (organization_id,created_at) index - only the partial idx_call_logs_credit_pending (organization_id,created_at WHERE credit_deducted=false AND status='completed', 20260124:226-228) which cannot serve these ORDER BY created_at queries; no lead_id index. So call_logs has org FK but its common history/live ORDER BY queries lack backing index. ISSUE moderate: duplicate org index. DIALING_QUEUES: PK id UUID PRIMARY KEY (20250619152448:42); FKs fk_dialing_queues_campaign (campaign_id->campaigns CASCADE :118-120), fk_dialing_queues_lead (lead_id->leads CASCADE :122-124). NO organization_id column - tenant derived only via campaign_id triggers (20260712070000:565-566; 20260713064000:42-60; phase1 list 20261029142121:77 excludes it). Indexes ONLY single-column: campaign_id(:132), status(:133), scheduled_at(:134). Hot poll: .in('campaign_id',ids).eq('status','pending').order('scheduled_at') (call-dispatcher/index.ts:1574-1580); api-gateway .in('campaign_id').eq('status','calling').lt('updated_at') (:1128-1130). NO composite (campaign_id,status,scheduled_at) - PARTIAL match. FLAGS: no org FK; no composite poll/order index. SCHEDULED_FOLLOW_UPS: PK id PRIMARY KEY (20251205153218:58); FKs lead_id->leads CASCADE(:60), sequence_id(:61), current_step_id(:62). NO organization_id column. Index ONLY idx_scheduled_follow_ups_user_status(user_id,status,scheduled_at)(:109). Hot: user_id+status ORDER scheduled_at (useDispositionAutomation:439-444) MATCHES; useCallbacks org-join (useCallbacks:112-122) partially covered. FLAGS: no org FK; lead_id FK unindexed. DRIFT: types.ts is stale - no dialing_queues block at all and call_logs Relationships omit the org FK (types.ts:1782-1797), so types understate live schema. CONTRAST: newer wholesale schema shows the intended pattern the core tables lack - composite indexes (20261028210000:71) and composite same-tenant FKs (:175-188).

**evidence**

- supabase/migrations/20260108_phase2_organizations.sql:10 (organizations PK), :44-46 (org indexes)
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53 (dialing_queues CREATE), :118-124 (FKs), :132-134 (indexes)
- supabase/migrations/20251205153218_06d8fe7f-4188-4afd-ba48-56c4b0c65e17.sql:57-69 (scheduled_follow_ups CREATE), :109 (index)
- supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-35 (campaigns org FK+idx), :74-83 (leads org FK+idx), :258-267 (call_logs org FK+idx)
- supabase/migrations/20260712070000_multi_organization_routing_contract.sql:6-18 (org columns+idx re-assert), :138-177 (org + membership FKs RESTRICT)
- supabase/migrations/20261029142121_phase1_org_scope.sql:7-15 (scope tables), :77 (policy loop table list excludes dialing_queues/scheduled_follow_ups), :122-125 (SET NOT NULL)
- supabase/migrations/20260107024232_abad304f-2fc1-4b64-851d-d6304e53801c.sql:65-68 (leads idx)
- supabase/migrations/20260110004737_47f3c3df-546c-4ca5-af18-509f04afc696.sql:5-6 (leads_phone_user_unique)
- supabase/migrations/20260124_white_label_credits.sql:226-228 (call_logs partial org+created_at index)
- supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:42-60 (dialing_queues tenant RLS via join, no org column)
- supabase/functions/call-dispatcher/index.ts:1574-1580 (dialing_queues poll: campaign_id IN + status=pending ORDER scheduled_at)
- supabase/functions/api-gateway/index.ts:926, :1128-1130 (dialing_queues campaign+status+updated_at)
- src/hooks/useRealtimeCallStatus.ts:86-89 (call_logs org+status ORDER created_at)
- src/hooks/useCallHistory.ts:149-150 (call_logs user_id ORDER created_at)
- src/hooks/useCallTracking.ts:57-59 (call_logs lead_id+org ORDER created_at)
- src/hooks/useDispositionAutomation.ts:439-444 (scheduled_follow_ups user_id+status ORDER scheduled_at)
- src/hooks/useCallbacks.ts:76-85, :112-122 (dialing_queues and scheduled_follow_ups org-joined reads)
- src/integrations/supabase/types.ts:1782-1797 (call_logs Relationships omit org FK), :4818-4826 (leads org FK), :5444-5467 (organizations rows), :2129/:4733 (campaigns/leads blocks)

**validation**

Read-only analysis; no writes, no live DB calls. Each PK/FK/index claim traced to an exact migration line; each hot query traced to exact hook/function lines via ripgrep. Per-table checks done by grep over supabase/migrations for CREATE TABLE / CREATE [UNIQUE] INDEX / REFERENCES / organization_id. No EXPLAIN or live catalog query executed (flagged below).

**open_questions**

- Does the primary dialer eligibility path (beyond the diagnostics query read here) run as an RPC that builds the campaign_id+status+scheduled_at predicate, or also seq-scans dialing_queues? The main dispatch RPC body was not located.
- Is there a composite index on dialing_queues applied outside supabase/migrations (live DB / Lovable dashboard)? Migrations show only three single-column indexes.
- How large are call_logs/leads/dialing_queues live? If small, the missing call_logs ORDER BY indexes are latent, not active pain.

**what_i_did_not_check**

- Live schema: did not connect to Supabase to run pg_indexes / \d - all claims from migration files + a stale types.ts; a repo migration may or may not be applied to production.
- campaign_leads junction table (indexes, PK, org propagation) - out of 6-table scope but relevant to lead<->campaign queries.
- Other tenant tables (phone_numbers, dnc_list, dispositions, pipeline_boards, ai_sms_settings, workflows, voice_broadcasts) touched only via phase1/phase2 migrations.
- Did not run EXPLAIN ANALYZE, so 'index does not match hot query' is a static structural judgement (missing composite), not a measured plan.
- RLS policy efficiency (per-row get_user_organizations subquery) - presence noted, performance not evaluated.
- Base CREATE TABLE for campaigns and leads is absent from supabase/migrations; PK declared FACT-by-inference from types.ts and inbound FKs, not from a DDL line.
- Did not enumerate indexes that may exist only in the running DB (drift the other direction).

**confidence**: medium