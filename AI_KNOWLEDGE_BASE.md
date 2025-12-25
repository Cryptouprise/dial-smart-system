# Smart Dialer AI Knowledge Base

This document serves as the comprehensive knowledge base for the AI Assistant. It contains complete information about all features, capabilities, and usage instructions for the Smart Dialer platform.

## 🆕 CRITICAL NEW FEATURE: Agent Performance Analytics (December 2024)

### Retell Agent Performance Tracking
**BREAKTHROUGH FEATURE - Analytics Now Connected to Retell Agents!**

The system now tracks performance for each individual Retell AI agent, enabling continuous improvement and data-driven agent optimization.

**What's New:**
- Every call logs which Retell agent was used
- Automatic performance metrics calculated per agent
- Real-time agent rankings and comparisons
- Agent-specific optimization recommendations
- Performance trends tracked over time
- Script success tied to specific agents

**Per-Agent Metrics Tracked:**
1. **Total Calls**: All-time and recent call volume
2. **Success Rate**: % of calls achieving goal
3. **Conversion Rate**: % of calls resulting in appointments
4. **Average Call Duration**: Typical call length in minutes
5. **Sentiment Score**: Average emotional tone (0-100)
6. **Appointment Booking Rate**: % of successful bookings
7. **Common Objections**: Most frequent concerns raised
8. **Best Performing Scripts**: Which scripts work best for each agent

**How to Access:**
- Dashboard: "Retell AI" → "Agent Analytics"
- View: Individual agent performance or compare multiple agents
- Export: Download agent performance reports
- AI Assistant: Ask "Show me agent performance" or "Compare my agents"

**Use Cases:**
1. **Identify Top Performers**: See which agents convert best
2. **Clone Success**: Replicate high-performing agent configurations
3. **Optimize Underperformers**: Get specific recommendations to improve weak agents
4. **A/B Testing**: Compare different agent approaches scientifically
5. **ROI Tracking**: Understand which agents generate best results
6. **Script Attribution**: Know which scripts work with which agents

**Agent Comparison View:**
```
Agent A          Agent B          Agent C
1000 calls       800 calls        1200 calls
45% success      38% success      51% success
3:45 avg time    4:20 avg time    3:10 avg time
4.2 sentiment    3.8 sentiment    4.5 sentiment

Insight: Agent C is most efficient with highest success rate
Recommendation: Clone Agent C configuration for all agents
```

**Automatic Updates:**
- Metrics update after every call automatically
- No manual tracking required
- Historical data preserved
- Trends calculated continuously
- Alerts when performance changes significantly

**Integration with ML Learning:**
- Agent performance feeds into ML learning engine
- System learns what makes agents successful
- Recommendations improve over time
- Continuous optimization without manual intervention

**For AI Assistant Usage:**
- Can now answer: "Which agent performs best?"
- Can now answer: "Why is Agent A underperforming?"
- Can now answer: "Show me agent trends this week"
- Can now take action: "Optimize Agent B based on Agent A"

## Recent Platform Enhancements (Latest Updates)

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

### Agent Performance Not Updating:
- Verify agent_id is being captured in calls
- Check retell-call-webhook is receiving events
- Ensure agent_performance_metrics table exists
- Review trigger function logs
- Manually refresh analytics dashboard

## Complete System Capabilities

### 🎯 Core Calling Features
1. **AI Voice Agents (Retell AI)**
   - 50+ human-like voices
   - Natural conversation handling
   - Appointment booking capability
   - Calendar integration (Google, Cal.com)
   - Objection handling
   - 24/7 availability

2. **Predictive Dialing Engine**
   - Multi-line simultaneous calling
   - AI-optimized dialing ratios (1.5-3.5x)
   - FCC compliance monitoring (<3% abandonment)
   - Answer Machine Detection (AMD)
   - Local presence dialing (+40% answer rates)
   - Time zone compliance (TCPA)

3. **Campaign Management**
   - Unlimited campaigns
   - Lead import (CSV, CRM, manual)
   - Real-time monitoring
   - Performance analytics
   - Auto-optimization
   - Pause/resume controls
   - Clone campaigns

