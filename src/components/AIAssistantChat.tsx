import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  MessageCircle, 
  X, 
  Send, 
  Loader2, 
  Bot, 
  User,
  Minimize2,
  Maximize2,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Wrench,
  Settings,
  FileText,
  Phone,
  Users,
  BarChart3,
  Calendar,
  ShieldAlert,
  Download,
  MessageSquare,
  Zap,
  ListChecks
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useVoiceChat } from '@/hooks/useVoiceChat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const QUICK_ACTIONS = [
  { label: '📊 Today\'s Stats', message: 'Get my stats for today - calls, answer rate, appointments, SMS activity' },
  { label: '🔍 Search Leads', message: 'Search for leads that need follow-up' },
  { label: '📞 Number Health', message: 'Check the health of my phone numbers - any spam flagged or quarantined?' },
  { label: '📋 Daily Report', message: 'Generate my daily performance report with wins, improvements, and recommendations.' },
  { label: '📈 Weekly Stats', message: 'Get my stats for this week - compare calls, appointments, and answer rates' },
  { label: '💾 Export Leads', message: 'Export all my leads to CSV format' },
];

const AVAILABLE_TOOLS = [
  { icon: BarChart3, name: 'Get Stats', description: 'Real-time call & SMS metrics' },
  { icon: Users, name: 'Search Leads', description: 'Find leads by name, phone, status' },
  { icon: ListChecks, name: 'Bulk Update', description: 'Update multiple leads at once' },
  { icon: Calendar, name: 'Schedule Callback', description: 'Set follow-up reminders' },
  { icon: ShieldAlert, name: 'Number Health', description: 'Check spam scores & status' },
  { icon: Zap, name: 'Move Pipeline', description: 'Move leads between stages' },
  { icon: Download, name: 'Export Data', description: 'Export leads to CSV' },
  { icon: Settings, name: 'Toggle Setting', description: 'Enable/disable features' },
  { icon: Settings, name: 'Update Setting', description: 'Change system settings' },
  { icon: Zap, name: 'Create Automation', description: 'Set up automation rules' },
  { icon: ListChecks, name: 'List Automations', description: 'View active rules' },
  { icon: X, name: 'Delete Automation', description: 'Remove automation rules' },
  { icon: FileText, name: 'Daily Report', description: 'Generate performance report' },
  { icon: Phone, name: 'Phone Setup', description: 'Guided phone number setup' },
  { icon: Phone, name: 'List SMS Numbers', description: 'Show available SMS numbers' },
  { icon: Users, name: 'Update Lead', description: 'Change lead status' },
  { icon: FileText, name: 'Create Campaign', description: 'Start new campaigns' },
  { icon: Settings, name: 'Update Campaign', description: 'Modify campaigns' },
  { icon: MessageSquare, name: 'Send SMS', description: 'Send from specific number' },
  { icon: ShieldAlert, name: 'Quarantine Number', description: 'Flag problematic numbers' },
];

interface AIAssistantChatProps {
  initialMessage?: string;
  configurationMode?: boolean;
}

