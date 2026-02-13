import { useState, useRef, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Send, Phone, Wifi, Battery, Signal, Bot, Camera } from 'lucide-react';
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
  prospectCompany?: string;
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
const getCampaignOpeningMessage = (campaignType: string, businessName: string, prospectName?: string, prospectCompany?: string): string => {
  const greeting = prospectName ? `Hey ${prospectName}!` : 'Hey!';
  const companyMention = prospectCompany ? ` at ${prospectCompany}` : '';
  const messages: Record<string, string> = {
    database_reactivation: `${greeting} This is Lady Jarvis from ${businessName} 💜 Great chatting with you${companyMention}! I noticed you checked us out a while back. Is that still something you're looking for, or has that ship sailed?`,
    speed_to_lead: `⚡ That was fast, right? ${prospectName ? `${prospectName}` : 'there'}${companyMention}, Lady Jarvis here from ${businessName}! I saw you just checked us out online. What specific problem are you trying to solve?`,
    appointment_setter: `📅 ${greeting} Lady Jarvis from ${businessName} here. I help people${companyMention ? ` like ${prospectCompany}` : ''} get time with our team. What's the main thing you're hoping to accomplish?`,
    lead_qualification: `✅ ${prospectName ? `Hi ${prospectName}!` : 'Hi there!'} Lady Jarvis from ${businessName}. I'm here to see if we're a good fit for ${prospectCompany || 'your business'}. What's your biggest challenge right now?`,
    customer_service: `💬 ${greeting} Lady Jarvis from ${businessName} support${companyMention ? ` here for ${prospectCompany}` : ''}. How can I help you today?`,
    appointment_reminder: `🔔 ${greeting} Lady Jarvis from ${businessName} here${companyMention ? ` reaching out to ${prospectCompany}` : ''}. Quick reminder - you've got an appointment coming up. You still good for that?`,
    cross_sell: `🎁 ${greeting} Lady Jarvis from ${businessName}. Thanks for being a customer${companyMention ? ` - we love working with ${prospectCompany}` : ''}! How's everything going with what you have?`,
    cold_outreach: `👋 ${prospectName ? `Hi ${prospectName}!` : 'Hi!'} Lady Jarvis here from ${businessName}. I noticed ${prospectCompany || 'you'} might be a great fit for what we do. Got a quick sec?`,
    survey_feedback: `📊 ${greeting} Lady Jarvis from ${businessName}. We'd love to hear how ${prospectCompany ? `${prospectCompany}'s` : 'your'} experience has been. Mind sharing some quick feedback?`,
    win_back: `💔 ${prospectName ? `Hey ${prospectName}!` : 'Hey there!'} Lady Jarvis from ${businessName}. We miss ${prospectCompany || 'you'}! I wanted to check in and see if there's anything we can do to help.`,
  };
  
  return messages[campaignType] || messages.database_reactivation;
};

