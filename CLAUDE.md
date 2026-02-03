# CLAUDE.md - Dial Smart System

> **GOLDEN RULE - READ THIS FIRST**
>
> After completing ANY task, you MUST update this file or AGENT.md with:
> 1. What was built/fixed/changed
> 2. Key files modified
> 3. Database changes made
> 4. Deployment status
> 5. Any gotchas or lessons learned
>
> This is NON-NEGOTIABLE. Charles shouldn't have to re-explain context. Document everything so future sessions have full history.

---

This file provides persistent context for Claude Code when working with the dial-smart-system codebase.

## Voice Broadcast Playbook (ACTIVE)

**Trigger Phrases → Automatic Actions:**

| User Says | I Do |
|-----------|------|
| "Let's get started on our test campaign" | Run pre-launch checklist (numbers, deploy, verify) |
| "Buy X numbers" | Purchase via Twilio MCP |
| "I'm launching" | Final checks, confirm go |
| "Status" / "How's it going?" | Live campaign stats |
| "Analyze [campaign]" | Full analysis + update LEARNINGS.md |
| "What's next?" | Scaling recommendations |

**Key Files:**
- `LEARNINGS.md` - Campaign history & learnings (UPDATE AFTER EACH CAMPAIGN)
- `scripts/campaign-analyzer/PLAYBOOK.md` - Full playbook details
- `scripts/campaign-analyzer/analyze-campaign.sql` - Analysis queries

**Current Test Campaign:** Test 1.18 (January 18, 2026)
- Target: 5,000 calls
- Settings: 50 calls/min, max_attempts=3, retry_delay=60min
- Need: ~50 phone numbers minimum

## Project Overview

**Dial Smart System** is an enterprise-grade AI-powered predictive dialer platform comparable to VICIdial, Five9, and Caller.io.

- **Lines of Code**: 144,137 TypeScript/JS (194K total with SQL, MD, JSON)
- **Edge Functions**: 63 Supabase edge functions (all complete and production-ready)
- **React Components**: 150+ components
- **Custom Hooks**: 56 hooks
- **Test Files**: 16 (needs expansion)
- **Build Time**: ~10 seconds
- **Bundle Size**: 1,073KB main chunk (needs code splitting)

## Tech Stack

**Frontend:**
- React 18 + TypeScript 5.5.3
- Vite build system
- Tailwind CSS + shadcn/ui (Radix UI)
- React Query for data management
- React Router for navigation

**Backend:**
- Supabase (PostgreSQL + Edge Functions)
- Real-time database subscriptions
- Row Level Security (RLS)

**Integrations:**
- Retell AI (primary AI voice provider)
- Twilio (voice, SMS, phone numbers)
- Telnyx (alternative carrier)
- Google Calendar (OAuth)
- Go High Level CRM
- ElevenLabs (TTS)

## Project Structure

```
dial-smart-system/
├── src/
│   ├── components/       # 150+ React components
│   ├── hooks/           # 56 custom hooks
│   ├── contexts/        # 5 context providers (Auth, Org, AIBrain, AIError, DemoMode, SimpleMode)
│   ├── services/        # Provider adapters (Retell, Twilio, Telnyx) - STUBS ONLY
│   ├── lib/             # Utilities (phoneUtils, logger, sentry, performance)
│   ├── pages/           # Route pages
│   └── integrations/    # Supabase client
├── supabase/
│   ├── functions/       # 63 edge functions (ALL COMPLETE)
│   └── migrations/      # Database migrations
├── e2e/                 # Playwright E2E tests
└── coverage/            # Test coverage reports
```

## Critical Architecture Knowledge

### Provider Adapters vs Edge Functions

**IMPORTANT**: There are TWO implementation patterns:

1. **Edge Functions (WORKING)**: All 63 edge functions are fully implemented and production-ready
   - `voice-broadcast-engine` - 1,582 lines, handles Twilio, Telnyx, Retell, SIP trunks
   - `call-tracking-webhook` - 1,343 lines, handles all call webhooks
   - `ai-sms-processor` - Complete SMS handling with workflow auto-reply
   - `disposition-router` - Complete disposition automation

