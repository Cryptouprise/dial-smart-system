# CLAUDE.md - Dial Smart System

This file provides persistent context for Claude Code when working with the dial-smart-system codebase.

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

**Last Updated**: January 17, 2026
**Audit Confidence**: Very High (comprehensive codebase analysis)

## Recent Fixes Log

### January 17, 2026
- **GHL Contact Import Fix (REGRESSION - Fixed Twice!)**: `ghl-integration` sync_contacts now properly imports all contacts, not just 100
  - **Root Cause**: GHL API returns 422 error when `limit` or `tags` parameters are sent in the search body
  - **Fix**: Removed `limit` and `tags` from search body; only use `pageLimit` and `locationId`
  - **Tags Filter**: Now applied client-side AFTER fetching all contacts (GHL API doesn't support server-side tag filtering)
  - **CRITICAL**: Do NOT add `limit: PAGE_SIZE` or `tags: [...]` to the search endpoint body - this causes 422 errors and fallback pagination issues
  - **File**: `supabase/functions/ghl-integration/index.ts` lines 297-307
  - **Pagination**: Uses search endpoint with page-based pagination (page: 1, 2, 3...) not cursor-based
  - **Max Contacts**: 100,000 (1000 pages * 100 per page)

- **Call Pacing Fix**: `voice-broadcast-engine` now properly enforces `calls_per_minute` setting
  - Added `calculatePacingDelay()` function for dynamic delay calculation
  - Previous: 100ms fixed delay (600 calls/min regardless of setting)
  - Now: Delay calculated as `60000 / calls_per_minute` with 100ms minimum
  - Logs show actual pacing: "pacing: 50/min with 1200ms delay"
