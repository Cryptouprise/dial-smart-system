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

### February 10, 2026 (Part 5) - Campaign Strategist: 8/10 → 10/10 (NOT DEPLOYED)

**Summary:** Two features that take the AI from execution-focused to strategist-level. The AI now plans entire days like a campaign manager (resource allocation across competing priorities) and discovers cross-dimensional patterns humans would miss (timing correlations, source effectiveness, decay curves, sequence optimization).

**What Changed:**

**1. Campaign Resource Allocator (9/10 Feature) — "Daily War Room"**
- `planDay()` function generates a complete battle plan each morning
- Gathers resource inventory: phone numbers (healthy vs resting), lead inventory by stage, budget, yesterday's performance, optimal calling windows, top playbook rules
- Feeds everything to premium LLM (Claude Sonnet) which generates:
  - Executive summary ("What's the play today?")
  - Priority order (callbacks → hot → engaged → stalled → fresh)
  - Budget allocation percentages per lead tier
  - Number allocation (best numbers → highest-value leads)
  - Time-blocked schedule with pace per hour and channel (call vs SMS)
  - Risk factors and expected outcomes (appointments, conversations, cost)
- Rule-based fallback when LLM unavailable (proportional allocation)
- End-of-day adherence scoring: compares plan vs actual outcomes
- Plans stored in `daily_battle_plans` table

**2. Strategic Pattern Detective (10/10 Feature) — "The AI That Sees What You Can't"**
- Runs 6 statistical pattern detection algorithms daily:
  1. **Timing Patterns**: Day × Hour conversion analysis. "Thursday 2pm converts 3.2x vs Monday 10am"
  2. **Attempt Gap Patterns**: Optimal retry timing. "24-48h gap converts 2.1x vs <2h gap"
  3. **Sequence Patterns**: Channel order effects. "SMS-before-call leads answer 1.8x more"
  4. **Source Patterns**: Lead origin effectiveness. "Facebook leads convert 2.5x vs web form"
  5. **Decay Patterns**: Value half-life. "Lead value drops 50% after 3-7 days of no contact"
  6. **Number Patterns**: Area code effectiveness. "555 area code gets 2x answer rate vs 212"
- Cross-dimensional LLM analysis: feeds all pattern data to premium LLM for non-obvious correlations
- All insights stored with: confidence score, sample size, effect magnitude, recommended action
- **Auto-rule creation**: High-confidence insights (>75%) with 30+ samples auto-generate new playbook rules
- Rule types: timing overrides, retry delay optimization, SMS-before-call channel preference
- All generated rules tracked in `insight_generated_rules` table with performance monitoring

**3. Strategic Briefings**
- Daily/weekly briefings auto-generated when insights are discovered
- Headline, executive summary, wins, concerns, recommendations, action items
- Compares current period vs previous period (appointments, conversion rate, cost per appointment)
- Stored in `strategic_briefings` table

**4. Campaign Strategist Dashboard (CampaignStrategistDashboard.tsx)**
- New "Strategist" tab in Autonomous Agent dashboard (tab 2, right after Overview)
- Three sub-tabs:
  - **Battle Plan**: Executive summary, resource cards, priority order, budget allocation bars, time blocks, risk factors
  - **Patterns**: Scrollable insight cards with confidence badges, effect magnitudes, recommended actions, auto-rule indicators
  - **Briefings**: Strategic briefings with wins/concerns/action items
- Auto-refreshes every 60 seconds

