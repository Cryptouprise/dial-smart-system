import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Phone, Wifi, Battery, Signal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: Date;
}

interface DemoPhoneMockupProps {
  campaignType: string;
  businessName?: string;
  prospectName?: string;
  onSendMessage?: (message: string) => Promise<string>;
  initialMessage?: string;
  isLoading?: boolean;
}

// Campaign type to subtitle mapping
const getCampaignSubtitle = (campaignType: string): string => {
  const subtitles: Record<string, string> = {
    database_reactivation: 'Database Reactivation',
    speed_to_lead: 'Speed to Lead',
    appointment_setter: 'Appointment Setter',
    lead_qualification: 'Lead Qualification',
    customer_service: 'Customer Service',
    appointment_reminder: 'Appointment Reminder',
    cross_sell: 'Cross-Sell Campaign',
    cold_outreach: 'Cold Outreach',
    survey_feedback: 'Survey & Feedback',
    win_back: 'Win-Back Campaign',
  };
  return subtitles[campaignType] || 'AI Sales Assistant';
};

// Opening messages per campaign type
const getCampaignOpeningMessage = (campaignType: string, businessName: string, prospectName?: string): string => {
  const greeting = prospectName ? `Hey ${prospectName}!` : 'Hey!';
  const messages: Record<string, string> = {
    database_reactivation: `${greeting} This is Lady Jarvis from ${businessName} 💜 Great chatting with you! I noticed you checked us out a while back. Is that still something you're looking for, or has that ship sailed?`,
    speed_to_lead: `⚡ That was fast, right? ${prospectName ? `${prospectName}, ` : ''}Lady Jarvis here from ${businessName}! I saw you just checked us out online. What specific problem are you trying to solve?`,
    appointment_setter: `📅 ${greeting} Lady Jarvis from ${businessName} here. I help people get time with our team. What's the main thing you're hoping to accomplish?`,
    lead_qualification: `✅ ${prospectName ? `Hi ${prospectName}!` : 'Hi there!'} Lady Jarvis from ${businessName}. I'm here to see if we're a good fit for each other. What's your biggest challenge right now?`,
    customer_service: `💬 ${greeting} Lady Jarvis from ${businessName} support. How can I help you today?`,
    appointment_reminder: `🔔 ${greeting} Lady Jarvis from ${businessName} here. Quick reminder - you've got an appointment coming up. You still good for that?`,
    cross_sell: `🎁 ${greeting} Lady Jarvis from ${businessName}. Thanks for being a customer! How's everything going with what you have?`,
    cold_outreach: `👋 ${prospectName ? `Hi ${prospectName}!` : 'Hi!'} Lady Jarvis here from ${businessName}. I noticed you might be a great fit for what we do. Got a quick sec?`,
    survey_feedback: `📊 ${greeting} Lady Jarvis from ${businessName}. We'd love to hear how your experience has been. Mind sharing some quick feedback?`,
    win_back: `💔 ${prospectName ? `Hey ${prospectName}!` : 'Hey there!'} Lady Jarvis from ${businessName}. We miss you! I wanted to check in and see if there's anything we can do to help.`,
  };
  
  return messages[campaignType] || messages.database_reactivation;
};

export const DemoPhoneMockup = ({
  campaignType,
  businessName = 'Call Boss',
  prospectName,
  onSendMessage,
  initialMessage,
  isLoading = false,
}: DemoPhoneMockupProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with opening message
  useEffect(() => {
    const opening = initialMessage || getCampaignOpeningMessage(campaignType, businessName, prospectName);
    setMessages([
      {
        id: '1',
        text: opening,
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
  }, [campaignType, businessName, prospectName, initialMessage]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      if (onSendMessage) {
        const reply = await onSendMessage(userMessage.text);
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: reply,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Failed to get AI reply:', error);
      // Add fallback message
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "Got it! Let me look into that for you. Want me to have someone from the team reach out?",
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <Card className="w-full max-w-[320px] mx-auto bg-zinc-900 rounded-[2.5rem] p-2 shadow-2xl border-zinc-800">
      {/* Phone Frame */}
      <div className="relative bg-black rounded-[2rem] overflow-hidden">
        {/* Status Bar */}
        <div className="flex items-center justify-between px-6 py-2 text-white text-xs">
          <span className="font-semibold">9:41</span>
          <div className="absolute left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full" />
          <div className="flex items-center gap-1">
            <Signal className="h-3.5 w-3.5" />
            <Wifi className="h-3.5 w-3.5" />
            <Battery className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Messages Header */}
        <div className="bg-zinc-900/80 backdrop-blur px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Lady Jarvis</p>
              <p className="text-zinc-400 text-xs">{getCampaignSubtitle(campaignType)}</p>
            </div>
          </div>
        </div>

        {/* Messages Container */}
        <div className="h-[320px] overflow-y-auto bg-zinc-950 p-3 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex',
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] px-3 py-2 rounded-2xl text-sm animate-in slide-in-from-bottom-2',
                  message.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-md'
                )}
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                <p className={cn(
                  'text-[10px] mt-1',
                  message.sender === 'user' ? 'text-primary-foreground/70' : 'text-zinc-500'
                )}>
                  {formatTime(message.timestamp)}
                </p>
              </div>
            </div>
          ))}
          
          {/* Typing indicator */}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-zinc-900 p-3 border-t border-zinc-800">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a reply..."
              className="flex-1 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-full text-sm"
              disabled={isSending || isLoading}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending || isLoading}
              className="rounded-full shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="flex justify-center py-2 bg-black">
          <div className="w-32 h-1 bg-zinc-600 rounded-full" />
        </div>
      </div>
    </Card>
  );
};