2. **Provider Adapters (STUBS)**: Files in `src/services/providers/` are STUBS for a planned refactor
   - `twilioAdapter.ts` - All methods return stub responses
   - `telnyxAdapter.ts` - All methods return stub responses
   - `retellAdapter.ts` - All methods return stub responses
   - These are NOT used in production - the edge functions handle everything directly

### What's Actually Working

| Feature | Status | Implementation |
|---------|--------|----------------|
| Voice Broadcasts (Twilio) | WORKING | voice-broadcast-engine edge function |
| AI Calls (Retell) | WORKING | outbound-calling edge function |
| SMS Processing | WORKING | ai-sms-processor, sms-messaging edge functions |
| Workflow Execution | WORKING | workflow-executor edge function |
| Disposition Automation | WORKING | disposition-router edge function |
| Call Tracking | WORKING | call-tracking-webhook edge function |
| Calendar Integration | WORKING | calendar-integration edge function |
| Pipeline Management | WORKING | pipeline-management edge function |
| AI Assistant | WORKING | ai-brain, ai-assistant edge functions |

### What's Partially Implemented

| Feature | Status | What's Missing |
|---------|--------|----------------|
| Multi-Tenancy | 85% | Migration exists but may need to be run |
| Provider Adapters | STUB | Not used - edge functions handle directly |
| Campaign Compliance | 90% | callsToday/callsThisHour return 0 |
| AI Decision Engine | 95% | Line 280 TODO for execution logic |

## Environment Variables

**Required:**
```
VITE_SUPABASE_URL=https://emonjusymdripmkvtttc.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
```

**Edge Function Secrets (in Supabase):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RETELL_AI_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TELNYX_API_KEY (optional)
ELEVENLABS_API_KEY (optional)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
LOVABLE_API_KEY (for AI features)
```

## Common Commands

```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Production build
npm run test         # Run Vitest tests (may hang - known issue)
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

## Known Issues & Fixes Needed

### High Priority
1. **Bundle Size**: Index.js is 1,073KB (should be <600KB) - needs code splitting
2. **Tests Hanging**: Vitest may hang on Windows - investigate setup
3. **Console.log Cleanup**: 627 console statements need removal
4. **npm Vulnerabilities**: 7 vulnerabilities (run `npm audit fix`)

### Medium Priority
5. **Organization Migration**: Run Phase 2 multi-tenancy migrations in Supabase
6. **Empty Catch Blocks**: 2 in calendar-integration edge function

### Low Priority
7. **Provider Adapter Stubs**: Can be removed or completed for cleaner architecture

## Voice Broadcast Troubleshooting

If voice broadcasts fail, check each item below:

### 1. Twilio Number Ownership (Error 21608)
**Symptom**: Calls fail immediately with "From number not owned by account"
**Solution**:
- Verify number in Twilio Console > Phone Numbers > Manage > Active Numbers
- The `voice-broadcast-engine` validates ownership at lines 213-248
- Common error codes:
  - 21608: From number not owned
  - 21211: Invalid 'To' number
  - 21214: To number unreachable
  - 21217: Geographic permission required

### 2. Webhook URLs (Auto-Configured)
Webhook URLs are dynamically built from `SUPABASE_URL` environment variable (line 561):
- **Status Callback**: `${SUPABASE_URL}/functions/v1/call-tracking-webhook`
- **DTMF Handler**: `${SUPABASE_URL}/functions/v1/twilio-dtmf-handler`
- **AMD Callback**: `${SUPABASE_URL}/functions/v1/twilio-amd-webhook`

For the production project:
```
https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook
https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-dtmf-handler
https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-amd-webhook
```

### 3. Phone Number Rotation Settings
**All three conditions must be true** (lines 703-715):
```sql
-- Query to check eligible numbers:
SELECT * FROM phone_numbers
WHERE status = 'active'
  AND is_spam = false
  AND rotation_enabled = true;
```
Additionally:
- Numbers must not exceed `max_daily_calls` (default: 100)
- Audio broadcasts require Twilio or Telnyx numbers (NOT Retell-only)

### 4. Audio URL Requirements
- Required for all non-AI broadcasts (line 607-611)
- Must be publicly accessible HTTPS URL
- Supported formats: MP3, WAV (Twilio-compatible)
- The URL is XML-escaped for TwiML safety (line 322)

