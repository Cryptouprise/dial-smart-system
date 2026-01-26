# AGENT.md - Script Analyzer Learning File

This file is automatically updated by the Dial Smart System as it analyzes calls, scripts, and outcomes. It serves as persistent memory for the AI to learn from patterns and improve recommendations.

**Last Updated**: January 18, 2026
**Total Calls Analyzed**: 0
**Learning Version**: 1.0

---

## Opener Insights

### Top Performing Openers
*Updated automatically as calls are analyzed*

| Rank | Opener Pattern | Effectiveness Score | Sample Size | Key Insight |
|------|---------------|---------------------|-------------|-------------|
| - | No data yet | - | - | Start a campaign to collect data |

### Worst Performing Openers
*Openers to avoid or rework*

| Opener Pattern | Failure Rate | Common Outcome | Suggested Fix |
|---------------|--------------|----------------|---------------|
| - | No data yet | - | - |

### Opener A/B Test Results
*Comparing similar openers with different approaches*

| Test | Variant A | Variant B | Winner | Lift |
|------|-----------|-----------|--------|------|
| - | No tests yet | - | - | - |

---

## Time Wasted Patterns

### Biggest Time Wasters
*Where your campaigns lose the most time*

| Reason | Total Time Lost | Call Count | Avg Per Call | Action Required |
|--------|----------------|------------|--------------|-----------------|
| vm_too_late | 0 min | 0 | - | Reduce ring time before AMD |
| long_no_conversion | 0 min | 0 | - | Improve qualification early |
| quick_hangup | 0 min | 0 | - | Better opener needed |
| short_no_outcome | 0 min | 0 | - | Check number quality |
| vm_message_too_long | 0 min | 0 | - | Shorten VM scripts |

### Daily Waste Summary
*Track improvement over time*

| Date | Total Wasted Minutes | Efficiency Score | Trend |
|------|---------------------|------------------|-------|
| - | No data yet | - | - |

---

## Voicemail Performance

### VM Message Effectiveness
*Which voicemail messages get callbacks*

| VM Script/Audio | VMs Left | Callbacks | Callback Rate | Best Time to Leave |
|-----------------|----------|-----------|---------------|-------------------|
| - | No data yet | - | - | - |

### Optimal VM Length
*Learning: What VM length gets best results*

- **Current Best Length**: Unknown (need data)
- **Callback Rate by Length**:
  - Under 15s: No data
  - 15-30s: No data
  - 30-45s: No data
  - 45-60s: No data
  - Over 60s: No data

### Callback Timing Patterns
*When do prospects call back after receiving a VM*

| Time After VM | Callback Rate | Appointment Rate |
|--------------|---------------|------------------|
| Within 1 hour | - | - |
| 1-4 hours | - | - |
| 4-24 hours | - | - |
| 24-48 hours | - | - |
| After 48 hours | - | - |

---

## Script Section Analysis

### Opening Section
- **Average Score**: N/A
- **Most Common Issues**: No data yet
- **Top Improvement Suggestions**: No data yet

### Qualification Section
- **Average Score**: N/A
- **Questions That Work Best**: No data yet
- **Questions That Cause Hangups**: No data yet

### Objection Handling
- **Most Common Objections**: No data yet
- **Best Responses**: No data yet
- **Responses That Fail**: No data yet

### Value Proposition
- **Phrases That Convert**: No data yet
- **Phrases That Fall Flat**: No data yet

### Closing Section
- **Successful Close Rate**: N/A
- **Best Closing Techniques**: No data yet

---

## Agent Performance Comparison

### By Retell Agent
*Compare different AI agent configurations*

| Agent Name | Calls | Avg Duration | Conversion Rate | Best For |
|------------|-------|--------------|-----------------|----------|
| - | No data yet | - | - | - |

---

## Campaign Learnings

### Campaign-Specific Insights
*What works for different campaign types*

| Campaign Type | Best Opener Style | Optimal Call Time | Key Success Factor |
|--------------|-------------------|-------------------|-------------------|
| - | No data yet | - | - |

---

## Automatic Recommendations

### High Priority Actions
*AI-generated recommendations based on analysis*

1. No recommendations yet - run a campaign to generate insights

### Script Improvements Queue
*Suggested improvements waiting to be applied*