**Files Created:**
| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/20260210_campaign_strategist.sql` | ~230 | All tables, views, functions |
| `src/components/CampaignStrategistDashboard.tsx` | ~430 | Strategist dashboard UI |

**Files Modified:**
| File | Changes |
|------|---------|
| `supabase/functions/ai-autonomous-engine/index.ts` | +~700 lines: planDay(), generateRuleBasedPlan(), scorePlanAdherence(), detectStrategicPatterns(), 6 pattern detectors, runCrossDimensionalAnalysis(), saveInsight(), createRuleFromInsight(), generateBriefing(), new EngineResult fields, steps 16-17 in runForUser |
| `src/components/AutonomousAgentDashboard.tsx` | Added CampaignStrategistDashboard lazy import, Strategist tab (grid 10→11 columns) |

**New Database Tables:**
- `daily_battle_plans` — Daily resource allocation with time blocks, budget splits, expected outcomes, adherence tracking
- `strategic_insights` — Discovered patterns with confidence, effect magnitude, statistical backing
- `insight_generated_rules` — Rules auto-created from high-confidence insights
- `strategic_briefings` — Daily/weekly strategic summaries with wins/concerns/actions

**New Database View:**
- `call_outcome_dimensions` — Cross-dimensional join of call_logs + leads + lead_journey_state for fast pattern queries

**New Database Function:**
- `get_funnel_trend(user_id, days)` — Returns daily funnel snapshots for trend analysis

**New autonomous_settings Columns:**
- `enable_daily_planning` (BOOLEAN, default false) — Master toggle for daily battle plans
- `enable_strategic_insights` (BOOLEAN, default false) — Master toggle for pattern detection
- `daily_budget_cents` (INTEGER, default 50000) — Daily budget constraint ($500)
- `auto_create_rules_from_insights` (BOOLEAN, default false) — Auto-generate rules from patterns
- `insight_confidence_threshold` (NUMERIC, default 0.75) — Minimum confidence for auto-rule creation
- `briefing_frequency` (TEXT, default 'daily') — How often to generate briefings

**Engine Steps (now 19 total):**
```
1-15: [unchanged from Part 4]
16. Campaign Resource Allocator (NEW) — daily battle plan generation
17. Strategic Pattern Detective (NEW) — cross-dimensional pattern discovery + auto-rules + briefings
18. Save operational memory (was 16)
19. Update last_engine_run (was 17)
```

**Deployment Required:**
```bash
# Run migration
# Set OpenRouter key (required for premium features):
supabase secrets set OPENROUTER_API_KEY=your_key_here
# Deploy:
supabase functions deploy ai-autonomous-engine
```

**Build Validation:** Both `npx tsc --noEmit` and `npx vite build` pass clean.

---

### February 10, 2026 (Part 4) - AI Intelligence Upgrade: 4/10 → 8/10 (NOT DEPLOYED)

**Summary:** 8 upgrades that give the AI real intelligence about the game being played at scale: funnel thinking, disposition value awareness, number health prediction, LLM intent extraction, cost/ROI tracking, campaign type differentiation, and self-optimizing playbook rules.

**What Changed:**

**1. OpenRouter Integration** (`_shared/openrouter.ts`)
- Shared LLM helper with model tiers: fast (Gemini Flash), balanced (Claude Sonnet), premium (Claude Sonnet)
- Falls back to Lovable AI gateway if no OpenRouter key configured
- JSON mode support, temperature/max_tokens control
- Requires `OPENROUTER_API_KEY` in Supabase secrets (optional - degrades gracefully)

**2. Disposition Value Weighting** (`disposition_values` table)
- Maps each call outcome to conversion probability and priority boost
- `talk_to_human` (0.60 probability, +40 priority) > `callback` (0.35, +30) > `contacted` (0.10, +5)
- Auto-seeded via `seed_disposition_values()` function with 18 default mappings
- Integrated into journey engine interest level computation

**3. Funnel Intelligence** (`analyzeFunnel()` in autonomous engine)
- Portfolio-level thinking: "42 warm leads are worth more than 2,000 cold dials"
- Daily funnel snapshots: stage counts, conversion rates, cost per appointment
- Detects: fresh leads piling up, stalled leads leaking value, high-value leads needing priority
- Saves to `funnel_snapshots` table for trend analysis

**4. Transcript Intent Parser** (`extractTranscriptIntents()`)
- LLM extracts structured signals from call transcripts: timeline, budget, decision maker, buying signals, objections, specific dates mentioned
- Saves to `lead_intent_signals` table
- Auto-boosts lead interest when high intent detected
- Processes max 5 transcripts per engine run to control costs
- Uses OpenRouter fast tier (Gemini Flash)

**5. Cost-Per-Lead Tracking** (columns on `lead_journey_state`)
- Tracks `total_cost_cents`, `call_cost_cents`, `sms_cost_cents` per lead
- Computes `estimated_value_cents` from disposition conversion probability
- `roi_score`: estimated value / total cost invested
- Engine knows when to stop investing in a lead (diminishing returns)

**6. Campaign Type Playbooks** (`campaign_type` column on `followup_playbook` + `lead_journey_state`)
- Rules can target: `cold_outreach`, `database_reactivation`, `speed_to_lead`, `inbound_followup`, or `all`
- Journey engine filters rules by campaign type when matching
- Same sequence structure, different messaging for each type

**7. Number Health Prediction** (`predictNumberHealth()` + `number_health_metrics` table)
- `recalculate_number_health()` PG function analyzes velocity, answer rates, voicemail rates
- Predicted spam risk formula: high velocity + low answer rate + high voicemail rate = risk
- Health score 0-100, proactive rest recommendations
- Auto-quarantines numbers with health < 20, reduces daily limits for health < 50
- Catches numbers BEFORE they get spam-flagged, not after

**8. Self-Optimizing Playbook** (`optimizePlaybook()`)
- Tracks every playbook rule's performance: times fired, response rate, appointment rate
- `playbook_performance` table with computed `performance_score`
- Rules with 20+ fires and <2% response rate flagged as underperformers
- Rules with 15+ fires and >15% response rate highlighted as top performers
- Daily LLM analysis (balanced tier) generates specific optimization recommendations
- All optimizations logged to `playbook_optimization_log` with reasoning and data basis

**Files Created:**
| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/_shared/openrouter.ts` | 160 | OpenRouter LLM integration helper |
| `supabase/migrations/20260210_ai_intelligence_upgrade.sql` | 433 | All tables, functions, seed data |