export const AIAssistantChat: React.FC<AIAssistantChatProps> = ({ 
  initialMessage,
  configurationMode = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceId, setVoiceId] = useState('EXAVITQu4vr4xnSDxMaL');
  const [showConfigPreview, setShowConfigPreview] = useState(false);
  const [showConfigProgress, setShowConfigProgress] = useState(false);
  const [configPlan, setConfigPlan] = useState<any>(null);
  const [configSteps, setConfigSteps] = useState<any[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Listen for external open requests (from Quick Start cards)
  useEffect(() => {
    const handleOpenWithPrompt = (event: CustomEvent<{ prompt: string }>) => {
      setIsOpen(true);
      setIsMinimized(false);
      const promptToSend = event.detail.prompt;
      // Use a ref to avoid stale closure issues
      setTimeout(() => {
        // Create user message directly to avoid closure issues
        const userMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: promptToSend,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        
        // Make the API call directly
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase.functions.invoke('ai-assistant', {
              body: { 
                message: promptToSend,
                conversationHistory: [],
                userId: user?.id,
              },
            });

            if (error) throw error;

            const responseText = data.response || 'Sorry, I could not generate a response.';
            
            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: responseText,
              timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
          } catch (error) {
            console.error('AI Assistant error:', error);
            const errorMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: 'Sorry, I encountered an error. Please try again.',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
          } finally {
            setIsLoading(false);
          }
        })();
      }, 150);
    };

    window.addEventListener('open-ai-chat', handleOpenWithPrompt as EventListener);
    return () => {
      window.removeEventListener('open-ai-chat', handleOpenWithPrompt as EventListener);
    };
  }, []);

  // Load conversation history from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('ai-assistant-history');
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      } catch (error) {
        console.error('Error loading conversation history:', error);
      }
    }
  }, []);

  // Save conversation history to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('ai-assistant-history', JSON.stringify(messages));
    }
  }, [messages]);

  // Load settings from database
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from('ai_chatbot_settings')
          .select('voice_enabled, voice_id, auto_speak')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setVoiceEnabled(data.voice_enabled ?? true);
          setAutoSpeak(data.auto_speak ?? false);
          setVoiceId(data.voice_id ?? 'EXAVITQu4vr4xnSDxMaL');
        }
      } catch (error) {
        console.error('Error loading chatbot settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleVoiceTranscript = (text: string) => {
    setInputValue(text);
    // Auto-send after voice input
    setTimeout(() => {
      sendMessage(text);
    }, 100);
  };

  const { 
    isListening, 
    isSpeaking, 
    isProcessing, 
    startListening, 
    stopListening, 
    speak, 
    stopSpeaking 
  } = useVoiceChat({ 
    voiceId,
    onTranscript: handleVoiceTranscript 
  });

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Get current user ID for action execution
      const { data: { user } } = await supabase.auth.getUser();

      // Use configuration-specific endpoint in configuration mode
      const functionName = configurationMode ? 'ai-configuration-complete' : 'ai-assistant';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { 
          message: messageText.trim(),
          conversationHistory,
          userId: user?.id,
          mode: configurationMode ? 'configuration' : 'general',
        },
      });

      if (error) throw error;

      const responseText = data.response || 'Sorry, I could not generate a response.';
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Auto-speak if enabled
      if (autoSpeak && voiceEnabled) {
        speak(responseText);
      }
    } catch (error) {
      console.error('AI Assistant error:', error);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: error instanceof Error && error.message.includes('429') 
          ? 'I\'m getting too many requests right now. Please wait a moment and try again.'
          : error instanceof Error && error.message.includes('402')
          ? 'AI credits are depleted. Please add credits to continue using the assistant.'
          : 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      toast({
        title: 'Assistant Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const handleQuickAction = (message: string) => {
    sendMessage(message);
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        size="icon"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="sr-only">Open AI Assistant</span>
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="h-14 px-4 rounded-full shadow-lg bg-primary hover:bg-primary/90 flex items-center gap-2"
        >
          <Bot className="h-5 w-5" />
          <span>AI Assistant</span>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[500px] shadow-2xl z-50 flex flex-col border-2">
      <CardHeader className="pb-2 flex-shrink-0 bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5" />
            AI Assistant
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="h-6 px-2 text-xs gap-1"
                >
                  <Wrench className="h-3 w-3" />
                  20 Tools
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-72 p-0" 
                align="start"
                side="bottom"
              >
                <div className="p-3 border-b bg-muted/50">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Available AI Tools
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ask me to use any of these capabilities
                  </p>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-2 space-y-1">
                    {AVAILABLE_TOOLS.map((tool, idx) => (
                      <div 
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-default"
                      >
                        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <tool.icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{tool.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </CardTitle>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="h-7 px-2 text-xs gap-1"
                onClick={() => {
                  setMessages([]);
                  localStorage.removeItem('ai-assistant-history');
                  toast({
                    title: 'New Conversation',
                    description: 'Started fresh chat',
                  });
                }}
                title="Start new conversation"
              >
                <Sparkles className="h-3 w-3" />
                New Chat
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setIsMinimized(true)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center text-muted-foreground py-4">
                <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Hi! I'm your Smart Dialer assistant.</p>
                <p className="text-xs">I can guide you through setup step-by-step!</p>
              </div>
              
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Quick actions:</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((action, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-1.5 px-2"
                      onClick={() => handleQuickAction(action.message)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                  {message.role === 'user' && (
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <form onSubmit={handleSubmit} className="p-3 border-t bg-background">
          <div className="flex gap-2">
            {voiceEnabled && (
              <Button
                type="button"
                size="icon"
                variant={isListening ? "destructive" : "outline"}
                onClick={isListening ? stopListening : startListening}
                disabled={isLoading || isSpeaking}
                title={isListening ? "Stop listening" : "Start voice input"}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            )}
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isListening ? "Listening..." : "Ask me anything..."}
              disabled={isLoading || isListening}
              className="flex-1"
            />
            {voiceEnabled && isSpeaking && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={stopSpeaking}
                title="Stop speaking"
              >
                <VolumeX className="h-4 w-4" />
              </Button>
            )}
            {voiceEnabled && !isSpeaking && messages.length > 0 && (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => {
                  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
                  if (lastAssistant) speak(lastAssistant.content);
                }}
                disabled={isLoading || isProcessing}
                title="Replay last response"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            )}
            <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim() || isListening}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          {isListening && (
            <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
              🎤 Listening... speak now
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

export default AIAssistantChat;
