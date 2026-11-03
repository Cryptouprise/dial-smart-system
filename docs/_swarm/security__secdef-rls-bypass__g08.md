# security::secdef-rls-bypass::g08

- status: completed
- tldr: g08 audit: 16 SECDEF/granted functions across 3 migrations documented; key tenant-check gaps in sms_* funcs (no org check) and user_in_organization enumeration surface flagged

g08 complete. Audited 3 migrations (sms_delivery_safety, provider_safe_unattended_backstops, multi_organization_routing_contract). 16 functions enumerated with (a) name+file:line, (b) language/volatility, (c) RETURNS trigger?, (d) every GRANT/REVOKE + role, (e) tables read/written w/ citations, (f) explicit org check + line or NONE. Highlights: user_in_organization @g07:179 is a SECURITY DEFINER/STABLE predicate granted to authenticated, not bound to auth.uid() (enumeration surface). transfer_organization_membership_resources @g07:829 has strong org/tenant checks (@891-909, @911-922, @967-1026) and is service_role-only. All 5 sms_* SECDEF funcs (file1) trust caller-supplied user/org with NO org check. run_safety_backstops (file2) is an intentionally cross-tenant service_role-only sweeper. Trigger SECDEF funcs @g07 enforce org membership. organization_membership_transfers REVOKE ALL incl service_role + zero RLS policies.

## Artifact

**Findings**

FILE 1 = 20260712040000_sms_delivery_safety.sql
F1. normalize_contact_phone(p_phone text) @8. sql, IMMUTABLE @11, PARALLEL SAFE, RETURNS NULL ON NULL INPUT. NOT trigger. SECURITY INVOKER. search_path=public,pg_temp @14. REVOKE ALL FROM PUBLIC @354; GRANT EXECUTE TO authenticated,service_role @359. Tables: NONE. Org check: N/A.
F2. sync_normalized_contact_phone() @72. RETURNS trigger @73. plpgsql. SECURITY INVOKER. Volatility default VOLATILE. No GRANT/REVOKE -> default PUBLIC EXECUTE. Tables: NONE (NEW only). Org check: N/A. Triggers on leads/dnc_list @84-91.
F3. claim_sms_delivery_attempt(text,uuid,uuid,uuid,text,text,text,text,jsonb) @170. plpgsql. SECURITY DEFINER @190. search_path=public,pg_temp @191. RETURNS TABLE @181. REVOKE ALL FROM PUBLIC @355; GRANT EXECUTE TO service_role @360. Tables: INSERT sms_delivery_attempts @200; SELECT @235-238. Org check: NONE. Writes caller-supplied p_user_id/p_organization_id verbatim @210-222; no auth.uid(), no user_in_organization.
F4. finalize_sms_delivery_attempt(uuid,uuid,text,text,text,jsonb) @264. plpgsql. SECURITY DEFINER @274. search_path=public,pg_temp @275. RETURNS boolean. REVOKE ALL FROM PUBLIC @356; GRANT EXECUTE TO service_role @361. Tables: UPDATE sms_delivery_attempts @285; SELECT @299-301. Org check: NONE (scoped user_id=p_user_id @293/@301 only; caller not validated).
F5. reconcile_sms_delivery_attempt(uuid,uuid,text,text,text) @308. plpgsql. SECURITY DEFINER @317. search_path=public,pg_temp @318. RETURNS boolean. REVOKE ALL FROM PUBLIC @357; GRANT EXECUTE TO service_role @362. Tables: UPDATE sms_delivery_attempts @338. Org check: NONE @346.
Note: sms_delivery_attempts RLS enabled @168 with ZERO policies + REVOKE ALL FROM PUBLIC,anon,authenticated @353 => default-deny.

