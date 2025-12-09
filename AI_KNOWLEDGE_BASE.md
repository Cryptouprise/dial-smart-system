# Smart Dialer AI Knowledge Base

This document serves as the comprehensive knowledge base for the AI Assistant. It contains complete information about all features, capabilities, and usage instructions for the Smart Dialer platform.

## Recent Platform Enhancements (Latest Updates)

### NEW: Voice Broadcast System
**Features:**
- Mass voice broadcasts with ElevenLabs text-to-speech
- Interactive IVR with DTMF actions (press 1, press 2, etc.)
- Quick test broadcast for immediate sending
- Full campaign management with lead selection
- Configurable calling rates (calls per minute)
- Multiple DTMF action types: transfer, callback, DNC, replay, voicemail

**DTMF Actions:**
- Press 1: Transfer to live agent (requires transfer number)
- Press 2: Schedule callback (configurable delay in hours)
- Press 3: Add to Do Not Call list
- Custom actions can be configured per campaign

**Usage:**
- Navigate to Voice Broadcast section
- Use Quick Test for immediate single calls
- Create campaigns for mass broadcasts
- Configure IVR prompts and actions
- Add leads and start broadcasting
- Monitor delivery status and responses

### NEW: VICIdial Integration
**Features:**
- Native integration with VICIdial contact center platform
- Agent API support: dial, hangup, status, pause operations
- Non-Agent API for lead management and administration
- Hybrid AI-human workflows without platform migration
- Real-time agent control and monitoring
- Campaign and disposition synchronization

**Configuration:**
- Server URL, API credentials required
- Agent API or Non-Agent API mode selection
- Default agent and campaign configuration
- Connection testing before activation

**Use Cases:**
- AI pre-qualifies leads, transfers to VICIdial agents
- Gradual AI adoption without disrupting existing operations
- Enterprise deployments with established VICIdial infrastructure
- Hybrid workforce management

**Agent Control Functions:**
- external_dial: Initiate outbound calls through agents
- external_hangup: Terminate active calls
- external_status: Set call dispositions
- external_pause: Pause/resume agents with reason codes
- external_add_lead: Add leads to VICIdial lists
- external_update_lead: Update existing lead information

### NEW: Real-Time Agent Coaching
**Features:**
- AI-powered coaching prompts during live calls
- 6 prompt types: suggestions, objections, compliance, next-actions, script, warnings
- Priority-based notification system (high/medium/low)
- Configurable prompt intervals (default 15 seconds)
- Call duration tracking
- Prompt acknowledgment and action tracking
- Historical prompt analysis

**Prompt Types:**
1. **Suggestions**: Rapport building, timing recommendations, conversation flow
2. **Objection Handling**: Pre-loaded responses for common objections
3. **Compliance**: TCPA/CCPA reminders, disclosure requirements
4. **Next Actions**: Buying signals detected, move-to-close suggestions
5. **Script Guidance**: Value propositions, key talking points
6. **Warnings**: Risky language alerts (income guarantees, false claims)

**Impact:**
- 15-25% agent performance improvement
- Reduced training time for new agents
- Consistent quality across all agents
- Real-time compliance enforcement
- Turns average agents into top performers

### NEW: Agent Benchmarking & Ranking
**Features:**
- Multi-metric performance scoring algorithm
- 6 weighted scoring factors:
  * Conversion Rate (30%)
  * Transfer Success (20%)
  * Compliance (15%)
  * Objection Handling (15%)
  * Script Adherence (10%)
  * Customer Sentiment (10%)
- 4-tier ranking system: Elite, Advanced, Proficient, Developing
- Real-time leaderboard with trend indicators
- Detailed performance profiles for each agent
- Automatic lead routing based on agent rank
- Strengths and improvement identification

**Ranking Tiers:**
- 🏆 Elite (85-100): High-value leads, complex situations
- 🔵 Advanced (70-84): Standard qualified leads
- 🟢 Proficient (55-69): General leads and follow-ups
- ⚪ Developing (0-54): Training leads with AI coaching

**Smart Routing:**
- High-value leads automatically routed to Elite agents
- New agents get practice opportunities with lower-tier leads
- Performance-based optimization without manual intervention
- 10-20% conversion improvement on high-value leads

**Metrics Tracked:**
- Total and answered calls
- Transfer success rate
- Conversion rate
- Average call duration
- Talk-to-listen ratio
- Objection handling score
- Script adherence percentage
- Compliance score
- Customer sentiment rating

