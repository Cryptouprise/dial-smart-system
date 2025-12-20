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
  ExternalLink
} from 'lucide-react';
import Navigation from '@/components/core/Navigation';

interface FeatureDoc {
  name: string;
  description: string;
  icon: React.ElementType;
  docSection: string;
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