### 📊 Analytics & Intelligence
4. **Agent Performance Analytics** ⭐ NEW
   - Per-agent metrics tracking
   - Success rate calculations
   - Conversion rate monitoring
   - Call duration analysis
   - Sentiment scoring
   - Agent comparison tools
   - Performance trends
   - Optimization recommendations

5. **Script Performance Tracking**
   - Performance scoring (0-100)
   - Success rate monitoring
   - Usage statistics
   - Sentiment analysis
   - A/B testing support
   - Automatic optimization suggestions
   - Version control

6. **Pipeline Analytics**
   - Bottleneck detection
   - Stage-by-stage metrics
   - Conversion funnel analysis
   - Lead velocity tracking
   - Drop-off identification
   - AI recommendations

7. **Campaign Analytics**
   - Health scoring
   - ROI tracking
   - Cost per appointment
   - Answer rate trends
   - Best time to call analysis
   - Lead quality scoring

### 🤖 Automation & AI
8. **Autonomous Agent System**
   - Auto-executes recommendations
   - Self-optimizing scripts
   - Intelligent lead prioritization
   - Automatic disposition application
   - Decision tracking & learning
   - Safety controls & limits

9. **Auto-Dispositions**
   - AI analyzes call transcripts
   - Automatic categorization
   - Confidence scoring
   - Learning from corrections
   - Trigger-based actions
   - Pipeline stage movement

10. **Follow-Up Sequences**
    - Multi-step automation (calls, SMS, email)
    - AI-generated messages
    - Time-based delays
    - Trigger-based activation
    - Success tracking
    - Template library

11. **Smart Scheduling**
    - Optimal time prediction
    - Time zone awareness
    - Callback management
    - Calendar integration
    - Reminder automation

### 📱 Communication Channels
12. **SMS Messaging**
    - Two-way conversations
    - AI message generation
    - Template library
    - Bulk broadcasting
    - Opt-out management
    - Time restrictions

13. **Email Integration**
    - Automated emails
    - Template system
    - Personalization
    - Open/click tracking
    - Sequence integration

### 📞 Phone Number Management
14. **Number Pool System**
    - Purchase from providers (Telnyx, Twilio)
    - Import existing numbers
    - Local presence pools
    - Spam score monitoring
    - Automatic rotation
    - Quarantine system
    - Health tracking

15. **Number Health**
    - Spam score tracking (0-100)
    - Auto-quarantine (score >80)
    - Cooling period management
    - Usage analytics
    - Carrier compliance

### 👥 Lead Management
16. **Lead Scoring**
    - 5-factor algorithm
    - Automatic calculation (0-100)
    - Real-time updates
    - Callback boost (+30%)
    - Priority-based calling

17. **Pipeline Management**
    - Visual Kanban board
    - Drag-and-drop interface
    - Auto-stage movement
    - Custom stages
    - Stage-based automation
    - Time tracking

18. **Lead Import/Export**
    - CSV upload/download
    - CRM integration (GHL, Yellowstone)
    - Airtable sync
    - Manual entry
    - Bulk operations
    - Data validation

### 🔌 Integrations
19. **Retell AI**
    - Full API integration
    - Agent management
    - LLM configuration
    - Voice selection
    - Calendar integration
    - Webhook handling

20. **Multi-Carrier Support**
    - Retell AI (voice agents)
    - Telnyx (numbers, SMS, voice)
    - Twilio (numbers, SMS, voice)
    - Intelligent routing
    - STIR/SHAKEN compliance

21. **CRM Integrations**
    - Go High Level (GHL)
    - Yellowstone
    - Airtable
    - Bi-directional sync
    - Field mapping
    - Real-time updates

22. **Calendar Systems**
    - Google Calendar
    - Cal.com
    - Availability checking
    - Automatic booking
    - Reminder system

23. **Automation Platforms**
    - n8n workflows
    - Webhook support
    - Custom integrations
    - Event triggers

### 🛡️ Compliance & Security
24. **FCC/TCPA Compliance**
    - <3% abandonment enforcement
    - 8 AM-9 PM calling hours
    - DNC list management
    - Consent tracking
    - Call recording notices
    - Audit trails

25. **Data Security**
    - Encrypted storage
    - Access controls
    - Role-based permissions
    - Backup systems
    - Data retention policies
    - GDPR/CCPA compliance

