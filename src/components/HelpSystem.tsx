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
  Radio,
  Trophy,
  Lightbulb,
  Headphones
} from 'lucide-react';
import Navigation from '@/components/Navigation';

interface FeatureDoc {
  name: string;
  description: string;
  icon: React.ElementType;
  docSection: string;
}

const features: FeatureDoc[] = [
  {
    name: 'Voice Broadcast System',
    description: 'Send mass voice broadcasts with IVR (press 1, press 2) and DTMF actions',
    icon: Radio,
    docSection: 'voice-broadcast'
  },
  {
    name: 'VICIdial Integration',
    description: 'Connect with VICIdial for hybrid AI-human workflows and agent control',
    icon: Headphones,
    docSection: 'vicidial'
  },
  {
    name: 'Real-Time Agent Coaching',
    description: 'AI-powered coaching prompts during live calls to improve performance',
    icon: Lightbulb,
    docSection: 'agent-coaching'
  },
  {
    name: 'Agent Benchmarking & Ranking',
    description: 'Multi-metric performance scoring with automatic lead routing to top agents',
    icon: Trophy,
    docSection: 'agent-ranking'
  },
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
  'voice-broadcast': '#voice-broadcast',
  'vicidial': '#vicidial',
  'agent-coaching': '#agent-coaching',
  'agent-ranking': '#agent-ranking',
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
  'ghl': '#ghl',
  'yellowstone': '#yellowstone',
  'analytics': '#analytics',
  'leads': '#leads',
  'campaigns': '#campaigns'
};

