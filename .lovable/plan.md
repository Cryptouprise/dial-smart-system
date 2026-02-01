

# Demo AI Voice Agent Setup Plan

## Overview

To make the Interactive Demo Platform work with **real AI calls**, we need to set up a dedicated Retell AI voice agent specifically for demo calls. This agent will:
1. Be personalized with scraped website data about the prospect's business
2. Demonstrate database reactivation, speed-to-lead, or other campaign types
3. Actually call the prospect's phone number during the demo
4. Show the power of the system in a live, memorable way

---

## What We're Building

### The Demo Call Experience

When a prospect enters their website and phone number:
1. Their website gets scraped (Firecrawl)
2. AI extracts their business info (Lovable AI)
3. A **real Retell AI agent** calls their phone
4. The agent knows about their business and demonstrates a sales call
5. After the call, they see the full simulation + ROI calculator

---

## Technical Implementation

### 1. Create Demo Agent Infrastructure

#### New Database Tables

```sql
-- Store demo agent configuration
CREATE TABLE demo_agent_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retell_agent_id text NOT NULL,            -- The actual Retell agent ID
  retell_llm_id text NOT NULL,              -- The LLM powering the agent
  demo_phone_number text NOT NULL,          -- Caller ID for demo calls
  retell_phone_id text,                     -- Retell phone number ID
  base_prompt text NOT NULL,                -- Template prompt with placeholders
  voice_id text DEFAULT '11labs-Sarah',     -- Voice for demo calls
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Track demo calls for rate limiting and analytics
CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_url text,
  scraped_data jsonb,                       -- Business name, products, etc.
  campaign_type text,                       -- 'database_reactivation', 'speed_to_lead', etc.
  simulation_config jsonb,
  prospect_phone text,
  prospect_name text,
  ip_address text,
  call_initiated boolean DEFAULT false,
  call_completed boolean DEFAULT false,
  retell_call_id text,
  call_duration_seconds integer,
  simulation_completed boolean DEFAULT false,
  converted_to_signup boolean DEFAULT false,
  roi_viewed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Rate limiting per IP
CREATE TABLE demo_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES demo_sessions(id),
  phone_number text NOT NULL,
  ip_address text NOT NULL,
  retell_call_id text,
  status text DEFAULT 'initiated',
  created_at timestamptz DEFAULT now()
);
```

### 2. Demo Agent Prompt Template

The demo agent needs a specialized prompt that:
- Understands it's doing a demo for a prospective customer
- Uses the scraped business info dynamically
- Demonstrates the campaign type they selected
- Is concise and impressive (30-60 seconds max)

```text
You are an AI sales agent demonstrating Call Boss for {{business_name}}.

CONTEXT:
- This is a DEMO call to show a prospect what our AI can do
- The prospect runs {{business_name}} which offers: {{products_services}}
- They selected a "{{campaign_type}}" demo
- Your goal: Impress them with natural conversation in under 60 seconds

DEMO SCRIPT ({{campaign_type}}):

[IF database_reactivation]
"Hey! This is an AI calling on behalf of {{business_name}}. I noticed you were 
interested in {{products_services}} a while back but we never connected. 
I'm reaching out to see if that's still something you're looking for? 
We've got some great options available right now."

[IF speed_to_lead]
"Hi there! Thanks for checking out {{business_name}}! I saw you were just 
looking at our {{products_services}}. I wanted to reach out personally to 
see if you have any questions I can help with?"

[IF appointment_setter]
"Hello! I'm calling from {{business_name}}. We help businesses with 
{{products_services}}. Do you have 15 minutes this week for a quick call 
to see if we might be a good fit?"

RULES:
- Keep it SHORT - this is a demo, not a real sales call
- Be natural and conversational
- After 30-40 seconds, wrap up with: "This is just a quick demo of what 
  Call Boss can do for you. Pretty cool, right? The full platform lets 
  you make thousands of these calls automatically."
- End gracefully
```

### 3. Edge Functions

#### `demo-scrape-website/index.ts` (New)
- Public endpoint (no auth required)
- Calls Firecrawl to scrape the website
- Uses Lovable AI to extract business info
- Stores in `demo_sessions` table
- Returns structured data for the UI

#### `demo-call/index.ts` (New)
- Public endpoint with rate limiting (3 calls/IP/day)
- Retrieves demo agent config from `demo_agent_config`
- Dynamically updates the LLM prompt with business info
- Initiates call via Retell AI
- Logs to `demo_call_logs`

```typescript
// Rate limit check
const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
const today = new Date().toISOString().split('T')[0];
const { count } = await supabase
  .from('demo_call_logs')
  .select('id', { count: 'exact' })
  .eq('ip_address', clientIP)
  .gte('created_at', `${today}T00:00:00Z`);

if (count >= 3) {
  return new Response(JSON.stringify({ 
    error: 'Demo limit reached today. Sign up for unlimited access!' 
  }), { status: 429 });
}

// Get demo agent config
const { data: config } = await supabase
  .from('demo_agent_config')
  .select('*')
  .eq('is_active', true)
  .single();

// Build personalized prompt
const personalizedPrompt = config.base_prompt
  .replace(/\{\{business_name\}\}/g, sessionData.business_name)
  .replace(/\{\{products_services\}\}/g, sessionData.products_services)
  .replace(/\{\{campaign_type\}\}/g, sessionData.campaign_type);

// Update LLM with personalized prompt (temporary)
await fetch(`https://api.retellai.com/update-retell-llm/${config.retell_llm_id}`, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
  body: JSON.stringify({ general_prompt: personalizedPrompt })
});

