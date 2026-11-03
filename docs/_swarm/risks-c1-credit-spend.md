# risks-c1-credit-spend

- status: completed
- tldr: Voice credits enforce race-safe (reserve gate pre-egress); SMS is unmetered (F1); below-zero spend is a configured option (F3).

LANE MONEY part 1 (risks-c1-credit-spend) COMPLETE. Question: can a user spend credits they do not have?

ANSWER: On VOICE — no (correctly enforced, race-safe, fail-closed). On SMS — yes, SMS is entirely unmetered.

Ranked findings:
- F1 MEDIUM/FACT: SMS has no credit enforcement. No SMS egress function (ai-sms-processor, ai-assistant, nudge-scheduler, sms-messaging, twilio-sms-webhook) references the ledger. A billing-enabled zero-credit org can send SMS uncharged. Intent unknown.
- F3 MEDIUM/FACT: Spending below zero IS possible by design via allow_negative_balance + negative_balance_limit_cents (bounded, operator-configured).
- F2 LOW/FACT: finalize refuses to deduct when actual>reservation (returns success=false, webhook only logs on success) -> overlong calls unbilled. Matters only for Telnyx, whose make_call is 503-disabled.
- F4 POSITIVE/FACT: Voice path is solid. Pre-check is advisory; reserve_credits is the authoritative atomic gate (FOR UPDATE re-check) BEFORE provider egress; RPCs are service_role-only; helpers fail closed; explicit org required.
- F5 LOW/FACT: pre-check ignores allow_negative_balance -> false-deny for negative-allowance orgs.
- F6 LOW/THEORY: no reservation reaper found; lost webhook strands reserved credits.

WHEN checks happen: before egress (outbound-calling:946-1043, before routing at 1049). Atomicity: reserve_credits, not the check, is the gate.

Validation: static trace of the whole voice flow only; ran nothing, touched no live system.

Blockers/follow-ups (candidates for new nodes): confirm SMS metering intent; locate any reserved-balance reaper (possibly pg_cron/Hermes, outside supabase/functions); verify organization_credit_status view columns used by credit-helpers; trace voice-broadcast-engine + predictive-dialing-engine dispatch billing.

## Artifact

**Findings**

F1 (MEDIUM, FACT): SMS is completely unmetered. No SMS egress function references the credit ledger, so a billing-enabled org with zero credits can send SMS with no check/reserve/deduct. Evidence: grep of supabase/functions for check_credit_balance|reserve_credits|finalize_call_cost|billing_enabled returns only voice/billing files; SMS egress confirmed at ai-sms-processor/index.ts:598, ai-assistant/index.ts:1053/1218/1329, nudge-scheduler/index.ts:238, sms-messaging (Twilio Messages.json) — none call the ledger. Impact: if SMS is meant to be billable this is unbounded tenant spend (we pay Twilio, customer uncharged).

F2 (LOW, FACT): finalize_call_cost refuses to deduct when actual usage exceeds the dispatch reservation and returns success=false; the webhook only logs inside if(result.success), so the call is never billed (revenue leak, not customer overspend). Evidence: migration 20260713060000:773-799 (CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED, no balance update); retell-call-webhook/index.ts:2094-2110. Used to matter for Telnyx (reserves only 9c/1min, telnyx-outbound-ai:247-275) but its make_call is 503-disabled (index.ts:133-143). For Retell, reservation = full certified max-call-duration exposure (outbound-calling:986-1016), so this is the abnormal path.

F3 (MEDIUM, FACT): An org CAN spend credits it does not have, by design and bounded: allow_negative_balance + negative_balance_limit_cents permit available balance below zero. reserve_credits admits the hold when available-amount >= -limit (migration:485-494); check reports has_balance true within the limit (334-346); DB constraint allows balance_cents down to -negative_balance_limit_cents (249-254).

