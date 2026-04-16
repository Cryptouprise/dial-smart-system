

# Plan: Call Lifecycle Reference + Autonomous Status Answers + Marketing Doc

## Answers First

### Question 2: Is autonomous mode ON or OFF?
**It is ON right now** and was ON yesterday. Your `autonomous_settings` shows:
- `enabled: true`
- `autonomy_level: full_auto`
- `manage_lead_journeys: true`
- `enable_script_ab_testing: true`
- `auto_optimize_calling_times: true`
- `auto_adjust_pacing: true`
- `enable_daily_planning: true`
- `enable_strategic_insights: true`
- `last_engine_run: 2026-04-16 13:00:27` (today, running every ~5 min)

So the autonomous engine **was running yesterday during the campaign**. However, its impact was limited because:
- It had very little historical data to learn from (first real campaign)
- The dispatcher bugs (repeated calls, rotation failure) were in the dispatcher edge function, which is upstream of the autonomous engine
- The engine's optimizations (pacing, time slots, lead scoring) need 1-2 weeks of data to become meaningful

### Question 3: Marketing doc
I'll save the full lifecycle documentation as a permanent artifact.

---

## Build Plan

### 1. Create "How It Works" Reference Page
**New component**: `src/components/CallLifecycleReference.tsx`

A dedicated visual reference accessible from the Autonomous Agent dashboard as a new tab called "How It Works" (with a `BookOpen` icon). Contains:

- **10-step visual flow** with numbered cards showing the full call lifecycle (Dispatcher → Outbound → Webhook → Queue → Lead → Disposition Router → Pipeline → Workflows → External Syncs → Cost Tracking)
- Each step shows: what it does, which edge function handles it, and where you see the results in the app
- **Collapsible sections** for each step (starts collapsed, click to expand details)
- **Retry protocol** visual breakdown
- **UI data mapping table** showing which app page pulls from which data source
- **Autonomous engine section** explaining the 21-step engine loop and all the AI managers
- Uses existing UI components (Card, Collapsible, Badge, Accordion)

### 2. Add Tab to Autonomous Dashboard
Add a "How It Works" tab trigger in `AutonomousAgentDashboard.tsx` between the existing tabs, lazy-loading the new component.

### 3. Save Marketing Document
Generate a polished markdown file at `/mnt/documents/dial-smart-call-lifecycle.md` containing the full system capabilities breakdown formatted for marketing use — features, differentiators, and the complete flow description.

### Technical Details
- No database changes
- No edge function changes
- Frontend-only: 1 new component + 1 tab addition
- Marketing doc: 1 markdown artifact

