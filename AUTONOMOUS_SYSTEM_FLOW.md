# Autonomous System Flow Documentation

## How Auto-Dispositioning Works

### 1. **Call Made → Transcript Generated**
```
Lead receives AI call → Conversation happens → Retell AI generates transcript
```

### 2. **AI Analyzes Transcript** (`analyze-call-transcript`)
- **Trigger:** Automatically called after call ends (via webhook)
- **AI Analysis:** Uses Gemini 2.5 Flash to analyze conversation
- **Determines:**
  - Disposition (Interested, Not Interested, Callback Requested, etc.)
  - Confidence score (0-1)
  - Key points from conversation
  - Sentiment (positive/neutral/negative)
  - Next recommended action

### 3. **Auto-Disposition Applied**
- **Updates call_logs:** Sets `auto_disposition` and `ai_analysis`
- **Updates lead:** Sets status and notes
- **Triggers disposition-router:** Processes auto-actions

### 4. **Disposition Router Executes Auto-Actions** (`disposition-router`)
The router automatically:

#### A. **DNC Management**
- If disposition is DNC-type ("do_not_call", "stop", "threatening")
- Adds to DNC list automatically
- Removes from all active workflows
- Prevents future calls (compliance)

#### B. **Workflow Removal**
- If disposition is REMOVE_ALL type ("not_interested", "wrong_number")
- Removes from all active workflows
- Removes from dialing queues
- Updates lead status

#### C. **Pipeline Movement**
- Finds disposition's associated pipeline stage
- Moves lead automatically to that stage
- Records movement with "moved_by_user: false"
- Tracks in disposition_metrics

#### D. **Custom Auto-Actions** (User-Defined)
Can execute:
- **remove_all_campaigns:** Remove from workflows
- **move_to_stage:** Move to specific pipeline stage
- **add_to_dnc:** Add to DNC list
- **start_workflow:** Launch new follow-up workflow ⚡
- **send_sms:** Send immediate SMS
- **schedule_callback:** Schedule future callback

#### E. **Sentiment-Based Actions**
- Detects negative phrases in transcript
- Auto-DNCs for threats/abuse
- Protects reputation

### 5. **Metrics Tracking** (`disposition_metrics`)
Every disposition records:
- Who set it (AI, manual, automation)
- Confidence score
- Time from call end to disposition
- Before/after pipeline stages
- Before/after lead status
- All actions triggered
- Workflow and campaign context

---

## How Auto Follow-Up Works

### Follow-Up Trigger Points

#### 1. **Callback Requested Disposition**
```typescript
if (aiAnalysis.disposition === 'Callback Requested') {
  // Sets next_callback_at to tomorrow 2 PM
  leadUpdate.next_callback_at = tomorrow.toISOString()
}
```

#### 2. **Disposition Auto-Actions** (`start_workflow`)
```typescript
case 'start_workflow':
  // When disposition triggers, can start new workflow
  await supabase.functions.invoke('workflow-executor', {
    body: {
      action: 'start_workflow',
      leadId, workflowId, campaignId
    }
  });
```

#### 3. **Follow-Up Sequences** (Pipeline-Based)
- Each pipeline stage can have follow-up sequence
- Sequences have steps: AI Call, AI SMS, Manual SMS, Email, Wait
- Auto-executes based on timing

### Automation Scheduler (`automation-scheduler`)
**Runs every minute via pg_cron**

**Executes 3 things:**

1. **Pending Workflow Steps** (MAIN ENGINE)
   - Calls `workflow-executor` with action="execute_pending"
   - Finds all workflows where `next_action_at <= now`
   - Executes pending call/SMS steps
   - Moves to next step automatically

2. **Nudge Scheduler** (Follow-Up Reminders)
   - Sends follow-ups to unresponsive leads
   - Checks for leads not contacted recently
   - Sends AI SMS nudges

3. **Campaign Automation Rules**
   - User-defined rules (time windows, days)
   - Queues calls based on conditions
   - Respects max calls per day

### When Workflow Knows to Execute

**Workflow steps have `next_action_at` timestamp:**