| Script | Current Issue | Suggested Change | Expected Impact |
|--------|---------------|------------------|-----------------|
| - | No data yet | - | - |

---

## Learning Log

### Recent Learnings
*Chronological log of insights discovered*

```
[2026-01-18] System initialized. Waiting for call data to begin learning.
```

---

## Configuration

### Analysis Settings
- **Minimum Sample Size for Insights**: 5 calls
- **Opener Matching Threshold**: 85% similarity
- **Time Wasted Threshold**: Score > 30
- **VM Too Long Threshold**: 60 seconds
- **Engagement Definition**: >30 seconds with human

### Data Sources
- `opener_analytics` table
- `voicemail_analytics` table
- `call_logs.time_wasted_score`
- `call_opener_logs` table
- `voicemail_callback_tracking` table

---

## Development Log

### January 24, 2026 - Voice AI Campaign Pre-Launch Verification

**Campaign Type:** Retell AI Voice Campaign
**Twilio SIP Trunk:** Reserved for Voice Broadcasts (separate)

#### Retell Phone Numbers (12 Total) ✅

| Number | Status | Daily Calls | Rotation |
|--------|--------|-------------|----------|
| +12013304540 | active | 0 | Retell-native |
| +14752343837 | active | 0 | Retell-native |
| +14752344348 | active | 0 | Retell-native |
| +14752344589 | active | 0 | Retell-native |
| +14752429282 | active | 0 | Retell-native |
| +14752429450 | active | 0 | Retell-native |
| +14752691576 | active | 0 | Retell-native |
| +14752702920 | active | 0 | Retell-native |
| +14753288598 | active | 0 | Retell-native |
| +14755587988 | active | 0 | Retell-native |
| +19704658473 | active | 0 | Retell-native |
| +19704995507 | active | 0 | Retell-native |

**Note:** `rotation_enabled=false` is CORRECT for Retell-native numbers (Retell handles rotation internally)

#### Retell Agents Configured

| Agent ID | Campaign | Status |
|----------|----------|--------|
| `agent_f65b8bcd726f0b045eb1615d8b` | aTest Campaign - Call 3 Times | **ACTIVE** |
| `agent_0756c35b6a913892ac052812fd` | Sms, test, 1st go | paused |
| `agent_e242e664f491a6281bde53659a` | Chase mainly looking | paused |

#### Active Campaign Settings

- **Campaign:** aTest Campaign - Call 3 Times
- **Agent:** `agent_f65b8bcd726f0b045eb1615d8b`
- **Calls/min:** 5
- **Max Attempts:** 3 ✅
- **Retry Delay:** 5 minutes

#### Edge Functions Status ✅

| Function | Version | Status | Purpose |
|----------|---------|--------|---------|
| outbound-calling | v466 | ACTIVE | Creates Retell calls |
| retell-call-webhook | v326 | ACTIVE | Handles Retell callbacks (verify_jwt=false) |
| call-tracking-webhook | v463 | ACTIVE | Tracks call status |
| retell-agent-management | v468 | ACTIVE | Manages Retell agents |

#### Calendar Availability System ✅

