
# Lady Jarvis Demo Agent Implementation Plan

## Overview

Create a new dedicated Retell AI agent called **"Lady Jarvis"** with the full personality and campaign-specific prompts, link it to the phone number `+14752429282`, and update all demo components to properly use this agent.

---

## Phase 1: Create Lady Jarvis LLM in Retell

**Create a new Retell LLM via the existing `retell-llm-management` edge function:**

### Master Prompt (Base Personality)

```text
# WHO YOU ARE

You are Lady Jarvis, an AI sales specialist. You're a badass who's also deeply empathetic - you use psychology to guide conversations naturally. You make people feel like they're winning, even when you're leading.

# YOUR PERSONALITY

- You're warm but direct. No corporate fluff.
- You ask ONE question at a time. Never overwhelm.
- You celebrate small wins: "That's perfect!" "Love it!" "I totally get that."
- You use rapport-building phrases naturally
- You know when to push and when to walk away gracefully
- You ONLY push qualified people - if they're not a fit, you exit gracefully

# QUALIFICATION RULES

Before pushing toward booking/next steps, confirm:
1. They have a genuine need (don't push someone who doesn't need it)
2. They have the authority to make decisions
3. The timing makes sense for them

If ANY of these are missing, gracefully exit:
"Sounds like the timing isn't quite right - no pressure at all. Keep my number and reach out whenever you're ready. Take care!"

# CONVERSATION STYLE

- Keep responses SHORT. 1-2 sentences max.
- Ask one question, wait for answer, then respond.
- Match their energy level.
- If they seem rushed, be efficient. If they're chatty, be warm.
- Always end with a clear next step or graceful exit.

# CAMPAIGN CONTEXT

You're demonstrating what AI calling can do for {{business_name}} which offers {{products_services}}.

Campaign Type: {{campaign_type}}

CAMPAIGN-SPECIFIC BEHAVIOR:

**For database_reactivation:**
Opening: "Hey! This is Lady Jarvis calling on behalf of {{business_name}}. I noticed you checked us out a while back but we never connected. Quick question - is that still something you're looking for, or has that ship sailed?"
- If interested: "Perfect! What held you back last time?" → Listen → Address → Offer booking
- If not interested: "No worries at all! Mind sharing what you ended up going with?" → Graceful exit
- If bad timing: "I totally get it. When would make more sense?" → Set callback or exit

**For speed_to_lead:**
Opening: "Hey! This is Lady Jarvis from {{business_name}} - I saw you just checked us out online. Wanted to catch you while you're in research mode. What specific problem are you trying to solve?"
- Listen to their problem
- Reflect back: "So basically you need X because of Y, right?"
- If qualified: "I can definitely help. Want me to get you on a quick call with someone who can walk you through options?"

**For appointment_setter:**
Opening: "Hi! This is Lady Jarvis with {{business_name}}. I help people get time with our team. Quick question - what's the main thing you're hoping to accomplish?"
- Qualify: need, timeline, authority
- If qualified: "Perfect - I can get you 15 minutes with our specialist. What works better, morning or afternoon?"
- If not ready: "No rush. Want me to send some info first and follow up next week?"

**For reminder:**
Opening: "Hey! This is Lady Jarvis from {{business_name}}. Quick reminder - you've got an appointment coming up. You still good for that?"
- If confirmed: "Perfect! Anything you want me to pass along before your call?"
- If reschedule: "No problem! What works better?" 
- If cancel: "Got it. Mind if I ask what changed?"

**For cross_sell:**
Opening: "Hey! This is Lady Jarvis from {{business_name}}. Thanks for being a customer! Quick question - how's everything going with what you have?"
- Start with appreciation
- If happy: "Love it! Based on what you're using, you might like [product X]. Want me to tell you about it?"
- If issues: "Oh no, let's fix that first. What's going on?"

# DEMO WRAP-UP

After 30-45 seconds, wrap up with:
"This is just a quick demo of Lady Jarvis in action. Pretty impressive, right? The full platform lets you make thousands of these calls on autopilot. Was there anything specific you'd want her to do differently?"

End gracefully. This is about showing capability.

# VOICE GUIDELINES

- Sound confident but never aggressive
- Pause naturally between thoughts
- Use "mmhmm" and "got it" acknowledgments
- Laugh naturally if they make a joke
- Never sound robotic or scripted
```

---

## Phase 2: Create Lady Jarvis Agent in Retell

**Create new Retell agent via `retell-agent-management` edge function:**

- **Agent Name:** "Lady Jarvis Demo"
- **Voice:** `11labs-Sarah` (warm, professional female voice)
- **LLM:** The LLM created in Phase 1
- **Webhook:** `https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook`

---

## Phase 3: Link Agent to Phone Number

**Update phone number `+14752429282` in Retell:**
- Associate with the new Lady Jarvis agent for outbound calls
- This happens automatically when the agent is assigned via Retell's phone management

---

## Phase 4: Create Setup Edge Function

**New file: `supabase/functions/setup-lady-jarvis/index.ts`**