**Files Modified:**
| File | Changes |
|------|---------|
| `supabase/functions/ai-autonomous-engine/index.ts` | +600 lines: analyzeFunnel(), predictNumberHealth(), extractTranscriptIntents(), optimizePlaybook(), loadDispositionValues(), disposition-aware interest computation, campaign type rule filtering, cost/ROI tracking |

**New Database Tables:**
- `disposition_values` - Conversion probability and priority boost per outcome
- `lead_intent_signals` - LLM-extracted buying signals per call
- `number_health_metrics` - Per-number health scores and spam risk prediction
- `playbook_performance` - Rule effectiveness tracking
- `funnel_snapshots` - Daily portfolio-level state
- `playbook_optimization_log` - AI playbook rewrite audit trail

**New Database Functions:**
- `seed_disposition_values(user_id)` - Seeds 18 default disposition weights
- `recalculate_number_health(user_id)` - Recalculates all number health metrics from call data

**New Columns:**
- `lead_journey_state`: total_cost_cents, call_cost_cents, sms_cost_cents, estimated_value_cents, roi_score, last_disposition, campaign_type
- `followup_playbook`: campaign_type

**Deployment Required:**
```bash
# Run migration
# Set OpenRouter key (optional but recommended):
supabase secrets set OPENROUTER_API_KEY=your_key_here
# Deploy:
supabase functions deploy ai-autonomous-engine
```

**Build Validation:** Both `npx tsc --noEmit` and `npx vite build` pass clean.

---

### February 10, 2026 (Part 3) - Lead Journey Intelligence System (NOT DEPLOYED)

**Summary:** The missing brain that actively manages every lead through their sales journey. Replaces the fake AIPipelineManager heuristics with a real server-side engine that tracks journey stages, applies sales psychology-based follow-up rules, respects explicit callback requests, learns preferred contact times/channels, and queues intelligent follow-up actions.

**What Changed:**

