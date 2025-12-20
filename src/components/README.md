# Components Directory Structure

This directory contains all React components organized by functional category for better maintainability and navigation.

## Directory Organization

### 📁 `/ai` - AI & Machine Learning Components
AI assistants, decision engines, and intelligent automation features.
- AIAssistantChat - Main AI chat assistant interface
- AIBrainChat - Advanced AI brain system
- AIDecisionEngine - AI-powered decision making
- AIErrorBoundary - Error handling for AI components
- AIErrorPanel - AI error display
- AIPipelineManager - AI pipeline management
- AIWorkflowGenerator - AI-driven workflow generation

### 📁 `/analytics` - Analytics & Monitoring
Performance monitoring, reporting, and analytics dashboards.
- AgentActivityDashboard - Agent performance monitoring
- AgentActivityWidget - Agent activity summary widget
- CallAnalytics - Call metrics and analysis
- DailyReports - Daily performance reports
- ReachabilityDashboard - Contact reachability analytics
- SystemHealthCheck - System health verification
- SystemHealthDashboard - Overall system health monitoring
- TodayPerformanceCard - Today's performance snapshot

### 📁 `/automation` - Automation & Workflows
Workflow builders, automation engines, and follow-up systems.
- AutomationEngine - Core automation engine
- AutomationTimeline - Automation execution timeline
- DispositionAutomationManager - Automated disposition handling
- FollowUpScheduler - Automated follow-up scheduling
- WorkflowABTesting - A/B testing for workflows
- WorkflowBuilder - Visual workflow builder
- WorkflowPreview - Workflow preview interface
- WorkflowTester - Workflow testing tools

### 📁 `/campaigns` - Campaign Management
Campaign creation, monitoring, and optimization tools.
- CampaignAutomation - Campaign automation rules
- CampaignCallActivity - Campaign call activity tracking
- CampaignLauncher - Campaign launch interface
- CampaignLeadManager - Campaign-specific lead management
- CampaignManager - Main campaign management interface
- CampaignPhonePool - Campaign phone number pools
- CampaignReadinessChecker - Pre-launch campaign validation
- CampaignResultsDashboard - Campaign results and metrics
- CampaignSetupWizard - Step-by-step campaign setup
- CampaignWizard - Quick campaign creation wizard
- CampaignWorkflowEditor - Campaign workflow customization
- LiveCampaignMonitor - Real-time campaign monitoring
- LiveCampaignStatusMonitor - Live campaign status
- QuickTestCampaign - Campaign testing tools

### 📁 `/communication` - Communication Tools
SMS, voice broadcasting, and call management.
- AiSmsAgentGenerator - AI-powered SMS agent creation
- AiSmsConversations - AI SMS conversation management
- BroadcastQueueManager - Broadcast queue management
- BroadcastReadinessChecker - Broadcast validation
- CallCenter - Call center interface
- CallSimulator - Call simulation for testing
- LiveCallMonitor - Real-time call monitoring
- QuickTestBroadcast - Broadcast testing tools
- SmsMessaging - SMS messaging interface
- VoiceBroadcastManager - Voice broadcast management

### 📁 `/core` - Core/Shared Components
Essential system-wide components and navigation.
- AgentEditDialog - Agent editing dialog
- AlertSystem - System-wide alerts
- AuthPage - Authentication page
- BudgetManager - Budget tracking and management
- ChatbotSettings - Chatbot configuration
- Dashboard - Main dashboard
- DashboardSidebar - Dashboard navigation sidebar
- HelpSystem - In-app help system
- NavLink - Navigation link component
- Navigation - Main navigation component
- QuickStartCards - Quick start guide cards
- ReadinessFixDialogs - System readiness fixes
- ScriptManager - Script management interface
- TabErrorBoundary - Tab-level error boundaries
- ThemeToggle - Dark/light mode toggle