FILE 2 = 20260712050000_provider_safe_unattended_backstops.sql
F6. run_safety_backstops() @9. plpgsql. SECURITY DEFINER @12. search_path=public,extensions,pg_temp @13. RETURNS jsonb. REVOKE EXECUTE FROM PUBLIC,anon,authenticated @234; GRANT EXECUTE TO service_role @235. Tables: autonomous_settings R@30; system_alerts R@37 I@44 U@59 I@110 R@120; dialing_queues U@72; provider_dispatch_claims R@82; call_logs R@92,@146,@163; campaigns R@106 U@186; budget_settings R@133 U@179; spending_summaries R@139,@155; budget_alerts I@192. Org check: NONE. Global sweeper over ALL users @28/@132; intentionally cross-tenant, service_role-only.
F7. resolve_provider_dispatch_invoke_error(uuid,uuid,text,timestamptz,text) @243. plpgsql. SECURITY DEFINER @252. search_path=public,pg_temp @253. RETURNS TABLE @250. REVOKE ALL FROM PUBLIC,anon,authenticated @312-314; GRANT EXECUTE TO service_role @315-317. Tables: dialing_queues SELECT..FOR UPDATE @265, UPDATE @286; provider_dispatch_claims R@281. Org check: NONE.

FILE 3 = 20260712070000_multi_organization_routing_contract.sql (BEGIN@1/COMMIT@1231)
F8. user_in_organization(user_uuid uuid, org_uuid uuid) @179. sql, STABLE @182, SECURITY DEFINER @183, search_path='' @184. RETURNS boolean. REVOKE ALL FROM PUBLIC,anon @194; GRANT EXECUTE TO authenticated,service_role @195. Tables: organization_users R@188. Org check: IS the predicate (pair membership @186-191); not bound to auth.uid(). Granted to authenticated (enumeration surface).
F9. enforce_tenant_owned_core_resource() @351. RETURNS trigger @352. plpgsql. SECURITY DEFINER @354. search_path='' @355. REVOKE ALL FROM PUBLIC,anon,authenticated @1211. Tables: organization_membership_transfers R@366; organization_users R@386. Org check: YES @384-393; immutability @358-377; NOT NULL @379-382. Triggers @398-416.
F10. enforce_call_log_tenant_graph() @418. RETURNS trigger @419. plpgsql. SECURITY DEFINER @421. search_path='' @422. REVOKE @1212. Tables: campaigns R@432; leads R@444. Org check: YES @430-452. Trigger @457-460.
F11. enforce_campaign_lead_tenant() @462. RETURNS trigger. plpgsql. SECURITY DEFINER @465. search_path='' @466. REVOKE @1213. Tables: campaigns R@480; leads R@481. Org check: YES @484-489. Trigger @494-497.
F12. enforce_campaign_phone_tenant() @499. RETURNS trigger. plpgsql. SECURITY DEFINER @502. search_path='' @503. REVOKE @1214. Tables: campaigns R@517; phone_numbers R@519. Org check: YES @521-527. Trigger @532-535.
F13. enforce_dialing_queue_tenant() @537. RETURNS trigger. plpgsql. SECURITY DEFINER @540. search_path='' @541. REVOKE @1215. Tables: campaigns R@550; leads R@552. Org check: YES @554-559. Trigger @564-567.
F14. enforce_integration_tenant() @688. RETURNS trigger. plpgsql. SECURITY DEFINER @691. search_path='' @692. REVOKE @1216. Tables: organization_users R@696. Org check: YES @695-702. Triggers @707-715.
F15. mint_api_key(uuid,text,text[],uuid,integer,timestamptz) @723. plpgsql. SECURITY DEFINER @738. search_path=public,pg_temp @739. RETURNS TABLE @731. Old 5-arg overload DROPPED @721. REVOKE ALL FROM PUBLIC,anon,authenticated @820-821; GRANT EXECUTE TO service_role @822-823. Tables: organization_users R@764,@775; api_keys I@794. Org check: PARTIAL @763-781 (membership if org given; exactly-one if NULL). No caller==p_user_id check.
F16. transfer_organization_membership_resources(uuid,uuid,uuid,text,boolean) @829. plpgsql. SECURITY DEFINER @846. search_path='' @847. RETURNS TABLE @836. REVOKE ALL FROM PUBLIC,anon,authenticated @1204-1206; GRANT EXECUTE TO service_role @1207-1209. Tables: organizations R/LOCK@878; organization_users LOCK@886 R@891,@903,@914 DELETE@1168; call_logs LOCK@929 R@975,@988,@997,@1147; campaigns LOCK@939 R@1018,@1084,@1102,@1113 U@1045; leads LOCK@946 R@1089,@1114 U@1051; phone_numbers LOCK@953 R@1092,@1125 U@1057; dialing_queues LOCK@960 R@1017,@1135; provider_dispatch_claims R@969; provider_call_attempts R@983; organization_membership_transfers I@1028 U@1177; campaign_phone_pools U@1069 R@1101,@1123. Org check: YES @891-909 membership, @911-922 last-owner, provider preflight @967-1013, dispatch guard @1015-1026, post-conditions @1083-1165. service_role-only.

