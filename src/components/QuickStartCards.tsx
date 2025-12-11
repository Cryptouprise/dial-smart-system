import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Radio, Bot, MessageSquare, Sparkles } from 'lucide-react';

interface QuickStartCardsProps {
  onOpenAIChat: (prompt: string) => void;
}

const QUICK_START_OPTIONS = [
  {
    id: 'voice-broadcast',
    icon: Radio,
    title: 'Quick Voice Broadcast',
    description: 'Record a message and blast it to your leads',
    prompt: "Help me set up a quick voice broadcast. I want to send a recorded message to my leads. Guide me through the setup step by step.",
    gradient: 'from-orange-500/20 to-red-500/20',
    iconColor: 'text-orange-500',
  },
  {
    id: 'ai-campaign',
    icon: Bot,
    title: 'AI Voice Campaign',
    description: 'Let AI make calls and have conversations for you',
    prompt: "Help me set up an AI voice campaign. I want my AI agent to call leads and have conversations. Guide me through the setup step by step, including phone numbers.",
    gradient: 'from-purple-500/20 to-blue-500/20',
    iconColor: 'text-purple-500',
  },
  {
    id: 'sms-blast',
    icon: MessageSquare,
    title: 'Quick SMS Blast',
    description: 'Send bulk SMS messages to your contacts',
    prompt: "Help me send a bulk SMS to my leads. Guide me through selecting a number and composing the message.",
    gradient: 'from-green-500/20 to-emerald-500/20',
    iconColor: 'text-green-500',
  },
];

const QuickStartCards: React.FC<QuickStartCardsProps> = ({ onOpenAIChat }) => {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Quick Start</h2>
        <span className="text-xs text-muted-foreground">— AI will guide you through setup</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {QUICK_START_OPTIONS.map((option) => (
          <Card 
            key={option.id}
            className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg border-2 hover:border-primary/50 bg-gradient-to-br ${option.gradient}`}
            onClick={() => onOpenAIChat(option.prompt)}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl bg-background/80 ${option.iconColor}`}>
                  <option.icon className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base mb-1">{option.title}</h3>
                  <p className="text-sm text-muted-foreground leading-snug">
                    {option.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default QuickStartCards;