### 📁 `/dialing` - Dialing & Phone Management
Predictive dialing, concurrency, and phone number management.
- AdvancedDialerSettings - Advanced dialer configuration
- ConcurrencyMonitor - Concurrent call monitoring
- DialingAnalytics - Dialing performance analytics
- DialingPerformanceDashboard - Dialing performance overview
- IntelligentPacingPanel - Intelligent call pacing
- NumberPoolManager - Phone number pool management
- NumberRotationManager - Number rotation strategies
- PhoneNumberClassifier - Number classification system
- PhoneNumberPurchasing - Number purchasing interface
- PhoneNumberRow - Phone number display component
- PredictiveDialingDashboard - Predictive dialing overview
- PredictiveDialingEngine - Core predictive dialing engine
- RotationHistory - Number rotation history
- SmartRetryPanel - Intelligent retry strategies

### 📁 `/integrations` - Third-Party Integrations
CRM, calendar, and provider integrations.
- CalendarIntegrationManager - Calendar system integration
- GoHighLevelManager - GoHighLevel CRM integration
- ProviderManagement - Provider account management
- RetellAIManager - Retell AI integration
- RetellAISetupWizard - Retell AI setup wizard
- RetellBusinessVerification - Retell business verification
- RetellCalendarSetup - Retell calendar configuration
- SipTrunkManager - SIP trunk management
- TwilioNumbersOverview - Twilio numbers dashboard
- YellowstoneManager - Yellowstone CRM integration

### 📁 `/leads` - Lead Management
Lead tracking, scoring, and pipeline management.
- EnhancedLeadManager - Advanced lead management
- LeadActivityTimeline - Lead interaction timeline
- LeadDetailDialog - Detailed lead information dialog
- LeadManager - Main lead management interface
- LeadScoreIndicator - Visual lead score indicator
- LeadScoringSettings - Lead scoring configuration
- LeadUpload - Bulk lead upload interface
- LowScoreAutomation - Low-score lead automation
- PipelineAnalyticsDashboard - Pipeline performance analytics
- PipelineKanban - Visual pipeline kanban board

### 📁 `/security` - Security & Compliance
Spam detection, rate limiting, and compliance monitoring.
- EnhancedSpamDashboard - Comprehensive spam monitoring
- RateLimitingSettings - Rate limit configuration
- SpamDetectionManager - Spam detection management

### 📁 `/ui` - UI Components
Reusable UI components from shadcn/ui library (buttons, cards, dialogs, etc.)

### 📁 `/ai-configuration` - AI Configuration
AI system setup and configuration wizards.

### 📁 `/TranscriptAnalyzer` - Transcript Analysis
Call transcript analysis components.

## Import Examples

### Before (Old Structure)
```typescript
import Dashboard from '@/components/Dashboard';
import CampaignManager from '@/components/CampaignManager';
import LeadManager from '@/components/LeadManager';
```

### After (New Structure)
```typescript
import Dashboard from '@/components/core/Dashboard';
import CampaignManager from '@/components/campaigns/CampaignManager';
import LeadManager from '@/components/leads/LeadManager';
```

### Using Barrel Exports (Recommended)
```typescript
// Import multiple components from the same category
import { 
  CampaignManager, 
  CampaignWizard, 
  LiveCampaignMonitor 
} from '@/components/campaigns';
```

## Benefits of This Organization

1. **Better Navigation**: Find components faster based on their functional area
2. **Improved Maintainability**: Related components are grouped together
3. **Clearer Dependencies**: Understand component relationships at a glance
4. **Easier Onboarding**: New developers can quickly understand the system structure
5. **Scalability**: Easy to add new components in the right category
6. **No Functionality Loss**: All imports have been updated automatically

## Guidelines for Adding New Components

1. Determine the primary function of your component
2. Place it in the most appropriate category directory
3. Update the category's `index.ts` barrel export file
4. Document the component's purpose in this README
5. If a component doesn't fit existing categories, consider creating a new category (with team discussion)

## Migration Notes

- All 100+ components have been reorganized into 10 functional categories
- All import statements throughout the codebase have been automatically updated
- No functionality has been changed or lost
- Component names remain exactly the same
- Only the directory structure and import paths have changed