### 5. Calling Hours Enforcement
- Default: 9:00 AM - 9:00 PM in broadcast timezone
- Configurable via `calling_hours_start` and `calling_hours_end`
- Set `bypass_calling_hours = true` to test outside hours
- The check happens at lines 641-675

### 6. Concurrency Limits
- Max concurrent calls: 100 (configurable at line 10)
- Error rate > 25%: Auto-pauses campaign
- Error rate > 10%: Triggers warning alert
- Stuck calls (>5 min in 'calling'): Auto-marked as failed

### 7. Call Pacing (Fixed Jan 17, 2026)
The `calls_per_minute` setting now properly controls call pacing:

**How it works:**
- `calculatePacingDelay()` function at lines 17-23 calculates delay between calls
- Formula: `delay_ms = 60000 / calls_per_minute`
- Minimum delay: 100ms (to avoid API hammering)

**Examples:**
| calls_per_minute | Delay Between Calls | Actual Rate |
|-----------------|---------------------|-------------|
| 50 | 1,200ms | 50/min |
| 100 | 600ms | 100/min |
| 200 | 300ms | 200/min |
| 600+ | 100ms (minimum) | 600/min max |

**Previous bug**: Before this fix, `calls_per_minute` was only used as batch size, not actual rate limiting. Calls were dispatched with only 100ms delay regardless of setting.

### Quick Diagnostic SQL
```sql
-- Check broadcast status and errors
SELECT id, name, status, last_error, last_error_at
FROM voice_broadcasts
ORDER BY created_at DESC LIMIT 10;

-- Check queue status
SELECT status, COUNT(*)
FROM broadcast_queue
WHERE broadcast_id = '<broadcast_id>'
GROUP BY status;

-- Find stuck calls
SELECT * FROM broadcast_queue
WHERE status = 'calling'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

## Database Tables (Key)

**Core:**
- leads, campaigns, call_logs, sms_messages
- lead_workflow_progress, campaign_workflows
- lead_pipeline_positions, pipeline_boards

**Analytics:**
- disposition_metrics, ml_learning_data
- script_performance_analytics, agent_decisions

**Configuration:**
- autonomous_settings, ai_sms_settings
- phone_numbers, dnc_list, timezone_rules

**Multi-Tenancy (Phase 2):**
- organizations, organization_users

## Edge Function Quick Reference

**Voice/Calling:**
- `outbound-calling` - Retell AI calls
- `voice-broadcast-engine` - Twilio broadcasts (1,582 lines)
- `call-tracking-webhook` - Call status updates
- `twilio-dtmf-handler` - DTMF handling
- `twilio-amd-webhook` - Voicemail detection
- `retell-call-webhook` - Retell webhooks

**SMS:**
- `sms-messaging` - Send SMS
- `ai-sms-processor` - AI SMS with workflow auto-reply
- `twilio-sms-webhook` - Inbound SMS

**Automation:**
- `workflow-executor` - Execute workflow steps
- `disposition-router` - Auto-actions on disposition
- `call-dispatcher` - Call queue management
- `nudge-scheduler` - Follow-up scheduling

**AI:**
- `ai-brain` - Main AI orchestration (4,400 lines)
- `ai-assistant` - Tool execution (2,900 lines)
- `analyze-call-transcript` - Transcript analysis
- `ml-learning-engine` - Self-learning

**Integrations:**
- `calendar-integration` - Google Calendar
- `ghl-integration` - Go High Level
- `retell-agent-management` - Retell agents
- `provider-management` - Multi-carrier config

## Testing

**Existing Tests (16 files):**
- Component tests: CampaignWizard, DailyReports, ErrorBoundary, ProductionHealthDashboard
- Hook tests: useAIBrain, useCalendarIntegration, useCampaignWorkflows, usePipelineManagement
- Lib tests: concurrencyUtils, edgeFunctionUtils, logger, monitoringScheduler, performance, phoneUtils
- Integration tests: call-dispatcher, outbound-calling
- E2E tests: auth, dashboard, navigation, accessibility

**Coverage**: ~8% (needs significant expansion)

## Documentation Files

82 markdown files in root directory. Key ones:
- `READ_ME_FIRST.md` - Quick start
- `EXECUTIVE_SUMMARY.md` - Business overview
- `FEATURES.md` - Complete feature list
- `WORKFLOW_AUTOREPLY_STATUS.md` - Auto-reply is IMPLEMENTED
- `DISPOSITION_METRICS_STATUS.md` - Metrics are IMPLEMENTED
- `PHASE2_MULTITENANCY_PLAN.md` - Multi-tenant architecture

## Recent Commits

Check `git log --oneline -20` for recent changes. Common patterns:
- "Changes" commits are auto-generated by Lovable
- Feature commits describe actual functionality

## Performance Notes

- Build: ~10 seconds
- Dev server: ~500ms cold start
- Main bundle: 1,073KB (needs splitting)
- Vendor chunks properly split (react, charts, ui, data)

## Security

- TypeScript: 0 compilation errors
- CodeQL: 0 vulnerabilities
- npm audit: 7 vulnerabilities (mostly dev dependencies)
- RLS: Enabled on all tables
- Auth: Supabase Auth with JWT

---

## White-Label Credit System (v2.0 - January 24, 2026)

**Enterprise-grade** prepaid credit system for white-label reselling of Retell AI voice services. Enables agencies to resell AI voice minutes at markup with full auditability and race-condition prevention.

### Business Model

| Component | Description |
|-----------|-------------|
| **Your Cost** | Retell AI @ $0.05-0.07/min (enterprise) |
| **Customer Price** | $0.12-0.18/min (your markup) |
| **Margin** | 70-200% per minute |
| **Revenue Model** | Prepaid credits, auto-recharge ready |

### Enterprise Features (v2.0)

1. **Credit Reservation System** - Reserves credits BEFORE call starts, prevents overspending
2. **Idempotent Operations** - All operations use idempotency keys, safe to retry
3. **Race Condition Prevention** - PostgreSQL `FOR UPDATE` locking on all balance changes
4. **Actual Cost Sync** - Fetches real cost from Retell API after each call
5. **Enterprise Accounts** - Configurable negative balance limits for trusted clients
6. **Full Audit Trail** - Every credit operation logged with before/after balances

### Credit Flow (How It Works)

```
1. User initiates call
   │
   ▼