### 1. Advanced Predictive Dialing Engine
**Features:**
- Real-time FCC compliance monitoring (3% abandonment rate limit)
- Automatic campaign pause on compliance violations
- TCPA-compliant calling hours with timezone awareness
- DNC list verification before every call
- Compliance checks every minute with overlap prevention

**Usage:**
- Compliance status visible in campaign manager
- Automatic enforcement requires no manual intervention
- Review compliance logs in campaign history
- Adjust dialing ratios to maintain compliance

### 2. Intelligent Lead Prioritization
**5-Factor Scoring Algorithm:**
- Recency (20%): How recently lead was added
- Call History (25%): Previous interaction quality
- Time Optimization (15%): Best time to call based on timezone
- Response Rate (15%): Historical response patterns
- Priority Level (25%): Manual priority setting (1-5)
- Callback Boost: 30% additional priority for scheduled callbacks

**How It Works:**
- Scores calculated automatically for all leads
- Highest scoring leads called first
- Scores update after each call attempt
- Parallel database updates for efficiency

### 3. Campaign Optimization Engine
**6-Metric Health Scoring:**
- Answer Rate (25% weight)
- Conversion Rate (30% weight)
- Lead Quality (15% weight)
- Agent Performance (15% weight)
- Compliance Status (10% weight)
- Efficiency Score (5% weight)

**Auto-Adjustments:**
- Calling hours optimized from performance data
- Dialing rates tuned for compliance/efficiency balance
- Real-time performance-based recommendations

### 4. Pipeline Analytics & Bottleneck Detection
**Capabilities:**
- Real-time bottleneck identification
- Stage-by-stage performance metrics
- Lead velocity tracking (time in each stage)
- Conversion and drop-off rate analysis
- Actionable AI-generated recommendations
- Visual pipeline health dashboard

### 5. Comprehensive Disposition Automation
**12 Standard Dispositions with Sentiment Tracking:**

Negative Dispositions:
- Wrong Number: Invalid contact information
- Not Interested: Lead declined offer
- Already Has Solar: Not qualified prospect

Neutral Dispositions:
- Potential Prospect: Requires nurturing
- Follow Up: General follow-up needed
- Not Connected: Call didn't reach lead
- Voicemail: Message left
- Dropped Call: Call disconnected
- Dial Tree Workflow: In automated process

Positive Dispositions:
- Hot Lead: High interest, immediate action needed
- Interested: Showed interest, needs follow-up
- Appointment Booked: Scheduled meeting

**Automation Features:**
- Automatic lead status updates based on sentiment
- Pipeline stage auto-creation and movement
- Configurable disposition rules
- Callback scheduling (default 24 hours, adjustable)
- Follow-up sequence initiation
- Custom disposition creation available

### 6. Multi-Step Follow-up Sequences
**5 Action Types:**
- AI Phone Call: Automated calls via Retell AI
- AI SMS: AI-generated text messages based on context
- Manual SMS: Predefined message templates
- Email: Automated email communications
- Wait: Delay steps for proper pacing

**Configuration:**
- Configurable delays between steps (in minutes)
- AI prompts for intelligent conversations
- Message templates for consistency
- Sequence assignment to pipeline stages
- Real-time execution tracking

**Best Practices:**
- Start with immediate action (SMS or email)
- Space calls appropriately (24-48 hours)
- Limit sequence length (3-5 steps optimal)
- Include wait steps for pacing

### 7. Comprehensive Call Tracking
**Tracked Information:**
- Total calls made to each lead
- All call timestamps (complete history)
- Last call date and time
- Total and average call duration
- Outcomes breakdown by type
- Dispositions applied per call
- Recording URLs and transcripts

**Visibility:**
- Integrated throughout platform
- Campaign Lead Manager: Quick stats
- Pipeline Views: Call history in cards
- Lead Details: Complete timeline
- AI Manager: Stats for recommendations

### 8. AI Pipeline Manager
**Virtual Sales Manager Capabilities:**
- Complete lead analysis based on call history
- Priority ranking (high/medium/low)
- Specific recommendations with reasoning
- Next best action suggestions (call/SMS/email/wait)
- Daily action plan generation
- Success tracking and learning

**Intelligence Factors:**
- Call frequency and recency
- Call outcomes and patterns (positive vs negative)
- Lead status and qualification level
- Time since last contact
- Scheduled callbacks
- Engagement trends

**Recommendation Examples:**
- NEW LEAD: Make first contact to introduce and qualify
- HOT LEAD: Strike while iron is hot - close the deal!
- URGENT: Re-engage this lead before they go cold
- LOW PRIORITY: Recent contact - give them time to respond
- FOLLOW-UP: Scheduled callback due today
- ALTERNATIVE APPROACH: Try SMS after multiple no-answers