CROSS-CUTTING: organization_membership_transfers RLS enabled + REVOKE ALL FROM PUBLIC,anon,authenticated,service_role @347-349 => only SECDEF RPC owner writes. Trigger functions (F2,F9-F14) SECDEF except F2 U; Postgres needs no EXECUTE to fire triggers, so their REVOKEs are defense-in-depth.

**evidence**

- 20260712040000_sms_delivery_safety.sql:8,11,14,72,73,170,181,190,191,200,235,264,274,275,285,299,308,317,318,338,353,354,355,356,357,359,360,361,362
- 20260712050000_provider_safe_unattended_backstops.sql:9,12,13,30,37,44,59,72,82,92,106,110,120,133,139,146,155,163,179,186,192,234,235,243,250,252,253,265,281,286,312,315
- 20260712070000_multi_organization_routing_contract.sql:1,179,182,183,184,186,194,195,347,348,349,351,352,354,355,366,384,386,418,421,422,430,432,444,462,465,466,480,481,499,502,503,517,519,537,540,541,550,552,688,691,692,696,721,723,731,738,739,764,775,794,820,822,829,836,846,847,878,886,891,903,914,929,939,946,953,960,969,975,983,988,997,1018,1028,1045,1051,1057,1069,1084,1101,1113,1123,1125,1135,1147,1168,1177,1204,1207,1211,1212,1213,1214,1215,1216,1231

**validation**

All three files read in full (1-362, 1-318, 1-1231). 16 functions enumerated (5/2/9). Each GRANT/REVOKE, SECURITY DEFINER clause, RETURNS type, and search_path SET located by direct line read. Table accesses from INSERT/UPDATE/SELECT/FOR UPDATE statements per body. Org-check column filled by inspecting bodies for user_in_organization/organization_users membership predicates.

**open_questions**

- user_in_organization EXECUTE-granted to authenticated and not bound to auth.uid(): an authenticated user can probe arbitrary (user_uuid, org_uuid) membership pairs. Acceptable or restrict?
- claim/finalize/reconcile_sms_delivery_attempt trust caller-supplied p_user_id/p_organization_id with no auth.uid()/org validation; confirm only trusted service_role server code calls them.
- organization_membership_transfers REVOKEs ALL incl service_role; confirm the RPC definer role retains table privileges in deployed DB.

**what_i_did_not_check**

- No live DB query; deployed privilege/RLS state may differ if later migrations GRANT/REVOKE/ALTER/DROP these functions.
- Did not scan other migrations in the folder for later statements touching these 16 functions or the two tables.
- Did not audit is_org_admin (referenced file1 @132; not defined here).
- Did not audit the g07-adjacent migration beyond the two named functions.
- Did not verify policy completeness on tables other than dnc_list/sms_delivery_attempts/organization_membership_transfers.
- Did not validate FOR UPDATE lock ordering runtime behavior or txid_current() semantics.
- Did not assess whether project service_role carries BYPASSRLS/elevated privileges defeating the REVOKE-ALL design intent.

**confidence**: high