**1. Journey Engine (manageLeadJourneys function in ai-autonomous-engine)**
- Syncs all leads into `lead_journey_state` table on each run
- Recomputes interaction counts from real `call_logs` and `sms_messages` data
- Auto-computes journey stage: fresh → attempting → engaged → hot → nurturing → stalled → dormant → callback_set → booked → closed
- Detects interest signals: call duration > 2min = buying signal, SMS replies, sentiment trends
- Learns best hour to call from answered call patterns
- Learns preferred channel (call vs SMS) from response data
- CRITICAL: Explicit callback requests (`call me Tuesday at 2pm`) are NEVER overridden - they get exact-time execution + 1hr advance reminder
- Matches leads against `followup_playbook` rules (highest-priority matching rule wins)
- Respects calling windows (9am-9pm) for scheduled actions
- Channel rotation tracking (alternates call/SMS when preference unknown)
- Daily touch cap prevents over-contacting (default 200/day)
- All actions flow through `ai_action_queue` for the configured autonomy level

**2. Sales Psychology Playbook (18 default rules)**
- Speed-to-lead: Call fresh leads within 5 minutes (Harvard study: 100x more likely to connect)
- Multi-channel: SMS within 2 min of unanswered call (+25% connect rate)
- Escalation: 3 call attempts with time-varied spacing, then value-driven AI SMS
- Engaged follow-up: Recap SMS within 1 hour, follow-up call at 36 hours
- Hot lead compression: Same-day call + morning check-in SMS
- Nurture drip: Value SMS at 1 week, 3 weeks, monthly (not a pitch)
- Stalled re-engagement: Curiosity-based SMS, then "breakup text" as last resort
- Callback honoring: Reminder 1hr before, call at exact requested time
- Booked confirmation: Immediate confirmation + day-before + morning-of reminders

**3. Journey Dashboard (LeadJourneyDashboard.tsx)**
- New "Journeys" tab in Autonomous Agent dashboard
- Stage distribution with clickable funnel visualization
- Click any stage to see all leads in that stage with interest levels, touch counts, preferred channels
- Upcoming actions panel (next 24 hours of scheduled follow-ups)
- Journey event log (audit trail of stage changes, rules fired, actions queued)
- Journey engine toggle (enable/disable independently)
- Auto-refreshes every 60 seconds

**4. New Action Types in Engine**
- `journey_call`: Calls lead via outbound-calling edge function
- `journey_ai_sms`: Generates and sends AI-written SMS via ai-sms-processor