- **calendar_preference:** `"both"` (syncs Google + GHL)
- **GHL Calendar:** `TkQdLhTuaDjmUvAYD2TH` (Mathew Hickey's Personal Calendar)
- **Availability Logic:** Merges busy times from:
  1. Google Calendar events
  2. GHL Calendar events
  3. Local database appointments
- **File:** `calendar-integration/index.ts` lines 908-1024

#### GHL Sync Settings ✅

| Setting | Value |
|---------|-------|
| sync_enabled | true |
| default_pipeline_id | KMi6o1nPVUv71iZihFBG |
| auto_create_opportunities | false |
| calendar_preference | both |
| Field mappings | Configured (outcome, notes, duration, etc.) |
| Tag rules | Configured (interested, not_interested, callback, etc.) |
| Pipeline stage mappings | Configured |

#### Leads Available

- **New leads:** 1,020
- **Contacted:** 90
- **Total:** 1,110

#### Pre-Launch Checklist Summary

| Item | Status |
|------|--------|
| Retell numbers ready | ✅ 12 active |
| Daily calls reset | ✅ All at 0 |
| Retell agent configured | ✅ agent_f65b8bcd726f0b045eb1615d8b |
| Edge functions deployed | ✅ All active |
| Retry logic enabled | ✅ max_attempts=3 |
| Calendar sync | ✅ Both Google + GHL |
| GHL integration | ✅ Enabled with mappings |
| Leads available | ✅ 1,110 |

#### Manual Verification Needed (Retell Dashboard)

1. **Webhook URL** on agent should be: `https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook`
2. **RETELL_AI_API_KEY** is set in Supabase secrets
3. **Agent prompt/voice** configured as desired

---

### January 24, 2026 - White-Label Credit System

**Summary:** Implemented the core white-label system to enable reselling Retell AI voice services with prepaid credits and margin tracking.

**Features Built:**

1. **Credit Balance System** ✅
   - Prepaid credit tracking per organization
   - Configurable markup rate (`cost_per_minute_cents` vs `retell_cost_per_minute_cents`)
   - Low balance and cutoff thresholds
   - Auto-recharge configuration (ready for Stripe integration)
   - Database table: `organization_credits`

2. **Transaction Audit Log** ✅
   - Full history of deposits, deductions, refunds, adjustments
   - Tracks balance before/after for each transaction
   - Links to call_logs for deductions
   - Links to Stripe payment IDs for deposits
   - Database table: `credit_transactions`

3. **Usage Summaries** ✅
   - Aggregated usage by period (daily/weekly/monthly)
   - Tracks: total_calls, total_minutes, cost, margin
   - Breakdown by outcome (completed, voicemail, no_answer, failed)
   - Auto-updated via database trigger
   - Database table: `usage_summaries`

4. **Pre-Call Balance Check** ✅
   - Database function: `check_credit_balance(org_id, minutes_needed)`
   - Returns: has_balance, billing_enabled, current_balance, required_amount
   - Backward compatible: Returns true if billing not enabled
   - Shared helper: `checkCreditBalance()` in `_shared/credit-helpers.ts`

5. **Post-Call Credit Deduction** ✅
   - Database function: `deduct_call_credits(org_id, call_log_id, minutes, retell_cost)`
   - Atomic balance update with transaction logging
   - Calculates margin (billed - actual cost)
   - Shared helper: `deductCallCredits()` in `_shared/credit-helpers.ts`

6. **Credit Management Edge Function** ✅
   - Actions: get_balance, check_balance, add_credits, deduct_credits, get_transactions, get_usage, health_check
   - Full CORS support
   - Auth via Bearer token (user or service role)
   - File: `supabase/functions/credit-management/index.ts`

**Database Changes:**

New Tables:
- `organization_credits` - Balance and rate config per org
- `credit_transactions` - Audit log of all credit operations
- `usage_summaries` - Aggregated usage metrics

New Columns on `call_logs`:
- `retell_cost_cents` - Actual Retell API cost
- `billed_cost_cents` - Amount charged to customer
- `cost_breakdown` - Detailed cost JSON
- `token_usage` - LLM token usage
- `credit_deducted` - Whether credit was deducted

New Columns on `organizations`:
- `billing_enabled` - Feature flag for white-label
- `stripe_customer_id` - For payment integration
- `billing_email` - Billing contact

New Database Functions:
- `check_credit_balance()` - Pre-call check
- `deduct_call_credits()` - Post-call deduction
- `add_credits()` - Add credits with transaction log

New View:
- `organization_credit_status` - Convenient balance status view

**Files Created:**
- `supabase/migrations/20260124_white_label_credits.sql` (650+ lines)
- `supabase/functions/credit-management/index.ts` (~420 lines)
- `supabase/functions/_shared/credit-helpers.ts` (~210 lines)
- `WHITE_LABEL_SYSTEM.md` - Master documentation

**Backward Compatibility:**
All features gated by `organizations.billing_enabled`:
- `false` (default): No credit checks, calls proceed normally
- `true`: Credit checks and deductions activate

**Still Needed:**
- [ ] Integrate credit check into `outbound-calling` edge function
- [ ] Integrate credit deduction into `retell-call-webhook` edge function
- [ ] Implement Retell list-calls API sync for actual cost data
- [ ] Build client sub-account portal UI
- [ ] Add Stripe payment integration
- [ ] Build visual agent flow builder

---

### January 18, 2026 - Script Analytics Enhancement

**Features Built:**

1. **Opener Effectiveness Tracking** ✅
   - Extracts opener (first 3 agent lines) from every transcript
   - Normalizes openers for comparison across calls
   - Tracks: total uses, answer rate, engagement rate, conversion rate
   - Calculates effectiveness score (0-100) based on weighted metrics
   - Database tables: `opener_analytics`, `call_opener_logs`
   - View: `top_openers` - shows openers with 5+ uses ranked by effectiveness

2. **Time Wasted Score** ✅
   - Calculates waste score (0-100) for every call
   - Categories:
     - `vm_too_late` (70 pts): Hit voicemail after 30s+ ringing
     - `long_no_conversion` (60 pts): 5+ min call, no appointment
     - `quick_hangup` (55 pts): Human answered, hung up <20s
     - `vm_message_too_long` (50 pts): VM duration >60s
     - `short_no_outcome` (40 pts): <15s call, no result
     - `call_failed` (30 pts): Failed/busy calls
   - Added columns to `call_logs`: `time_wasted_score`, `time_wasted_reason`
   - View: `time_wasted_summary` - aggregates waste by reason

3. **Voicemail Message Analytics** ✅
   - Tracks VM messages left per audio URL/broadcast
   - Monitors callbacks: total, within 1h, within 24h
   - Calculates callback rate and appointment conversion rate
   - Database tables: `voicemail_analytics`, `voicemail_callback_tracking`
   - View: `voicemail_performance` - shows VMs with 10+ leaves ranked by effectiveness

**Files Changed:**
- `supabase/migrations/20260118_script_analytics_enhancement.sql` (NEW - 490 lines)
- `supabase/functions/analyze-call-transcript/index.ts` (UPDATED - added analytics)

**Database Functions Created:**
- `calculate_time_wasted_score()` - Returns score and reason for time waste
- `extract_opener_from_transcript()` - Pulls first agent lines from transcript
- `normalize_opener_text()` - Normalizes for comparison
- `update_opener_analytics()` - Upserts opener stats, calculates rates
- `update_voicemail_analytics()` - Tracks VM effectiveness and callbacks

4. **Voicemail Callback Detection** ✅
   - Added to `call-tracking-webhook` Twilio handler
   - Detects inbound calls and matches to `voicemail_callback_tracking` records
   - Updates callback timing (within 1h, within 24h, after 24h)
   - Calls `update_voicemail_analytics` RPC to update stats
   - Marks lead as `callback_received`
   - Logs: `🎉 CALLBACK DETECTED! VM left X minutes ago`

5. **Script Analytics Dashboard** ✅
   - New React component: `src/components/ScriptAnalyticsDashboard.tsx`
   - 3 tabs: Opener Effectiveness, Time Wasted, Voicemail Analytics
   - Summary cards: Top Opener Score, Time Wasted, VM Callback Rate, Best Conversion
   - Queries the database views: `top_openers`, `time_wasted_summary`, `voicemail_performance`
   - Color-coded effectiveness scores and progress bars
   - Actionable fix suggestions for each time waste category

**Files Changed:**
- `supabase/functions/call-tracking-webhook/index.ts` (UPDATED - added callback detection)
- `src/components/ScriptAnalyticsDashboard.tsx` (NEW - 420 lines)

**Still Needed:**
- Deploy edge functions to Supabase

---

### Previous Fixes Reference

#### GHL Contact Import (Jan 17, 2026)
- **Issue**: Only importing 100 contacts instead of 10,000+
- **Root Cause**: GHL API returns 422 when `limit` or `tags` in search body
- **Fix**: Removed those params, use only `pageLimit` and `locationId`
- **Also**: GHL caps `total` at 10,000; ignore it, stop when <100 per page

#### Call Pacing (Jan 17, 2026)
- **Issue**: `calls_per_minute` setting was ignored
- **Fix**: Added `calculatePacingDelay()` function
- **Formula**: `delay_ms = 60000 / calls_per_minute` (min 100ms)

#### Retry Logic (Jan 17, 2026)
- **Issue**: no_answer/busy/failed calls not retried
- **Fix**: Added retry scheduling in `call-tracking-webhook`
- **Config**: `max_attempts` on voice_broadcasts enables retries

---

*This file is updated by Claude Code during development sessions. Always check here first when investigating issues.*

---

*This file is updated by the `analyze-call-transcript` and `call-tracking-webhook` edge functions.*