2. outbound-calling checks billing_enabled
   │ NO → Proceed normally (backward compatible)
   │ YES ↓
   ▼
3. check_credit_balance() - Is there enough?
   │ NO → Return error, block call
   │ YES ↓
   ▼
4. reserve_credits(15c) - Lock estimated amount
   │
   ▼
5. Call proceeds via Retell API
   │
   ▼
6. Call ends → retell-call-webhook fires
   │
   ▼
7. Fetch actual cost from Retell GET /get-call
   │
   ▼
8. finalize_call_cost() - Release reservation, deduct actual
   │
   ▼
9. Check low balance alerts / auto-recharge triggers
```

### Files Created/Modified

| File | Lines | Purpose |
|------|-------|---------|
| `migrations/20260124_white_label_credits.sql` | 583 | Base tables, functions, RLS |
| `migrations/20260124_white_label_credits_v2_enhanced.sql` | 789 | Reservation system, idempotency |
| `functions/credit-management/index.ts` | 575 | Credit API (10 actions, v2.0) |
| `functions/_shared/credit-helpers.ts` | 592 | Helper functions |
| `functions/outbound-calling/index.ts` | +80 | Pre-call credit check + reservation |
| `functions/retell-call-webhook/index.ts` | +120 | Post-call finalization |
| `WHITE_LABEL_SYSTEM.md` | 630 | Master documentation |

### Database Functions (All Idempotent)

| Function | Purpose | Locking |
|----------|---------|---------|
| `check_credit_balance(org, mins)` | Pre-call check | No |
| `reserve_credits(org, cents, call_id, retell_id)` | Reserve before call | FOR UPDATE |
| `finalize_call_cost(org, call_id, retell_id, mins, cost)` | Deduct after call | FOR UPDATE |
| `add_credits(org, cents, type, desc, stripe_id)` | Add credits | FOR UPDATE |
| `check_auto_recharge(org)` | Check recharge needed | No |

### Backward Compatibility

**CRITICAL**: All features gated by `organizations.billing_enabled`:
- `false` → All calls proceed normally (no checks, no deductions)
- `true` → Full credit system activates

### Quick Enable for Organization

```sql
-- 1. Enable billing
UPDATE organizations SET billing_enabled = true WHERE id = '<org_id>';