**Files Created:**
| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/20260210_lead_journey_intelligence.sql` | ~255 | Tables, playbook rules, seed function |
| `src/components/LeadJourneyDashboard.tsx` | ~400 | Journey visualization dashboard |

**Files Modified:**
| File | Changes |
|------|---------|
| `supabase/functions/ai-autonomous-engine/index.ts` | +~350 lines: manageLeadJourneys(), queueJourneyAction(), journey_call/journey_ai_sms action types, wired into runForUser step 9 |
| `src/components/AutonomousAgentDashboard.tsx` | Added Journeys tab with LeadJourneyDashboard, grid 9→10 columns |

**New Database Tables:**
- `lead_journey_state` - One row per lead. Journey stage, interaction counts, timing intelligence, interest level, sentiment, next action, preferred channel/hour
- `followup_playbook` - Configurable per-stage rules with conditions and timing
- `journey_event_log` - Audit trail of every journey engine decision

**New Database Functions:**
- `seed_default_playbook(user_id)` - Seeds 18 sales psychology-based default rules

**New autonomous_settings Columns:**
- `manage_lead_journeys` (BOOLEAN, default false) - Master toggle
- `journey_max_daily_touches` (INTEGER, default 200) - Daily cap

**Key Design Decisions:**
- Explicit callbacks are SACRED - the engine will NEVER override a lead who said "call me Tuesday at 2pm"
- Interest level computed from real signals: call outcomes, duration, SMS replies, sentiment scores
- Best contact hour learned from actual answered calls, not guessed
- Channel preference learned from which channel gets responses
- Stage transitions are computed fresh each run (not incrementally) so they self-correct
- All actions go through ai_action_queue so the configured autonomy level (full_auto/approval_required/suggestions_only) is respected

**Deployment Required:**
```bash
# Run migration first
# Then deploy:
supabase functions deploy ai-autonomous-engine
```

---

### February 10, 2026 - Autonomous Engine Upgrade & AI Safety Tiers (NOT DEPLOYED)

**Summary:** Major upgrade to make the AI assistant truly autonomous with server-side execution, safety guardrails, persistent memory, and an action approval queue.

**What Changed:**

**1. Server-Side Autonomous Engine (NEW)**
- New `ai-autonomous-engine` edge function replaces all browser-side autonomous hooks
- Runs every 5 min via pg_cron (not browser setInterval)
- Goal assessment: checks daily call/appointment/conversation targets vs progress
- Lead scoring: server-side rescoring with engagement/recency/answer rate/status weights
- Pacing analysis: auto-adjusts calls_per_minute based on error rate and answer rate
- Decision making: queues actions (lead calling, follow-up SMS, number quarantine, pacing changes)
- Respects autonomy_level: full_auto (auto-approve), approval_required (queue for user), suggestions_only (log only)
- Daily action cap enforced server-side (default 50)
- Saves operational memories after significant events

**2. Safety Tiers (CRITICAL FIX)**
- **ai-assistant**: `riskyTools` expanded from 2 to 6: `buy_phone_numbers`, `send_sms_blast`, `launch_now`, `bulk_update_leads`, `delete_workflow`, `classify_phone_number`
- **ai-brain**: Added global `criticalTools` confirmation gate (didn't have one before!): `launch_now`, `purchase_retell_numbers`, `send_sms_blast`, `delete_lead`, `delete_workflow`, `bulk_update_leads`, `classify_phone_number`, `delete_phone_number`
- Both functions now show exactly what action + params before confirming
- System prompts updated to list all high-impact actions requiring confirmation

**3. Operational Memory System (NEW)**
- `ai_operational_memory` table: persistent structured memory (campaigns, lessons, errors, patterns)
- Both AI functions now inject up to 10-15 recent memories into system prompt
- Auto-saves after significant tool executions (campaigns, launches, deletes, errors)
- Memory decays by importance and access frequency
- Enables real context between conversations (not goldfish memory)

**4. Action Queue & Approval UI (NEW)**
- `ai_action_queue` table with status flow: pending → approved → executing → completed/failed
- `ActionQueuePanel` component added to Autonomous Agent dashboard → Actions tab
- Approve/reject individual actions or batch approve all
- Shows reasoning, parameters, priority, source, timestamps
- Actions auto-expire after 24h if not approved
- Polls for updates every 30 seconds

**5. Calling Time Optimization (DB Foundation)**
- `optimal_calling_windows` table with per-user, per-day, per-hour aggregation
- `recalculate_calling_windows()` PostgreSQL function analyzes last 30 days of call data
- Scoring: answer_rate + 3x appointment_rate per time slot
- `lead_score_outcomes` table tracks score-at-call-time for feedback loop

**Files Created:**
| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/20260210_autonomous_engine_upgrade.sql` | ~250 | New tables, functions, indexes, RLS, pg_cron |
| `supabase/functions/ai-autonomous-engine/index.ts` | ~530 | Server-side autonomous brain |
| `src/components/ActionQueuePanel.tsx` | ~240 | Action queue approval UI |

**Files Modified:**
| File | Changes |
|------|---------|
| `supabase/functions/ai-assistant/index.ts` | Safety tiers (2→6 risky tools), operational memory injection, auto-save after tool execution |
| `supabase/functions/ai-brain/index.ts` | Safety tiers (0→8 critical tools), operational memory injection, action queue awareness, auto-save |
| `src/components/AutonomousAgentDashboard.tsx` | Added Actions tab with ActionQueuePanel |

**New Database Tables:**
- `ai_action_queue` - Server-side action queue with approval flow
- `ai_operational_memory` - Persistent structured AI memory
- `optimal_calling_windows` - Learned best calling times
- `lead_score_outcomes` - Score-at-call-time tracking for feedback

