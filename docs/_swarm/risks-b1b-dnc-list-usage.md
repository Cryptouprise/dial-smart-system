# risks-b1b-dnc-list-usage

- status: completed
- tldr: DNC enforced server-side (call-dispatcher, outbound-calling, sms-messaging, voice-call, ai-sms-processor); browser can only INSERT; two reads user-scoped not org-scoped.

Audit of dnc_list / do_not_call enforcement (repo C:/Users/charl/dial-smart-system). Enforcement (server-side, fail-closed): call-dispatcher:1695-1727 (org-scoped normalized, before dial) and outbound-calling:652-693 (org-scoped normalized at provider boundary, skipDncCheck ignored); sms-messaging:194-209 and ai-sms-processor:206-220 (SMS); voice-call:129-142 (browser/Telnyx call start). Display/client-only: src/hooks/useAdvancedDialerFeatures.ts:221-244 checkDNCList, CallSimulator:1138-1147, CallLifecycleReference:121,133. Key finding: evaluate_contact_stop (migrations/20260712020000:196-256) does NOT read dnc_list (only contact_stop_controls), so the two gates are independent. Browser write: src has zero dnc_list write ops; DB grants authenticated SELECT,INSERT only (20260713073000:55 after REVOKE ALL), UPDATE/DELETE privileges revoked and the newest migration 20261029142121:82-85 re-adds policies but no GRANT, plus identity trigger. So browser can INSERT (add) but never update/delete. Tenant-scoping: org-scoped in call-dispatcher/outbound-calling/sms-messaging/voice-call/ai-sms-processor/frontend; NOT org-scoped (user_id only) in ghl-webhook-trigger:266 and voice-broadcast-queue:182. Legacy writers disposition-router:323, voice-broadcast-engine:2393, api-gateway:327 still use dropped onConflict 'user_id,phone_number'/omit org, likely failing on current schema.

Validation: read 3 requested migrations + newest 20261029142121; grepped functions/src for dnc_list and do_not_call and read each hit; confirmed evaluate_contact_stop body; regex-confirmed zero dnc_list writes in src. Static source audit only.

Blockers/follow-ups (open_questions): verify live schema vs repo (docs/wholesale/audit/LIVE-SCHEMA.md says live may still be per-user, dnc_list=28); confirm legacy onConflict writers actually error; check enqueue-time and other surfaces (MCP/packs) for dnc_list writes. Confidence: medium.

## Artifact

**Findings**

ENFORCED before contact (server-side, fail-closed): call-dispatcher/index.ts:1695-1727 hard-stops on dnc_list before dialing (org-scoped by organization_id + phone_number_normalized; throws DNC_SAFETY_UNAVAILABLE on lookup error; blocks and syncs leads.do_not_call) and also calls evaluate_contact_stop at 1731 (throws CONTACT_SAFETY_UNAVAILABLE on error). outbound-calling/index.ts:652-693 assertContactAllowed runs evaluate_contact_stop (653), leads.do_not_call (668-678) and dnc_list org-scoped on phone_number_normalized (685-691), each throwing on error; skipDncCheck is explicitly ignored at the boundary (683). sms-messaging/index.ts:194-209 checks dnc_list by organization_id (198-201) + lead do_not_call (202-207), throwing 403 DNC_BLOCKED before any provider call (matches RAW phone_number variants). voice-call/index.ts:129-142 checks leads.do_not_call + dnc_list org-scoped (raw phone variants) before inserting call_logs and starting the provider leg. ai-sms-processor/index.ts:206-220 reads dnc_list by organization_id (raw phone_number) and skips auto-reply. NOTE: evaluate_contact_stop (migrations/20260712020000:196-256) does NOT consult dnc_list at all (only contact_stop_controls), so the RPC gate and the dnc_list gate are independent; every dial path must call both (call-dispatcher and outbound-calling do).

PARTIALLY ENFORCED / not at send time: voice-broadcast-queue/index.ts:178-190 filters DNC numbers at queue-add time, scoped by USER (eq user_id) not organization_id, raw phone_number. ghl-webhook-trigger/index.ts:262-284 skips DNC before queueing a broadcast, also USER-scoped (eq user_id) + raw phone_number - NOT tenant(org)-scoped.

DISPLAY/CLIENT-ONLY (not a server boundary): src/hooks/useAdvancedDialerFeatures.ts:221-244 checkDNCList (org-scoped, fails closed at 242) feeds validateCall (259-284) in the browser; src/components/CallSimulator.tsx:1138-1147 counts rows for a UI 'system test'; src/components/CallLifecycleReference.tsx:121,133 are doc strings.

BROWSER WRITE: src/ has NO insert/update/delete on dnc_list (regex grep = 0 matches), so the shipped UI cannot write it. DB grants authenticated SELECT,INSERT only (20260713073000:55 after REVOKE ALL 29-36); UPDATE/DELETE privileges are revoked. The later migration 20261029142121:82-85 re-adds permissive UPDATE/DELETE POLICIES for dnc_list but issues no GRANT, so privileges stay revoked, and trigger protect_dnc_suppression_identity (20260713073000:59-88) raises DNC_SUPPRESSION_IRREVERSIBLE on DELETE and DNC_SUPPRESSION_IDENTITY_IMMUTABLE on identity-changing UPDATE. Net: a browser may INSERT (add) a suppression, never update or delete.

READ TENANT-SCOPING: org-scoped (organization_id filter) in call-dispatcher, outbound-calling, sms-messaging, voice-call, ai-sms-processor and frontend checkDNCList. NOT org-scoped (user_id only) in ghl-webhook-trigger:266 and voice-broadcast-queue:182. RLS SELECT policy is org-scoped (20260713073000:40-44; 20261029142121:82 via user_in_organization) but edge functions use service_role which BYPASSES RLS, so they rely solely on explicit filters.