-- 2. Create credit record
INSERT INTO organization_credits (
  organization_id, balance_cents, cost_per_minute_cents, retell_cost_per_minute_cents
) VALUES ('<org_id>', 5000, 15, 7);  -- $50 at $0.15/min, cost $0.07/min

-- 3. Ensure call_logs has organization_id column
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
```

### Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Credit System Core | ✅ Complete | Tables, functions, RLS, views |
| 2. Reservation System | ✅ Complete | Pre-call lock, post-call release |
| 3. Idempotency | ✅ Complete | All operations retry-safe |
| 4. Cost Tracking | ✅ Complete | Fetches from Retell API |
| 5. outbound-calling Integration | ✅ Complete | Check + reserve before call |
| 6. Webhook Integration | ✅ Complete | Finalize after call |
| 7. Client Portal | ⏳ Pending | Sub-account dashboard |
| 8. Stripe Integration | ⏳ Pending | Auto-recharge payments |

### Deployment Commands

```bash
# Deploy all credit-related functions
cd C:/Users/charl/dial-smart-system
supabase functions deploy credit-management
supabase functions deploy outbound-calling
supabase functions deploy retell-call-webhook

# Health check
curl -X POST https://emonjusymdripmkvtttc.supabase.co/functions/v1/credit-management \
  -H "Authorization: Bearer <token>" \
  -d '{"action": "health_check"}'