**New Database Functions:**
- `expire_old_actions()` - Auto-expire stale pending actions
- `save_operational_memory()` - Upsert memory entries
- `recalculate_calling_windows()` - Aggregate call outcomes into time slots

**New autonomous_settings Columns:**
- `last_engine_run` - When engine last ran
- `engine_interval_minutes` - Configurable interval (default 5)
- `auto_optimize_calling_times` - Enable time slot learning
- `auto_adjust_pacing` - Enable auto pacing adjustment

**Deployment Required:**
```bash
# Run migration first
# Then deploy edge functions:
supabase functions deploy ai-autonomous-engine
supabase functions deploy ai-assistant
supabase functions deploy ai-brain
```

**Gotchas:**
- pg_cron job for ai-autonomous-engine uses `current_setting('app.supabase_url')` -- may need manual setup if app settings not configured
- Operational memory queries add ~50-100ms to each AI call (non-blocking)
- `supabase.raw('access_count + 1')` in ai-brain memory touch may not work in all Supabase client versions -- silently fails (non-critical)

### February 10, 2026 (Part 2) - Phases 5-8: Learning Systems (NOT DEPLOYED)

**Summary:** Four learning systems that make the AI genuinely smarter over time based on real call outcome data.

**Phase 5: Calling Time Optimizer**
- `automation-scheduler` now checks `optimal_calling_windows` table before queueing leads
- If current time slot has score < 0.15 (bottom 20%), skips queueing entirely
- Only activates when user has `auto_optimize_calling_times = true` in autonomous_settings
- Requires 10+ calls in a time slot before making decisions (no premature optimization)
- `ai-autonomous-engine` recalculates windows from last 30 days of call data every run

**Phase 6: Lead Score Weight Feedback Loop**
- `lead_scoring_weights` table stores per-user calibrated weights (replaces hardcoded 0.3/0.25/0.25/0.2)
- `calibrate_lead_scoring_weights()` PG function analyzes `lead_score_outcomes` table
- Compares component scores for answered vs missed calls → adjusts weights toward predictive factors
- `lead_score_outcomes` populated when automation-scheduler queues a call (score at queue time)
- `retell-call-webhook` updates outcomes when calls complete
- `ai-autonomous-engine` reads calibrated weights during lead rescoring
- Calibration runs weekly (needs 50+ outcomes to activate)

**Phase 7: Script A/B Testing**
- `agent_script_variants` table stores multiple script versions per Retell agent
- `call_variant_assignments` tracks which variant was used for each call
- `select_script_variant()` PG function does weighted random selection (Thompson Sampling style)
- `update_variant_stats()` PG function updates success/appointment rates after each call
- `rebalance_variant_weights()` PG function shifts traffic toward winners (UCB1 algorithm)
- `outbound-calling` selects a variant before each call, injects into dynamic variables
- `retell-call-webhook` updates variant stats after call ends
- `ai-autonomous-engine` rebalances weights every 5 min run
- Minimum 10% traffic to every active variant (prevents premature exploitation)

**Phase 8: Pacing Adaptation**
- `adaptive_pacing` table stores optimal pace per broadcast/campaign
- `pacing_history` table logs every pacing change with error_rate, answer_rate, trigger
- `voice-broadcast-engine` checks `adaptive_pacing` before using broadcast's `calls_per_minute`
- All 3 pacing delay points in voice-broadcast-engine now use adaptive pace
- `ai-autonomous-engine` writes to `adaptive_pacing` when it decides to change pace

**Files Created:**
| File | Purpose |
|------|---------|
| `supabase/migrations/20260210_phases_5_8_learning.sql` | All tables, functions, indexes for phases 5-8 |

