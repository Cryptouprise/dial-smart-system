# Phase 1 findings (Fable, 2026-10-28)

## Repo vs live migration diff
- Live schema_migrations: 160 rows. Live has 10 August 2026 migrations NOT in the repo (applied via MCP/dashboard, never committed):
  20260828012734 provision_org_on_signup, 013123 close_billing_escalation, 013247 tighten_guard_function_grants,
  014640 campaign_launch_guard, 014743 onboarding_completion_flag, 015210 harden_definer_helpers,
  030638 close_cross_tenant_write_leaks, 034020 plan_catalog_tables, 034111 plan_catalog_functions_rls_seed,
  034301 fix_billing_guard_definer_context. Pulled into `live_only/` as files (repo now has them).
- Repo has 30 July 2026 migrations NOT live: 20260712010000 .. 20260720150000 (~13,500 lines). None applied.
- Lovable's 20260720232851/232913/235049 and the Aug 16/17 ones ARE live under shifted version numbers (+2-3 s).

## Data preconditions (live, 10/28)
| table | organization_id NULL | total |
|---|---|---|
| leads | 5 | 3,303 |
| campaigns | 0 | 8 |
| phone_numbers | 0 | 40 |
| call_logs | 519 | 5,635 |
`20260712070000_multi_organization_routing_contract.sql` SETs NOT NULL on all four -> would FAIL on leads and call_logs without a backfill to the Default Organization (11824e05-24e3-4dc3-b684-5d0bc7c436d6).

## Ordering hazard
July files have LOWER versions than the live Aug ones but would be applied AFTER them. Any CREATE OR REPLACE in July of a function the Aug set also defines (handle_new_user, is_platform_operator, guard_organization_billing_columns, check_credit_balance, has_role, is_org_admin, user_in_organization, policies on organization_users/credits/campaign_leads) would REGRESS the live Aug fix. DeepSeek review job checks for this.

## Live edge-function security findings (automated review of the LIVE snapshots, 10/29) - pre-existing, not introduced by us
| fn (live) | finding | fix path |
|---|---|---|
| sms-messaging | `get_available_numbers` answers with NO auth (42 numbers) - confirmed by probe | P5 redeploy: require JWT + membership |
| disposition-router | accepts caller-supplied `userId`; service key OR any JWT accepted; `dispositionName` interpolated into `.or()` | P4b redeploy from live snapshot: userId from verified JWT, membership check, parameterized filters |
| retell-call-webhook | no Retell signature check; trusts metadata.user_id / organization_id for billing | verify `x-retell-signature` with RETELL_AI_API_KEY; derive org from call_logs row |
| call-dispatcher | `force_dispatch` acts on any leadId/campaignId without ownership check | scope to caller's company |
| outbound-calling | honours isTestCall / skipCreditCheck / skipDncCheck from the browser; lead/callerId/agent not scoped to caller | honour skips only for service_role; scope lookups by organization_id |
| telnyx-webhook | signature check skipped when WEBHOOK_SECRET_TELNYX unset (fail-open) | fail closed |
| phase1 migration (ours) | enforce_organization_scope was fail-open (DEFINER current_user) | FIXED 10/29: migration phase1_scope_guard_fix |
| workflow-executor | no auth at all: any caller can start/pause/remove workflows for any user; webhook step fetches arbitrary URLs (SSRF) | redeploy from live snapshot with service-role requirement + URL allowlist |
| retell-call-webhook | auto-recharge calls add_credits with no Stripe payment | credit only from signed Stripe webhook |
| sms-messaging / twilio-sms-webhook / api-gateway | deployed with verify_jwt=false (function-level auth only) | P5 redeploy: explicit JWT + membership checks |
| organization_users policy "Org admins can add members" (live Aug) | a signed-in user may insert themselves as owner of ANY organization that has zero members (orphan orgs) | tighten to organizations created by the same user (add created_by) - phase 6 / onboarding work |