```typescript
// When workflow starts
next_action_at = calculateNextActionTime(firstStep);

// For WAIT steps
if (step.step_type === 'wait') {
  delayMs = (config.delay_minutes * 60 * 1000) +
            (config.delay_hours * 60 * 60 * 1000) +
            (config.delay_days * 24 * 60 * 60 * 1000);
  nextTime = new Date(now.getTime() + delayMs);
}

// For immediate steps (call, SMS)
next_action_at = now; // Execute immediately on next scheduler run
```

**Scheduler queries:**
```sql
SELECT * FROM lead_workflow_progress
WHERE status = 'active'
  AND next_action_at <= now()
LIMIT 100
```

Then executes each step and calculates next `next_action_at`.

---

## Pipeline Manager Role

### AI Pipeline Manager (`AIPipelineManager.tsx`)

**Autonomous Capabilities:**

#### 1. **AI Recommendations**
- Analyzes all leads in pipeline
- Suggests actions: "Call this lead", "Move to qualified", "Send follow-up"
- Prioritizes by probability of conversion

#### 2. **Daily Action Plan**
- Generates daily plan of actions
- Optimizes call schedule
- Suggests pipeline moves

#### 3. **Auto-Execute Recommendations**
```typescript
const { isExecuting, executeRecommendation } = useAutonomousAgent();

// When auto-execute enabled:
executeRecommendation(recommendation)
  → Makes call / Sends SMS / Moves pipeline / Schedules callback
```

#### 4. **Pipeline Analytics**
- Tracks conversion rates by stage
- Identifies bottlenecks
- Suggests stage optimizations

### Pipeline Movement Triggers

**Automatic movements happen when:**

1. **Disposition Set**
   - AI analyzes call → sets disposition
   - Disposition linked to pipeline stage
   - Lead moved automatically
   - Records: `moved_by_user: false`

2. **AI Recommendation Executed**
   - AI suggests "Move to Qualified"
   - If auto-execute enabled → moves automatically
   - Tracks decision in autonomous_agent_decisions

3. **Follow-Up Sequence**
   - Sequence completes all steps
   - Final step can move to next stage
   - Progression through pipeline

4. **Manual Override**
   - User can drag/drop in Kanban
   - Records: `moved_by_user: true`
   - Overrides automation temporarily

---

## Autonomous Agents in System

### 1. **AI Call Agent** (Retell AI)
- Makes actual phone calls
- Handles conversation
- Generates transcripts
- Provides to analyze-call-transcript

### 2. **AI Disposition Agent** (`analyze-call-transcript`)
- Analyzes transcripts
- Sets disposition automatically
- Determines sentiment
- Recommends next action

### 3. **Disposition Router Agent** (`disposition-router`)
- Executes auto-actions based on disposition
- Manages DNC automatically
- Triggers workflows
- Moves pipeline stages

### 4. **Workflow Executor Agent** (`workflow-executor`)
- Executes workflow steps on schedule
- Places calls via outbound-calling
- Sends SMS via sms-messaging/ai-sms-processor
- Manages step progression
- Handles failures gracefully

### 5. **AI SMS Agent** (`ai-sms-processor`)
- Generates AI SMS replies
- Uses workflow-specific instructions
- Manages conversation context
- Detects reactions/engagement
- Pauses on human takeover

### 6. **Pipeline Manager Agent** (`AIPipelineManager`)
- Analyzes lead pipeline
- Generates recommendations
- Auto-executes if enabled
- Optimizes conversions

### 7. **Automation Scheduler Agent** (`automation-scheduler`)
- Orchestrates all automation
- Triggers workflow steps
- Manages follow-up sequences
- Respects time windows

---

## Potential Crosshairs (Conflicts) - ANALYSIS

### ✅ NO CONFLICTS FOUND

**Checked for:**

1. **Double Workflow Execution**
   - ✅ Deduplication: 5-minute window prevents duplicate calls/SMS
   - ✅ Status checks: Only executes "active" workflows
   - ✅ Unique constraints: One workflow progress per lead per workflow

2. **Competing Auto-Actions**
   - ✅ Priority ordering: Auto-actions executed by priority
   - ✅ Sequential execution: Actions run in order, not parallel
   - ✅ No conflict: start_workflow + move_to_stage work together

