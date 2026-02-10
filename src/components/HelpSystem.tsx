import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Phone, 
  Brain, 
  Target, 
  RotateCw, 
  Shield, 
  MessageSquare,
  Calendar,
  Settings,
  BarChart3,
  Users,
  Zap,
  Link,
  Database,
  Bot,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Route,
  Server
} from 'lucide-react';
import Navigation from '@/components/Navigation';

interface FeatureDoc {
  name: string;
  description: string;
  icon: React.ElementType;
  docSection: string;
  isNew?: boolean;
}

const features: FeatureDoc[] = [
  {
    name: 'Predictive Dialing',
    description: 'AI-powered calling campaigns with intelligent lead prioritization',
    icon: Target,
    docSection: 'predictive-dialing'
  },
  {
    name: 'Retell AI Integration',
    description: 'Voice AI agents for automated conversations',
    icon: Brain,
    docSection: 'retell-ai'
  },
  {
    name: 'Phone Number Management',
    description: 'Purchase, import, and rotate phone numbers',
    icon: Phone,
    docSection: 'phone-numbers'
  },
  {
    name: 'Spam Detection',
    description: 'Monitor and manage spam scores for your numbers',
    icon: Shield,
    docSection: 'spam-detection'
  },
  {
    name: 'Number Rotation',
    description: 'Automatic rotation to maintain caller ID health',
    icon: RotateCw,
    docSection: 'rotation'
  },
  {
    name: 'SMS Messaging',
    description: 'AI-powered SMS conversations with leads',
    icon: MessageSquare,
    docSection: 'sms'
  },
  {
    name: 'Follow-up Sequences',
    description: 'Automated multi-step follow-up workflows',
    icon: Calendar,
    docSection: 'follow-ups'
  },
  {
    name: 'Disposition Automation',
    description: 'Auto-apply actions based on call outcomes',
    icon: Zap,
    docSection: 'dispositions'
  },
  {
    name: 'Pipeline Management',
    description: 'Kanban-style lead pipeline with stages',
    icon: Database,
    docSection: 'pipeline'
  },
  {
    name: 'Autonomous Agent',
    description: 'AI decision-making for lead management',
    icon: Bot,
    docSection: 'autonomous-agent'
  },
  {
    name: 'AI Safety & Confirmation Tiers',
    description: 'Multi-layer safety gates for high-risk AI actions like purchases and bulk SMS',
    icon: ShieldCheck,
    docSection: 'ai-safety-tiers',
    isNew: true
  },
  {
    name: 'Self-Learning Systems',
    description: 'Calling time optimization, lead score calibration, script A/B testing, and adaptive pacing',
    icon: TrendingUp,
    docSection: 'learning-systems',
    isNew: true
  },
  {
    name: 'Lead Journey Intelligence',
    description: 'Automated journey tracking with sales psychology-based follow-up playbook',
    icon: Route,
    docSection: 'lead-journeys',
    isNew: true
  },
  {
    name: 'Infrastructure & Cron Jobs',
    description: 'Background automation scheduling, edge function security, and system architecture',
    icon: Server,
    docSection: 'infrastructure',
    isNew: true
  },
  {
    name: 'Go High Level Integration',
    description: 'Sync contacts and data with GHL',
    icon: Link,
    docSection: 'ghl'
  },
  {
    name: 'Yellowstone Integration',
    description: 'Connect with Yellowstone platform',
    icon: Link,
    docSection: 'yellowstone'
  },
  {
    name: 'Analytics & Reports',
    description: 'Track performance with daily reports',
    icon: BarChart3,
    docSection: 'analytics'
  },
  {
    name: 'Lead Management',
    description: 'Import, organize, and manage leads',
    icon: Users,
    docSection: 'leads'
  },
  {
    name: 'Campaign Settings',
    description: 'Configure calling hours, scripts, and agents',
    icon: Settings,
    docSection: 'campaigns'
  }
];

