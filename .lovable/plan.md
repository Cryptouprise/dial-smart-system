

# Mission Briefing Wizard: State of the Union & Fix Plan

## Problems Found (What You're Hitting)

### 1. Missing Campaign Types & "Other" Options
- **Goal step** only offers 3 choices: Appointments, Qualify, Callbacks. No "Transfers" standalone. No "Other — type your own."
- **Follow-up strategy** has "Calls Only" but NO "SMS Only" or "Custom mix."
- Every radio group is closed — if your use case isn't one of the 3-4 options, you're stuck.

### 2. The Workflow Is a Black Box
- The wizard never shows you WHAT sequence it will build (call-text-call-text vs call-call-call).
- You never get to pick "calls only" vs "texts only" vs "custom sequence."
- After build, you can't see the actual steps that were created.

### 3. Post-Build Is a Dead End
- Success screen shows generic summary cards and navigation links.
- No link to the ACTUAL campaign, workflow, or pipeline that was just created.
- No way to edit anything — you'd have to manually hunt through tabs.
- No "Edit this campaign" button.

### 4. Review Step Is View-Only
- Step 8 shows a summary but clicking on anything doesn't let you jump back to edit it.
- Pipeline stages are editable (good) but everything else is locked.

### 5. Transfer Configuration Gap
- "Transferred" stage exists in the pipeline, and `transferSuccess` event exists.
- But there's no field to enter the TRANSFER PHONE NUMBER or SIP endpoint.
- The agent doesn't know WHERE to transfer.

---

## The Fix Plan (7 Changes)

### Change 1: Add Missing Goal & Strategy Options + "Other" Everywhere
**What:** Add `transfers` goal type, `sms_only` strategy, and an "Other (describe)" option to every radio group that currently has fixed choices.

- Goals: Add "Live Transfers to Agents" + "Other (type your own)"
- Strategies: Add "SMS Only — no calls" + "Other (describe your ideal cadence)"
- Priorities: Add "Other" free-text option
- All radio groups get a final "Other" item with a text input that appears when selected

### Change 2: Workflow Preview Step (New Step Before Review)
**What:** Insert a new step between Follow-up Strategy (6) and Priorities (7) that shows the ACTUAL workflow sequence that will be generated.

- Shows a visual timeline: Call → Wait 5min → SMS → Wait 1hr → Call → Wait 1 day → AI SMS
- Based on the selected strategy (aggressive/balanced/gentle/calls_only/sms_only)
- User can toggle individual steps on/off or reorder
- This is a PREVIEW — user sees exactly what sequence will be built before committing

### Change 3: Transfer Destination Configuration
**What:** When goal is "transfers" or `transferSuccess` event is configured, show a transfer config section.

- Transfer phone number (required for transfer campaigns)
- Transfer type: Warm (AI stays on) vs Cold (AI hangs up)
- Transfer trigger: What the AI should listen for before transferring
- This feeds into the agent's instructions and the workflow's transfer step

### Change 4: Make Review Step Clickable/Editable
**What:** Each row in the Review step (Step 8 currently, will shift to 9) becomes clickable — tap any row to jump back to that step.

- Each summary row gets a small pencil/edit icon
- Clicking jumps to the relevant step number
- After editing, "Next" brings you back to Review
- Pipeline stages and event handling are already editable in-line (keep that)

### Change 5: Post-Build Success Screen With Real Data & Edit Links
**What:** After build completes, query the database for the ACTUAL resources that were created and show them with direct edit links.

- Query `campaigns` table for the latest campaign matching the description
- Query `campaign_workflows` for the associated workflow and its steps
- Query `pipeline_boards` for the created pipeline
- Show: Campaign name + status + edit link, Workflow steps list, Pipeline stages
- "Edit Campaign" button → goes to campaigns tab with the campaign pre-selected
- "Edit Workflow" button → goes to workflows tab
- "Edit Pipeline" button → goes to pipelines tab
- "Re-run Wizard" button for starting over

### Change 6: Add "SMS Only" and "Custom" Follow-Up Strategies
**What:** Expand the follow-up strategy options and add the ability to describe a custom cadence.

- `sms_only`: "SMS Only — text-based outreach, no calls"
- `custom`: "Custom — describe your ideal sequence" with a text input
- The custom description gets passed to the AI prompt so it builds exactly what you describe

### Change 7: Calling Hours & Timezone (Missing Configuration)
**What:** Add a small calling hours section to Step 4 (Daily Calls).

- Start/end time (default 9am-9pm)
- Timezone selector
- "Bypass calling hours for testing" toggle
- These matter for launch day — without them the system uses defaults that may not match your timezone

---

## Implementation Order (Prioritized for Launch Today)

1. **Change 1** — Add missing options + "Other" everywhere (~15 min)
2. **Change 3** — Transfer destination config (~10 min)
3. **Change 4** — Make review rows clickable to edit (~10 min)
4. **Change 6** — SMS Only + Custom strategies (~5 min, part of Change 1)
5. **Change 5** — Post-build real data + edit links (~15 min)
6. **Change 2** — Workflow preview step (~20 min)
7. **Change 7** — Calling hours config (~10 min)

## Technical Details

All changes are in `src/components/MissionBriefingWizard.tsx` (single file). No edge function changes. No migrations needed.

- `goalType` union expands: `'appointments' | 'qualify' | 'callbacks' | 'transfers' | 'custom'`
- `followUpStrategy` union expands: add `'sms_only' | 'custom'`
- New state: `customGoalText`, `customStrategyText`, `transferPhoneNumber`, `transferType`
- Total steps goes from 9 to 10 (new workflow preview step)
- Post-build screen queries Supabase for created resources
- Review step rows get `onClick={() => setStep(N)}` handlers