// Make the call
const callResponse = await fetch('https://api.retellai.com/v2/create-phone-call', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${RETELL_API_KEY}` },
  body: JSON.stringify({
    from_number: config.demo_phone_number,
    to_number: prospect_phone,
    agent_id: config.retell_agent_id
  })
});
```

### 4. One-Time Setup Steps (Manual)

Before the demo platform goes live, you'll need to:

1. **Purchase a Demo Phone Number**
   - Buy one number specifically for demo calls (Telnyx is cheapest)
   - Import it into Retell AI

2. **Create the Demo LLM in Retell**
   - Use the template prompt above
   - Model: GPT-4o for best quality
   - Begin message: "Hey there!"

3. **Create the Demo Agent in Retell**
   - Link to the demo LLM
   - Voice: 11labs-Sarah (friendly, professional)
   - Set webhook to `retell-call-webhook`

4. **Store Config in Database**
   ```sql
   INSERT INTO demo_agent_config (
     retell_agent_id, retell_llm_id, demo_phone_number, 
     retell_phone_id, base_prompt, voice_id
   ) VALUES (
     'agent_xxx', 'llm_xxx', '+1xxxxxxxxxx',
     'pn_xxx', '...template prompt...', '11labs-Sarah'
   );
   ```

---

## Frontend Components

| Component | Purpose |
|-----------|---------|
| `src/pages/Demo.tsx` | Public landing page route |
| `src/components/demo/DemoLanding.tsx` | Hero + website input |
| `src/components/demo/DemoWebsiteScraper.tsx` | Scraping progress UI |
| `src/components/demo/DemoCampaignTypeSelector.tsx` | Campaign type cards |
| `src/components/demo/DemoCampaignSetup.tsx` | Simplified config form |
| `src/components/demo/DemoPhoneInput.tsx` | Phone number + consent |
| `src/components/demo/DemoCallInProgress.tsx` | iPhone mockup with call status |
| `src/components/demo/DemoSimulationDashboard.tsx` | Time-lapse simulation |
| `src/components/demo/DemoROIDashboard.tsx` | Impact calculator |
| `src/hooks/useDemoFlow.ts` | State machine for demo flow |

---

## Security & Rate Limiting

| Protection | Implementation |
|------------|----------------|
| Rate limit | 3 demo calls per IP per day |
| Phone validation | E.164 format, no premium numbers |
| CAPTCHA | Before call initiation (optional) |
| Cost cap | Max 100 demo calls/day total (configurable) |
| Abuse detection | Flag rapid attempts from same IP |

---

## Implementation Phases

### Phase 1: Demo Agent Infrastructure
- [ ] Create database tables for demo config and tracking
- [ ] Create `demo-scrape-website` edge function
- [ ] Create `demo-call` edge function with rate limiting
- [ ] Manual setup of Retell demo agent (via Retell dashboard)
- [ ] Insert demo agent config into database

### Phase 2: Frontend Demo Flow
- [ ] Create `/demo` public route
- [ ] Build website scraping UI
- [ ] Build campaign type selector
- [ ] Build simplified setup form
- [ ] Build phone input with consent

### Phase 3: Call Experience
- [ ] Build iPhone mockup component
- [ ] Show real-time call status from Retell webhook
- [ ] Display call recording after completion
- [ ] Show SMS/email preview mockups

### Phase 4: Simulation Dashboard
- [ ] Build tri-panel simulation view
- [ ] Create time-lapse animation engine
- [ ] Animate pipeline filling
- [ ] Build cost tracker

### Phase 5: ROI Calculator
- [ ] Build human comparison dashboard
- [ ] Create personalized projections
- [ ] Add "No Churn No Burn" messaging
- [ ] Final CTA section

---

## Dependencies

### Required Services
1. **Firecrawl** - Website scraping (needs API key configured)
2. **Lovable AI** - Already configured (LOVABLE_API_KEY)
3. **Retell AI** - Already configured (RETELL_AI_API_KEY)

### Required: Demo Phone Number
You need to purchase/designate one phone number for demo calls:
- Can use an existing Telnyx number you're not using
- Must be imported into Retell AI
- Will be the caller ID for all demo calls

---

## Cost Estimates

| Item | Cost |
|------|------|
| Demo phone number | ~$2/month |
| Retell AI per demo call | ~$0.10 (assuming 1 min call) |
| Firecrawl per scrape | ~$0.01 |
| 100 demos/day | ~$11/day |

With 3 calls/IP/day limit and typical usage, expect 20-50 demo calls/day = **$2-5/day**

---

## Next Steps

1. **Immediate**: Do you want me to create the database tables and edge functions?
2. **Manual Setup Required**: You'll need to create the demo agent in the Retell dashboard (takes 5 minutes)
3. **Phone Number**: Do you have a number to use, or should we purchase one?

