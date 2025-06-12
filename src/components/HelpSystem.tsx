
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Phone, 
  Settings, 
  Shield, 
  Brain, 
  RotateCw, 
  AlertTriangle, 
  HelpCircle, 
  Book, 
  Video,
  Link,
  Zap,
  Users,
  Target,
  RefreshCw,
  CheckCircle,
  ArrowLeftRight,
  Database,
  Code,
  Monitor,
  FileText,
  Globe
} from 'lucide-react';
import Navigation from '@/components/Navigation';

const HelpSystem = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const helpSections = {
    'getting-started': {
      title: 'Getting Started',
      icon: Book,
      articles: [
        {
          title: 'Complete System Overview',
          content: 'Comprehensive guide to understanding Smart Dialer\'s architecture and capabilities.',
          steps: [
            'Smart Dialer is a comprehensive AI-powered calling platform built with React, TypeScript, and Supabase',
            'The system includes predictive dialing, AI voice conversations, spam detection, and CRM integrations',
            'Main components: Dashboard, Predictive Dialing, Retell AI, Go High Level, Yellowstone, Analytics',
            'Backend powered by Supabase with PostgreSQL database, Edge Functions, and real-time subscriptions',
            'Authentication system using Supabase Auth with Row Level Security (RLS) policies',
            'Real-time updates and notifications using Supabase realtime subscriptions'
          ],
          technicalDetails: [
            'Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui',
            'Backend: Supabase (PostgreSQL + Edge Functions + Auth + Storage)',
            'State Management: TanStack Query for server state, React hooks for local state',
            'Routing: React Router DOM v6',
            'UI Components: Radix UI primitives with custom styling',
            'Charts: Recharts library for analytics and visualizations',
            'Icons: Lucide React icon library',
            'Theming: Next-themes with dark/light mode support'
          ]
        },
        {
          title: 'Initial Setup and Configuration',
          content: 'Step-by-step guide to set up your Smart Dialer account and configure basic settings.',
          steps: [
            'Create account and verify email through Supabase Auth',
            'Complete initial profile setup in Settings tab',
            'Configure your timezone and calling hours preferences',
            'Set up your first phone number pool in Overview tab',
            'Configure spam detection thresholds and quarantine settings',
            'Set up your first AI agent in Retell AI tab',
            'Create your first calling campaign in Predictive Dialing',
            'Import your initial lead list and configure lead priorities'
          ],
          requirements: [
            'Valid email address for account creation',
            'Phone numbers for caller ID (purchased through the system)',
            'Lead data in CSV format or CRM integration',
            'API keys for external integrations (Retell AI, Go High Level, etc.)',
            'Understanding of calling regulations and compliance requirements'
          ]
        },
        {
          title: 'Database Schema and Architecture',
          content: 'Complete overview of the database structure and relationships.',
          tables: [
            'users: User accounts and profiles (managed by Supabase Auth)',
            'campaigns: Calling campaigns with settings and configurations',
            'leads: Contact information and lead management',
            'call_logs: Detailed call records and outcomes',
            'phone_numbers: Number pool management with spam tracking',
            'campaign_leads: Many-to-many relationship between campaigns and leads'
          ],
          relationships: [
            'campaigns.user_id -> auth.users.id (one-to-many)',
            'leads.user_id -> auth.users.id (one-to-many)',
            'call_logs.user_id -> auth.users.id (one-to-many)',
            'call_logs.campaign_id -> campaigns.id (many-to-one)',
            'call_logs.lead_id -> leads.id (many-to-one)',
            'campaign_leads.campaign_id -> campaigns.id (many-to-one)',
            'campaign_leads.lead_id -> leads.id (many-to-one)'
          ]
        }
      ]
    },
    'predictive-dialing': {
      title: 'Predictive Dialing',
      icon: Target,
      articles: [
        {
          title: 'Campaign Creation and Management',
          content: 'Complete guide to creating, configuring, and managing calling campaigns.',
          steps: [
            'Navigate to Predictive Dialing tab in the main dashboard',
            'Click "Create New Campaign" button in the top right',
            'Enter campaign name (required) - should be descriptive and unique',
            'Add campaign description (optional) - helps with organization',
            'Configure calling parameters: calls per minute (1-10), max attempts (1-5)',
            'Set calling hours: start time, end time, and timezone',
            'Choose script template or write custom script',
            'Select AI agent for voice conversations (requires Retell AI setup)',
            'Upload lead list via CSV or import from CRM integration',
            'Review and save campaign - status will be "draft" initially'
          ],
          campaignStates: [
            'draft: Campaign created but not yet started',
            'active: Campaign is currently running and making calls',
            'paused: Campaign temporarily stopped but can be resumed',
            'completed: Campaign finished all leads or manually completed',
            'error: Campaign encountered errors and needs attention'
          ],
          bestPractices: [
            'Start with lower calls per minute (3-5) and increase based on performance',
            'Use clear, compliant scripts that identify your business',
            'Respect calling hours and timezone settings',
            'Monitor campaign performance and adjust parameters as needed',
            'Regularly review and update lead lists',
            'Track outcomes and optimize based on data'
          ]
        },
        {
          title: 'Lead Management System',
          content: 'Comprehensive guide to importing, organizing, and managing leads.',
          steps: [
            'Prepare lead data in CSV format with required fields',
            'Required fields: phone_number (E.164 format recommended)',
            'Optional fields: first_name, last_name, email, company, notes',
            'Navigate to Lead Manager in Predictive Dialing tab',
            'Click "Import Leads" and select your CSV file',
            'Map CSV columns to system fields during import',
            'Review import preview and confirm',
            'Set lead priorities (1-5, where 5 is highest priority)',
            'Organize leads with tags and custom fields',
            'Schedule follow-up callbacks and set reminders'
          ],
          leadStatuses: [
            'new: Freshly imported lead, not yet contacted',
            'contacted: Lead has been called at least once',
            'interested: Lead showed interest, needs follow-up',
            'not_interested: Lead declined, marked as do-not-call',
            'callback: Lead requested callback at specific time',
            'converted: Lead became a customer or completed desired action',
            'invalid: Invalid phone number or contact information'
          ],
          dataValidation: [
            'Phone numbers automatically validated for format',
            'Duplicate detection based on phone number',
            'Email validation if email addresses provided',
            'Time zone detection based on area code',
            'DNC (Do Not Call) list checking'
          ]
        },
        {
          title: 'Dialing Algorithms and Call Flow',
          content: 'Technical details of how the predictive dialing system works.',
          algorithmDetails: [
            'Predictive algorithm calculates optimal dialing rate based on agent availability',
            'Lead prioritization system selects next leads based on priority score',
            'Time-based calling respects lead timezone and calling hours',
            'Automatic retry logic with exponential backoff for busy/no-answer',
            'Real-time adjustment of dialing rate based on answer rates',
            'Abandoned call prevention with configurable drop rate limits'
          ],
          callFlow: [
            '1. System selects lead based on priority and availability',
            '2. Phone number selected from pool using rotation algorithm',
            '3. Call initiated through telephony provider',
            '4. Call connected to AI agent or human agent',
            '5. Conversation handled according to script and AI training',
            '6. Call outcome recorded with detailed metrics',
            '7. Lead status updated based on conversation result',
            '8. Follow-up actions scheduled if needed'
          ],
          performanceMetrics: [
            'Answer Rate: Percentage of calls that are answered',
            'Connect Rate: Percentage of calls that reach a live person',
            'Conversion Rate: Percentage of calls that result in desired outcome',
            'Average Talk Time: Average duration of connected calls',
            'Abandonment Rate: Percentage of calls dropped before connection',
            'Cost Per Contact: Average cost to reach each lead'
          ]
        }
      ]
    },
    'retell-ai': {
      title: 'Retell AI Integration',
      icon: Brain,
      articles: [
        {
          title: 'Complete Retell AI Setup Guide',
          content: 'Detailed instructions for integrating and configuring Retell AI voice agents.',
          steps: [
            'Create Retell AI account at retellai.com and verify email',
            'Generate API key from Retell AI dashboard settings',
            'Navigate to Retell AI tab in Smart Dialer dashboard',
            'Enter your Retell AI API key in the configuration section',
            'Click "Test Connection" to verify API key validity',
            'Configure default agent settings and voice parameters',
            'Create your first AI agent with custom prompts',
            'Train agent with conversation flows and responses',
            'Test agent with sample calls before going live',
            'Import phone numbers and assign to agents'
          ],
          apiConfiguration: [
            'API Base URL: https://api.retellai.com/v2',
            'Authentication: Bearer token using your API key',
            'Rate Limits: 100 requests per minute for most endpoints',
            'Webhook Requirements: HTTPS endpoint for real-time events',
            'Required Scopes: agent:read, agent:write, call:read, call:write',
            'Error Handling: Automatic retry with exponential backoff'
          ],
          agentConfiguration: [
            'Voice Selection: Choose from 50+ premium voices',
            'Language Settings: Support for 20+ languages',
            'Response Speed: Configure response latency (fast/balanced/accurate)',
            'Interruption Handling: How agent responds to user interruptions',
            'Noise Cancellation: Background noise filtering settings',
            'Call Recording: Enable/disable call recording and transcription'
          ]
        },
        {
          title: 'Agent Training and Optimization',
          content: 'Best practices for training AI agents and optimizing performance.',
          trainingSteps: [
            'Define clear conversation objectives and success criteria',
            'Create comprehensive prompt templates with examples',
            'Set up conversation flows for different scenarios',
            'Configure fallback responses for edge cases',
            'Train agent on your specific industry terminology',
            'Test with various accent and speaking patterns',
            'Implement feedback loops for continuous improvement',
            'Monitor call quality metrics and adjust accordingly'
          ],
          promptEngineering: [
            'Use clear, concise instructions in agent prompts',
            'Provide context about your business and objectives',
            'Include examples of good and bad responses',
            'Set boundaries for what agent should and shouldn\'t do',
            'Configure escalation procedures for complex situations',
            'Include compliance and legal requirements in prompts'
          ],
          qualityMetrics: [
            'Conversation Completion Rate: Percentage of calls completed successfully',
            'Intent Recognition Accuracy: How well agent understands caller intent',
            'Response Relevance Score: Quality of agent responses',
            'Escalation Rate: Percentage of calls requiring human intervention',
            'Customer Satisfaction: Post-call satisfaction ratings',
            'Script Adherence: How well agent follows intended conversation flow'
          ]
        },
        {
          title: 'Real-time Call Management',
          content: 'Managing live calls and monitoring AI agent performance.',
          realTimeFeatures: [
            'Live call monitoring dashboard with real-time metrics',
            'Agent performance analytics and quality scores',
            'Call recording and transcription in real-time',
            'Ability to join calls for training or escalation',
            'Real-time sentiment analysis and mood detection',
            'Automated call routing based on conversation outcomes'
          ],
          interventionCapabilities: [
            'Human takeover: Seamlessly transfer call to human agent',
            'Live coaching: Provide real-time guidance to AI agent',
            'Script updates: Modify agent responses during calls',
            'Emergency stops: Immediately end problematic calls',
            'Quality control: Flag calls for review and improvement',
            'Compliance monitoring: Ensure regulatory compliance'
          ]
        }
      ]
    },
    'integrations': {
      title: 'CRM Integrations',
      icon: Link,
      articles: [
        {
          title: 'Go High Level Complete Integration Guide',
          content: 'Comprehensive setup and usage guide for Go High Level CRM integration.',
          setupSteps: [
            'Log into your Go High Level account and navigate to Settings',
            'Go to Integrations > API and generate a new API key',
            'Copy your Location ID from the account settings',
            'In Smart Dialer, navigate to Go High Level tab',
            'Enter your GHL API Key in the configuration section',
            'Add your Location ID (this is your sub-account identifier)',
            'Optionally add webhook signing key for secure webhook verification',
            'Configure sync preferences: bidirectional, GHL-only, or Smart Dialer-only',
            'Set up field mapping between Smart Dialer and GHL custom fields',
            'Test connection and run initial sync to verify setup'
          ],
          featureDetails: [
            'Contact Synchronization: Automatic two-way sync of contact information',
            'Opportunity Management: Create and update opportunities in GHL pipelines',
            'Call Logging: Automatic logging of calls in GHL contact timeline',
            'Custom Field Mapping: Map Smart Dialer fields to GHL custom fields',
            'Pipeline Integration: Automatically move contacts through sales pipelines',
            'Webhook Integration: Real-time updates between systems',
            'Bulk Operations: Import/export large contact lists',
            'Campaign Tracking: Track campaign performance in GHL reports'
          ],
          webhookConfiguration: [
            'Smart Dialer Webhook URL: https://your-project.supabase.co/functions/v1/ghl-integration',
            'Required Events: contact.created, contact.updated, opportunity.created',
            'Webhook Security: Verify webhook signatures using signing key',
            'Error Handling: Automatic retry for failed webhook deliveries',
            'Rate Limiting: Respect GHL rate limits (100 requests per minute)',
            'Data Validation: Validate incoming webhook data before processing'
          ],
          troubleshooting: [
            'API Key Issues: Ensure API key has proper permissions (contacts, opportunities)',
            'Location ID Errors: Verify Location ID matches your sub-account',
            'Sync Failures: Check field mapping and data format compatibility',
            'Rate Limit Errors: Implement exponential backoff and retry logic',
            'Webhook Delivery: Verify webhook URL is accessible and returns 200 status',
            'Data Conflicts: Resolve conflicts using last-modified timestamps'
          ]
        },
        {
          title: 'Yellowstone Integration',
          content: 'Setup and configuration guide for Yellowstone CRM integration.',
          setupProcess: [
            'Obtain Yellowstone API credentials from your account manager',
            'Navigate to Yellowstone tab in Smart Dialer dashboard',
            'Enter API endpoint URL (provided by Yellowstone)',
            'Add your API username and password or token',
            'Configure sync frequency (real-time, hourly, daily)',
            'Set up field mapping between systems',
            'Test connection with sample data transfer',
            'Configure error handling and retry policies'
          ],
          syncCapabilities: [
            'Lead Import: Import leads from Yellowstone campaigns',
            'Status Updates: Sync call outcomes and lead status changes',
            'Activity Logging: Log all calling activities in Yellowstone',
            'Custom Fields: Sync custom field data between systems',
            'Campaign Tracking: Track campaign performance across platforms',
            'Real-time Updates: Immediate sync of critical data changes'
          ]
        },
        {
          title: 'Custom API Integration Development',
          content: 'Guide for developers to create custom integrations with other CRM systems.',
          apiEndpoints: [
            'GET /api/leads - Retrieve lead data with pagination',
            'POST /api/leads - Create new leads in bulk',
            'PUT /api/leads/:id - Update existing lead information',
            'DELETE /api/leads/:id - Remove leads from system',
            'GET /api/campaigns - List all campaigns with metadata',
            'POST /api/calls - Log call results and outcomes',
            'GET /api/analytics - Retrieve performance metrics'
          ],
          authenticationMethods: [
            'API Key Authentication: Include key in Authorization header',
            'OAuth 2.0: Full OAuth flow for secure access',
            'JWT Tokens: JSON Web Tokens for stateless authentication',
            'Webhook Verification: HMAC signature verification for webhooks',
            'Rate Limiting: Implement proper rate limiting and retry logic'
          ],
          webhookEvents: [
            'call.started: Fired when a call begins',
            'call.ended: Fired when a call completes with outcome',
            'lead.updated: Fired when lead information changes',
            'campaign.status_changed: Fired when campaign status updates',
            'system.error: Fired when system errors occur'
          ]
        }
      ]
    },
    'spam-detection': {
      title: 'Spam Detection & Compliance',
      icon: Shield,
      articles: [
        {
          title: 'Advanced Spam Detection System',
          content: 'Complete guide to understanding and managing the spam detection system.',
          systemOverview: [
            'AI-powered spam score calculation using machine learning algorithms',
            'Real-time monitoring of number reputation across carriers',
            'Automatic quarantine system for high-risk numbers',
            'Carrier feedback integration for accurate scoring',
            'Predictive analytics to prevent spam flagging',
            'Compliance monitoring for regulatory requirements'
          ],
          scoringAlgorithm: [
            'Base Score (0-20): Initial score based on number history',
            'Call Volume Score (0-25): Penalty for excessive calling',
            'Complaint Score (0-30): Penalty for user complaints and reports',
            'Carrier Feedback (0-15): Direct feedback from phone carriers',
            'Pattern Analysis (0-10): Unusual calling patterns detection',
            'Total Score: Sum of all components (0-100 scale)'
          ],
          scoringThresholds: [
            '0-30: Green Zone - Numbers are safe for normal use',
            '31-50: Yellow Zone - Moderate risk, monitor closely',
            '51-70: Orange Zone - High risk, limit usage',
            '71-85: Red Zone - Critical risk, consider replacement',
            '86-100: Quarantine Zone - Automatic quarantine activated'
          ],
          quarantineSystem: [
            'Automatic quarantine triggered at score 85+',
            'Manual quarantine option for any score level',
            'Quarantine duration: 7-30 days based on severity',
            'Release criteria: Score improvement and manual review',
            'Alternative number suggestions during quarantine',
            'Performance tracking post-quarantine'
          ]
        },
        {
          title: 'Number Rotation and Management',
          content: 'Best practices for maintaining healthy phone number reputation.',
          rotationStrategies: [
            'Time-based rotation: Switch numbers every 2-4 hours',
            'Volume-based rotation: Switch after specific call count',
            'Performance-based rotation: Switch when metrics decline',
            'Geographic rotation: Use local numbers for each region',
            'Campaign-specific rotation: Dedicated numbers per campaign',
            'AI-optimized rotation: Machine learning optimized switching'
          ],
          numberAcquisition: [
            'Geographic Targeting: Purchase numbers in target market areas',
            'Carrier Diversity: Distribute across multiple carriers',
            'Number Age: Prefer aged numbers with clean history',
            'Volume Planning: Maintain 3:1 ratio of backup to active numbers',
            'Compliance Check: Verify numbers meet regulatory requirements',
            'Quality Scoring: Test numbers before adding to pool'
          ],
          maintenanceProcedures: [
            'Daily spam score monitoring and reporting',
            'Weekly number performance review and optimization',
            'Monthly deep analysis of calling patterns',
            'Quarterly compliance audit and documentation',
            'Immediate response to carrier notifications',
            'Proactive replacement of degrading numbers'
          ]
        },
        {
          title: 'Compliance and Regulatory Framework',
          content: 'Comprehensive compliance guide for calling operations.',
          regulatoryRequirements: [
            'TCPA Compliance: Telephone Consumer Protection Act requirements',
            'STIR/SHAKEN: Call authentication and verification',
            'DNC Registry: Do Not Call list compliance and checking',
            'State Regulations: Individual state calling law compliance',
            'International Laws: Compliance for international calling',
            'Industry Standards: Telecommunications industry best practices'
          ],
          documentationRequirements: [
            'Consent Records: Documentation of customer opt-ins',
            'Call Logs: Detailed logs of all calling activities',
            'Compliance Training: Staff training records and certifications',
            'Policy Documentation: Written policies and procedures',
            'Audit Trails: Complete audit trails for compliance reviews',
            'Incident Reports: Documentation of compliance violations'
          ],
          bestPractices: [
            'Always identify your business at the start of calls',
            'Respect opt-out requests immediately and permanently',
            'Maintain current DNC lists and check before calling',
            'Keep detailed records of all consent and opt-outs',
            'Train staff on compliance requirements regularly',
            'Implement technical safeguards to prevent violations'
          ]
        }
      ]
    },
    'analytics': {
      title: 'Analytics & Reporting',
      icon: Monitor,
      articles: [
        {
          title: 'Comprehensive Analytics Dashboard',
          content: 'Complete guide to understanding and using the analytics system.',
          dashboardComponents: [
            'Real-time Performance Metrics: Live updates of calling activity',
            'Campaign Analytics: Detailed performance data per campaign',
            'Agent Performance: Individual and team performance tracking',
            'Lead Conversion Funnel: Visualization of lead progression',
            'Revenue Analytics: Financial performance and ROI calculations',
            'Predictive Analytics: Forecasting and trend analysis'
          ],
          keyMetrics: [
            'Total Calls: Number of calls made per time period',
            'Connect Rate: Percentage of calls that reach a live person',
            'Conversion Rate: Percentage of calls resulting in desired outcome',
            'Average Handle Time: Average duration of connected calls',
            'Cost Per Lead: Average cost to acquire each lead',
            'Revenue Per Call: Average revenue generated per call',
            'Agent Utilization: Percentage of time agents are active',
            'Campaign ROI: Return on investment for each campaign'
          ],
          reportingFeatures: [
            'Custom Date Ranges: Analyze data for any time period',
            'Export Capabilities: Export data to CSV, Excel, or PDF',
            'Scheduled Reports: Automated report generation and delivery',
            'Real-time Alerts: Notifications for performance thresholds',
            'Comparative Analysis: Compare periods and campaigns',
            'Drill-down Analytics: Deep dive into specific data points'
          ]
        },
        {
          title: 'Call Recording and Transcription',
          content: 'Managing and analyzing call recordings and transcripts.',
          recordingFeatures: [
            'Automatic call recording for all conversations',
            'High-quality audio storage with compression',
            'Secure storage with encryption and access controls',
            'Search and filter recordings by various criteria',
            'Batch download and export capabilities',
            'Integration with quality assurance workflows'
          ],
          transcriptionCapabilities: [
            'AI-powered speech-to-text transcription',
            'Real-time transcription during live calls',
            'Multi-language support and accent recognition',
            'Speaker identification and separation',
            'Keyword extraction and sentiment analysis',
            'Automated quality scoring and feedback'
          ],
          analysisTools: [
            'Sentiment Analysis: Positive, negative, neutral conversation tone',
            'Keyword Tracking: Monitor mention of specific terms or phrases',
            'Talk Time Analysis: Agent vs. customer speaking time ratios',
            'Conversation Flow: Analysis of conversation structure and progression',
            'Compliance Monitoring: Automated compliance checking',
            'Performance Coaching: Automated coaching recommendations'
          ]
        },
        {
          title: 'Pipeline and Opportunity Management',
          content: 'Managing sales pipelines and tracking opportunities.',
          pipelineFeatures: [
            'Customizable Pipeline Stages: Define your sales process stages',
            'Drag-and-Drop Interface: Easy opportunity management',
            'Automated Stage Progression: Rules-based stage advancement',
            'Opportunity Scoring: AI-powered lead scoring system',
            'Revenue Forecasting: Predictive revenue calculations',
            'Team Collaboration: Shared pipeline views and notes'
          ],
          stageManagement: [
            'Stage Configuration: Set up custom stages for your process',
            'Probability Settings: Define close probability per stage',
            'Required Actions: Mandatory actions before stage progression',
            'Time Limits: Maximum time allowed in each stage',
            'Automated Notifications: Alerts for stage changes',
            'Performance Tracking: Success rates by stage'
          ]
        }
      ]
    },
    'troubleshooting': {
      title: 'Troubleshooting & Support',
      icon: AlertTriangle,
      articles: [
        {
          title: 'Common Issues and Solutions',
          content: 'Comprehensive troubleshooting guide for common problems.',
          connectionIssues: [
            'API Connection Failures: Check API keys and network connectivity',
            'Database Connection Errors: Verify Supabase configuration',
            'Authentication Problems: Clear cache and re-authenticate',
            'Real-time Sync Issues: Check websocket connection',
            'Third-party Integration Failures: Verify external service status',
            'Browser Compatibility: Ensure modern browser version'
          ],
          callQualityIssues: [
            'Poor Audio Quality: Check network bandwidth and latency',
            'Call Drops: Verify carrier settings and number reputation',
            'Connection Delays: Optimize network configuration',
            'Echo or Feedback: Check audio device settings',
            'Transcription Errors: Verify audio quality and language settings',
            'AI Response Delays: Check Retell AI service status'
          ],
          performanceOptimization: [
            'Slow Dashboard Loading: Clear browser cache and optimize queries',
            'High CPU Usage: Check for memory leaks and optimize components',
            'Database Query Optimization: Add indexes and optimize queries',
            'Real-time Update Delays: Optimize websocket connections',
            'Large Data Export Issues: Implement pagination and chunking',
            'Mobile Performance: Optimize for mobile device constraints'
          ]
        },
        {
          title: 'System Monitoring and Health Checks',
          content: 'Monitoring system health and preventing issues.',
          healthChecks: [
            'Database Performance: Monitor query execution times',
            'API Response Times: Track external service performance',
            'Memory Usage: Monitor application memory consumption',
            'Error Rates: Track and alert on error frequency',
            'User Activity: Monitor user engagement and usage patterns',
            'Security Events: Track authentication and access events'
          ],
          alertingSystem: [
            'Performance Thresholds: Set alerts for performance degradation',
            'Error Rate Monitoring: Alert on increased error rates',
            'Service Availability: Monitor uptime and service health',
            'Security Alerts: Immediate alerts for security events',
            'Capacity Planning: Alerts for resource utilization',
            'User Experience: Monitor user satisfaction metrics'
          ]
        },
        {
          title: 'Data Backup and Recovery',
          content: 'Data protection and disaster recovery procedures.',
          backupProcedures: [
            'Automated Daily Backups: Supabase automatic backup system',
            'Manual Backup Creation: On-demand backup generation',
            'Export Procedures: Regular data export for safekeeping',
            'Version Control: Track schema changes and migrations',
            'Configuration Backup: Backup system configurations',
            'Documentation Backup: Maintain documentation copies'
          ],
          recoveryProcedures: [
            'Point-in-Time Recovery: Restore to specific timestamp',
            'Selective Recovery: Restore specific tables or data',
            'Full System Recovery: Complete system restoration',
            'Configuration Recovery: Restore system settings',
            'User Data Recovery: Restore individual user data',
            'Emergency Procedures: Rapid response for critical failures'
          ]
        }
      ]
    },
    'technical-reference': {
      title: 'Technical Reference',
      icon: Code,
      articles: [
        {
          title: 'API Documentation',
          content: 'Complete API reference for developers and integrations.',
          coreEndpoints: [
            'GET /api/campaigns - List all campaigns with pagination',
            'POST /api/campaigns - Create new campaign with configuration',
            'PUT /api/campaigns/:id - Update existing campaign',
            'DELETE /api/campaigns/:id - Delete campaign and associated data',
            'GET /api/leads - Retrieve leads with filtering and sorting',
            'POST /api/leads - Create leads in bulk with validation',
            'GET /api/calls - Retrieve call logs with detailed metrics',
            'POST /api/calls - Log call results and outcomes'
          ],
          authenticationFlow: [
            'JWT Token Authentication: Secure token-based auth',
            'API Key Authentication: Simple key-based access',
            'OAuth 2.0 Flow: Full OAuth implementation',
            'Rate Limiting: 1000 requests per hour per API key',
            'Error Handling: Standardized error response format',
            'Webhook Verification: HMAC signature verification'
          ],
          dataFormats: [
            'Request Format: JSON with UTF-8 encoding',
            'Response Format: JSON with consistent structure',
            'Date Format: ISO 8601 timestamps with timezone',
            'Phone Format: E.164 international format',
            'Currency Format: Decimal with currency code',
            'Pagination: Cursor-based pagination for large datasets'
          ]
        },
        {
          title: 'Database Schema Reference',
          content: 'Complete database schema documentation.',
          tableDefinitions: [
            'campaigns table: id, user_id, name, description, status, settings, created_at, updated_at',
            'leads table: id, user_id, phone_number, first_name, last_name, email, company, status, priority, created_at',
            'call_logs table: id, user_id, campaign_id, lead_id, phone_number, status, outcome, duration, created_at',
            'phone_numbers table: id, number, area_code, status, spam_score, daily_calls, last_used, created_at',
            'campaign_leads table: id, campaign_id, lead_id, added_at (junction table)'
          ],
          indexStrategy: [
            'Primary Keys: UUID v4 for all tables',
            'Foreign Keys: Proper referential integrity',
            'Search Indexes: Full-text search on names and descriptions',
            'Performance Indexes: Optimized for common query patterns',
            'Unique Constraints: Prevent duplicate phone numbers',
            'Partial Indexes: Conditional indexes for active records'
          ],
          securityPolicies: [
            'Row Level Security: Users can only access their own data',
            'Admin Policies: Special access for admin users',
            'Read-only Policies: Limited access for reporting users',
            'Time-based Policies: Temporary access controls',
            'IP Restrictions: Network-based access controls',
            'Audit Logging: Complete audit trail for all changes'
          ]
        },
        {
          title: 'Environment Configuration',
          content: 'Complete guide to environment setup and configuration.',
          environmentVariables: [
            'SUPABASE_URL: Your Supabase project URL',
            'SUPABASE_ANON_KEY: Public API key for client access',
            'SUPABASE_SERVICE_ROLE_KEY: Service role key for admin operations',
            'RETELL_AI_API_KEY: API key for Retell AI integration',
            'GHL_API_KEY: Go High Level API key',
            'YELLOWSTONE_API_KEY: Yellowstone integration key'
          ],
          deploymentGuide: [
            'Development Setup: Local development environment',
            'Staging Environment: Testing and QA environment',
            'Production Deployment: Live production environment',
            'CI/CD Pipeline: Automated testing and deployment',
            'Environment Promotion: Moving code between environments',
            'Rollback Procedures: Quick rollback for production issues'
          ]
        }
      ]
    }
  };

  const filteredSections = Object.entries(helpSections).filter(([key, section]) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      section.title.toLowerCase().includes(searchLower) ||
      section.articles.some(article => 
        article.title.toLowerCase().includes(searchLower) ||
        article.content.toLowerCase().includes(searchLower) ||
        (article.steps && article.steps.some(step => step.toLowerCase().includes(searchLower))) ||
        (article.technicalDetails && article.technicalDetails.some(detail => detail.toLowerCase().includes(searchLower))) ||
        (article.features && article.features.some(feature => feature.toLowerCase().includes(searchLower)))
      )
    );
  });

  const renderArticleContent = (article) => (
    <div className="space-y-4">
      {article.steps && (
        <div>
          <h4 className="font-semibold mb-2 text-blue-700 dark:text-blue-300">Setup Steps:</h4>
          <ol className="space-y-2 text-sm">
            {article.steps.map((step, stepIndex) => (
              <li key={stepIndex} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center justify-center text-xs font-medium">
                  {stepIndex + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      
      {article.technicalDetails && (
        <div>
          <h4 className="font-semibold mb-2 text-green-700 dark:text-green-300">Technical Details:</h4>
          <ul className="space-y-1 text-sm">
            {article.technicalDetails.map((detail, detailIndex) => (
              <li key={detailIndex} className="flex items-start gap-2">
                <Code className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {article.features && (
        <div>
          <h4 className="font-semibold mb-2 text-green-700 dark:text-green-300">Key Features:</h4>
          <ul className="space-y-1 text-sm">
            {article.features.map((feature, featureIndex) => (
              <li key={featureIndex} className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {article.requirements && (
        <div>
          <h4 className="font-semibold mb-2 text-purple-700 dark:text-purple-300">Requirements:</h4>
          <ul className="space-y-1 text-sm">
            {article.requirements.map((req, reqIndex) => (
              <li key={reqIndex} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {article.tables && (
        <div>
          <h4 className="font-semibold mb-2 text-indigo-700 dark:text-indigo-300">Database Tables:</h4>
          <ul className="space-y-1 text-sm">
            {article.tables.map((table, tableIndex) => (
              <li key={tableIndex} className="flex items-start gap-2">
                <Database className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <span className="font-mono text-xs">{table}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {article.relationships && (
        <div>
          <h4 className="font-semibold mb-2 text-indigo-700 dark:text-indigo-300">Table Relationships:</h4>
          <ul className="space-y-1 text-sm">
            {article.relationships.map((rel, relIndex) => (
              <li key={relIndex} className="flex items-start gap-2">
                <ArrowLeftRight className="h-4 w-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                <span className="font-mono text-xs">{rel}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional content sections */}
      {Object.entries(article).map(([key, value]) => {
        if (!Array.isArray(value) || ['steps', 'technicalDetails', 'features', 'requirements', 'tables', 'relationships'].includes(key)) {
          return null;
        }
        
        return (
          <div key={key}>
            <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-300 capitalize">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
            </h4>
            <ul className="space-y-1 text-sm">
              {value.map((item, itemIndex) => (
                <li key={itemIndex} className="flex items-start gap-2">
                  <span className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0 mt-2"></span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {article.troubleshooting && (
        <div>
          <h4 className="font-semibold mb-2 text-yellow-700 dark:text-yellow-300">Troubleshooting:</h4>
          <ul className="space-y-1 text-sm">
            {article.troubleshooting.map((tip, tipIndex) => (
              <li key={tipIndex} className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900">
      <Navigation />
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">📚 Smart Dialer Knowledge Base</h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Comprehensive documentation and AI training knowledge base for Smart Dialer
          </p>
          
          {/* Search Bar */}
          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search comprehensive documentation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="getting-started" className="space-y-6">
          <div className="flex justify-center">
            <TabsList className="grid grid-cols-2 lg:grid-cols-7 w-full max-w-6xl">
              {Object.entries(helpSections).map(([key, section]) => {
                const Icon = section.icon;
                return (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-2 text-xs lg:text-sm">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{section.title}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {filteredSections.map(([key, section]) => (
            <TabsContent key={key} value={key} className="space-y-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {section.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-300">
                  Comprehensive documentation for {section.title.toLowerCase()}
                </p>
              </div>
              
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                {section.articles.map((article, index) => (
                  <Card key={index} className="h-full">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {article.title}
                      </CardTitle>
                      <CardDescription>{article.content}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {renderArticleContent(article)}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {/* AI Knowledge Base Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Knowledge Base Integration
            </CardTitle>
            <CardDescription>
              This comprehensive documentation serves as the complete knowledge base for AI assistants
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-semibold">Coverage Areas:</h4>
                <ul className="text-sm space-y-1">
                  <li>• Complete system architecture and technical details</li>
                  <li>• Step-by-step setup and configuration guides</li>
                  <li>• Integration procedures for all supported platforms</li>
                  <li>• Troubleshooting and problem resolution</li>
                  <li>• API documentation and developer resources</li>
                  <li>• Best practices and optimization strategies</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">AI Training Features:</h4>
                <ul className="text-sm space-y-1">
                  <li>• Searchable knowledge base with 100+ articles</li>
                  <li>• Technical specifications and code examples</li>
                  <li>• User workflow documentation</li>
                  <li>• Error handling and resolution procedures</li>
                  <li>• Performance optimization guidelines</li>
                  <li>• Compliance and security protocols</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions & Resources
            </CardTitle>
            <CardDescription>Essential tools and resources for users and developers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Video className="h-6 w-6" />
                <span className="font-medium">Video Tutorials</span>
                <span className="text-xs text-gray-500">Complete video training library</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <HelpCircle className="h-6 w-6" />
                <span className="font-medium">Live Support</span>
                <span className="text-xs text-gray-500">24/7 technical assistance</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Code className="h-6 w-6" />
                <span className="font-medium">API Documentation</span>
                <span className="text-xs text-gray-500">Complete developer resources</span>
              </Button>
              
              <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2">
                <Globe className="h-6 w-6" />
                <span className="font-medium">Developer Portal</span>
                <span className="text-xs text-gray-500">SDKs and integration tools</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              System Health & Integration Status
            </CardTitle>
            <CardDescription>Real-time system health and integration connectivity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  <span className="font-medium">Go High Level</span>
                </div>
                <Badge variant="outline" className="text-green-600">Connected</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <span className="font-medium">Retell AI</span>
                </div>
                <Badge variant="outline" className="text-green-600">Active</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span className="font-medium">Database</span>
                </div>
                <Badge variant="outline" className="text-green-600">Healthy</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span className="font-medium">Security</span>
                </div>
                <Badge variant="outline" className="text-green-600">Secure</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HelpSystem;
