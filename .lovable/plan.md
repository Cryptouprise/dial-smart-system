

# Mission Briefing Wizard — Guided Campaign Builder

## The Problem
The `setup_full_campaign` tool exists in the backend (ai-brain edge function) and works great via chat, but there is zero visible UI for it. Users have to know to open the AI chat and describe their business. The user wants a step-by-step guided wizard embedded in the Autonomous Agent dashboard that asks smart questions so even a brand-new user can launch a campaign without thinking.

## What We're Building

A multi-step **Mission Briefing Wizard** component that replaces the current blank Overview tab top area with a guided onboarding card. It walks the user through 5-6 focused steps, collects structured answers, then fires `sendMessage()` via `useAIBrainContext` with a fully formed prompt that triggers the existing `setup_full_campaign` tool. No backend changes.

## The Wizard Steps

```text
Step 1: "What are you selling?"
  - Text area for plain-English business description
  - Examples shown as placeholder hints
  - e.g. "Solar panel installations for homeowners in Florida"

Step 2: "What's your goal?"
  - Pre-built options (radio buttons):
    * Book appointments / transfers to live agents
    * Collect info / qualify leads
    * Drive to a landing page / generate callbacks
  - Plus: target number input (e.g. "10-15 transfers/day")
  - Plus: max cost per result input (e.g. "$20 per transfer")

Step 3: "How many leads are you starting with, and where are you headed?"
  - Starting lead count input (e.g. 500)
  - Ramp-up target input (e.g. 5,000 in 2 weeks)
  - System auto-suggests phone numbers needed:
    * Formula: ~1 number per 50-100 calls/day
    * Shows: "We recommend 10-15 numbers for this volume"
  - Shows current owned number count from DB for context

Step 4: "How many calls per day to start, and how should we ramp?"
  - Starting daily call target slider/input
  - Ramp-up behavior selector:
    * Conservative (increase 20%/day if results are good)
    * Moderate (increase 50%/day)
    * Aggressive (double daily until target)
  - The autonomous agent handles the actual ramping

Step 5: "How should we follow up?"
  - Strategy choice (maps to follow_up_strategy param):
    * Aggressive — call fast, follow up hard
    * Balanced — professional cadence, calls + texts
    * Gentle — spaced out, relationship-building
    * Calls Only — no SMS, just call-wait-call-wait
  - Provider selector: Retell / Telnyx

Step 6: Review & Build
  - Shows summary of all choices
  - Lists pipeline stages that will be created
  - Shows recommended phone numbers
  - "Build My Campaign" button
  - User confirms before anything is created
```

## How It Works Technically

1. Wizard collects structured data across steps (React state, no DB writes until build)
2. On "Build My Campaign", constructs a detailed natural-language prompt combining all inputs
3. Sends via `useAIBrainContext.sendMessage()` — this hits the ai-brain edge function
4. ai-brain recognizes the campaign setup intent, calls `setup_full_campaign` tool
5. Campaign, workflow, autonomous settings, and playbook rules are all created
6. Wizard shows success state with links to the new campaign

## Pipeline Confirmation

Before building, the Review step shows the user exactly which pipeline stages will be created (based on their goal type):
- Appointment booking: New Lead > Contacted > Interested > Appointment Set > Completed
- Lead qualification: New Lead > Contacted > Qualified > Sent to Team > Closed
- Custom based on description

The user sees and approves these before the build fires.

## Phone Number Recommendation Logic

```text
daily_calls = user input (e.g. 200)
numbers_needed = ceil(daily_calls / 80)  // ~80 calls per number per day is safe
current_numbers = query phone_numbers table count
deficit = numbers_needed - current_numbers

Display: "You'll need ~{numbers_needed} numbers. You currently have {current_numbers}."
If deficit > 0: "We recommend buying {deficit} more numbers."
```

## Files to Create/Modify

| File | Action | What |
|------|--------|------|
| `src/components/MissionBriefingWizard.tsx` | NEW | Multi-step wizard component (~400 lines) |
| `src/components/AutonomousAgentDashboard.tsx` | MODIFY | Import + render wizard at top of Overview tab |

## Safety

- **Zero backend changes** — uses existing `setup_full_campaign` via chat context
- **Zero database changes** — no migrations
- **No cascading effects** — wizard is a new component inserted above existing Overview content
- **Existing Overview content preserved** — Daily Goals, Campaign Health, etc. remain below the wizard
- **Wizard auto-hides** after a campaign is built (shows a compact "Mission Active" summary instead, with option to create another)

## Scalability

- Each wizard run creates a separate campaign — users can run the wizard multiple times for different verticals (solar, insurance, etc.)
- The structured prompt format means the ai-brain always gets clean, complete input
- Phone number recommendations scale with volume inputs
- Ramp-up preferences are stored in autonomous settings, so the engine respects them on every 5-minute cycle