F4 (POSITIVE, FACT): The enforcement core is genuinely race-safe and fail-closed. The pre-check is advisory; reserve_credits (SECURITY DEFINER, row FOR UPDATE lock, atomic re-check) is the authoritative gate and runs BEFORE provider egress (outbound-calling:946-1043 before routing at 1049). All ledger RPCs are REVOKEd from anon/authenticated and GRANTed only to service_role (migration:1001-1015); credit-management gates reserve/finalize/add behind assertServiceControlledCreditAction (index.ts:300,347,409) so a browser JWT cannot mint or reserve spend. credit-helpers fails closed on RPC error/exception/invalid shape (credit-helpers.ts:109-173). outbound-calling requires an explicit org (index.ts:356) so there is no null-org bypass. Net: a zero-credit, billing-enabled org is correctly blocked from placing a VOICE call.

F5 (LOW, FACT): Pre-check vs reserve disagree on negative policy: outbound-calling:990 denies when available_balance_cents < exposure ignoring allow_negative_balance that the RPC returns, so an org with a configured negative allowance can be falsely denied (over-block, not overspend).

F6 (LOW, THEORY): No reservation reaper found. Reservations release only on terminal webhook finalize or pre-egress cancel (outbound-calling:695-707); a lost/unauthorized webhook strands reserved credits (over-reserve, opposite of overspend).

**evidence**

- docs/dial-smart-app-map.md — read in full (shared fact base + contract).
- supabase/functions/credit-management/index.ts — read in full (819 lines).
- supabase/migrations/20260124_white_label_credits.sql — read in full.
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql — read in full; reserve_credits:350-527, finalize_call_cost:529-878, check_credit_balance:281-348, add_credits:880-999, grants/revokes:1001-1015.
- supabase/functions/_shared/credit-helpers.ts — read in full (fail-closed check:109-173).
- supabase/functions/outbound-calling/index.ts:356 (explicit org required), 946-1043 (credit block before egress), 990 (pre-check), 1007-1024 (reserve), 695-707 (cancelReservation).
- supabase/functions/retell-call-webhook/index.ts:2088-2110 (finalize gating + only logs on success).
- supabase/functions/telnyx-outbound-ai/index.ts:133-143 (make_call 503-disabled), 247-276 (9c/1min reserve, no finalize).
- supabase/functions/budget-tracker/index.ts — read in full (503-gated, provider-global, not per-org credits).
- supabase/functions/credit-management/index.ts:169-292 (balance/check actions scoped by org membership).

**validation**

Traced the full voice spend flow end to end (dispatch -> advisory check -> authoritative locked reserve -> provider egress -> webhook finalize/deduct). Confirmed atomicity via FOR UPDATE re-check, service-role-only grants, fail-closed helpers, no org-less bypass, and the 503 gate on the un-finalized Telnyx path. Performed static code reading only; ran nothing and touched no live system.

**open_questions**

- Is SMS intended to be metered under the white-label credit model? If yes, F1 is a real unbounded spend hole.
- Does any pg_cron/scheduled job outside supabase/functions reap stranded reservations (F6)?
- What are the live org's billing_enabled / allow_negative_balance / negative_balance_limit_cents values?

**edge_cases_considered**

- Zero-credit billing-enabled org on voice (correctly blocked).
- Concurrent calls / check-then-reserve TOCTOU (safe: reserve re-checks under FOR UPDATE).
- allow_negative_balance + negative_balance_limit_cents band (spend-below-zero permitted by design).
- RPC error/exception/invalid shape (fails closed in credit-helpers).
- Call attempt with no organization (blocked: explicit org required).
- Sub-6s / zero-minute calls (release-only, no charge).
- Provider call longer than reservation (settlement refuses to deduct -> unbilled).

**what_i_did_not_check**

- voice-broadcast-engine actual dispatch path (grep found only a 'billing contract' comment; not traced whether reservations are per-call or per-batch).
- predictive-dialing-engine and voice-broadcast-queue dispatch internals.
- billing_ownership_boundary.sql (20260713065000) view correctness and whether credit-helpers' reads of available_balance_cents/reserved_balance_cents from organization_credit_status match its columns.
- Live database values for billing_enabled / allow_negative_balance / reserved_balance_cents.
- The full 657 lines of CreditDashboard.tsx (read header/interfaces/fetch; appears read-only).
- sms-messaging/index.ts send body (confirmed no credit RPC by grep only).
- ai-sms-processor / twilio-sms-webhook separate usage accounting.
- ai-autonomous-engine and workflow-executor beyond confirming they invoke outbound-calling (thus inherit the guarded path).

**confidence**: medium