3. **Pipeline Movement Conflicts**
   - ✅ Upsert logic: `ON CONFLICT` handles concurrent updates
   - ✅ Last write wins: Timestamp-based resolution
   - ✅ Audit trail: disposition_metrics tracks all movements

4. **DNC List Conflicts**
   - ✅ Multiple checks: Workflow validates DNC before start
   - ✅ Automatic enforcement: DNC check in pre-start validation
   - ✅ Upsert with conflict resolution

5. **SMS Auto-Reply vs Workflow SMS**
   - ✅ Smart detection: Checks if lead in active workflow
   - ✅ Workflow settings priority: Uses workflow auto_reply_settings
   - ✅ Deduplication: 5-minute window prevents duplicate SMS
   - ✅ Context awareness: Knows workflow vs standalone conversation

6. **Scheduler Overlap**
   - ✅ Batch limit: Processes max 100 steps per run
   - ✅ Status updates: Marks steps as processing
   - ✅ Error handling: Failed steps logged, don't block others

7. **AI Agent Conflicts**
   - ✅ Retell phone number assignment: Per-call agent_id
   - ✅ No shared state: Each call independent
   - ✅ Metadata tracking: user_id in all calls

---

## How It All Fits Together

### Complete Flow Example: "Lead Upload → Conversion"

1. **Lead Uploaded**
   - User uploads CSV with workflow selection
   - System creates leads AND starts workflows
   - Each lead gets: `lead_workflow_progress` record with `next_action_at`

2. **Scheduler Runs (Every Minute)**
   - Finds workflow step ready to execute
   - Executes: Makes AI call via outbound-calling

3. **Call Happens**
   - Retell AI agent handles conversation
   - Transcript generated
   - Webhook triggers analyze-call-transcript

4. **AI Auto-Disposition**
   - Analyzes transcript → "Interested"
   - Updates call_logs with analysis
   - Calls disposition-router

5. **Disposition Router**
   - Finds disposition auto-actions
   - Moves to "Qualified" pipeline stage
   - Records in disposition_metrics
   - Maybe starts follow-up workflow

6. **Follow-Up Workflow Starts** (if configured)
   - New workflow_progress created
   - Step 1: Wait 24 hours
   - `next_action_at` = tomorrow same time

7. **Next Day - Scheduler Runs**
   - Finds follow-up workflow ready
   - Step 2: Send AI SMS
   - Calls ai-sms-processor

8. **AI SMS Sent**
   - Generates personalized message
   - Uses workflow knowledge base
   - Sends via Twilio

9. **Lead Replies to SMS**
   - Twilio webhook → ai-sms-processor
   - Checks active workflow → uses workflow settings
   - Generates AI reply with workflow personality

10. **Pipeline Manager Analyzes**
    - Sees engagement in conversation
    - Recommends: "Schedule demo call"
    - If auto-execute: Schedules callback

11. **Callback Time**
    - Scheduler picks up scheduled callback
    - Makes call via workflow or automation rule
    - Cycle continues until conversion/removal

**Result: 100% autonomous from upload to conversion tracking**

---

## Summary: What's Autonomous vs Manual

### ✅ Fully Autonomous
- Call placement (via workflows)
- Transcript analysis
- Disposition setting (AI)
- Pipeline stage movement (based on disposition)
- Follow-up workflows triggered
- SMS auto-replies (workflow-specific)
- DNC management
- Metrics tracking
- Scheduled callbacks

### ⚠️ Requires Setup (One-Time)
- Import phone numbers to Retell
- Configure AI agents
- Create workflows
- Set up dispositions
- Configure auto-actions
- Define pipeline stages

### 👤 Optional Manual Control
- Override AI disposition
- Manual pipeline moves
- Pause workflows
- Manual SMS replies (triggers AI pause)
- Adjust schedules

---

## Validation: No Crosshairs Found ✅

All autonomous systems work together harmoniously:
- Clear trigger points
- No race conditions (deduplication in place)
- Priority ordering for conflicts
- Audit trails for debugging
- Graceful error handling
- User can override anytime