export const DemoPhoneMockup = ({
  campaignType,
  businessName = 'Call Boss',
  prospectName,
  prospectCompany,
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
    const opening = initialMessage || getCampaignOpeningMessage(campaignType, businessName, prospectName, prospectCompany);
    setMessages([
      {
        id: '1',
        text: opening,
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
  }, [campaignType, businessName, prospectName, prospectCompany, initialMessage]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    <div className="relative w-full max-w-[440px] mx-auto">
      {/* Dramatic outer glow */}
      <div className="absolute -inset-8 bg-gradient-to-b from-violet-500/30 via-primary/20 to-cyan-500/30 rounded-[4.5rem] blur-2xl opacity-70 animate-pulse pointer-events-none" />
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-cyan-500/20 rounded-[3.5rem] blur-xl opacity-50 pointer-events-none" />
      
      {/* iPhone 15 Pro Frame - Titanium */}
      <div className="relative">
        {/* Titanium outer frame with realistic bevels */}
        <div className="relative bg-gradient-to-br from-[#8a8a8f] via-[#6e6e73] to-[#48484a] rounded-[3rem] p-[2px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)]">
          {/* Inner titanium ring */}
          <div className="bg-gradient-to-b from-[#3a3a3c] to-[#1c1c1e] rounded-[2.9rem] p-[2px]">
            {/* Screen area with subtle curve simulation */}
            <div className="relative bg-black rounded-[2.8rem] overflow-hidden">
              
              {/* Side buttons - Volume */}
              <div className="absolute -left-[3px] top-28 w-[3px] h-8 bg-gradient-to-r from-[#6e6e73] to-[#48484a] rounded-l-sm" />
              <div className="absolute -left-[3px] top-40 w-[3px] h-8 bg-gradient-to-r from-[#6e6e73] to-[#48484a] rounded-l-sm" />
              {/* Side button - Power */}
              <div className="absolute -right-[3px] top-32 w-[3px] h-12 bg-gradient-to-l from-[#6e6e73] to-[#48484a] rounded-r-sm" />
              
              {/* Screen with edge-to-edge display */}
              <div className="relative m-[3px] rounded-[2.6rem] overflow-hidden bg-black">
                
                {/* Dynamic Island */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                  <div className="relative">
                    {/* Glow effect when active */}
                    <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md opacity-50 animate-pulse" />
                    <div className="relative w-[120px] h-[36px] bg-black rounded-full flex items-center justify-center shadow-lg">
                      {/* Camera cutout */}
                      <div className="absolute left-4 w-3 h-3 rounded-full bg-[#1a1a1c] ring-[0.5px] ring-[#2a2a2c]">
                        <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-[#2d2d30] to-[#0a0a0a]" />
                        <div className="absolute top-[3px] left-[3px] w-1 h-1 rounded-full bg-[#4a4a50]" />
                      </div>
                      {/* Face ID sensors */}
                      <div className="absolute right-4 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1c]" />
                        <div className="w-2 h-2 rounded-full bg-[#1a1a1c] ring-[0.5px] ring-[#2a2a2c]" />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Status Bar */}
                <div className="relative flex items-center justify-between px-7 pt-4 pb-2 text-white text-xs">
                  <span className="font-semibold text-sm tracking-tight">9:41</span>
                  <div className="flex items-center gap-1">
                    <Signal className="h-4 w-4" />
                    <Wifi className="h-4 w-4" />
                    <div className="flex items-center">
                      <div className="w-6 h-3 border border-white/80 rounded-[3px] relative">
                        <div className="absolute inset-[1px] right-[2px] bg-emerald-500 rounded-[2px]" />
                      </div>
                      <div className="w-[2px] h-1.5 bg-white/80 rounded-r-sm ml-[1px]" />
                    </div>
                  </div>
                </div>

                {/* Messages Header - iOS Style */}
                <div className="bg-[#1c1c1e]/95 backdrop-blur-xl px-4 py-2.5 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    {/* Premium avatar */}
                    <div className="relative">
                      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 blur opacity-60" />
                      <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 via-primary to-cyan-500 flex items-center justify-center shadow-lg ring-2 ring-white/10">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#1c1c1e] shadow-sm" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold text-sm">Lady Jarvis</p>
                      <p className="text-white/50 text-xs flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {getCampaignSubtitle(campaignType)}
                      </p>
                    </div>
                    <div className="p-2 rounded-full bg-primary/20">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                </div>

                {/* Messages Container - iOS Style */}
                <div className="h-[340px] overflow-y-auto bg-black p-3 space-y-2.5">
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
                          'max-w-[82%] px-3.5 py-2 text-[15px] animate-in slide-in-from-bottom-1 duration-200',
                          message.sender === 'user'
                            ? 'bg-primary text-white rounded-[20px] rounded-br-[4px]'
                            : 'bg-[#2c2c2e] text-white rounded-[20px] rounded-bl-[4px]'
                        )}
                      >
                        <p className="whitespace-pre-wrap leading-[1.35]">{message.text}</p>
                        <p className={cn(
                          'text-[10px] mt-1 opacity-60',
                          message.sender === 'user' ? 'text-right' : ''
                        )}>
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing indicator - iOS style */}
                  {isSending && (
                    <div className="flex justify-start">
                      <div className="bg-[#2c2c2e] px-4 py-3 rounded-[20px] rounded-bl-[4px]">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area - iOS Style */}
                <div className="bg-[#1c1c1e] p-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <button className="p-2 text-primary" type="button">
                      <Camera className="h-5 w-5" />
                    </button>
                    <div className="flex-1 relative">
                      <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="iMessage"
                        className="w-full bg-[#2c2c2e] border-0 text-white placeholder:text-white/30 rounded-full text-[15px] h-10 px-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        disabled={isSending || isLoading}
                        autoComplete="off"
                      />
                    </div>
                    <Button
                      size="icon"
                      type="button"
                      onClick={handleSend}
                      disabled={!inputValue.trim() || isSending || isLoading}
                      className="rounded-full shrink-0 h-9 w-9 bg-primary hover:bg-primary/90 shadow-lg disabled:opacity-30"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Home Indicator */}
                <div className="flex justify-center py-2 bg-black">
                  <div className="w-32 h-[5px] bg-white/80 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Premium shadow and reflection */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[70%] h-16 bg-gradient-to-b from-black/40 via-primary/10 to-transparent rounded-full blur-2xl pointer-events-none" />
    </div>
  );
};