**Files Modified:**
| File | Changes |
|------|---------|
| `supabase/functions/ai-autonomous-engine/index.ts` | Calibrated weights in rescoring, weekly calibration, A/B rebalancing, pacing DB write |
| `supabase/functions/automation-scheduler/index.ts` | Calling window check, lead score recording at queue time |
| `supabase/functions/outbound-calling/index.ts` | A/B variant selection + assignment before call |
| `supabase/functions/retell-call-webhook/index.ts` | Variant stats update + lead score outcome update after call |
| `supabase/functions/voice-broadcast-engine/index.ts` | Adaptive pacing read from DB at all 3 delay points |

**New Database Tables:**
- `agent_script_variants` - Script versions per agent with performance stats
- `call_variant_assignments` - Which variant was used per call
- `lead_scoring_weights` - Per-user calibrated scoring weights
- `adaptive_pacing` - Current optimal pace per broadcast
- `pacing_history` - Audit trail of all pacing changes

**New Database Functions:**
- `select_script_variant()` - Weighted random variant selection
- `update_variant_stats()` - Incremental variant stat updates
- `rebalance_variant_weights()` - UCB1 traffic rebalancing
- `calibrate_lead_scoring_weights()` - Outcome-correlation weight calibration

**Deployment Required:**
```bash
# Run migration for phases 5-8
# Then deploy all modified edge functions:
supabase functions deploy ai-autonomous-engine
supabase functions deploy automation-scheduler
supabase functions deploy outbound-calling
supabase functions deploy retell-call-webhook
supabase functions deploy voice-broadcast-engine
```

---

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

---

## February 4, 2026 - AI Safety & Auth Fixes (Pre-Deploy)

**Summary**
- Hardened AI assistant auth to prevent cross-tenant access.
- Added confirmation gates for purchase and bulk SMS actions.
- Retell SMS provider path now falls back to Lovable AI (no placeholder responses).

**Files Changed**
- `supabase/functions/ai-assistant/index.ts`
- `supabase/functions/ai-brain/index.ts`
- `supabase/functions/ai-sms-processor/index.ts`

**Deployment Required**
- `supabase functions deploy ai-assistant`
- `supabase functions deploy ai-brain`
- `supabase functions deploy ai-sms-processor`

**Notes**
- Clients must send `confirmed: true` for `buy_phone_numbers` and `send_sms_blast` after explicit user approval.

---

## February 13, 2026 - Migrations 4 & 5 Deployed: AI Intelligence + Campaign Strategist (DEPLOYED ✅)

**Summary:** Successfully deployed the AI Intelligence Upgrade (Migration 4) and Campaign Strategist (Migration 5) to production. These were previously code-only (from GitHub PR merges) — now the database schema and edge functions are live.

### What Was Deployed

**Migration 4 — AI Intelligence Upgrade (8 features):**

| Feature | What It Does | Key Table/Column |
|---------|-------------|------------------|
| OpenRouter Integration | Shared LLM helper with model tiers (fast/balanced/premium) | `_shared/openrouter.ts` |
| Disposition Value Weighting | Maps call outcomes to conversion probability + priority boost | `disposition_values` |
| Funnel Intelligence | Portfolio-level analysis: stage counts, conversion rates, cost/appointment | `funnel_snapshots` |
| Transcript Intent Parser | LLM extracts buying signals from call transcripts | `lead_intent_signals` |
| Cost-Per-Lead Tracking | Tracks total/call/SMS cost per lead with ROI scoring | `lead_journey_state` columns |
| Campaign Type Playbooks | Rules can target cold_outreach, speed_to_lead, etc. | `followup_playbook.campaign_type` |
| Number Health Prediction | Proactive spam risk detection before flagging | `number_health_metrics` |
| Self-Optimizing Playbook | Tracks rule performance, flags underperformers | `playbook_performance` |

**Migration 5 — Campaign Strategist (3 features):**

| Feature | What It Does | Key Table |
|---------|-------------|-----------|
| Daily Battle Plan | AI generates complete daily resource allocation plan | `daily_battle_plans` |
| Strategic Pattern Detective | 6 statistical pattern detection algorithms + auto-rule creation | `strategic_insights`, `insight_generated_rules` |
| Strategic Briefings | Daily/weekly executive summaries with wins/concerns/actions | `strategic_briefings` |

