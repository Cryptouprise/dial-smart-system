import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, Phone, User, MessageSquare, Settings, 
  Zap, TrendingUp, Target, Clock
} from 'lucide-react';
import { AIAssistantChat } from '../AIAssistantChat';

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  prompt: string;
  category: 'campaign' | 'agent' | 'workflow' | 'general';
  estimatedTime: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'full-system-setup',
    title: 'Full System Setup',
    description: 'Walk me through setting up everything from scratch',
    icon: <Sparkles className="h-5 w-5" />,
    prompt: `I'm new and need to set up the entire dialer system from scratch. Please walk me through everything step by step:
1. First, help me get phone numbers
2. Then set up an AI voice agent
3. Import my leads
4. Create my first campaign
5. Set up follow-up workflows

Guide me through each step one at a time, explaining what each thing does and helping me configure it. Start with phone numbers.`,
    category: 'general',
    estimatedTime: '10-15 min'
  },
  {
    id: 'create-campaign',
    title: 'Create New Campaign',
    description: 'Set up a complete calling campaign with AI guidance',
    icon: <Phone className="h-5 w-5" />,
    prompt: 'I want to create a new calling campaign. Can you help me set it up?',
    category: 'campaign',
    estimatedTime: '2-3 min'
  },
  {
    id: 'create-agent',
    title: 'Create AI Agent',
    description: 'Build a custom AI voice agent for your campaigns',
    icon: <User className="h-5 w-5" />,
    prompt: 'I need to create a new AI agent. Let\'s configure it together.',
    category: 'agent',
    estimatedTime: '3-4 min'
  },
  {
    id: 'create-workflow',
    title: 'Build Workflow',
    description: 'Design a follow-up workflow with calls and SMS',
    icon: <MessageSquare className="h-5 w-5" />,
    prompt: 'Help me create a workflow for following up with leads.',
    category: 'workflow',
    estimatedTime: '2-3 min'
  },
  {
    id: 'optimize-settings',
    title: 'Optimize Settings',
    description: 'Review and improve your dialer configuration',
    icon: <Settings className="h-5 w-5" />,
    prompt: 'Can you review my current settings and suggest optimizations?',
    category: 'general',
    estimatedTime: '1-2 min'
  },
  {
    id: 'quick-campaign',
    title: 'Quick Campaign Setup',
    description: 'Fast-track setup with smart defaults',
    icon: <Zap className="h-5 w-5" />,
    prompt: 'I need to set up a campaign quickly. Use smart defaults and just ask me the essentials.',
    category: 'campaign',
    estimatedTime: '1 min'
  },
  {
    id: 'performance-review',
    title: 'Performance Analysis',
    description: 'Get insights and recommendations',
    icon: <TrendingUp className="h-5 w-5" />,
    prompt: 'Analyze my campaign performance and give me recommendations.',
    category: 'general',
    estimatedTime: '2 min'
  }
];

export const AISetupAssistant: React.FC = () => {
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [initialMessage, setInitialMessage] = useState('');

  const handleQuickAction = (action: QuickAction) => {
    setSelectedAction(action);
    setInitialMessage(action.prompt);
    setShowChat(true);
  };

  const handleStartFreeform = () => {
    setSelectedAction(null);
    setInitialMessage('');
    setShowChat(true);
  };

  if (showChat) {
    return (
      <div className="h-full flex flex-col min-h-[600px]">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">AI Setup Assistant</h2>
              {selectedAction && (
                <p className="text-sm text-muted-foreground">{selectedAction.title}</p>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowChat(false)}>
            Back to Quick Actions
          </Button>
        </div>
        
        <div className="flex-1 overflow-hidden p-4">
          <AIAssistantChat embedded={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">AI Setup Assistant</h1>
          <Badge variant="secondary" className="ml-2">Powered by AI</Badge>
        </div>
        <p className="text-muted-foreground text-lg">
          Let AI help you configure your dialer system. Choose a quick action below or start a free-form conversation.
        </p>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {QUICK_ACTIONS.map((action) => (
          <Card 
            key={action.id}
            className="hover:shadow-lg transition-shadow cursor-pointer group"
            onClick={() => handleQuickAction(action)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors`}>
                  {action.icon}
                </div>
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {action.estimatedTime}
                </Badge>
              </div>
              <CardTitle className="mt-4">{action.title}</CardTitle>
              <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-white transition-colors">
                Start Setup
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Free-form Chat Option */}
      <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Custom Configuration
          </CardTitle>
          <CardDescription>
            Have something specific in mind? Start a conversation and tell me exactly what you need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleStartFreeform} size="lg" className="w-full">
            <Sparkles className="h-5 w-5 mr-2" />
            Start Free-form Conversation
          </Button>
        </CardContent>
      </Card>

      {/* Info Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold">Intelligent</p>
                <p className="text-sm text-muted-foreground">AI understands your needs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-semibold">Fast</p>
                <p className="text-sm text-muted-foreground">Setup in minutes, not hours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="font-semibold">Precise</p>
                <p className="text-sm text-muted-foreground">Configured exactly how you want</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AISetupAssistant;