```

### Full Documentation

See `WHITE_LABEL_SYSTEM.md` for:
- Complete file audit with line counts
- Deployment checklist
- Testing procedures
- Troubleshooting guide
- Known limitations and future work

---

**Last Updated**: January 28, 2026
**Audit Confidence**: Very High (comprehensive codebase analysis)
**Credit System Version**: 3.0.0 (Agent-Specific Pricing)

## Recent Fixes Log

### February 3, 2026 - Agent Voice Preview Plays In-App (NOT PUBLISHED)

**Summary:** Fixed the Agent Settings → Voice tab so clicking **Play Voice Sample** actually plays audio in the browser (instead of showing “check Retell dashboard”).

**What Changed:**
- Agent voice IDs remain **Retell-compatible** (`11labs-George`, etc.) for saving to Retell.
- Voice preview now calls our **`elevenlabs-tts` edge function** to generate a short MP3 and plays it immediately via a data-URI.
- Keeps existing pre-recorded samples for `11labs-Adrian`, `11labs-Rachel`, and OpenAI voices.

**Key Files Modified:**
- `src/components/AgentEditDialog.tsx`

**Database Changes:** None

**Gotchas:** Preview requires `ELEVENLABS_API_KEY` to be configured in Supabase secrets.

### January 28, 2026 - Admin Settings & Agent-Specific Pricing (DEPLOYED)

> **DEPLOYMENT STATUS: PRODUCTION** ✅
> - Edge functions deployed via MCP:
>   - `outbound-calling` v468 ✅ (agent-specific pricing lookup)
>   - `retell-call-webhook` v328 ✅ (agent_id for finalization)

**New Admin Settings Tab (Admin-Only):**
- Location: Sidebar → System & Settings → Admin Settings (🔒 Lock icon)
- Only visible to organization owners and admins
- Simple ON/OFF toggle for credit system

**Agent-Specific Pricing System:**
Per-agent pricing based on actual Retell costs. No more flat-rate guessing.

| Component | What It Does |
|-----------|--------------|
| `pricing_tiers` table | Stores Retell's base rates (LLM, Voice, Telephony, Add-ons) |
| `agent_pricing` table | Per-agent pricing with custom markup |
| `AgentPricingManager` component | UI to sync agents and set markup |

**Pre-Loaded Retell Rates:**
- GPT-4o Mini: $0.006/min | GPT-4o: $0.05/min | Claude 3.5 Sonnet: $0.06/min
- ElevenLabs: $0.07/min | Deepgram: $0.02/min
- Telephony: $0.015/min | Knowledge Base: $0.005/min

**How It Works:**
1. Sync agents from Retell (detects LLM + Voice)
2. Auto-calculates base cost per agent
3. Set your markup per agent
4. Customer price = Base + Markup
5. Actual Retell cost fetched after each call
6. Real margin tracked per transaction

**New Database Functions:**
- `check_credit_balance()` - Pre-call balance verification
- `reserve_credits()` - Lock credits before call
- `finalize_call_cost()` - Release reservation, deduct actual, calculate margin
- `calculate_agent_base_cost()` - Sum LLM + Voice + Telephony costs
- `get_agent_customer_price()` - Look up agent-specific rate

**Files Created:**
- `src/components/AdminSettings.tsx` - Admin settings panel
- `src/components/AgentPricingManager.tsx` - Agent pricing configuration

**Files Modified:**
- `src/components/DashboardSidebar.tsx` - Added Admin Settings (admin-only)
- `src/components/Dashboard.tsx` - Added AdminSettings tab
- `supabase/functions/outbound-calling/index.ts` - Agent-specific pricing lookup
- `supabase/functions/retell-call-webhook/index.ts` - Pass agent_id for finalization

**URL to Test:**
- Admin Settings: http://localhost:8080/?tab=admin-settings

---

### January 26, 2026 - UI Consolidation & New Features (DEPLOYED)

> **DEPLOYMENT STATUS: PRODUCTION** ✅ ALL COMPLETE
> - Git push: commit 6d15f8e (20 files, 7,922 insertions, 477 deletions)
> - Edge functions deployed via MCP:
>   - `credit-management` v1 ✅
>   - `stripe-webhook` v1 ✅
>   - `outbound-calling` v467 ✅ (credit check + reservation)
>   - `retell-call-webhook` v327 ✅ (finalize_call_cost + credit deduction)

**AI Dashboard Consolidation:**
Merged AI Engine, AI Manager, and Agent Activity into the Autonomous Agent dashboard as sub-tabs.

| Original Tab | New Location | Status |
|--------------|--------------|--------|
| AI Engine | Autonomous Agent → AI Engine tab | ✅ Merged |
| AI Manager (Pipeline) | Autonomous Agent → Pipeline tab | ✅ Merged |
| Agent Activity | Autonomous Agent → Activity tab | ✅ Merged |
| Agent Builder | Standalone (unchanged) | ✅ Not touched |
| Retell AI | Standalone (unchanged) | ✅ Not touched |
| AI Workflows | Standalone (unchanged) | ✅ Not touched |

**Files Modified:**
- `src/components/AutonomousAgentDashboard.tsx` - Added lazy imports for AIDecisionEngine, AIPipelineManager, AgentActivityDashboard; added 3 new tabs; added phone number fetching for AI Engine
- `src/components/DashboardSidebar.tsx` - Removed AI Engine, AI Manager, Agent Activity from sidebar (now in Autonomous Agent)
- `src/components/AIBrainChat.tsx` - DELETED (duplicate of AIAssistantChat)
- `src/components/AIPipelineManager.tsx` - Added pipeline dropdown selector to choose which pipeline to analyze

**New Features:**
1. **Pipeline Dropdown in AI Pipeline Manager** - Users can now select which pipeline to analyze instead of analyzing all leads
2. **Call History Table** - Enhanced with disposition filters, agent filters, Retell custom attributes
3. **Client Portal** - White-label customer self-service dashboard (credits, usage, Stripe checkout)
4. **Stripe Webhook Handler** - `supabase/functions/stripe-webhook/index.ts` for payment processing

**Chat Component Merge:**
- Deleted `AIBrainChat.tsx` (unused duplicate)
- `AIAssistantChat.tsx` is the single chat component with voice, hands-free mode, tool status

**URLs to Test:**
- Autonomous Agent (consolidated): http://localhost:8080/?tab=autonomous-agent
- Call History: http://localhost:8080/?tab=call-history
- Client Portal: http://localhost:8080/?tab=client-portal
- Credits Dashboard: http://localhost:8080/?tab=credits

**Pending Deployment:**
These edge functions were created/modified but NOT deployed:
- `stripe-webhook` - New function for Stripe payment webhooks
- `credit-management` - Updated with checkout session and settings actions

**Known Issues:**
- Client Portal may show blank if edge functions not deployed (falls back to demo data)
- Call History needs Retell API key configured for agent list

---

### January 24, 2026 - White-Label Credit System v2.0 (MAJOR)

**Implemented enterprise-grade prepaid credit system for white-label Retell AI reselling:**

**Database Migrations Created:**
- `20260124_white_label_credits.sql` (583 lines) - Base tables, functions, RLS
- `20260124_white_label_credits_v2_enhanced.sql` (789 lines) - Enterprise enhancements

**New Tables:**
- `organization_credits` - Balance, rates, thresholds, auto-recharge settings
- `credit_transactions` - Full audit log with idempotency keys
- `usage_summaries` - Aggregated reporting by period

**New PostgreSQL Functions:**
- `check_credit_balance()` - Pre-call balance verification
- `reserve_credits()` - Lock credits before call (FOR UPDATE)
- `finalize_call_cost()` - Release reservation, deduct actual (FOR UPDATE)
- `add_credits()` - Deposits with idempotency
- `check_auto_recharge()` - Auto-recharge detection

**Edge Function Updates:**
- `credit-management/index.ts` (575 lines) - 10 API actions, v2.0
- `_shared/credit-helpers.ts` (592 lines) - Reservation/finalization helpers
- `outbound-calling/index.ts` - Added credit check (line 252) + reservation (line 298)
- `retell-call-webhook/index.ts` - Added finalization (line 1385) + Retell cost fetch

**Key Features:**
- Credit reservation prevents overspending during concurrent calls
- Idempotency keys prevent duplicate transactions
- FOR UPDATE locking prevents race conditions
- Actual Retell cost fetched via GET /get-call API
- Low balance alerts (24h cooldown)
- Auto-recharge trigger detection (Stripe integration ready)
- Enterprise accounts can go negative (configurable limit)

**Backward Compatible:**
- All features gated by `organizations.billing_enabled`
- When false: calls proceed normally, no credit checks
- When true: full credit system activates

**Documentation:**
- `WHITE_LABEL_SYSTEM.md` - Complete master documentation (630 lines)
- Includes deployment checklist, testing procedures, troubleshooting

---

### January 24, 2026 - Voice AI Campaign Pre-Launch Verification

**Verified for Retell AI Voice Campaign launch:**

- **12 Retell Phone Numbers**: All active, daily_calls=0 (ready)
  - `rotation_enabled=false` is CORRECT for Retell-native (Retell handles internally)

- **Retell Agents**:
  - Active: `agent_f65b8bcd726f0b045eb1615d8b` (aTest Campaign - Call 3 Times)
  - Campaign settings: 5 calls/min, max_attempts=3, retry_delay=5min

- **Edge Functions** (all deployed and active):
  - `outbound-calling` v466
  - `retell-call-webhook` v326 (verify_jwt=false for webhooks)
  - `call-tracking-webhook` v463
  - `retell-agent-management` v468

- **Calendar Integration**:
  - `calendar_preference: "both"` - pulls availability from BOTH Google AND GHL
  - Merges busy times from: Google Calendar + GHL Calendar + Local DB appointments
  - GHL Calendar: `TkQdLhTuaDjmUvAYD2TH` (Mathew Hickey's Personal Calendar)
  - Logic: `calendar-integration/index.ts` lines 908-1024

- **GHL Sync**: Enabled with full field mappings, tag rules, pipeline stage mappings

- **Leads**: 1,110 available (1,020 new + 90 contacted)

**Manual verification needed in Retell Dashboard:**
1. Webhook URL: `https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook`
2. RETELL_AI_API_KEY set in Supabase secrets

---

### January 18, 2026

- **Script Analytics Dashboard Integration**: Added `ScriptAnalyticsDashboard` to 5 UI locations:
  1. Analytics page → Reports tab (`src/pages/Analytics.tsx`)
  2. TranscriptAnalyzer → Script Insights tab (`src/components/TranscriptAnalyzer.tsx`)
  3. CallAnalytics component (`src/components/CallAnalytics.tsx`)
  4. RetellAIManager → Analytics tab (`src/components/RetellAIManager.tsx`)
  5. AutonomousAgentDashboard → Analytics tab (`src/components/AutonomousAgentDashboard.tsx`)

- **Database Migration Applied**: `20260118_script_analytics_enhancement.sql`
  - **Tables**: `opener_analytics`, `call_opener_logs`, `voicemail_analytics`, `voicemail_callback_tracking`
  - **Views**: `top_openers`, `time_wasted_summary`, `voicemail_performance`
  - **Functions**: `calculate_time_wasted_score`, `extract_opener_from_transcript`, `normalize_opener_text`, `update_opener_analytics`, `update_voicemail_analytics`
  - **RLS**: Enabled on all new tables

- **Edge Functions Deployed**:
  - `analyze-call-transcript` (v453) - Now tracks opener effectiveness and time wasted
  - `call-tracking-webhook` (v459) - Now detects voicemail callbacks

- **New Files Created**:
  - `src/components/ScriptAnalyticsDashboard.tsx` - Main analytics UI component
  - `AGENT.md` - AI learning file for script/opener patterns
  - `LEARNINGS.md` - Campaign history and learnings
  - `scripts/campaign-analyzer/` - SQL and playbook for campaign analysis

- **Git Commit**: `bd67050` - "feat: Add ScriptAnalyticsDashboard to 5 UI locations"

### January 17, 2026
- **GHL Contact Import Fix (Fixed Multiple Times!)**: `ghl-integration` sync_contacts now properly imports ALL contacts
  - **Issue 1**: GHL API returns 422 error when `limit` or `tags` parameters are sent in the search body
  - **Fix 1**: Removed `limit` and `tags` from search body; only use `pageLimit` and `locationId`
  - **Issue 2**: GHL API caps the `total` field at 10,000 even when there are more contacts (e.g., 29,000)
  - **Fix 2**: Ignore `totalFromApi` - only stop pagination when we get fewer than 100 contacts per page
  - **Tags Filter**: Now applied client-side AFTER fetching all contacts (GHL API doesn't support server-side tag filtering)
  - **CRITICAL**: Do NOT trust the `total` field from GHL API - it's capped at 10,000
  - **CRITICAL**: Do NOT add `limit: PAGE_SIZE` or `tags: [...]` to the search endpoint body - this causes 422 errors
  - **File**: `supabase/functions/ghl-integration/index.ts` lines 297-354
  - **Pagination**: Uses search endpoint with page-based pagination (page: 1, 2, 3...) not cursor-based
  - **Max Contacts**: 100,000 (1000 pages * 100 per page)

- **Call Pacing Fix**: `voice-broadcast-engine` now properly enforces `calls_per_minute` setting
  - Added `calculatePacingDelay()` function for dynamic delay calculation
  - Previous: 100ms fixed delay (600 calls/min regardless of setting)
  - Now: Delay calculated as `60000 / calls_per_minute` with 100ms minimum
  - Logs show actual pacing: "pacing: 50/min with 1200ms delay"

- **Retry Logic for no_answer/busy/failed Calls**: `call-tracking-webhook` now automatically schedules retries
  - **Issue**: Calls ending as no_answer, busy, or failed were marked final with no retry
  - **Analysis from Chase 1.15 campaign**:
    - 28 no_answer calls (could have been retried)
    - 8 busy calls (could have been retried)
    - 12 failed calls (could have been retried)
    - Total: 48 calls that could benefit from retry = 23% of campaign
  - **Fix**: Added retry logic at lines 373-400 in `call-tracking-webhook/index.ts`
  - **How it works**:
    1. When call ends as no_answer/busy/failed, check if `attempts < max_attempts`
    2. If retry eligible: set status='pending', increment attempts, schedule retry
    3. Retry scheduled for `retry_delay_minutes` later (default: 60 minutes)
    4. Only counts as final outcome when max_attempts reached
  - **Configuration**: Set `max_attempts` > 1 on voice_broadcasts to enable retries
  - **Example**: max_attempts=3, retry_delay_minutes=60 = up to 3 calls, 1 hour apart
  - **File**: `supabase/functions/call-tracking-webhook/index.ts` lines 373-435
  - **NEEDS DEPLOYMENT**: Run `supabase functions deploy call-tracking-webhook`

- **Campaign Analysis Summary (Chase 1.15)**:
  - 203 total leads, 176 calls made
  - 29 answered (16.5% answer rate)
  - 126 voicemail (81.3% - AMD working correctly)
  - 28 no_answer, 8 busy, 12 failed (48 retry candidates)
  - Phone rotation: 13 numbers configured, all used (daily_calls distributed)
  - DTMF: Working (1x "1", 1x "2" captured)