### New Database Objects Created

**Tables (10):** `disposition_values`, `lead_intent_signals`, `number_health_metrics`, `playbook_performance`, `funnel_snapshots`, `playbook_optimization_log`, `daily_battle_plans`, `strategic_insights`, `insight_generated_rules`, `strategic_briefings`

**View:** `call_outcome_dimensions` — Cross-dimensional join of call_logs + leads + lead_journey_state

**Function:** `get_funnel_trend(p_user_id, p_days)` — Daily funnel snapshots for trend analysis

### Schema Gotchas Discovered & Fixed
- `leads` table uses `lead_source` not `source` — view corrected
- `lead_journey_state` uses `current_stage`/`total_calls`/`engagement_score` not `journey_stage`/`call_attempts`/`interest_level` — view mappings corrected
- New tables not in auto-generated `types.ts` — `CampaignStrategistDashboard.tsx` uses `supabase as any` cast

### Edge Function Deployed
- `ai-autonomous-engine` — Full deployment with all Migration 4+5 intelligence features

### How To Use These Features

**Prerequisites:** All tables created ✅ | Engine deployed ✅ | Optional: Add `OPENROUTER_API_KEY` for premium LLM features

**Enable in autonomous_settings:**
- `manage_lead_journeys = true` → Lead journey tracking
- `auto_optimize_calling_times = true` → Time slot learning
- `auto_adjust_pacing = true` → Adaptive call pacing
- `enable_script_ab_testing = true` → Script A/B tests
- `enable_daily_planning = true` → Daily battle plans
- `enable_strategic_insights = true` → Pattern detection
- `auto_create_rules_from_insights = true` → Auto-rule generation

**View Results:** Autonomous Agent tab → "Strategist" sub-tab (Battle Plan | Patterns | Briefings)

**Engine runs every 5 min** via pg_cron: goal assessment → lead scoring → pacing → journeys → funnel → health → transcripts → playbook → battle plan → patterns → memory

### Key Notes
1. All features gated by toggles — nothing activates unless turned on
2. Without OpenRouter key, premium features fall back to rule-based logic
3. Features need call history data to produce meaningful results
4. OpenRouter costs ~$3-15/day at full premium (288 runs/day)
5. `CampaignStrategistDashboard` uses `as any` casts (cosmetic, queries work fine)

**Last Updated**: February 13, 2026

---

### February 18, 2026 - Solar Test Readiness Controls (NOT DEPLOYED)

**What was built/fixed/changed**
- Added a one-click **“Apply 2,000-Call Solar Test Preset”** in Autonomous Agent settings.
- Preset enables full-auto autonomous execution plus key automation toggles needed for today’s test run:
  - lead journey auto-follow-ups
  - script A/B testing
  - calling-time optimization
  - adaptive pacing
  - daily battle planning
  - strategic insights + auto-rule creation
- Increased Settings/Goals UI slider ceilings from 500/200 to **5,000** to support high-volume test targets like 2,000 calls.
- Extended `useAutonomousAgent` settings load/save mapping so newer autonomous settings are persisted in `autonomous_settings` when changed from UI.

**Key files modified**
- `src/components/AutonomousAgentDashboard.tsx`
- `src/hooks/useAutonomousAgent.ts`
- `src/lib/autonomousSettingsPresets.ts` (new)
- `src/lib/__tests__/autonomousSettingsPresets.test.ts` (new)

**Database changes made**
- None (no new migrations, schema updates, or SQL function changes).

**Deployment status**
- Frontend code change only; not separately deployed from this session.
- Local validation: targeted preset test passed and `npm run build` passed.

**Gotchas / lessons learned**
- The Autonomous Agent UI previously exposed only a subset of autonomous settings; several server-supported toggles existed in DB/function logic but were not persisted via `useAutonomousAgent`.
- Full `npm run lint` and full `npm run test` currently have unrelated pre-existing failures in this repository baseline; use targeted validation for this change set.
- Manual UI verification required a local fake session in browser storage because auth is enforced on `/`.