const docLinks: Record<string, string> = {
  'predictive-dialing': '#predictive-dialing',
  'retell-ai': '#retell-ai',
  'phone-numbers': '#phone-numbers',
  'spam-detection': '#spam-detection',
  'rotation': '#rotation',
  'sms': '#sms',
  'follow-ups': '#follow-ups',
  'dispositions': '#dispositions',
  'pipeline': '#pipeline',
  'autonomous-agent': '#autonomous-agent',
  'ai-safety-tiers': '#ai-safety-tiers',
  'learning-systems': '#learning-systems',
  'lead-journeys': '#lead-journeys',
  'infrastructure': '#infrastructure',
  'ghl': '#ghl',
  'yellowstone': '#yellowstone',
  'analytics': '#analytics',
  'leads': '#leads',
  'campaigns': '#campaigns'
};

const HelpSystem = () => {
  const handleFeatureClick = (docSection: string) => {
    const element = document.getElementById(docSection);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Help & Documentation</h1>
          <p className="text-muted-foreground mt-2">
            Click on any feature to learn more about how to use it
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card 
                key={feature.docSection}
                className="cursor-pointer hover:border-primary transition-colors group"
                onClick={() => handleFeatureClick(feature.docSection)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span>{feature.name}</span>
                    {feature.isNew && (
                      <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
                    )}
                    <ExternalLink className="h-4 w-4 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Start Section */}
        <div className="mt-12 space-y-8">
          <h2 className="text-2xl font-bold text-foreground">Quick Start Guides</h2>
          
          <div className="space-y-6" id="predictive-dialing">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Predictive Dialing
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Navigate to the Predictive Dialing tab</li>
                  <li>Click "Create New Campaign" and enter campaign details</li>
                  <li>Configure calling parameters (calls per minute, max attempts)</li>
                  <li>Set calling hours and timezone</li>
                  <li>Assign an AI agent from Retell AI</li>
                  <li>Add leads to your campaign</li>
                  <li>Start the campaign to begin dialing</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="retell-ai">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Retell AI Setup
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Get your API key from retellai.com</li>
                  <li>Go to Settings → API Keys and add your Retell key</li>
                  <li>Navigate to the Retell AI tab</li>
                  <li>Create a new AI agent with your desired voice and prompts</li>
                  <li>Import phone numbers to Retell</li>
                  <li>Assign the agent to your campaigns</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="autonomous-agent">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  Autonomous Agent
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Navigate to the AI Pipeline Manager</li>
                  <li>Enable Autonomous Mode in settings</li>
                  <li>Configure auto-execution preferences</li>
                  <li>Set daily action limits</li>
                  <li>Review AI recommendations before execution</li>
                  <li>Monitor decision history in the activity log</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="follow-ups">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Follow-up Sequences
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Go to the Follow-up Scheduler</li>
                  <li>Create a new sequence with name and description</li>
                  <li>Add steps (AI call, AI SMS, wait, email)</li>
                  <li>Set delay times between steps</li>
                  <li>Assign sequences to disposition outcomes</li>
                  <li>Start sequences automatically when dispositions are applied</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="dispositions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Disposition Automation
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Standard dispositions are auto-created on first use</li>
                  <li>Each disposition maps to a pipeline stage</li>
                  <li>Positive dispositions (Hot Lead, Interested) trigger sequences</li>
                  <li>Neutral dispositions (Voicemail, Callback) schedule callbacks</li>
                  <li>Negative dispositions (Wrong Number) mark leads appropriately</li>
                  <li>Customize dispositions in the Disposition Manager</li>
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* NEW SECTIONS - February 2026 */}

          <div className="space-y-6" id="ai-safety-tiers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  AI Safety & Confirmation Tiers
                  <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">
                  The system has multi-layer safety gates to prevent the AI from performing high-risk actions without your explicit approval.
                </p>
                <h4 className="text-foreground font-semibold mb-2">How It Works</h4>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  <li><strong>Low-risk actions</strong> (reading data, checking stats) — execute automatically</li>
                  <li><strong>Medium-risk actions</strong> (updating lead status, adjusting pacing) — require confirmation in the AI chat</li>
                  <li><strong>High-risk actions</strong> (buying phone numbers, sending SMS blasts, launching campaigns, bulk updates, deleting workflows) — always require explicit confirmation with a detailed preview of what will happen</li>
                </ul>
                <h4 className="text-foreground font-semibold mt-4 mb-2">Action Queue</h4>
                <p className="text-muted-foreground">
                  When the Autonomous Agent is set to "Approval Required" mode, all actions go into the Action Queue (found in the Autonomous Agent → Actions tab). You can approve or reject each action individually, or batch-approve all pending actions.
                </p>
                <h4 className="text-foreground font-semibold mt-4 mb-2">Operational Memory</h4>
                <p className="text-muted-foreground">
                  The AI remembers past campaigns, lessons learned, and error patterns across conversations. This means it won't repeat the same mistakes and can reference previous campaign performance when making recommendations.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="learning-systems">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Self-Learning Systems
                  <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">
                  Four interconnected learning systems that make the AI genuinely smarter over time based on real call outcome data.
                </p>

                <h4 className="text-foreground font-semibold mb-2">1. Calling Time Optimizer</h4>
                <p className="text-muted-foreground">
                  Learns the best hours and days to call by analyzing answer rates and appointment rates across time slots. 
                  When enabled (<strong>Autonomous Agent → Settings → Auto Optimize Calling Times</strong>), the system will skip low-performing time slots automatically. Requires at least 10 calls per slot before making decisions.
                </p>

                <h4 className="text-foreground font-semibold mt-4 mb-2">2. Lead Score Weight Calibration</h4>
                <p className="text-muted-foreground">
                  The lead scoring formula automatically adjusts its weights based on which factors actually predict answered calls for <em>your</em> specific leads.
                  Instead of generic weights (engagement, recency, etc.), it calibrates to your real data weekly. Needs 50+ call outcomes to activate.
                </p>

                <h4 className="text-foreground font-semibold mt-4 mb-2">3. Script A/B Testing</h4>
                <p className="text-muted-foreground">
                  Create multiple script variants for the same agent. The system automatically splits traffic using Thompson Sampling (a proven algorithm), 
                  tracks conversion rates per variant, and shifts traffic toward winners — while always keeping at least 10% on each variant to detect changes. 
                  Enable via <strong>Autonomous Agent → Settings → Enable Script A/B Testing</strong>.
                </p>

                <h4 className="text-foreground font-semibold mt-4 mb-2">4. Adaptive Pacing</h4>
                <p className="text-muted-foreground">
                  Automatically adjusts calls-per-minute based on real-time error rates and answer rates. If error rate spikes above 25%, pacing slows down. 
                  If answer rate is strong, pacing can increase. The system stores the optimal pace per campaign and applies it automatically.
                  Enable via <strong>Autonomous Agent → Settings → Auto Adjust Pacing</strong>.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="lead-journeys">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  Lead Journey Intelligence
                  <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">
                  Every lead is tracked through a complete sales journey with automated, psychology-based follow-up actions.
                </p>

                <h4 className="text-foreground font-semibold mb-2">Journey Stages</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Fresh</strong> — New lead, no contact attempts yet</li>
                  <li><strong>Attempting</strong> — Calls/SMS sent but no response</li>
                  <li><strong>Engaged</strong> — Lead has responded or answered</li>
                  <li><strong>Hot</strong> — Showing strong buying signals (long call duration, positive sentiment)</li>
                  <li><strong>Nurturing</strong> — Interested but not ready, needs periodic touches</li>
                  <li><strong>Stalled</strong> — Was engaged but stopped responding</li>
                  <li><strong>Dormant</strong> — No contact for 14+ days</li>
                  <li><strong>Callback Set</strong> — Lead explicitly requested a callback at a specific time</li>
                  <li><strong>Booked</strong> — Appointment confirmed</li>
                  <li><strong>Closed</strong> — Deal completed</li>
                </ul>

                <h4 className="text-foreground font-semibold mt-4 mb-2">Sales Psychology Playbook (18 Default Rules)</h4>
                <p className="text-muted-foreground">
                  Built-in follow-up rules based on proven sales research:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Speed-to-lead:</strong> Fresh leads get called within 5 minutes (Harvard study: 100x more likely to connect)</li>
                  <li><strong>Multi-channel:</strong> SMS sent within 2 minutes of unanswered call (+25% connect rate)</li>
                  <li><strong>Escalation:</strong> 3 call attempts with time-varied spacing, then value-driven AI SMS</li>
                  <li><strong>Callback honoring:</strong> Explicit callback requests are NEVER overridden — exact-time execution with advance reminder</li>
                  <li><strong>Booked confirmation:</strong> Immediate confirmation + day-before + morning-of reminders</li>
                  <li><strong>Breakup text:</strong> Last-resort re-engagement for stalled leads</li>
                </ul>

                <h4 className="text-foreground font-semibold mt-4 mb-2">How to Enable</h4>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Go to Autonomous Agent dashboard</li>
                  <li>Open the "Journeys" tab to see the stage distribution and upcoming actions</li>
                  <li>Enable the journey engine toggle in Autonomous Agent settings</li>
                  <li>The system will start tracking all leads and queueing follow-up actions automatically</li>
                </ol>

                <h4 className="text-foreground font-semibold mt-4 mb-2">Intelligence Features</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Best contact hour:</strong> Learned from when the lead actually answers calls</li>
                  <li><strong>Preferred channel:</strong> Learned from which channel (call vs SMS) gets responses</li>
                  <li><strong>Interest level:</strong> Computed from call duration, SMS replies, and sentiment signals</li>
                  <li><strong>Channel rotation:</strong> Alternates call/SMS when preference is unknown</li>
                  <li><strong>Daily touch cap:</strong> Prevents over-contacting (default 200/day across all leads)</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6" id="infrastructure">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  Infrastructure & Cron Jobs
                  <span className="text-xs font-semibold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">
                  Behind the scenes, several background processes keep the system running autonomously.
                </p>

                <h4 className="text-foreground font-semibold mb-2">Background Jobs (Cron)</h4>
                <p className="text-muted-foreground mb-2">
                  Three automated jobs run on a schedule using PostgreSQL's pg_cron extension:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-muted-foreground border border-border rounded">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2 font-semibold text-foreground">Job</th>
                        <th className="text-left p-2 font-semibold text-foreground">Schedule</th>
                        <th className="text-left p-2 font-semibold text-foreground">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="p-2">Automation Scheduler</td>
                        <td className="p-2">Every 1 min</td>
                        <td className="p-2">Queues leads for automated calling based on campaign rules</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="p-2">Voice Broadcast Processor</td>
                        <td className="p-2">Every 1 min</td>
                        <td className="p-2">Processes pending voice broadcast campaigns</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="p-2">AI Autonomous Engine</td>
                        <td className="p-2">Every 5 min</td>
                        <td className="p-2">Runs AI brain: goal tracking, lead scoring, pacing, journeys</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4 className="text-foreground font-semibold mt-4 mb-2">Edge Function Security</h4>
                <p className="text-muted-foreground">
                  Every backend function has a security setting (<code className="bg-muted px-1 rounded text-foreground">verify_jwt</code>) that controls access:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li><strong>Internal functions</strong> (AI engine, SMS, calling) — require authentication (JWT token)</li>
                  <li><strong>External webhooks</strong> (Twilio, Telnyx, Retell callbacks) — open access, since these services can't send our auth tokens. Security is handled through webhook signature verification instead.</li>
                </ul>
                <p className="text-muted-foreground mt-2">
                  This is configured in <code className="bg-muted px-1 rounded text-foreground">supabase/config.toml</code> and managed automatically during development. You should never need to change this manually.
                </p>

                <h4 className="text-foreground font-semibold mt-4 mb-2">How Cron Jobs Work</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>pg_cron fires at the scheduled interval inside the database</li>
                  <li>pg_net sends an HTTP POST to the edge function URL</li>
                  <li>The request uses the project's anon key as a Bearer token for authentication</li>
                  <li>No sensitive keys are exposed — the anon key is a safe, publishable token</li>
                </ol>
                <p className="text-muted-foreground mt-2">
                  These are database-level infrastructure settings. They persist across deployments and are not stored in source code files.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSystem;
