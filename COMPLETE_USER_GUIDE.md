# Complete User Guide - Dial Smart System
## Your Complete "How to Use Everything" Manual

This guide provides step-by-step instructions for every feature in the Dial Smart System. Perfect for beginners and experienced users alike.

---

## 📚 Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Campaign Management](#campaign-management)
4. [Lead Management](#lead-management)
5. [AI Voice Agents (Retell AI)](#ai-voice-agents-retell-ai)
6. [Phone Number Management](#phone-number-management)
7. [SMS Messaging](#sms-messaging)
8. [Analytics & Performance](#analytics--performance)
9. [Automation & Workflows](#automation--workflows)
10. [AI Assistant](#ai-assistant)
11. [Settings & Configuration](#settings--configuration)
12. [Integrations](#integrations)
13. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Time Setup (10 minutes)

#### Step 1: Sign Up & Login
1. Go to your Dial Smart System URL
2. Click "Sign Up" or use your login credentials
3. Verify your email if prompted
4. You'll land on the Dashboard

#### Step 2: Quick Configuration Wizard
1. Click **Settings** → **AI Configuration**
2. Click **"Quick Setup Wizard"**
3. The AI Assistant will guide you through:
   - Retell AI API key setup
   - Phone number import/purchase
   - First agent creation
   - Basic settings configuration
4. Follow the prompts - it's fully automated!

#### Step 3: Import Your First Leads
1. Go to **Leads** tab
2. Click **"Upload Leads"** button
3. Either:
   - **Drag and drop** a CSV file, OR
   - **Paste** contact data, OR
   - **Manual entry** for individual leads
4. Required fields: Name, Phone Number
5. Optional: Email, Status, Priority, Notes
6. Click **"Import"**

#### Step 4: Create Your First Campaign
1. Go to **Campaigns** tab
2. Click **"Create Campaign"**
3. Fill in:
   - **Campaign Name**: e.g., "Solar Leads - December"
   - **Select Leads**: Choose from your imported leads
   - **Select Agent**: Pick your Retell AI agent
   - **Phone Numbers**: Select which numbers to call from
4. Click **"Launch Campaign"**

**🎉 Congratulations! Your first campaign is running!**

---

## Dashboard Overview

### What You See on the Dashboard

#### Top Metrics Bar
- **Total Calls Today**: All calls made today
- **Answer Rate**: Percentage of calls answered
- **Appointments**: Meetings booked today
- **Active Campaigns**: Currently running campaigns

#### Campaign Status Cards
- **Green Card**: Campaign running smoothly
- **Yellow Card**: Warning - needs attention
- **Red Card**: Error - action required
- Click any card to view details

#### Recent Activity Feed
- Real-time updates on calls, SMS, appointments
- Click any item to see full details
- Filter by activity type

#### Quick Actions Panel
- **Make Test Call**: Test your setup
- **Send SMS**: Quick message to leads
- **Upload Leads**: Import more contacts
- **View Analytics**: Performance reports

---

## Campaign Management

### Creating a Campaign

#### Standard Campaign
1. **Campaigns** → **Create Campaign**
2. Enter campaign details:
   - **Name**: Descriptive name
   - **Description**: Optional notes
   - **Priority**: 1-5 (5 = highest)
3. **Select Leads**:
   - Upload CSV, OR
   - Select from existing leads, OR
   - Import from integration (GHL, Yellowstone)
4. **Configure Agent**:
   - Select existing Retell agent
   - OR create new agent
5. **Phone Pool**:
   - Select which numbers to use
   - Enable local presence matching (recommended)
6. **Schedule** (optional):
   - Set calling hours
   - Define timezone compliance
   - Configure max calls per day
7. Click **"Create & Launch"**

#### Predictive Dialing Campaign
1. Follow standard campaign steps above
2. Enable **"Predictive Dialing Mode"**
3. Configure:
   - **Max Concurrent Calls**: 10-50
   - **Dialing Ratio**: 1.5-3.5 (auto-adjusts)
   - **Answer Machine Detection**: Enable/Disable
   - **Abandonment Rate Limit**: 3% (FCC compliant)
4. System auto-optimizes based on performance

### Managing Active Campaigns

#### View Campaign Details
1. Click campaign card on Dashboard
2. See:
   - **Live Stats**: Calls, answers, appointments
   - **Lead List**: All contacts in campaign
   - **Activity Timeline**: Recent events
   - **Performance Metrics**: Success rates

#### Pause/Resume Campaign
- Click **"Pause"** button to stop calling
- Click **"Resume"** to restart
- Useful during lunch breaks, after hours, etc.

#### Edit Campaign Settings
1. Campaign Details → **"Edit Settings"**
2. Modify:
   - Calling hours
   - Agent assignment
   - Phone number pool
   - Dialing parameters
3. Changes apply immediately

#### Monitor Compliance
- **Abandonment Rate**: Must stay < 3%
- **DNC Checks**: Automatic before each call
- **Calling Hours**: TCPA compliant windows
- **Warning Alerts**: System notifies violations
- **Auto-Pause**: Campaign pauses if violations occur

### Campaign Performance Optimization

#### View Performance Metrics
1. Campaign → **"Analytics"** tab
2. Review:
   - **Answer Rate**: Target >30%
   - **Conversion Rate**: % becoming appointments
   - **Average Call Duration**: Longer usually = better
   - **Best Times to Call**: AI identifies patterns

#### AI Recommendations
- System analyzes performance automatically
- Check **"Insights"** panel for suggestions
- Examples:
  - "Call between 10 AM - 2 PM for 40% better answer rates"
  - "Consider adjusting script - low engagement detected"
  - "Add more leads to maintain optimal call volume"

---

## Lead Management

### Adding Leads

#### Bulk Upload via CSV
1. **Leads** → **"Upload Leads"**
2. Download CSV template (optional)
3. Format your CSV:
   ```csv
   name,phone_number,email,status,priority,notes
   John Doe,555-123-4567,john@example.com,new,5,Hot lead from webinar
   Jane Smith,555-987-6543,jane@example.com,new,3,Requested info
   ```
4. Drag file or click to upload
5. Map fields if needed
6. Click **"Import"**

#### Manual Entry
1. **Leads** → **"Add Lead"**
2. Fill in form:
   - **Name** (required)
   - **Phone** (required)
   - **Email**
   - **Status**: New, Hot, Cold, etc.
   - **Priority**: 1-5
   - **Tags**: For organization
   - **Notes**: Any context
3. Click **"Save"**

#### Import from CRM
1. **Settings** → **"Integrations"**
2. Connect:
   - Go High Level (GHL)
   - Yellowstone
   - Airtable
3. Select data to sync
4. Leads automatically imported

### Lead Pipeline Management

#### Understanding Pipeline Stages
Default stages (auto-created):
- **New Leads**: Just imported
- **Contacted**: First call made
- **Hot Leads**: High interest
- **Appointments**: Meeting scheduled
- **Follow Up**: Needs nurturing
- **Callbacks**: Scheduled callback
- **Cold**: Not interested
- **Invalid**: Wrong number/DNC

#### Moving Leads Between Stages
**Automatic Movement:**
- System moves leads based on call outcomes
- Hot response → Hot Leads stage
- Appointment booked → Appointments stage
- Not interested → Cold stage
- Wrong number → Invalid stage

**Manual Movement:**
1. Go to **Pipeline** view (Kanban board)
2. **Drag and drop** lead cards between columns
3. System logs the change
4. Auto-triggers any stage-based workflows

#### Lead Priority Scoring
**Automatic Scoring (0-100):**
- Based on 5 factors:
  - **Recency**: How recently added (20%)
  - **Call History**: Quality of interactions (25%)
  - **Time Optimization**: Best call time (15%)
  - **Response Rate**: Historical patterns (15%)
  - **Manual Priority**: Your 1-5 rating (25%)
  - **Callback Boost**: +30% if callback scheduled

**View Lead Scores:**
1. Pipeline → Lead card shows score
2. Higher scores = called first
3. Scores update after each interaction

#### Search & Filter Leads
1. **Leads** page → **Search bar**
2. Search by:
   - Name, Phone, Email
   - Status or Tag
   - Date added
   - Last contacted
3. **Advanced Filters**:
   - Priority level
   - Pipeline stage
   - Call count
   - Conversion likelihood

### Lead Follow-Up System

#### Callback Scheduling
1. During/after call, note callback needed
2. **Set Callback** button
3. Choose date & time
4. Add notes about why
5. System automatically:
   - Moves to Callbacks stage
   - Sets reminder
   - Calls at scheduled time

#### Multi-Step Follow-Up Sequences
1. **Settings** → **"Follow-Up Sequences"**
2. Click **"Create Sequence"**
3. Add steps:
   - **AI Call**: Automated call
   - **AI SMS**: Smart text message
   - **Manual SMS**: Template message
   - **Email**: Automated email
   - **Wait**: Delay between steps
4. Set delays (minutes/hours/days)
5. Assign sequence to pipeline stage
6. Leads auto-enter sequence when reaching stage

**Example Sequence:**
```
Step 1: Immediate AI SMS - "Thanks for your interest!"
Step 2: Wait 24 hours
Step 3: AI Call - Check-in call
Step 4: Wait 2 hours
Step 5: AI SMS - "Did you get my call?"
Step 6: Wait 48 hours
Step 7: AI Call - Final attempt
```

---

## AI Voice Agents (Retell AI)

### Understanding Retell AI Agents

**What is a Retell Agent?**
- AI-powered voice agent that makes/receives calls
- Sounds human, handles conversations naturally
- Follows your script and instructions
- Books appointments, answers questions, handles objections
- Available 24/7, never gets tired

### Creating Your First Agent

#### Using the Agent Wizard
1. **Settings** → **"Retell AI Setup"**
2. Click **"Create New Agent"**
3. **Step 1: Basic Info**
   - **Agent Name**: e.g., "Sarah - Solar Closer"
   - **Voice**: Choose from 50+ voices
     - Try different voices with preview
     - Match voice to audience
   - **Language**: English (default)

4. **Step 2: Script/Instructions**
   - Choose **Script Template** OR write custom
   - Templates available:
     - Introduction & Qualification
     - Appointment Setting
     - Follow-up Call
     - Objection Handling
   - Add your specific talking points
   - Include FAQs your agent should know

5. **Step 3: Calendar Integration** (optional)
   - Connect Google Calendar
   - Enable appointment booking
   - Set availability windows
   - Agent auto-books meetings

6. **Step 4: Advanced Settings**
   - **Interruption Sensitivity**: How quickly agent responds
   - **Speaking Rate**: Slow, Normal, Fast
   - **Voicemail Detection**: Enable/Disable
   - **Transfer Options**: Human handoff if needed

7. Click **"Create Agent"**

#### Testing Your Agent
1. After creation, click **"Test Call"**
2. Enter your phone number
3. Receive test call
4. Have a conversation
5. Review:
   - How natural did it sound?
   - Did it follow script?
   - Any improvements needed?
6. Make adjustments and test again

### Managing Agents

#### View Agent Performance
1. **Retell AI** → **"Agents"** tab
2. See all your agents
3. Click agent to view:
   - **Total Calls**: All-time call volume
   - **Success Rate**: % achieving goal
   - **Avg Call Duration**: Typical call length
   - **Appointment Rate**: % booking meetings
   - **Common Issues**: Problems detected
   - **Best Performing Scripts**: Top scripts

#### Edit Agent Configuration
1. Select agent → **"Edit"**
2. Modify:
   - Voice selection
   - Script/instructions
   - Response style
   - Calendar settings
3. Changes apply to new calls immediately
4. Existing calls continue with old config

#### Clone an Agent
1. Select high-performing agent
2. Click **"Clone"**
3. Make minor adjustments
4. A/B test different approaches

#### Archive/Delete Agent
1. Select agent → **"Actions"** → **"Archive"**
2. Archived agents stop making calls
3. Performance data preserved
4. Can reactivate anytime

### Agent Scripts & Optimization

#### Script Templates
**Introduction Script:**
```
Hi, this is {{agent_name}} calling from {{company_name}}.

I'm reaching out because {{reason_for_call}}.

Is this a good time to chat for just a couple of minutes?

[If YES]: Great! I'd like to tell you about {{value_proposition}}.

[If NO]: No problem! When would be a better time to call you back?
```

**Appointment Setting:**
```
Hi {{lead_name}}, this is {{agent_name}} from {{company_name}}.

I'm calling to schedule your consultation. We have availability:
- {{slot_1}}
- {{slot_2}}
- {{slot_3}}

Which time works best for you?
```

**Objection Handling:**
```
I understand your concern about {{objection}}.

Many of our clients felt the same way initially. What they found was {{counter_point}}.

Would it help if I {{offer_solution}}?
```

#### Script Performance Analytics
1. **Scripts** → **"Analytics"** tab
2. System tracks automatically:
   - **Performance Score**: 0-100 rating
   - **Conversion Rate**: % success
   - **Usage Count**: Total calls
   - **Avg Call Duration**: Time per call
   - **Sentiment**: Positive/Negative reactions

#### AI Script Optimization
**Automatic Improvement:**
- System monitors all scripts
- When performance drops below 70%:
  1. AI analyzes what's not working
  2. Generates improvement suggestions
  3. Shows expected impact
  4. You approve or reject
  5. New version deployed
  6. A/B tested against old version

**Manual Optimization:**
1. Review analytics
2. Identify low-performing sections
3. Edit script
4. Test with few calls
5. Compare performance
6. Keep better version

---

## Phone Number Management

### Why Phone Numbers Matter

**Key Concepts:**
- **Caller ID**: What the lead sees when you call
- **Local Presence**: Matching area code increases answer rates by 40%
- **Number Health**: Spam score affects whether calls are answered
- **Rotation**: Cycling numbers prevents spam flags

### Getting Phone Numbers

#### Purchase New Numbers
1. **Phone Numbers** → **"Purchase Numbers"**
2. **Search Options**:
   - By Area Code: e.g., "310" for Los Angeles
   - By State: e.g., "California"
   - By City: e.g., "San Francisco"
3. View available numbers
4. Check:
   - **Spam Score**: Lower is better (0-100)
   - **Provider**: Telnyx, Twilio, etc.
   - **Cost**: Per month
5. Select numbers
6. Click **"Purchase"** (charged to your provider account)

#### Import Existing Numbers
1. **Phone Numbers** → **"Import Numbers"**
2. Choose method:
   - **From Retell AI**: Auto-sync your Retell numbers
   - **From Telnyx**: Import Telnyx numbers
   - **From Twilio**: Import Twilio numbers
   - **Manual Entry**: Add any number
3. Numbers appear in your pool

### Number Pool Management

#### Creating Number Pools
1. **Phone Numbers** → **"Number Pools"**
2. Click **"Create Pool"**
3. **Pool Types**:
   - **Local Presence**: Numbers grouped by area code
   - **Campaign Specific**: Dedicated to one campaign
   - **General**: Mixed use
4. Add numbers to pool
5. Assign pool to campaigns

#### Local Presence Setup
1. Create pool per geographic market:
   - "California Pool" - All 310, 415, 619 area codes
   - "Texas Pool" - All 214, 713, 512 area codes
   - "New York Pool" - All 212, 718, 917 area codes
2. System auto-matches lead area code to pool
3. Result: 40% higher answer rates

#### Number Rotation Strategies
1. **Settings** → **"Number Rotation"**
2. Choose strategy:
   - **Round Robin**: Cycles through all numbers equally
   - **Random**: Random selection
   - **Least Used**: Uses numbers with lowest daily call count
   - **Health-Based**: Prioritizes numbers with best spam scores
3. Set rotation interval:
   - Per call
   - Every X calls
   - Time-based (hourly, daily)

### Monitoring Number Health

#### Understanding Spam Scores
- **0-30**: Excellent - No issues
- **31-60**: Good - Minor concerns
- **61-80**: Fair - Moderate risk
- **81-100**: Poor - High spam risk

#### Checking Number Status
1. **Phone Numbers** → View list
2. Each number shows:
   - **Spam Score**: Color-coded
   - **Daily Calls**: Usage today
   - **Status**: Active, Quarantined, Flagged
   - **Last Used**: When last called from

#### Quarantine System
**Automatic Quarantine:**
- Spam score > 80: Auto-quarantined
- Too many unanswered calls: Flagged
- Carrier warnings: Quarantined

**Manual Quarantine:**
1. Select number
2. Click **"Quarantine"**
3. Add reason
4. Number removed from rotation
5. Leave inactive 30+ days to "cool down"

#### Number Cleanup
1. **Phone Numbers** → **"Cleanup"**
2. System recommends:
   - Numbers to retire (high spam)
   - Numbers to rest (heavy use)
   - Numbers to reactivate (cooled down)
3. Review and apply recommendations

---

## SMS Messaging

### AI-Powered SMS Conversations

#### Sending Individual SMS
1. **Leads** → Select lead
2. Click **"Send SMS"** button
3. Choose:
   - **AI Generated**: AI writes message based on context
   - **Template**: Use pre-written message
   - **Custom**: Write your own
4. Preview message
5. Click **"Send"**

#### AI Message Generation
1. When selecting "AI Generated"
2. AI considers:
   - Lead's interaction history
   - Current pipeline stage
   - Last call outcome
   - Time since last contact
3. Generates contextual message
4. You can edit before sending

#### SMS Templates
**Create Template:**
1. **Settings** → **"SMS Templates"**
2. Click **"Create Template"**
3. Add:
   - **Name**: e.g., "Follow-up after no answer"
   - **Message**: Your text (use variables)
   - **Category**: Organizer
4. Use variables:
   - `{{lead_name}}` - Lead's first name
   - `{{company_name}}` - Your company
   - `{{agent_name}}` - Your name
   - `{{appointment_date}}` - Scheduled date

**Example Templates:**
```
Hi {{lead_name}}, this is {{agent_name}}. 
I tried calling earlier about {{topic}}. 
When's a good time to chat? Reply with your availability!
```

```
{{lead_name}}, just confirming your appointment on {{appointment_date}} at {{appointment_time}}. 
Reply CONFIRM or call {{phone_number}} if you need to reschedule.
```

### Bulk SMS Campaigns
1. **SMS** → **"Broadcast"**
2. Select recipients:
   - Entire campaign
   - Pipeline stage
   - Custom filter
3. Choose message:
   - Template
   - AI generated
   - Custom
4. **Schedule**:
   - Send now
   - Schedule for later
   - Time-optimized (AI picks best time)
5. **Review & Send**

### Two-Way SMS Conversations
1. **SMS** → **"Conversations"**
2. View all active conversations
3. Click conversation to see history
4. Reply options:
   - Type manual response
   - Use AI suggestion
   - Use template
5. **AI Auto-Response** (optional):
   - Enable for automated replies
   - AI handles common questions
   - Escalates complex queries to you

### SMS Compliance
- **Opt-Out Handling**: "STOP" automatically processed
- **Opt-In Required**: Only message contacts who consented
- **Time Restrictions**: No SMS before 8 AM or after 9 PM local time
- **Message Limits**: Max 1 message per hour to same lead
- **DNC Respect**: Numbers on DNC list blocked

---

## Analytics & Performance

### Dashboard Analytics

#### Real-Time Metrics
**Today's Performance:**
- **Calls Made**: Total calls today
- **Answer Rate**: % answered (target: >30%)
- **Appointments Booked**: Meetings scheduled
- **Conversion Rate**: % leads converted
- **Active Calls**: Currently in progress
- **SMS Sent/Received**: Message count

#### Historical Trends
1. **Analytics** → **"Trends"**
2. View charts:
   - **Call Volume**: Calls over time
   - **Answer Rates**: Trend analysis
   - **Best Times**: Optimal calling hours
   - **Agent Performance**: Comparison
3. **Date Range**: Today, Week, Month, Custom
4. **Export**: Download charts/data

### Campaign Analytics

#### Performance Metrics
1. Select campaign
2. **"Analytics"** tab shows:
   - **Health Score**: 0-100 rating
   - **Conversion Funnel**: Lead → Contact → Interest → Appointment
   - **Cost Per Appointment**: If budget tracking enabled
   - **ROI**: Return on investment

#### Bottleneck Detection
**Automatic Analysis:**
- System identifies where leads get stuck
- Example findings:
  - "70% of leads stuck in 'Contacted' stage"
  - "Average 5 days in 'Follow Up' - too long"
  - "Only 15% convert from 'Hot Lead' to 'Appointment'"
- **AI Recommendations**:
  - "Add follow-up sequence to 'Contacted' stage"
  - "Reduce wait time in 'Follow Up' sequence"
  - "Review 'Hot Lead' script - low conversion detected"

### Agent Analytics (NEW FEATURE!)

#### Per-Agent Performance
1. **Retell AI** → **"Agent Analytics"**
2. View each agent's metrics:
   - **Total Calls**: All-time volume
   - **Success Rate**: % achieving goal
   - **Conversion Rate**: % → appointments
   - **Avg Call Duration**: Typical length
   - **Sentiment Score**: How positive calls are
   - **Common Objections**: What leads say
   - **Best Scripts**: Top performing prompts

#### Agent Comparison
1. **Analytics** → **"Agent Comparison"**
2. Compare multiple agents side-by-side
3. Metrics compared:
   - Call volume
   - Success rates
   - Average handling time
   - Conversion rates
4. **Insights**:
   - "Agent A has 25% higher conversion"
   - "Agent B handles objections better"
   - "Agent C has shorter calls but same results"

#### Agent Improvement Tracking
- System monitors agent performance daily
- **Trend Detection**:
  - "Agent performance improving 15% this week"
  - "Agent conversions declined 10% - reviewing scripts"
- **Automatic Optimization**:
  - Best performing scripts auto-identified
  - Weak scripts flagged for improvement
  - Successful patterns replicated across agents

### Script Analytics

#### Script Performance Dashboard
1. **Scripts** → **"Performance"**
2. See all scripts ranked by:
   - **Performance Score**: 0-100
   - **Success Rate**: % conversions
   - **Usage**: Total calls
   - **Sentiment**: Positive/Negative
3. Color-coded:
   - 🟢 Green (70-100): Excellent
   - 🟡 Yellow (50-69): Needs improvement
   - 🔴 Red (<50): Critical - optimize now

#### Script Optimization Recommendations
**Automatic Suggestions:**
- Generated when script performance drops
- Example recommendations:
  - "Opening too long - leads losing interest"
  - "Add more value propositions early"
  - "Objection handling weak - strengthen responses"
  - "Call-to-action unclear - be more direct"
- **Expected Impact**: "Expected to improve conversion by 20%"
- **Apply**: One-click to implement changes

### Lead Analytics

#### Lead Scoring Insights
1. **Analytics** → **"Lead Insights"**
2. See:
   - **Score Distribution**: How leads are rated
   - **High Scorers**: Best leads
   - **Low Scorers**: Problematic leads
   - **Score Trends**: Improving or declining
3. **Actions**:
   - Focus on high scorers
   - Re-engage low scorers
   - Refine scoring model

#### Conversion Funnel Analysis
1. View complete lead journey:
   ```
   New Lead → Contacted → Interested → Hot Lead → Appointment → Closed
   100%        80%         40%         20%          15%          10%
   ```
2. Identify drop-off points
3. AI suggests interventions
4. Apply improvements

### Pipeline Analytics

#### Stage Performance
1. **Pipeline** → **"Analytics"**
2. Per-stage metrics:
   - **Lead Count**: Current in stage
   - **Avg Time in Stage**: Days
   - **Conversion Rate**: % moving forward
   - **Drop-off Rate**: % going backward
   - **Velocity**: Speed through stage

#### Optimization Insights
- **Bottleneck Alerts**:
  - "Follow Up stage has 200 leads - backlog detected"
  - "Hot Leads staying 7 days - too long"
- **Recommendations**:
  - "Add automation to speed up 'Follow Up'"
  - "Increase calling frequency for 'Hot Leads'"
  - "Consider splitting large stages"

### Export & Reporting

#### Built-in Reports
1. **Analytics** → **"Reports"**
2. Pre-built reports:
   - **Daily Summary**: Today's activity
   - **Weekly Performance**: 7-day trends
   - **Monthly Report**: Full month analysis
   - **Campaign Report**: Specific campaign
   - **Agent Report**: Per-agent performance
3. **Download**: PDF, CSV, Excel

#### Custom Reports
1. **Analytics** → **"Custom Report"**
2. Select:
   - **Metrics**: Choose what to include
   - **Date Range**: When
   - **Grouping**: By campaign, agent, stage, etc.
   - **Filters**: Narrow data
3. Preview report
4. **Save Template**: Reuse configuration
5. **Schedule**: Auto-generate daily/weekly

#### Data Export
1. **Analytics** → **"Export Data"**
2. Export options:
   - **All Leads**: Complete database
   - **Call Logs**: All call records
   - **Analytics Data**: Metrics only
   - **Custom Selection**: Choose fields
3. **Format**: CSV, JSON, Excel
4. **Includes**: All historical data
5. **Use**: Import to other systems, backup, analysis

---

## Automation & Workflows

### Understanding Automation

**What Can Be Automated?**
- Call scheduling and execution
- SMS follow-ups
- Lead status updates
- Pipeline movements
- Callback scheduling
- Data entry
- Report generation
- Alert notifications

### Disposition Automation

#### What Are Dispositions?
- Categories for call outcomes
- Examples: Hot Lead, Not Interested, Callback, Voicemail
- Automatically applied by AI after calls

#### Standard Dispositions
**Positive:**
- ✅ Hot Lead - High interest
- ✅ Interested - Moderate interest
- ✅ Appointment Booked - Meeting scheduled

**Neutral:**
- ⏸️ Callback Requested - Lead wants callback
- ⏸️ Voicemail - Left message
- ⏸️ Not Connected - Didn't reach lead
- ⏸️ Follow Up - General follow-up needed

**Negative:**
- ❌ Not Interested - Declined offer
- ❌ Wrong Number - Invalid contact
- ❌ Do Not Call - Requested no contact

#### Auto-Actions Based on Disposition
1. **Settings** → **"Disposition Rules"**
2. For each disposition, configure:
   - **Pipeline Stage**: Where to move lead
   - **Status Update**: Change lead status
   - **Follow-Up**: Trigger sequence
   - **Callback**: Schedule callback
   - **Tag**: Add tags
   - **Notification**: Alert team member
3. Actions execute automatically after each call

**Example Rules:**
```
Disposition: Hot Lead
→ Move to: Hot Leads stage
→ Status: Hot
→ Tag: "High Priority"
→ Follow-Up: "Hot Lead Sequence" in 1 hour
→ Notify: Sales Manager

Disposition: Voicemail
→ Move to: Follow Up stage
→ Status: Attempted
→ Follow-Up: "Voicemail Sequence" in 2 hours
→ Schedule Callback: +24 hours

Disposition: Not Interested
→ Move to: Cold stage
→ Status: Cold
→ Tag: "Not Interested"
→ Remove from: Active campaigns
```

### Follow-Up Sequences

#### Creating Automated Sequences
1. **Automation** → **"Sequences"**
2. Click **"Create Sequence"**
3. **Name**: E.g., "Hot Lead Nurture"
4. **Add Steps**: Click **"+"** to add
5. **Step Types**:

**AI Phone Call:**
- Select agent
- Add call objective
- Set max attempts
- Define success criteria

**AI SMS:**
- AI generates message based on context
- Can include variables
- Tone: Professional, Friendly, Urgent

**Manual SMS:**
- Use template
- Or write custom message
- Include personalization

**Email:**
- Subject line
- Body content
- Attachments (optional)

**Wait:**
- Delay before next step
- Minutes, hours, or days
- Can be dynamic (business days only)

6. **Set Delays Between Steps**:
   - Immediate: 0 minutes
   - Same day: 2-4 hours
   - Next day: 24 hours
   - Later: 48+ hours

7. **Assign Trigger**:
   - Disposition applied
   - Pipeline stage entered
   - Manual trigger
   - Time-based

#### Example Sequences

**New Lead Sequence:**
```
1. Immediate: AI Phone Call - Introduction
2. Wait 2 hours
3. AI SMS - "Did you get my call?"
4. Wait 24 hours
5. AI Phone Call - Follow-up
6. Wait 4 hours
7. Manual SMS - "Here's info you requested"
8. Wait 48 hours
9. AI Phone Call - Final check-in
```

**Appointment Reminder:**
```
1. 24 hours before: AI SMS - Reminder
2. Wait to 2 hours before
3. AI SMS - Final reminder
4. Wait to 30 minutes after
5. AI Phone Call - "Did we miss each other?"
```

**Voicemail Follow-Up:**
```
1. Immediate: AI SMS - "Just tried calling"
2. Wait 3 hours
3. AI Phone Call - Second attempt
4. Wait 24 hours
5. Manual SMS - Value proposition
6. Wait 48 hours
7. AI Phone Call - Last attempt
```

### Workflow Builder

#### Creating Custom Workflows
1. **Automation** → **"Workflows"**
2. Click **"Create Workflow"**
3. **Visual Builder**:
   - Drag blocks onto canvas
   - Connect with arrows
   - Define conditions

**Workflow Blocks:**
- **Trigger**: What starts workflow
- **Condition**: If/then logic
- **Action**: What to do
- **Wait**: Delay
- **Branch**: Multiple paths

#### Example Workflow: Smart Lead Routing
```
Trigger: New lead added
→ Condition: Lead score > 80?
  → YES: 
    → Assign to: Top agent
    → Start: Hot Lead Sequence
    → Notify: Sales manager
  → NO: 
    → Assign to: General pool
    → Start: Standard Sequence
```

#### Example Workflow: Re-Engagement
```
Trigger: Lead inactive 30 days
→ Action: Update status to "Dormant"
→ Action: Send AI SMS - Re-engagement message
→ Wait: 48 hours
→ Condition: Did lead respond?
  → YES: Move to "Re-engaged" stage
  → NO: Move to "Archived" stage
```

### Smart Scheduling

#### Best Time to Call
1. **Automation** → **"Smart Scheduling"**
2. Enable **"Optimize Call Times"**
3. System analyzes:
   - Historical answer rates by time
   - Lead's timezone
   - Industry best practices
   - Individual lead patterns
4. Automatically schedules calls at optimal times

#### Time Zone Management
1. **Settings** → **"Time Zones"**
2. Configure calling windows:
   - **Start**: 9:00 AM local time
   - **End**: 6:00 PM local time
   - **Lunch Break**: 12-1 PM (optional)
   - **Weekend Calling**: Enable/Disable
3. System auto-adjusts for each lead's timezone
4. TCPA compliant by default

---

## AI Assistant

### What Can the AI Assistant Do?

The AI Assistant is your personal system expert available 24/7. It can:
- Answer questions about the system
- Retrieve data and generate reports
- Perform actions on your behalf
- Provide strategic recommendations
- Guide you through complex tasks
- Troubleshoot issues

### Accessing the AI Assistant

#### Opening the Assistant
- Click **💬 AI Assistant** icon (bottom right of any page)
- OR press **Ctrl + /** keyboard shortcut
- OR say **"Hey Assistant"** if voice enabled

#### Voice Mode
1. Click **🎤 microphone** icon in assistant
2. Speak your request
3. Assistant responds with voice
4. Toggle voice on/off anytime

### Using Quick Actions

**Pre-configured Buttons:**
- **📊 Today's Stats**: Instant performance summary
- **🔍 Search Leads**: Find specific contacts
- **📞 Number Health**: Check spam scores
- **📋 Daily Report**: Full activity report
- **📈 Weekly Stats**: 7-day comparison
- **💾 Export Leads**: Download data

### Available AI Tools (20 Tools)

#### 1. Get Stats
**Usage:** "Get my stats for today"
**Returns:** Calls, answer rates, appointments, SMS activity

#### 2. Search Leads
**Usage:** "Find all hot leads in California"
**Returns:** Matching leads with details

#### 3. Bulk Update
**Usage:** "Update all leads in 'Follow Up' stage to priority 4"
**Returns:** Confirmation of updates

#### 4. Schedule Callback
**Usage:** "Schedule callback for John Doe tomorrow at 2 PM"
**Returns:** Callback scheduled, reminder set

#### 5. Number Health Check
**Usage:** "Check health of my phone numbers"
**Returns:** Spam scores, flagged numbers, recommendations

#### 6. Move Pipeline
**Usage:** "Move all 'Hot Leads' older than 7 days to 'Follow Up'"
**Returns:** Pipeline updated

#### 7. Export Data
**Usage:** "Export all leads from December to CSV"
**Returns:** Download link

#### 8. Toggle Setting
**Usage:** "Enable answer machine detection"
**Returns:** Setting updated

#### 9. Update Setting
**Usage:** "Set max concurrent calls to 25"
**Returns:** Setting changed

#### 10. Create Automation
**Usage:** "Create automation to SMS all new leads after 1 hour"
**Returns:** Automation created

#### 11. List Automations
**Usage:** "Show me all active automations"
**Returns:** List of automation rules

#### 12. Delete Automation
**Usage:** "Delete automation 'Daily SMS to Cold Leads'"
**Returns:** Automation removed

#### 13. Daily Report
**Usage:** "Generate my daily performance report"
**Returns:** Comprehensive report with wins and recommendations

#### 14. Phone Setup
**Usage:** "Help me set up phone numbers"
**Returns:** Step-by-step guided setup

#### 15. List SMS Numbers
**Usage:** "Show me all SMS-enabled numbers"
**Returns:** List of numbers with SMS capability

#### 16. Update Lead
**Usage:** "Change status of John Doe to 'Not Interested'"
**Returns:** Lead updated

#### 17. Create Campaign
**Usage:** "Create new campaign for Texas solar leads"
**Returns:** Campaign creation wizard

#### 18. Update Campaign
**Usage:** "Pause campaign 'California Solar' for 2 hours"
**Returns:** Campaign paused

#### 19. Send SMS
**Usage:** "Send SMS to Jane Smith from 555-1234"
**Returns:** Message sent

#### 20. Quarantine Number
**Usage:** "Quarantine number 555-9876 due to high spam score"
**Returns:** Number quarantined

### Advanced AI Conversations

#### Complex Queries
**System Analysis:**
```
You: "Why is my answer rate declining?"
AI: Analyzes your data, identifies:
    - Calling during poor times
    - Number health degraded
    - Lead quality dropped
    Provides specific recommendations.
```

**Strategic Planning:**
```
You: "How can I double my appointments?"
AI: Reviews performance, suggests:
    - Optimize calling times
    - Add follow-up sequences
    - Improve agent scripts
    - Use local presence
    Estimates impact of each change.
```

**Troubleshooting:**
```
You: "Campaign isn't calling leads"
AI: Checks:
    - Campaign status
    - Lead list not empty
    - Phone numbers available
    - Retell agent configured
    - Calling hours
    Identifies issue and fixes it.
```

### AI Configuration Mode

#### Guided Setup
1. Ask: **"Help me configure the system"**
2. AI asks questions:
   - What's your business?
   - What's your goal?
   - Who are you calling?
   - When do you want to call?
3. AI configures everything automatically:
   - Imports numbers
   - Creates agent
   - Sets up campaigns
   - Configures automation
4. System ready to use!

---

## Settings & Configuration

### User Profile

#### Personal Information
1. **Settings** → **"Profile"**
2. Update:
   - Name
   - Email
   - Phone
   - Company name
   - Time zone
3. **Avatar**: Upload profile picture

#### Notification Preferences
1. **Settings** → **"Notifications"**
2. Configure:
   - **Email Notifications**: Daily summary, alerts
   - **SMS Notifications**: Critical alerts only
   - **In-App**: Real-time updates
   - **Frequency**: Immediate, hourly, daily

### System Settings

#### Calling Configuration
1. **Settings** → **"Calling"**
2. **General**:
   - Max concurrent calls: 10-100
   - Calls per minute: 10-60
   - Max daily calls: No limit or set limit
3. **Compliance**:
   - FCC abandonment rate: 3% (required)
   - TCPA calling hours: 9 AM - 8 PM
   - DNC scrubbing: Enabled (required)
4. **Dialing**:
   - Predictive dialing: Enable/Disable
   - Answer machine detection: Enable/Disable
   - Local presence: Enable/Disable

#### AI Configuration
1. **Settings** → **"AI Configuration"**
2. **Autonomous Mode**:
   - Enable AI autonomy
   - Auto-execute recommendations
   - Auto-approve script changes
   - Require approval for high-priority leads
3. **Safety Limits**:
   - Max autonomous actions per day: 50
   - Decision tracking: Enabled
   - Emergency stop: Available

#### Business Hours
1. **Settings** → **"Business Hours"**
2. Set for each day:
   - **Start Time**: 9:00 AM
   - **End Time**: 6:00 PM
   - **Time Zone**: Your local time
   - **Breaks**: Lunch, etc.
   - **Days Off**: Weekends, holidays
3. System auto-respects these hours

### API Keys & Integrations

#### Retell AI Setup
1. **Settings** → **"API Keys"** → **"Retell AI"**
2. Enter **API Key** from Retell dashboard
3. Test connection
4. **Status**: Connected ✅
5. **Features Enabled**:
   - Voice agents
   - Call management
   - Calendar integration

#### Telnyx Setup
1. **Settings** → **"API Keys"** → **"Telnyx"**
2. Enter:
   - **API Key**
   - **Public Key** (for signature verification)
3. Test connection
4. **Features**:
   - Phone number purchasing
   - SMS messaging
   - Voice calls

#### Twilio Setup
1. **Settings** → **"API Keys"** → **"Twilio"**
2. Enter:
   - **Account SID**
   - **Auth Token**
3. Test connection
4. **Features**:
   - Phone numbers
   - SMS
   - Voice

### Data Management

#### Backup & Export
1. **Settings** → **"Data Management"**
2. **Full Backup**:
   - Click **"Create Backup"**
   - Downloads complete database
   - Include: Leads, calls, campaigns
3. **Scheduled Backups**:
   - Enable automatic daily backup
   - Retain 30 days

#### Import Data
1. **Settings** → **"Import"**
2. Import types:
   - **Leads**: CSV, Excel
   - **Call Logs**: CSV
   - **Contacts**: vCard
3. Map fields
4. **Conflict Resolution**:
   - Skip duplicates
   - Update existing
   - Create all

#### Data Retention
1. **Settings** → **"Data Retention"**
2. Configure:
   - **Call Logs**: 90 days, 1 year, Forever
   - **Recordings**: 30 days, 90 days, Forever
   - **SMS Messages**: 90 days, Forever
   - **Archived Leads**: Forever

---

## Integrations

### Go High Level (GHL)

#### Connecting GHL
1. **Settings** → **"Integrations"** → **"Go High Level"**
2. Click **"Connect GHL"**
3. Enter:
   - **API Key**: From GHL settings
   - **Location ID**: Your GHL location
4. Test connection
5. **Status**: Connected ✅

#### Sync Configuration
1. **Bi-Directional Sync**:
   - ✅ Push leads to GHL
   - ✅ Pull contacts from GHL
   - ✅ Sync call activity
   - ✅ Update appointment status
2. **Sync Frequency**:
   - Real-time (webhooks)
   - Every 15 minutes
   - Hourly
   - Manual
3. **Field Mapping**:
   - Map Dial Smart fields to GHL custom fields
   - Preview before syncing

### Yellowstone Integration

#### Setup
1. **Settings** → **"Integrations"** → **"Yellowstone"**
2. Enter:
   - **API Key**
   - **Organization ID**
3. Test connection

#### Features
- Import leads from Yellowstone
- Update lead status in Yellowstone
- Sync appointments
- Track activity

### Calendar Integrations

#### Google Calendar
1. **Settings** → **"Integrations"** → **"Google Calendar"**
2. Click **"Connect Google Account"**
3. Authorize access
4. Select calendar for appointments
5. **Features**:
   - AI agents book directly to calendar
   - Auto-create events
   - Send invites to leads
   - Sync availability

#### Cal.com
1. **Settings** → **"Integrations"** → **"Cal.com"**
2. Enter **API Key**
3. Select event type
4. Configure availability
5. **Features**:
   - Agents use Cal.com booking links
   - Real-time availability checking

### Airtable Integration

#### Setup
1. **Settings** → **"Integrations"** → **"Airtable"**
2. Enter:
   - **API Key**
   - **Base ID**
   - **Table Name**
3. Map fields
4. **Use Cases**:
   - Import leads from Airtable
   - Export analytics to Airtable
   - Two-way sync

### n8n Workflows

#### Webhook Integration
1. **Settings** → **"Integrations"** → **"Webhooks"**
2. **Available Webhooks**:
   - Call Started
   - Call Completed
   - Lead Created
   - Lead Updated
   - Appointment Booked
   - SMS Received
3. **Setup in n8n**:
   - Copy webhook URL
   - Create n8n workflow
   - Use webhook as trigger
   - Build custom automation

---

## Troubleshooting

### Common Issues & Solutions

#### "Campaign Not Calling"

**Possible Causes:**
1. ✅ **Campaign Paused**: Check campaign status
2. ✅ **No Leads**: Verify lead list not empty
3. ✅ **No Phone Numbers**: Check number pool
4. ✅ **Outside Hours**: Review business hours
5. ✅ **Agent Not Configured**: Verify Retell agent

**Solution:**
1. Go to campaign details
2. Check **"Health Check"** section
3. Fix issues listed
4. Click **"Resume Campaign"**

#### "Calls Not Connecting"

**Possible Causes:**
1. Numbers quarantined
2. Retell API key invalid
3. Provider account issue
4. Lead phone numbers invalid

**Solution:**
1. **Test Call**: Make test call to yourself
2. **Check API Keys**: Settings → API Keys
3. **Verify Numbers**: Phone Numbers → Check status
4. **Contact Support**: If issue persists

#### "Low Answer Rates"

**Causes & Solutions:**
1. **Calling Wrong Times**:
   → Enable Smart Scheduling
   → Review optimal times in analytics
   
2. **High Spam Scores**:
   → Check number health
   → Rotate/replace bad numbers
   
3. **Wrong Area Codes**:
   → Enable Local Presence
   → Purchase local numbers
   
4. **Poor Lead Quality**:
   → Review lead source
   → Implement lead scoring
   → Filter out bad leads

#### "Agent Not Responding"

**Possible Causes:**
1. Retell agent offline
2. LLM configuration issue
3. Webhook not receiving events

**Solution:**
1. **Test Agent**: Retell AI → Test Call
2. **Check Logs**: View recent calls
3. **Verify Webhook**: Settings → Check webhook URL
4. **Recreate Agent**: If needed, clone working agent

#### "SMS Not Sending"

**Possible Causes:**
1. Number not SMS-capable
2. Provider issue
3. Lead opted out
4. Message rejected (spam)

**Solution:**
1. **Check Number**: Must support SMS
2. **Verify Provider**: Telnyx/Twilio account active
3. **Check Opt-Out**: Lead may have stopped messages
4. **Review Message**: Avoid spam words

### Getting Help

#### In-App Support
1. Click **"Help"** icon
2. Options:
   - Search knowledge base
   - Video tutorials
   - Ask AI Assistant
   - Contact support

#### AI Assistant Help
- Ask: **"I need help with [issue]"**
- AI troubleshoots in real-time
- Provides step-by-step solutions
- Can fix many issues automatically

#### Knowledge Base
1. **Help** → **"Knowledge Base"**
2. Categories:
   - Getting Started
   - Features
   - Troubleshooting
   - Best Practices
   - API Documentation
3. Searchable
4. Always updated

#### Contact Support
**When to Contact:**
- Technical errors you can't solve
- Billing questions
- Feature requests
- Bug reports

**How to Contact:**
1. **Help** → **"Contact Support"**
2. Fill form:
   - Issue description
   - Steps to reproduce
   - Screenshots (helpful)
3. **Response Time**: 
   - Critical: <2 hours
   - Urgent: <4 hours
   - Normal: <24 hours

---

## Best Practices

### Calling Best Practices

1. **Use Local Presence**: 40% better answer rates
2. **Call During Optimal Times**: 10 AM - 2 PM, 4 PM - 6 PM
3. **Respect Time Zones**: Always call during business hours
4. **Limit Call Attempts**: 3-5 per lead before resting
5. **Space Out Attempts**: Wait 24-48 hours between calls
6. **Monitor Number Health**: Replace numbers with spam scores >70
7. **Rotate Numbers**: Don't overuse single numbers
8. **Use AMD**: Save time by filtering voicemails

### Script Best Practices

1. **Start Strong**: First 10 seconds crucial
2. **Be Conversational**: Natural, not robotic
3. **Value Proposition Early**: Why should they listen?
4. **Handle Objections**: Prepare for common push-backs
5. **Clear Call-to-Action**: What's the next step?
6. **Test & Optimize**: Use A/B testing
7. **Keep It Short**: 2-3 minutes ideal
8. **Include Personalization**: Use lead's name, context

### Lead Management Best Practices

1. **Prioritize Properly**: Focus on high-scoring leads first
2. **Follow Up Quickly**: Contact within 5 minutes if possible
3. **Use Multi-Touch**: Combine calls, SMS, email
4. **Track Everything**: Log all interactions
5. **Segment Leads**: Group by quality, interest, stage
6. **Clean Data**: Remove invalid numbers promptly
7. **Respect DNC**: Never call after opt-out
8. **Re-Engage Cold Leads**: Try again after 90 days

### Campaign Best Practices

1. **Start Small**: Test with 50-100 leads
2. **Monitor Closely**: Watch first 2 hours
3. **Adjust Quickly**: Fix issues immediately
4. **Use Compliance Checks**: Verify before launch
5. **Set Realistic Goals**: Based on industry benchmarks
6. **Review Daily**: Check performance every day
7. **Optimize Continuously**: Apply AI recommendations
8. **Scale Gradually**: Increase volume after validation

### Automation Best Practices

1. **Test Workflows**: Verify before enabling
2. **Start Simple**: Basic sequences first
3. **Monitor Results**: Check automation performance
4. **Iterate Often**: Improve based on data
5. **Use AI Suggestions**: Let system optimize
6. **Balance Automation**: Don't over-automate
7. **Have Human Touch**: Personal intervention when needed
8. **Review Decisions**: Audit AI choices

---

## Quick Reference

### Keyboard Shortcuts
- `Ctrl + /`: Open AI Assistant
- `Ctrl + K`: Search leads
- `Ctrl + N`: Create new lead
- `Ctrl + S`: Save changes
- `Ctrl + E`: Export data
- `Esc`: Close dialogs

### Status Indicators
- 🟢 **Green**: Active, healthy, good
- 🟡 **Yellow**: Warning, needs attention
- 🔴 **Red**: Error, critical, stopped
- ⚪ **Gray**: Inactive, paused, archived

### Performance Benchmarks
- **Answer Rate**: >30% good, >40% excellent
- **Conversion Rate**: >10% good, >20% excellent
- **Abandonment Rate**: <3% required (FCC compliance)
- **Call Duration**: 2-5 minutes typical
- **Lead Score**: >70 high priority

### Support Resources
- 📚 Knowledge Base: help.dialsmart.com
- 💬 AI Assistant: Always available in-app
- 📧 Email: support@dialsmart.com
- 📞 Phone: 1-800-DIAL-SMART
- 💻 Community: community.dialsmart.com

---

## Glossary

**Agent**: Retell AI voice agent that makes/receives calls
**AMD**: Answer Machine Detection
**Campaign**: Group of leads to call with specific agent and settings
**Disposition**: Category applied to call outcome
**DNC**: Do Not Call list
**FCC**: Federal Communications Commission (regulates calls)
**Lead**: Contact/prospect you want to reach
**Local Presence**: Using numbers matching lead's area code
**Pipeline**: Visual stages leads move through
**Script**: Instructions and talking points for AI agent
**Sequence**: Multi-step automated follow-up workflow
**TCPA**: Telephone Consumer Protection Act
**Webhook**: Automated notification when events occur

---

**Need Help?** Ask the AI Assistant: "Help me with [your question]"

**Last Updated**: December 25, 2024
**Version**: 1.0
**Status**: ✅ Production Ready