### 📈 Reporting
26. **Built-in Reports**
    - Daily summaries
    - Weekly performance
    - Monthly analysis
    - Campaign reports
    - Agent reports
    - Custom reports

27. **Data Export**
    - CSV, Excel, JSON formats
    - Complete data export
    - Call logs
    - Lead database
    - Analytics data
    - Scheduled exports

### 💬 AI Assistant
28. **Conversational AI**
    - 20+ integrated tools
    - Natural language understanding
    - Voice input/output
    - Context awareness
    - Action execution
    - Guided setup

29. **AI Tools Available**
    - Get Stats
    - Search Leads
    - Bulk Update
    - Schedule Callback
    - Number Health Check
    - Move Pipeline
    - Export Data
    - Toggle/Update Settings
    - Create/Manage Automations
    - Daily Reports
    - Phone Setup
    - List SMS Numbers
    - Update Lead
    - Create/Update Campaign
    - Send SMS
    - Quarantine Number
    - Agent Performance (NEW)
    - Compare Agents (NEW)
    - Script Optimization (NEW)

### 🎓 Support & Learning
30. **Documentation**
    - Complete User Guide (COMPLETE_USER_GUIDE.md)
    - How-To Guide (HOW_TO_USE_EVERYTHING.md)
    - Feature Documentation (FEATURES.md)
    - Integration Guides (PROVIDER_INTEGRATION.md)
    - Predictive Dialing Guide (PREDICTIVE_DIALING_GUIDE.md)
    - Disposition Guide (DISPOSITION_AUTOMATION_GUIDE.md)

31. **Help System**
    - In-app help
    - Video tutorials
    - Knowledge base
    - AI Assistant guidance
    - Email support
    - Phone support
    - Community forum

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
✅ **Per-Agent Performance Analytics** ⭐ NEW
✅ **Agent Comparison & Optimization** ⭐ NEW
✅ **Analytics-Retell Feedback Loop** ⭐ NEW

## How the System Gets Smarter Every Day

### Continuous Learning Loop:
1. **Calls Made** → System logs agent_id, script used, outcome
2. **Data Collection** → Metrics calculated per agent and script
3. **Performance Analysis** → AI identifies patterns and trends
4. **Recommendations Generated** → Specific improvements suggested
5. **Optimization Applied** → Best practices replicated across system
6. **Results Tracked** → Confirm improvements worked
7. **Cycle Repeats** → Continuous improvement

### What Gets Better:
- Agent performance (track best agents)
- Script effectiveness (identify winning scripts)
- Calling strategies (learn optimal times)
- Disposition accuracy (improve auto-categorization)
- Lead scoring (refine prediction model)
- Sequence timing (optimize follow-up delays)
- Number health (maintain caller ID reputation)

### Evidence of Learning:
- Performance trends show improvement over time
- Success rates increase week-over-week
- Conversion rates climb month-over-month
- Cost per appointment decreases
- Answer rates improve with local presence
- Agent efficiency increases with script optimization

The system is production-ready for running campaigns with minimal human oversight while maintaining full compliance and maximizing conversion rates.

## For AI Assistant: Key Information Sources

When answering user questions, refer to these resources:
1. **COMPLETE_USER_GUIDE.md** - Step-by-step instructions for all features
2. **HOW_TO_USE_EVERYTHING.md** - Detailed capabilities and use cases
3. **FEATURES.md** - Comprehensive feature list
4. **This file** - System knowledge and recent updates
5. **Database Tables**:
   - `agent_performance_metrics` - Per-agent performance data
   - `script_performance_analytics` - Script performance data
   - `ml_learning_data` - Learning system data
   - `call_logs` - All call records (now includes agent_id)
   - `leads` - All lead data and scores
   - `campaigns` - Campaign configurations
   - `pipeline_stages` - Pipeline configuration

When user asks "how do I...", search COMPLETE_USER_GUIDE.md
When user asks "what can...", search HOW_TO_USE_EVERYTHING.md and FEATURES.md
When user asks "why is...", analyze data and provide insights
When user asks about agents, use agent_performance_metrics table
When user asks about scripts, use script_performance_analytics table

**Last Updated**: December 25, 2024
**Version**: 2.0 (Added Agent Performance Analytics)
**Status**: ✅ Production Ready with Enhanced Intelligence