WRITER INCONSISTENCY: retell-call-webhook:1547-1556 is the correct new-style writer (organization_id + onConflict 'organization_id,phone_number_normalized'). Legacy writers still target the dropped constraint / omit org: disposition-router:318-323 and voice-broadcast-engine:2387-2393 upsert with onConflict 'user_id,phone_number', and api-gateway:326-331 inserts without organization_id. Because 20260713062000 dropped the (phone_number,user_id) unique constraint and made organization_id/phone_number_normalized NOT NULL, those legacy upserts are expected to fail ('no unique or exclusion constraint matching ON CONFLICT') at the current schema.

CANONICAL KEY DRIFT: call-dispatcher:1705 and outbound-calling:687 match phone_number_normalized; sms-messaging, voice-call, ai-sms-processor and ghl-webhook-trigger match the RAW phone_number via format variants (format-fragile though normalized stays populated by triggers).

**evidence**

- supabase/migrations/20260712040000_sms_delivery_safety.sql:8-26 normalize_contact_phone; :31-33 dnc_list gets phone_number_normalized+organization_id; :88-91 sync_dnc_normalized_phone trigger; :101-103 idx_dnc_org_normalized_phone.
- supabase/migrations/20260713062000_dnc_tenant_uniqueness_contract.sql:29-34,55-59 drops (phone_number,user_id)/(phone_number_normalized,user_id)/(organization_id,phone_number_normalized) uniqueness; :174-178 NOT NULL + unique (organization_id,phone_number_normalized); :180-210 enforce_dnc_tenant_contract trigger.
- supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:6 ENABLE RLS; :29-36 REVOKE ALL from PUBLIC,anon,authenticated; :40-53 SELECT/INSERT policies; :55 GRANT SELECT,INSERT to authenticated; :56-57 service_role grants; :59-88 protect_dnc_suppression_identity.
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196-256 evaluate_contact_stop reads only contact_stop_controls (no dnc_list).
- supabase/migrations/20261029142121_phase1_org_scope.sql:8 organization_id IF NOT EXISTS; :41 backfill; :65-68 set_organization_from_user trigger; :82-85 permissive company-member policies incl UPDATE/DELETE (no GRANT); :93-119 tenant_scope_guard; :122-125 NOT NULL core tables.
- supabase/functions/call-dispatcher/index.ts:1695-1727; supabase/functions/outbound-calling/index.ts:652-693; supabase/functions/sms-messaging/index.ts:194-209; supabase/functions/voice-call/index.ts:129-142; supabase/functions/ai-sms-processor/index.ts:206-220.
- supabase/functions/voice-broadcast-queue/index.ts:178-190; supabase/functions/ghl-webhook-trigger/index.ts:262-284; supabase/functions/voice-broadcast-engine/index.ts:2383-2404; supabase/functions/disposition-router/index.ts:318-323; supabase/functions/api-gateway/index.ts:326-331; supabase/functions/retell-call-webhook/index.ts:1547-1556.
- src/hooks/useAdvancedDialerFeatures.ts:221-244,259-284; src/components/CallSimulator.tsx:1138-1147; src/components/CallLifecycleReference.tsx:121,133; grep of src for dnc_list write ops = 0 matches.

**validation**

Read all three requested migrations end-to-end plus the newest migration (20261029142121_phase1_org_scope.sql) which also references dnc_list; confirmed migration ordering. Grepped supabase/functions (18 hits/12 files) and src (8 hits/6 files) for dnc_list and do_not_call/doNotCall, then read each hit's surrounding lines. Confirmed evaluate_contact_stop body in its CREATE FUNCTION. Confirmed 'no browser writes' by regex grep for dnc_list write verbs in src (0 matches). Cross-checked legacy onConflict targets against constraints dropped in 20260713062000. Static/source audit only - not executed against a live DB.

**open_questions**

- Does the live DB actually carry the 20260713062000 (organization_id NOT NULL + unique) and 20260713073000 grants, or is live still the older per-user schema (docs/wholesale/audit/LIVE-SCHEMA.md says core tables are still PER-USER and dnc_list=28 rows on 10/28)? Repo-vs-live divergence would change both the onConflict failures and the browser-write answer.
- Do the legacy writers (disposition-router:323, voice-broadcast-engine:2393, api-gateway:327) actually error at runtime on the live schema, silently dropping opt-out persistence?
- Is there any non-src, non-functions HTTP surface (MCP server, packs, Lovable app) that inserts into dnc_list with the anon key?

**what_i_did_not_check**

- Live production DB state (information_schema/pg_policies) to confirm the 7/13 grants+constraints are applied vs the repo-vs-live divergence noted in docs/wholesale/audit/LIVE-SCHEMA.md.
- Runtime behavior of the legacy onConflict 'user_id,phone_number' upserts - inferred from schema only, not executed.
- dialing_queues enqueue-time / campaign-level upstream DNC filtering (only the dispatch-time check in call-dispatcher was read).
- The DTMF '2' handler and other voice-broadcast-engine opt-out paths beyond line 2383, and voice-broadcast-engine send-time DNC check.
- door_to_door pack (src/packs/door_to_door/enroll.ts) and lib/mcp tools dnc usage; whether they write dnc_list.
- certification/recovery-lineage-* copies and whether v10..v24 lineages reconcile with supabase/migrations.
- RLS helper user_in_organization / is_org_admin definitions and their own scoping.

**confidence**: medium