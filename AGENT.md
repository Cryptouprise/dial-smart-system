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