**Daily Action Plan Categories:**
- High Priority: Must-handle today (hot leads, overdue callbacks)
- Calls Today: Scheduled and recommended calls
- Follow-ups: Actions due in 24-48 hours
- Nurture: Low priority, long-term engagement

### 9. Autonomous Agent System
**Configuration Options:**
- Autonomous Mode: Master toggle for AI autonomy
- Auto-Execute Recommendations: AI executes without approval
- Auto-Approve Script Changes: AI updates scripts based on performance
- High Priority Protection: Require manual approval for critical leads
- Daily Action Limits: Maximum autonomous actions/day (default: 50)
- Decision Tracking: Log all AI decisions

**Decision Tracking:**
- Every decision logged with full context
- Lead name and action type recorded
- Reasoning behind each decision documented
- Execution timestamp tracked
- Success/failure status monitored
- Autonomous vs manual distinction
- Complete history available in Decision History tab

**Script Performance Monitoring:**
- Performance scoring (0-100 scale)
- Conversion rate tracking
- Positive vs negative outcome analysis
- Usage statistics and trends
- Average call duration (for call scripts)
- Continuous monitoring with alerts

**AI Script Optimization:**
- Automatic performance monitoring
- AI-generated improvement suggestions when:
  * Performance score < 70 with 10+ uses
  * Conversion rate < 20%
  * More negative than positive outcomes
  * Very short calls (< 60 seconds)
- Data-backed reasoning provided
- Expected improvement calculations
- Manual or autonomous application
- Version control and A/B testing support

**Safety Features:**
- Daily limits prevent runaway automation
- High-priority lead protection
- All decisions tracked for accountability
- Easy emergency off switch
- Granular control over each feature
- Real-time monitoring dashboard

### 10. Smooth Execution Flow
**Manual Mode:**
1. AI generates recommendations
2. User reviews suggestions
3. Click "Execute Action" button
4. Decision logged automatically
5. Results tracked for analysis
6. Success/failure recorded

**Autonomous Mode:**
1. AI analyzes leads continuously
2. Evaluates recommendations against rules
3. Automatically executes approved actions
4. Logs all decisions for review
5. Respects daily limits and priority rules
6. Monitors outcomes and learns

## How to Use These Features

### Enabling Autonomous Mode:
1. Navigate to Dashboard > AI Manager tab
2. Click the "Settings" button in the header
3. Toggle "Autonomous Mode" ON
4. Configure additional settings:
   - Auto-Execute Recommendations (for hands-free operation)
   - Auto-Approve Script Changes (for automatic optimization)
   - High Priority Protection (safety for important leads)
   - Daily Action Limits (prevent overuse)
5. Monitor operations in Decision History tab

### Creating Disposition Automation:
1. Go to Dashboard > Dispositions tab
2. Click "Initialize Standard Dispositions" for quick setup
3. Or create custom dispositions:
   - Click "Create Disposition"
   - Set name, description, and sentiment
   - Configure rules: callback delay, sequence, pipeline stage
   - Enable auto-create pipeline stage if desired
4. Apply dispositions during/after calls
5. System automatically executes configured actions

### Building Follow-up Sequences:
1. Navigate to Dispositions > Follow-up Sequences tab
2. Click "Create Sequence"
3. Name the sequence descriptively
4. Add steps:
   - Choose action type (AI Call, AI SMS, Manual SMS, Email, Wait)
   - Set delay before step (in minutes)
   - Write AI prompts or message templates
5. Assign sequence to pipeline stages or dispositions
6. Enable and monitor execution

### Using AI Pipeline Manager:
1. Go to Dashboard > AI Manager tab
2. Click "Analyze Pipeline" to run full analysis
3. Review recommendations in "AI Recommendations" tab
4. For each lead, see:
   - Priority level (high/medium/low)
   - Specific recommendation with reasoning
   - Suggested actions to take
   - Next best action with timing
5. Execute actions:
   - Manual: Click "Execute Action" button
   - Autonomous: Happens automatically if enabled
6. Generate Daily Action Plan for prioritized tasks

### Monitoring Call History:
- View in Campaign Lead Manager: Quick stats per lead
- Check Pipeline Views: Call history in lead cards
- Review Lead Details: Complete call timeline
- Analyze in AI Manager: Stats inform recommendations
- Export from Analytics Dashboard: Aggregate statistics

## AI Assistant Commands

The AI Assistant can understand and execute these types of requests:

### System Settings:
- "Enable/disable autonomous mode"
- "Turn on AMD" (Answering Machine Detection)
- "Set AMD sensitivity to high"
- "Enable local presence dialing"
- "Set daily call limit to 100"
- "Enable timezone compliance"