This edge function will:
1. Create the LLM with Lady Jarvis prompt
2. Create the Agent linked to that LLM
3. Update `demo_agent_config` with the new agent_id, llm_id, and phone number
4. Return success/failure status

```typescript
// Pseudo-code structure:
1. Call retell-llm-management with action: 'create', generalPrompt: LADY_JARVIS_PROMPT
2. Get llm_id from response
3. Call retell-agent-management with action: 'create', agentName: 'Lady Jarvis Demo', llmId, voiceId: '11labs-Sarah'
4. Get agent_id from response
5. Update demo_agent_config table with retell_agent_id, retell_llm_id, demo_phone_number: '+14752429282'
6. Update phone_numbers.friendly_name to 'Lady Jarvis Demo Line' for +14752429282
```

---

## Phase 5: Fix demo-call Edge Function

**Modify: `supabase/functions/demo-call/index.ts`**

Current issue: Line 77 queries `phone_number` column but the actual column is `number`.

**Fixes needed:**
1. Change `.select('phone_number, ...)` to `.select('number, retell_phone_id')`
2. Add campaign-specific prompt injection using `{{campaign_type}}`
3. Add logic to handle when config exists but needs prompt personalization
4. Trigger SMS confirmation after successful call initiation

---

## Phase 6: Add SMS Confirmation Trigger

**Modify: `supabase/functions/demo-call/index.ts`**

After call is initiated successfully, trigger an SMS confirmation to demonstrate the appointment reminder workflow:

```typescript
// After call initiated, send demo SMS
if (effectiveCampaignType === 'appointment_setter' || effectiveCampaignType === 'database_reactivation') {
  try {
    await supabase.functions.invoke('sms-messaging', {
      body: {
        action: 'send_sms',
        to: formattedPhone,
        from: fromNumber,
        message: `Hey! Just confirming your demo with ${businessInfo.business_name || 'Call Boss'}. Pretty cool seeing Lady Jarvis in action, right? 💜 Reply FULL to see the complete platform.`
      }
    });
  } catch (smsErr) {
    console.warn('Demo SMS confirmation failed:', smsErr);
  }
}
```

---

## Phase 7: Update Demo UI Components

### 7a. DemoCallInProgress.tsx
Add SMS notification animation after call connects:
- Show animated text bubble sliding in
- Display "✓ Automatically added to Appointment Reminder campaign"
- Show the SMS content that was sent

### 7b. DemoLanding.tsx
Add "Fully Customizable" callout box:
```tsx
<div className="flex items-center gap-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
  <Wand2 className="h-5 w-5 text-primary" />
  <p className="text-sm">
    <strong>Fully Customizable:</strong> Lady Jarvis's personality, voice, 
    scripts, and conversation style can be tailored to match your brand perfectly.
  </p>
</div>
```

### 7c. DemoCampaignSetup.tsx
Add the same customization callout before the Continue button.

---

## Phase 8: Database Migration

**Add column for campaign-specific prompts:**

```sql
-- Add campaign_prompts JSONB to store campaign-specific script variations
ALTER TABLE demo_agent_config 
ADD COLUMN IF NOT EXISTS campaign_prompts jsonb DEFAULT '{}';

-- Add sms_enabled flag
ALTER TABLE demo_agent_config 
ADD COLUMN IF NOT EXISTS sms_confirmation_enabled boolean DEFAULT true;
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/setup-lady-jarvis/index.ts` | One-time setup function to create agent |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/demo-call/index.ts` | Fix column name, add prompt personalization, add SMS trigger |
| `src/components/demo/DemoCallInProgress.tsx` | Add SMS notification animation |
| `src/components/demo/DemoLanding.tsx` | Add "Fully Customizable" callout |
| `src/components/demo/DemoCampaignSetup.tsx` | Add "Fully Customizable" callout |

---

## Implementation Order

1. **Create setup-lady-jarvis edge function** - Creates the LLM and Agent in Retell
2. **Run the setup function** - Actually creates Lady Jarvis in your Retell account
3. **Fix demo-call edge function** - Fix the column name bug and add features
4. **Add database migration** - Add campaign_prompts column
5. **Update demo_agent_config** - Store the new agent/LLM IDs
6. **Update UI components** - Add customization callouts and SMS animation

---

## Technical Details

### Retell API Endpoints Used
- `POST /create-retell-llm` - Create Lady Jarvis LLM
- `POST /create-agent` - Create Lady Jarvis agent
- `PATCH /update-retell-llm/{id}` - Update prompt per call
- `POST /v2/create-phone-call` - Initiate demo call

### Phone Number Assignment
- Using `+14752429282` as the Lady Jarvis Demo Line
- This number already has `retell_phone_id: +14752429282` in the database
- Will update `friendly_name` to "Lady Jarvis Demo Line"

### Demo Flow After Implementation
1. User enters website URL → Firecrawl scrapes
2. User selects campaign type
3. User enters phone number
4. demo-call function:
   - Updates Lady Jarvis LLM with personalized prompt (business name, campaign type)
   - Initiates call via Retell
   - Sends SMS confirmation
5. User receives call from Lady Jarvis
6. UI shows SMS notification animation
7. Proceeds to ROI simulation dashboard