const HelpSystem = () => {
  const handleFeatureClick = (docSection: string) => {
    // For now, scroll to section or show toast
    // In production, this would navigate to detailed docs
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
          
          {/* Voice Broadcast System */}
          <div className="space-y-6" id="voice-broadcast">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-primary" />
                  Voice Broadcast System
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">Send mass voice broadcasts with interactive IVR (press 1, press 2) options and DTMF actions.</p>
                
                <h3 className="text-lg font-semibold mt-4">Quick Test Broadcast</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Navigate to the Voice Broadcast section</li>
                  <li>Enter the recipient phone number</li>
                  <li>Select your caller ID from available numbers</li>
                  <li>Write your broadcast message</li>
                  <li>Optionally add a transfer number for live agent handoff</li>
                  <li>Click "Send Test Call" to send immediately</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">Creating a Broadcast Campaign</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Click "Create New Broadcast"</li>
                  <li>Enter campaign name and description</li>
                  <li>Write your message text (converted to speech via ElevenLabs)</li>
                  <li>Select a voice for your broadcast</li>
                  <li>Configure IVR options:
                    <ul className="ml-6 mt-2 space-y-1">
                      <li>• Press 1: Transfer to agent (enter transfer number)</li>
                      <li>• Press 2: Schedule callback (set delay hours)</li>
                      <li>• Press 3: Add to Do Not Call list</li>
                    </ul>
                  </li>
                  <li>Set calling rate (calls per minute)</li>
                  <li>Add leads to the broadcast</li>
                  <li>Generate audio preview</li>
                  <li>Start the broadcast campaign</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">DTMF Actions</h3>
                <p className="text-muted-foreground">Configure what happens when recipients press different keys:</p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>Transfer:</strong> Connect caller to live agent</li>
                  <li><strong>Callback:</strong> Schedule automated callback at specified time</li>
                  <li><strong>DNC:</strong> Add to Do Not Call list</li>
                  <li><strong>Replay:</strong> Replay the message</li>
                  <li><strong>Voicemail:</strong> Leave voicemail option</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* VICIdial Integration */}
          <div className="space-y-6" id="vicidial">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Headphones className="h-5 w-5 text-primary" />
                  VICIdial Integration
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">Connect with your existing VICIdial infrastructure for hybrid AI-human workflows.</p>
                
                <h3 className="text-lg font-semibold mt-4">Setup</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Navigate to Settings → Providers</li>
                  <li>Click "Add Provider" and select "VICIdial"</li>
                  <li>Enter your VICIdial server URL</li>
                  <li>Enter API credentials (username and password)</li>
                  <li>Configure default agent and campaign settings</li>
                  <li>Click "Test Connection" to verify</li>
                  <li>Save configuration</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">Features</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>Agent Control:</strong> Dial, hangup, pause/resume agents remotely</li>
                  <li><strong>Dispositions:</strong> Set call outcomes and statuses</li>
                  <li><strong>Lead Management:</strong> Add and update leads in VICIdial</li>
                  <li><strong>Hybrid Workflows:</strong> AI qualifies leads, transfers to VICIdial agents</li>
                  <li><strong>Campaign Sync:</strong> Sync campaign data bidirectionally</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-4">Use Cases</h3>
                <p className="text-muted-foreground">Perfect for enterprises with existing VICIdial infrastructure:</p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>AI pre-qualifies leads, hot transfers to human agents</li>
                  <li>Use AI for high-volume screening, humans for closing</li>
                  <li>Gradual adoption without platform migration</li>
                  <li>Preserve existing agent training and processes</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Real-Time Agent Coaching */}
          <div className="space-y-6" id="agent-coaching">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  Real-Time Agent Coaching
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">AI-powered coaching prompts appear during live calls to help agents perform at their best.</p>
                
                <h3 className="text-lg font-semibold mt-4">How It Works</h3>
                <p className="text-muted-foreground">During active calls, the AI Coach analyzes the conversation in real-time and provides contextual suggestions:</p>
                
                <h3 className="text-lg font-semibold mt-4">Prompt Types</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>Suggestions:</strong> Build rapport, timing recommendations</li>
                  <li><strong>Objection Handling:</strong> Pre-loaded response templates for common objections</li>
                  <li><strong>Compliance:</strong> TCPA/regulatory reminders and disclosures</li>
                  <li><strong>Next Actions:</strong> Buying signals detected, suggest next steps</li>
                  <li><strong>Script Guidance:</strong> Value propositions and key talking points</li>
                  <li><strong>Warnings:</strong> Risky language alerts (income guarantees, false claims)</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-4">Configuration</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Coaching activates automatically during live calls</li>
                  <li>High-priority prompts appear as notifications</li>
                  <li>Adjust prompt interval in settings (default: 15 seconds)</li>
                  <li>View prompt history and action tracking</li>
                  <li>Mark prompts as "Applied" or "Dismiss"</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">Benefits</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>15-25% improvement in agent performance</li>
                  <li>Consistent quality across all agents</li>
                  <li>Reduced training time for new hires</li>
                  <li>Real-time compliance enforcement</li>
                  <li>Turn average agents into top performers</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Agent Benchmarking & Ranking */}
          <div className="space-y-6" id="agent-ranking">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Agent Benchmarking & Ranking
                </CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p className="text-muted-foreground mb-4">Multi-metric performance scoring system with automatic lead routing to your best performers.</p>
                
                <h3 className="text-lg font-semibold mt-4">Performance Scoring</h3>
                <p className="text-muted-foreground">Agents are scored using 6 weighted metrics:</p>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>Conversion Rate (30%):</strong> Calls that result in appointments/sales</li>
                  <li><strong>Transfer Success (20%):</strong> Successful warm transfers to closers</li>
                  <li><strong>Compliance (15%):</strong> Adherence to regulatory requirements</li>
                  <li><strong>Objection Handling (15%):</strong> Ability to overcome objections</li>
                  <li><strong>Script Adherence (10%):</strong> Following approved scripts</li>
                  <li><strong>Customer Sentiment (10%):</strong> Customer satisfaction and rapport</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-4">Ranking Tiers</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li><strong>🏆 Elite (85-100):</strong> Top performers - get high-value leads and complex situations</li>
                  <li><strong>🔵 Advanced (70-84):</strong> Strong performers - handle standard qualified leads</li>
                  <li><strong>🟢 Proficient (55-69):</strong> Developing agents - general leads and follow-ups</li>
                  <li><strong>⚪ Developing (0-54):</strong> Training - practice leads with AI coaching</li>
                </ul>
                
                <h3 className="text-lg font-semibold mt-4">Smart Lead Routing</h3>
                <p className="text-muted-foreground">High-value leads are automatically routed to your best agents:</p>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>System calculates real-time agent scores</li>
                  <li>New leads are prioritized by potential value</li>
                  <li>Elite agents receive high-value prospects first</li>
                  <li>Developing agents get training opportunities</li>
                  <li>Performance trends tracked over time</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">Viewing Performance</h3>
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Navigate to Analytics → Agent Benchmarking</li>
                  <li>View real-time leaderboard</li>
                  <li>Click any agent for detailed metrics</li>
                  <li>Review strengths and improvement areas</li>
                  <li>Track performance trends (up/down/stable)</li>
                </ol>
                
                <h3 className="text-lg font-semibold mt-4">Benefits</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                  <li>10-20% conversion improvement on high-value leads</li>
                  <li>Optimized agent utilization</li>
                  <li>Data-driven coaching and training</li>
                  <li>Fair, objective performance reviews</li>
                  <li>Automatic optimization - no manual routing needed</li>
                </ul>
              </CardContent>
            </Card>
          </div>
          
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
        </div>
      </div>
    </div>
  );
};

export default HelpSystem;