### Campaign Management:
- "Create a new campaign called [name]"
- "Pause campaign [name]"
- "Start campaign [name]"
- "Show me campaign performance"
- "How many calls were made today?"

### Lead Management:
- "Import phone number [number]"
- "Update lead status for [name]"
- "Show top leads"
- "How many appointments were booked?"

### Analytics & Reporting:
- "Generate daily report"
- "What's our answer rate?"
- "Show SMS analytics"
- "Analyze call outcomes"

### Automation:
- "Create automation rule for weekday mornings"
- "Schedule calls between 9 AM - 5 PM"
- "Set max calls per day to 50"

### Messaging:
- "Send SMS to [number] saying [message]"
- "Show recent SMS conversations"
- "What's our SMS response rate?"

## Technical Integration Points

### Database Schema:
- `campaigns`: Campaign configurations and settings
- `leads`: Contact information and lead management
- `call_logs`: Detailed call records with outcomes
- `phone_numbers`: Number pool with spam tracking
- `campaign_leads`: Junction table for many-to-many
- `dispositions`: Custom disposition definitions
- `disposition_rules`: Automation rules per disposition
- `follow_up_sequences`: Sequence definitions
- `sequence_steps`: Individual steps within sequences
- `scheduled_follow_ups`: Queue of pending actions
- `autonomous_settings`: User autonomous preferences
- `agent_decisions`: Complete decision audit trail
- `script_suggestions`: AI-generated improvements
- `script_usage_logs`: Performance tracking

### API Endpoints:
- `/api/campaigns`: CRUD operations for campaigns
- `/api/leads`: Lead management and import
- `/api/calls`: Call logging and retrieval
- `/api/analytics`: Performance metrics
- `/functions/ai-assistant`: AI chat interface
- `/functions/automation-scheduler`: Background automation

### Integrations:
- Retell AI: Voice AI conversations
- Twilio: Phone number management and calling
- Go High Level: CRM synchronization
- Yellowstone: Additional CRM integration
- Supabase: Backend database and auth

## Compliance & Best Practices

### FCC Compliance:
- Always maintain < 3% abandonment rate
- Respect calling hours (8 AM - 9 PM local time)
- Check DNC list before every call
- Honor timezone differences
- Keep detailed call logs

### Lead Management:
- Prioritize high-value leads
- Follow up within 24-48 hours
- Use appropriate communication channels
- Respect opt-out requests immediately
- Maintain data accuracy

### Script Optimization:
- Monitor performance continuously
- Test improvements before full rollout
- A/B test different approaches
- Update based on data, not assumptions
- Keep scripts compliant and professional

### Autonomous Operation:
- Start with manual mode to understand system
- Gradually enable autonomous features
- Monitor decision history regularly
- Set appropriate daily limits
- Keep high-priority protection enabled
- Review and adjust based on results

## Troubleshooting

### Autonomous Mode Not Working:
- Check if autonomous mode is enabled in settings
- Verify daily action limit not reached
- Ensure recommendations exist (run "Analyze Pipeline")
- Check Decision History for errors
- Review high priority protection settings

### Dispositions Not Triggering:
- Verify disposition rules are configured
- Check if auto-create pipeline stage is needed
- Ensure follow-up sequences are enabled
- Review scheduled follow-ups tab for queued actions
- Check execution logs for errors

### Script Suggestions Not Appearing:
- Ensure scripts have sufficient usage (10+ uses)
- Check if performance score is < 70
- Verify Auto-Approve Script Changes setting
- Review Script Optimizer tab for suggestions
- Manually trigger "Generate Suggestions"

### Call Tracking Not Showing:
- Confirm calls are being logged in call_logs table
- Check lead ID mapping is correct
- Verify user permissions for data access
- Review database connection status
- Check for filtering that may hide data

## System Capabilities Summary

This platform now provides:
✅ Fully automated FCC compliance enforcement
✅ Intelligent lead prioritization and scoring
✅ Autonomous campaign optimization
✅ Comprehensive disposition automation
✅ Multi-step follow-up sequences
✅ Complete call history and analytics
✅ AI-powered pipeline management
✅ Autonomous agent with decision tracking
✅ Script performance monitoring and optimization
✅ Real-time bottleneck detection
✅ Smooth manual to autonomous transition
✅ Complete audit trail of all actions
✅ Safety controls and emergency stops
✅ Integration with all major calling/CRM systems

The system is production-ready for running campaigns with minimal human oversight while maintaining full compliance and maximizing conversion rates.
