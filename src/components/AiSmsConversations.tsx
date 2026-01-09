/**
 * AI SMS Conversations Component
 * 
 * Full-featured SMS conversation view with:
 * - Threaded conversations
 * - AI response generation (Lovable AI & Retell AI)
 * - Image support
 * - Reaction display
 * - Context-aware messaging
 * - Provider selection
 * - New conversation creation
 * - SMS templates
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare,
  Send,
  RefreshCw,
  Sparkles,
  Image as ImageIcon,
  Settings,
  Phone,
  Clock,
  Check,
  CheckCheck,
  Bot,
  User,
  X,
  Plus,
  FileText,
  Zap,
  ArrowLeft,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ChevronRight,
  Globe,
  Search,
  Calendar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAiSmsMessaging, type SmsConversation, type SmsMessage } from '@/hooks/useAiSmsMessaging';
import { useTwilioIntegration } from '@/hooks/useTwilioIntegration';
import { useDebounce } from '@/hooks/useDebounce';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { normalizePhoneNumber, formatPhoneNumber, getPhoneValidationError } from '@/lib/phoneUtils';
import type { AiSmsSettings } from '@/hooks/useAiSmsMessaging';

// Calendar Integration Section Component
const CalendarIntegrationSection: React.FC<{
  settings: AiSmsSettings | null;
  updateSettings: (updates: Partial<AiSmsSettings>) => Promise<boolean>;
}> = ({ settings, updateSettings }) => {
  const { toast } = useToast();
  const [calendarStatus, setCalendarStatus] = useState<{
    connected: boolean;
    provider?: string;
    email?: string;
    calendarName?: string;
    loading: boolean;
  }>({ connected: false, loading: true });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const fetchCalendarStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: integrations } = await supabase
          .from('calendar_integrations')
          .select('provider, provider_account_email, calendar_name, sync_enabled')
          .eq('user_id', user.id)
          .eq('sync_enabled', true)
          .limit(1);

        if (integrations && integrations.length > 0) {
          const cal = integrations[0];
          setCalendarStatus({
            connected: true,
            provider: cal.provider,
            email: cal.provider_account_email || cal.calendar_name,
            calendarName: cal.calendar_name,
            loading: false,
          });
        } else {
          setCalendarStatus({ connected: false, loading: false });
        }
      } catch (error) {
        console.error('Error fetching calendar status:', error);
        setCalendarStatus({ connected: false, loading: false });
      }
    };

    fetchCalendarStatus();
  }, []);

  const testCalendarConnection = async () => {
    setTesting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for availability data
      const { data: availability } = await supabase
        .from('calendar_availability')
        .select('weekly_schedule, timezone')
        .eq('user_id', user.id)
        .maybeSingle();

      // Check for upcoming appointments
      const { data: appointments, count } = await supabase
        .from('calendar_appointments')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .gte('start_time', new Date().toISOString())
        .limit(3);

      if (availability) {
        toast({
          title: "Calendar Working!",
          description: `Found availability settings (${availability.timezone}) and ${count || 0} upcoming appointments. AI can check your schedule.`,
        });
      } else {
        toast({
          title: "No Availability Set",
          description: "Go to Settings → Calendar to set your available times.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Calendar test error:', error);
      toast({
        title: "Calendar Test Failed",
        description: "Could not verify calendar access.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border-t pt-4 mt-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Calendar Integration
      </h4>
      
      <div className="flex items-center justify-between mb-4">
        <div>
          <Label htmlFor="calendar-integration">Enable Calendar Access</Label>
          <p className="text-sm text-muted-foreground">AI can check availability & book appointments</p>
        </div>
        <Switch
          id="calendar-integration"
          checked={settings?.enable_calendar_integration || false}
          onCheckedChange={(checked) => updateSettings({ enable_calendar_integration: checked })}
        />
      </div>

      {settings?.enable_calendar_integration && (
        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
          {/* Connection Status */}
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-medium text-sm mb-2">Connection Status:</p>
            {calendarStatus.loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking...
              </div>
            ) : calendarStatus.connected ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCheck className="h-4 w-4" />
                <span className="capitalize">{calendarStatus.provider}</span> connected
                {calendarStatus.email && (
                  <span className="text-muted-foreground text-xs">({calendarStatus.email})</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="h-4 w-4" />
                  No calendar connected
                </div>
                <p className="text-xs text-muted-foreground">
                  AI will use your availability settings. Connect Google/Outlook in Settings → Calendar for real-time sync.
                </p>
              </div>
            )}
          </div>

          {/* Test Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={testCalendarConnection}
            disabled={testing}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Test Calendar Access
              </>
            )}
          </Button>

          {/* Booking Link */}
          <div className="space-y-2">
            <Label htmlFor="booking-link">Calendly/Booking Link (Optional)</Label>
            <Input
              id="booking-link"
              value={settings?.calendar_booking_link || ''}
              onChange={(e) => updateSettings({ calendar_booking_link: e.target.value })}
              placeholder="https://calendly.com/yourname/15min"
            />
            <p className="text-xs text-muted-foreground">
              AI will share this link when leads want to schedule
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Pre-defined SMS templates
const SMS_TEMPLATES = [
  {
    id: 'greeting',
    name: 'Greeting',
    category: 'General',
    message: "Hi! Thanks for reaching out. How can I help you today?"
  },
  {
    id: 'follow-up',
    name: 'Follow Up',
    category: 'Sales',
    message: "Hi {name}, I wanted to follow up on our conversation. Do you have any questions I can help answer?"
  },
  {
    id: 'appointment-reminder',
    name: 'Appointment Reminder',
    category: 'Scheduling',
    message: "Hi {name}, this is a reminder about your upcoming appointment. Please reply YES to confirm or call us to reschedule."
  },
  {
    id: 'thank-you',
    name: 'Thank You',
    category: 'General',
    message: "Thank you for your time today! If you have any questions, feel free to reach out anytime."
  },
  {
    id: 'callback-request',
    name: 'Callback Request',
    category: 'Sales',
    message: "Hi {name}, I noticed I missed your call. When would be a good time to call you back?"
  },
  {
    id: 'info-request',
    name: 'Info Request',
    category: 'General',
    message: "Hi! To better assist you, could you please provide some additional details about your inquiry?"
  },
  {
    id: 'pricing',
    name: 'Pricing Info',
    category: 'Sales',
    message: "Thanks for your interest! Our pricing starts at $X. Would you like me to send you more detailed information?"
  },
  {
    id: 'out-of-office',
    name: 'Out of Office',
    category: 'General',
    message: "Thanks for your message! I'm currently away but will respond as soon as possible. For urgent matters, please call our main line."
  },
];

const AiSmsConversations: React.FC = () => {
  const navigate = useNavigate();
  const {
    isLoading,
    conversations,
    currentMessages,
    settings,
    loadConversations,
    loadMessages,
    sendMessage,
    generateAIResponse,
    updateSettings,
  } = useAiSmsMessaging();
  
  const { checkA2PStatus, addNumberToCampaign, configureSmsWebhook, isLoading: isLoadingA2P } = useTwilioIntegration();

  const [selectedConversation, setSelectedConversation] = useState<SmsConversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showA2PStatus, setShowA2PStatus] = useState(false);
  const [a2pStatus, setA2PStatus] = useState<{
    phone_numbers?: Array<{
      sid: string;
      phone_number: string;
      friendly_name?: string;
      a2p_registered?: boolean;
      messaging_service_sid?: string;
      messaging_service_name?: string;
    }>;
    messaging_services?: Array<{
      sid: string;
      friendly_name: string;
      use_case?: string;
      us_app_to_person_registered?: boolean;
      associated_phone_numbers?: string[];
    }>;
    brand_registrations?: Array<{
      sid: string;
      brand_type: string;
      status: string;
    }>;
    campaigns?: Array<{
      sid: string;
      use_case: string;
      status: string;
      messaging_service_name?: string;
    }>;
    summary?: {
      total_numbers: number;
      registered_numbers: number;
      pending_numbers: number;
      unregistered_numbers: number;
    };
  } | null>(null);
  const [a2pTab, setA2pTab] = useState('overview');
  const [selectedCampaignSid, setSelectedCampaignSid] = useState('');
  const [numberToAddToCampaign, setNumberToAddToCampaign] = useState('');
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local state for text fields to prevent losing focus on every keystroke
  const [localAiPersonality, setLocalAiPersonality] = useState('');
  const [localCustomInstructions, setLocalCustomInstructions] = useState('');
  const [localKnowledgeBase, setLocalKnowledgeBase] = useState('');
  
  // Sync local state with settings when settings load
  useEffect(() => {
    if (settings) {
      setLocalAiPersonality(settings.ai_personality || '');
      setLocalCustomInstructions(settings.custom_instructions || '');
      setLocalKnowledgeBase(settings.knowledge_base || '');
    }
  }, [settings?.id]); // Only re-sync when settings ID changes (initial load)
  
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search input
  const [availableTwilioNumbers, setAvailableTwilioNumbers] = useState<Array<{number: string, friendly_name?: string}>>([]);
  const [selectedFromNumber, setSelectedFromNumber] = useState('');
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [configuringWebhook, setConfiguringWebhook] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleConfigureWebhook = async () => {
    setConfiguringWebhook(true);
    try {
      await configureSmsWebhook();
    } finally {
      setConfiguringWebhook(false);
    }
  };

  const handleCheckA2PStatus = async () => {
    setShowA2PStatus(true);
    const status = await checkA2PStatus();
    setA2PStatus(status);
  };

  const handleAddNumberToCampaign = async () => {
    if (!numberToAddToCampaign || !selectedCampaignSid) {
      toast({
        title: 'Missing Information',
        description: 'Please select both a phone number and a messaging service',
        variant: 'destructive',
      });
      return;
    }

    setAddingToCampaign(true);
    try {
      await addNumberToCampaign(numberToAddToCampaign, selectedCampaignSid);
      // Refresh A2P status
      const status = await checkA2PStatus();
      setA2PStatus(status);
      setNumberToAddToCampaign('');
      setSelectedCampaignSid('');
    } catch (error) {
      // Error handled in hook
    } finally {
      setAddingToCampaign(false);
    }
  };

  // Load available Twilio numbers on mount
  useEffect(() => {
    const loadAvailableNumbers = async () => {
      setLoadingNumbers(true);
      try {
        const { data, error } = await supabase.functions.invoke('sms-messaging', {
          body: { action: 'get_available_numbers' }
        });
        if (error) throw error;
        const numbers = data?.numbers || [];
        setAvailableTwilioNumbers(numbers);
        // Auto-select first number if available
        if (numbers.length > 0 && !selectedFromNumber) {
          setSelectedFromNumber(numbers[0].number);
        }
      } catch (error) {
        console.error('[AiSmsConversations] Failed to load available numbers:', error);
      } finally {
        setLoadingNumbers(false);
      }
    };
    loadAvailableNumbers();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // Real-time subscription for new messages and updates
  useEffect(() => {
    const channel = supabase
      .channel('sms-messages-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_messages',
        },
        async (payload) => {
          try {
            console.log('[AiSmsConversations] New message received:', payload);
            const newMessage = payload.new as {
              conversation_id?: string;
              direction?: string;
              is_ai_generated?: boolean;
            };
            
            // Reload conversations to update list
            await loadConversations();
            
            // If this message is for the selected conversation, reload messages
            if (selectedConversation && newMessage?.conversation_id === selectedConversation.id) {
              await loadMessages(selectedConversation.id);
            }
          } catch (error) {
            console.error('[AiSmsConversations] Error handling new message:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sms_messages',
        },
        async (payload) => {
          try {
            console.log('[AiSmsConversations] Message updated:', payload);
            const updatedMessage = payload.new as {
              conversation_id?: string;
            };
            
            // If this message is for the selected conversation, reload messages
            if (selectedConversation && updatedMessage?.conversation_id === selectedConversation.id) {
              await loadMessages(selectedConversation.id);
            }
          } catch (error) {
            console.error('[AiSmsConversations] Error handling message update:', error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation, loadConversations, loadMessages]);

  const handleSelectConversation = async (conversation: SmsConversation) => {
    setSelectedConversation(conversation);
    
    // Auto-select the last used "from" number for this conversation
    if (conversation.last_from_number) {
      const numberExists = availableTwilioNumbers.some(n => n.number === conversation.last_from_number);
      if (numberExists) {
        setSelectedFromNumber(conversation.last_from_number);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageText.trim()) return;

    // Use the selected from number or first available Twilio number
    const fromNumber = selectedFromNumber || availableTwilioNumbers[0]?.number;

    if (!fromNumber) {
      toast({
        title: 'No Phone Number',
        description: 'No SMS-capable phone numbers found in your Twilio account. Please add a number in Twilio first.',
        variant: 'destructive',
      });
      return;
    }

    const success = await sendMessage(
      selectedConversation.id,
      selectedConversation.contact_phone,
      fromNumber,
      messageText
    );

    if (success) {
      setMessageText('');
      
      // Save the "from" number for this conversation so it auto-selects next time
      try {
        await supabase
          .from('sms_conversations')
          .update({ last_from_number: fromNumber })
          .eq('id', selectedConversation.id);
      } catch (error) {
        console.error('Failed to save last from number:', error);
      }
    }
  };

  const handleGenerateAI = async () => {
    if (!selectedConversation) return;

    setIsGeneratingAI(true);
    const response = await generateAIResponse(selectedConversation.id);
    setIsGeneratingAI(false);

    if (response) {
      setMessageText(response);
    }
  };

  const handleCreateConversation = async () => {
    if (!newContactPhone.trim()) {
      toast({
        title: 'Phone Required',
        description: 'Please enter a phone number',
        variant: 'destructive',
      });
      return;
    }

    // Validate phone number
    const validationError = getPhoneValidationError(newContactPhone);
    if (validationError) {
      toast({
        title: 'Invalid Phone Number',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(newContactPhone);
    if (!normalizedPhone) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Could not normalize phone number. Please use format: +1234567890',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return;
      }

      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('sms_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('contact_phone', normalizedPhone)
        .maybeSingle();

      if (existing) {
        setSelectedConversation(existing as SmsConversation);
        setShowNewConversation(false);
        setNewContactPhone('');
        setNewContactName('');
        toast({
          title: 'Conversation Found',
          description: 'Selected existing conversation',
        });
        return;
      }

      // Create new conversation
      const { data: newConv, error } = await supabase
        .from('sms_conversations')
        .insert({
          user_id: user.id,
          contact_phone: normalizedPhone,
          contact_name: newContactName.trim() || null,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: 'Conversation Created',
        description: `Started conversation with ${formatPhoneNumber(normalizedPhone)}`,
      });

      await loadConversations();
      setSelectedConversation(newConv as SmsConversation);
      setShowNewConversation(false);
      setNewContactPhone('');
      setNewContactName('');
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive',
      });
    }
  };

  const handleUseTemplate = (template: typeof SMS_TEMPLATES[0]) => {
    let message = template.message;
    // Replace placeholders with contact name if available
    if (selectedConversation?.contact_name) {
      message = message.replace(/{name}/g, selectedConversation.contact_name);
    } else {
      message = message.replace(/{name}/g, 'there');
    }
    setMessageText(message);
  };

  const getMessageStatusIcon = (message: SmsMessage) => {
    if (message.direction === 'inbound') return null;

    switch (message.status) {
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'sent':
        return <Check className="h-3 w-3 text-gray-500" />;
      case 'failed':
        return <X className="h-3 w-3 text-red-500" />;
      default:
        return <Clock className="h-3 w-3 text-gray-400" />;
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (!debouncedSearchQuery) return true;
    const search = debouncedSearchQuery.toLowerCase();
    // Search by phone number, contact name, or context summary
    return (
      conv.contact_phone.includes(search) ||
      (conv.contact_name && conv.contact_name.toLowerCase().includes(search)) ||
      (conv.context_summary && conv.context_summary.toLowerCase().includes(search))
    );
  });

  if (showSettings) {
    return (
      <div className="h-screen flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  AI SMS Settings
                </CardTitle>
                <CardDescription>
                  Configure AI behavior and provider selection
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowSettings(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-6 max-w-2xl">
              {/* Enable AI SMS */}
              <div className="flex items-center justify-between">
                <Label htmlFor="ai-enabled">Enable AI SMS</Label>
                <Switch
                  id="ai-enabled"
                  checked={settings?.enabled || false}
                  onCheckedChange={(checked) => updateSettings({ enabled: checked })}
                />
              </div>

              {/* AI Provider Selection */}
              <div className="space-y-2">
                <Label htmlFor="ai-provider" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  AI Provider
                </Label>
                <Select
                  value={settings?.ai_provider || 'lovable'}
                  onValueChange={(value: 'lovable' | 'retell') => updateSettings({ ai_provider: value })}
                >
                  <SelectTrigger id="ai-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lovable">
                      <div className="flex flex-col">
                        <span className="font-medium">Lovable AI</span>
                        <span className="text-xs text-muted-foreground">Powered by Gemini - Best for images & context</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="retell">
                      <div className="flex flex-col">
                        <span className="font-medium">Retell AI</span>
                        <span className="text-xs text-muted-foreground">Voice-optimized SMS responses</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Retell AI Configuration */}
              {settings?.ai_provider === 'retell' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="retell-llm">Retell LLM ID</Label>
                    <Input
                      id="retell-llm"
                      value={settings?.retell_llm_id || ''}
                      onChange={(e) => updateSettings({ retell_llm_id: e.target.value })}
                      placeholder="llm_xxxxxxxxxxxxx"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get this from your Retell AI dashboard
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retell-voice">Retell Voice ID (Optional)</Label>
                    <Input
                      id="retell-voice"
                      value={settings?.retell_voice_id || ''}
                      onChange={(e) => updateSettings({ retell_voice_id: e.target.value })}
                      placeholder="voice_xxxxxxxxxxxxx"
                    />
                  </div>
                </>
              )}

              {/* Settings organized in tabs */}
              <Tabs defaultValue="personality" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="personality">Personality</TabsTrigger>
                  <TabsTrigger value="instructions">Instructions</TabsTrigger>
                  <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
                  <TabsTrigger value="context">Context</TabsTrigger>
                </TabsList>

                {/* Personality Tab */}
                <TabsContent value="personality" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-personality">AI Personality</Label>
                    <Textarea
                      id="ai-personality"
                      value={localAiPersonality}
                      onChange={(e) => setLocalAiPersonality(e.target.value)}
                      onBlur={() => {
                        if (localAiPersonality !== (settings?.ai_personality || '')) {
                          updateSettings({ ai_personality: localAiPersonality });
                        }
                      }}
                      placeholder="e.g., professional and helpful, friendly and casual, warm and empathetic..."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      Describe the tone and style of AI responses
                    </p>
                  </div>

                  {/* Auto Response */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto-response">Auto Response</Label>
                      <p className="text-sm text-muted-foreground">Automatically respond to incoming messages</p>
                    </div>
                    <Switch
                      id="auto-response"
                      checked={settings?.auto_response_enabled || false}
                      onCheckedChange={(checked) => updateSettings({ auto_response_enabled: checked })}
                    />
                  </div>

                  {/* Response Delay */}
                  <div className="space-y-2">
                    <Label htmlFor="response-delay">Response Delay (seconds)</Label>
                    <Input
                      id="response-delay"
                      type="number"
                      value={settings?.double_text_delay_seconds || 2}
                      onChange={(e) => updateSettings({ double_text_delay_seconds: parseInt(e.target.value) })}
                      min={0}
                      max={300}
                    />
                    <p className="text-xs text-muted-foreground">
                      Time to wait before sending auto-response (prevents immediate replies)
                    </p>
                  </div>
                </TabsContent>

                {/* Instructions Tab */}
                <TabsContent value="instructions" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="custom-instructions" className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Custom Instructions / Rules
                    </Label>
                    <Textarea
                      id="custom-instructions"
                      value={localCustomInstructions}
                      onChange={(e) => setLocalCustomInstructions(e.target.value)}
                      onBlur={() => {
                        if (localCustomInstructions !== (settings?.custom_instructions || '')) {
                          updateSettings({ custom_instructions: localCustomInstructions });
                        }
                      }}
                      placeholder={`Enter rules and guidelines for the AI to follow:

- Always greet the customer by name
- Never discuss pricing over text
- If they ask about appointments, direct them to call
- Be empathetic when handling complaints
- Always end with a question to keep conversation going`}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Specific rules, guidelines, and behaviors the AI should follow
                    </p>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Available Dynamic Variables</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <code className="bg-background px-2 py-1 rounded">{"{{first_name}}"}</code>
                      <code className="bg-background px-2 py-1 rounded">{"{{last_name}}"}</code>
                      <code className="bg-background px-2 py-1 rounded">{"{{email}}"}</code>
                      <code className="bg-background px-2 py-1 rounded">{"{{company}}"}</code>
                      <code className="bg-background px-2 py-1 rounded">{"{{phone}}"}</code>
                      <code className="bg-background px-2 py-1 rounded">{"{{status}}"}</code>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      These will be replaced with actual lead data when available
                    </p>
                  </div>
                </TabsContent>

                {/* Knowledge Base Tab */}
                <TabsContent value="knowledge" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-base" className="flex items-center gap-2">
                      <Bot className="w-4 h-4" />
                      Knowledge Base
                    </Label>
                    <Textarea
                      id="knowledge-base"
                      value={localKnowledgeBase}
                      onChange={(e) => setLocalKnowledgeBase(e.target.value)}
                      onBlur={() => {
                        if (localKnowledgeBase !== (settings?.knowledge_base || '')) {
                          updateSettings({ knowledge_base: localKnowledgeBase });
                        }
                      }}
                      placeholder={`Enter information the AI should know:

COMPANY INFO:
- Company Name: Acme Corp
- Hours: Mon-Fri 9am-5pm EST
- Main Phone: (555) 123-4567

PRODUCTS/SERVICES:
- Basic Plan: $29/month
- Pro Plan: $99/month
- Enterprise: Contact for pricing

FAQ:
Q: What is your refund policy?
A: 30-day money back guarantee on all plans

COMMON OBJECTIONS:
- "Too expensive" → Mention ROI and payment plans
- "Need to think about it" → Offer free trial`}
                      rows={15}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Facts, FAQs, product info, and other knowledge the AI can reference
                    </p>
                  </div>
                </TabsContent>

                {/* Context Tab */}
                <TabsContent value="context" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="dynamic-vars">Dynamic Variables</Label>
                      <p className="text-sm text-muted-foreground">Include lead info in AI context</p>
                    </div>
                    <Switch
                      id="dynamic-vars"
                      checked={settings?.dynamic_variables_enabled ?? true}
                      onCheckedChange={(checked) => updateSettings({ dynamic_variables_enabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="lead-context">Lead Context</Label>
                      <p className="text-sm text-muted-foreground">Include lead details (name, email, company, status)</p>
                    </div>
                    <Switch
                      id="lead-context"
                      checked={settings?.include_lead_context ?? true}
                      onCheckedChange={(checked) => updateSettings({ include_lead_context: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="call-history">Call History</Label>
                      <p className="text-sm text-muted-foreground">Include recent call logs for context</p>
                    </div>
                    <Switch
                      id="call-history"
                      checked={settings?.include_call_history ?? true}
                      onCheckedChange={(checked) => updateSettings({ include_call_history: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="sms-history">SMS History</Label>
                      <p className="text-sm text-muted-foreground">Include previous SMS conversation</p>
                    </div>
                    <Switch
                      id="sms-history"
                      checked={settings?.include_sms_history ?? true}
                      onCheckedChange={(checked) => updateSettings({ include_sms_history: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="context-window">Context Window Size</Label>
                    <Input
                      id="context-window"
                      type="number"
                      value={settings?.context_window_size || 20}
                      onChange={(e) => updateSettings({ context_window_size: parseInt(e.target.value) })}
                      min={1}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of previous messages to include
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-history">Max History Items</Label>
                    <Input
                      id="max-history"
                      type="number"
                      value={settings?.max_history_items || 5}
                      onChange={(e) => updateSettings({ max_history_items: parseInt(e.target.value) })}
                      min={1}
                      max={20}
                    />
                    <p className="text-xs text-muted-foreground">
                      Max call/SMS history entries to include
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="image-analysis">Image Analysis</Label>
                      <p className="text-sm text-muted-foreground">Analyze images sent by contacts</p>
                    </div>
                    <Switch
                      id="image-analysis"
                      checked={settings?.enable_image_analysis || false}
                      onCheckedChange={(checked) => updateSettings({ enable_image_analysis: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="reaction-detection">Reaction Detection</Label>
                      <p className="text-sm text-muted-foreground">Detect emoji reactions (👍, ❤️, etc.)</p>
                    </div>
                    <Switch
                      id="reaction-detection"
                      checked={settings?.enable_reaction_detection || false}
                      onCheckedChange={(checked) => updateSettings({ enable_reaction_detection: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="double-text-prevention">Prevent Double Texting</Label>
                      <p className="text-sm text-muted-foreground">Avoid multiple quick messages</p>
                    </div>
                    <Switch
                      id="double-text-prevention"
                      checked={settings?.prevent_double_texting || false}
                      onCheckedChange={(checked) => updateSettings({ prevent_double_texting: checked })}
                    />
                  </div>

                  <CalendarIntegrationSection 
                    settings={settings}
                    updateSettings={updateSettings}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate('/')}
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  AI SMS Conversations
                  {settings?.ai_provider && (
                    <Badge variant="secondary" className="text-xs">
                      {settings.ai_provider === 'lovable' ? 'Lovable AI' : 'Retell AI'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  AI-powered SMS with image analysis and smart responses
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              {/* Number Webhook Overview - Shows what's configured where */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/number-webhooks')}
              >
                <Globe className="h-4 w-4 mr-2" />
                Number Webhooks
              </Button>
              
              {/* A2P Status Dialog */}
              <Dialog open={showA2PStatus} onOpenChange={setShowA2PStatus}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCheckA2PStatus}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    A2P Status
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      A2P 10DLC Registration Status
                    </DialogTitle>
                    <DialogDescription>
                      View and manage A2P registration for your phone numbers
                    </DialogDescription>
                  </DialogHeader>
                  
                  {isLoadingA2P ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="ml-3 text-muted-foreground">Checking A2P status...</span>
                    </div>
                  ) : a2pStatus ? (
                    <Tabs value={a2pTab} onValueChange={setA2pTab} className="flex-1 overflow-hidden flex flex-col">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="add-number">Add Number to Campaign</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="overview" className="flex-1 overflow-hidden">
                        <ScrollArea className="h-[50vh] pr-4">
                          <div className="space-y-6">
                            {/* Summary */}
                            <div className="grid grid-cols-4 gap-4">
                              <div className="p-4 rounded-lg bg-muted">
                                <div className="text-2xl font-bold">{a2pStatus.summary?.total_numbers || 0}</div>
                                <div className="text-sm text-muted-foreground">Total Numbers</div>
                              </div>
                              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                                <div className="text-2xl font-bold text-green-600">{a2pStatus.summary?.registered_numbers || 0}</div>
                                <div className="text-sm text-muted-foreground">Registered</div>
                              </div>
                              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                <div className="text-2xl font-bold text-yellow-600">{a2pStatus.summary?.pending_numbers || 0}</div>
                                <div className="text-sm text-muted-foreground">Pending</div>
                              </div>
                              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                                <div className="text-2xl font-bold text-red-600">{a2pStatus.summary?.unregistered_numbers || 0}</div>
                                <div className="text-sm text-muted-foreground">Unregistered</div>
                              </div>
                            </div>

                            {/* Phone Numbers */}
                            <div>
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                Phone Numbers
                              </h4>
                              <div className="space-y-2">
                                {a2pStatus.phone_numbers?.map((num) => (
                                  <div 
                                    key={num.sid} 
                                    className="flex items-center justify-between p-3 rounded-lg border"
                                  >
                                    <div className="flex items-center gap-3">
                                      {num.a2p_registered ? (
                                        <ShieldCheck className="h-5 w-5 text-green-500" />
                                      ) : num.messaging_service_sid ? (
                                        <Shield className="h-5 w-5 text-yellow-500" />
                                      ) : (
                                        <ShieldAlert className="h-5 w-5 text-red-500" />
                                      )}
                                      <div>
                                        <div className="font-medium">{num.phone_number}</div>
                                        <div className="text-sm text-muted-foreground">
                                          {num.friendly_name || 'No friendly name'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <Badge 
                                        variant={num.a2p_registered ? "default" : num.messaging_service_sid ? "secondary" : "destructive"}
                                      >
                                        {num.a2p_registered ? 'Registered' : num.messaging_service_sid ? 'Pending' : 'Not Registered'}
                                      </Badge>
                                      {num.messaging_service_name && (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {num.messaging_service_name}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {(!a2pStatus.phone_numbers || a2pStatus.phone_numbers.length === 0) && (
                                  <div className="text-center py-4 text-muted-foreground">
                                    No phone numbers found in your Twilio account
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Messaging Services / Campaigns */}
                            {a2pStatus.messaging_services?.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-3">Messaging Services (Campaigns)</h4>
                                <div className="space-y-2">
                                  {a2pStatus.messaging_services.map((service) => (
                                    <div key={service.sid} className="p-3 rounded-lg border">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <div className="font-medium">{service.friendly_name}</div>
                                          <div className="text-sm text-muted-foreground">
                                            Use case: {service.use_case || 'Not set'}
                                          </div>
                                          <div className="text-xs text-muted-foreground mt-1">
                                            {service.associated_phone_numbers?.length || 0} phone number(s) attached
                                          </div>
                                        </div>
                                        <Badge variant={service.us_app_to_person_registered ? 'default' : 'secondary'}>
                                          {service.us_app_to_person_registered ? 'A2P Registered' : 'Not A2P Registered'}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Brand Registrations */}
                            {a2pStatus.brand_registrations?.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-3">Brand Registrations</h4>
                                <div className="space-y-2">
                                  {a2pStatus.brand_registrations.map((brand) => (
                                    <div key={brand.sid} className="p-3 rounded-lg border">
                                      <div className="flex justify-between items-center">
                                        <span className="font-medium">{brand.brand_type}</span>
                                        <Badge variant={brand.status === 'APPROVED' ? 'default' : 'secondary'}>
                                          {brand.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* A2P Campaigns */}
                            {a2pStatus.campaigns?.length > 0 && (
                              <div>
                                <h4 className="font-semibold mb-3">A2P Campaigns</h4>
                                <div className="space-y-2">
                                  {a2pStatus.campaigns.map((campaign) => (
                                    <div key={campaign.sid} className="p-3 rounded-lg border">
                                      <div className="flex justify-between items-center">
                                        <div>
                                          <span className="font-medium">{campaign.use_case}</span>
                                          <div className="text-sm text-muted-foreground">
                                            {campaign.messaging_service_name}
                                          </div>
                                        </div>
                                        <Badge variant={campaign.status === 'VERIFIED' ? 'default' : 'secondary'}>
                                          {campaign.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </TabsContent>
                      
                      <TabsContent value="add-number" className="flex-1">
                        <div className="space-y-6 p-4">
                          <div className="p-4 rounded-lg bg-muted/50 border">
                            <h4 className="font-medium mb-2">Add Phone Number to A2P Campaign</h4>
                            <p className="text-sm text-muted-foreground">
                              Select an unregistered phone number and a messaging service to register it for A2P messaging.
                            </p>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Select Phone Number</Label>
                              <Select value={numberToAddToCampaign} onValueChange={setNumberToAddToCampaign}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a phone number..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {a2pStatus.phone_numbers
                                    ?.filter((num) => !num.messaging_service_sid)
                                    .map((num) => (
                                      <SelectItem key={num.sid} value={num.phone_number}>
                                        <div className="flex items-center gap-2">
                                          <ShieldAlert className="h-4 w-4 text-red-500" />
                                          {num.phone_number}
                                          {num.friendly_name && (
                                            <span className="text-muted-foreground">({num.friendly_name})</span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  {a2pStatus.phone_numbers?.filter((num) => !num.messaging_service_sid).length === 0 && (
                                    <SelectItem value="__disabled_all_registered" disabled>
                                      All numbers are already registered
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Select Messaging Service (Campaign)</Label>
                              <Select value={selectedCampaignSid} onValueChange={setSelectedCampaignSid}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a messaging service..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {a2pStatus.messaging_services?.map((service) => (
                                    <SelectItem key={service.sid} value={service.sid}>
                                      <div className="flex items-center gap-2">
                                        {service.us_app_to_person_registered ? (
                                          <ShieldCheck className="h-4 w-4 text-green-500" />
                                        ) : (
                                          <Shield className="h-4 w-4 text-yellow-500" />
                                        )}
                                        {service.friendly_name}
                                        {service.use_case && (
                                          <span className="text-muted-foreground">- {service.use_case}</span>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                  {(!a2pStatus.messaging_services || a2pStatus.messaging_services.length === 0) && (
                                     <SelectItem value="__disabled_no_services" disabled>
                                       No messaging services found - create one in Twilio Console
                                     </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <Button 
                              onClick={handleAddNumberToCampaign} 
                              disabled={addingToCampaign || !numberToAddToCampaign || !selectedCampaignSid}
                              className="w-full"
                            >
                              {addingToCampaign ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Adding to Campaign...
                                </>
                              ) : (
                                <>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add to Messaging Service
                                </>
                              )}
                            </Button>
                          </div>

                          {(!a2pStatus.messaging_services || a2pStatus.messaging_services.length === 0) && (
                            <div className="p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10">
                              <h4 className="font-medium text-yellow-700 mb-2">No Messaging Services Found</h4>
                              <p className="text-sm text-yellow-600">
                                You need to create a Messaging Service in your Twilio Console first.
                                Go to Twilio Console → Messaging → Services to create one, then complete
                                A2P 10DLC registration.
                              </p>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Click to check A2P registration status
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog open={showNewConversation} onOpenChange={setShowNewConversation}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Conversation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start New Conversation</DialogTitle>
                    <DialogDescription>
                      Enter the phone number to start a new SMS conversation
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="from-number">From Number *</Label>
                      <Select value={selectedFromNumber} onValueChange={setSelectedFromNumber}>
                        <SelectTrigger id="from-number">
                          <SelectValue placeholder={loadingNumbers ? "Loading..." : "Select your Twilio number"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTwilioNumbers.map((num) => (
                            <SelectItem key={num.number} value={num.number}>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                {formatPhoneNumber(num.number)}
                                {num.friendly_name && (
                                  <span className="text-muted-foreground">({num.friendly_name})</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                          {availableTwilioNumbers.length === 0 && !loadingNumbers && (
                            <SelectItem value="__disabled_no_sms_numbers" disabled>
                              No SMS-capable numbers found in Twilio
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {availableTwilioNumbers.length === 0 && !loadingNumbers && (
                        <p className="text-xs text-destructive">
                          No SMS-capable numbers found. Please add numbers in your Twilio console.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-phone">To Phone Number *</Label>
                      <Input
                        id="new-phone"
                        placeholder="+1 (555) 123-4567"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-name">Contact Name (Optional)</Label>
                      <Input
                        id="new-name"
                        placeholder="John Doe"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewConversation(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateConversation} disabled={!selectedFromNumber || !newContactPhone.trim()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadConversations}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex gap-4 overflow-hidden">
          {/* Conversation List */}
          <div className="w-80 border-r flex flex-col">
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, number, or context..." 
                className="w-full pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No conversations yet</p>
                    <p className="text-sm">Click "New Conversation" to start</p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={cn(
                        "p-3 rounded-lg cursor-pointer transition-colors",
                        selectedConversation?.id === conv.id 
                          ? "bg-primary/10 border-2 border-primary" 
                          : "hover:bg-muted border-2 border-transparent"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>
                            <Phone className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium truncate">
                              {conv.contact_name || formatPhoneNumber(conv.contact_phone)}
                            </p>
                            {conv.unread_count > 0 && (
                              <Badge variant="default" className="ml-2">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {formatPhoneNumber(conv.contact_phone)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Message Thread */}
          <div className="flex-1 flex flex-col">
            {!selectedConversation ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Select a conversation to view messages</p>
                  <p className="text-sm mt-2">Or create a new conversation to get started</p>
                </div>
              </div>
            ) : (
              <>
                {/* Message List */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {currentMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-3",
                          message.direction === 'outbound' ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.direction === 'inbound' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div className={cn(
                          "max-w-[70%] space-y-2",
                          message.direction === 'outbound' && "items-end flex flex-col"
                        )}>
                          {message.is_reaction && (
                            <Badge variant="outline" className="text-xs">
                              Reaction: {message.reaction_type}
                            </Badge>
                          )}

                          <div
                            className={cn(
                              "rounded-lg px-4 py-2",
                              message.direction === 'outbound'
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            )}
                          >
                            {message.has_image && message.image_url && (
                              <div className="mb-2">
                                <img 
                                  src={message.image_url} 
                                  alt="Message attachment" 
                                  className="rounded max-w-full h-auto"
                                />
                                {message.image_analysis && (
                                  <p className="text-xs opacity-70 mt-2">
                                    📸 {message.image_analysis.description}
                                  </p>
                                )}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {message.is_ai_generated && (
                              <Badge variant="secondary" className="text-xs">
                                <Bot className="h-3 w-3 mr-1" />
                                AI
                              </Badge>
                            )}
                            <span>{format(new Date(message.created_at), 'h:mm a')}</span>
                            {getMessageStatusIcon(message)}
                          </div>
                        </div>

                        {message.direction === 'outbound' && (
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              <Phone className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t p-4 space-y-3">
                  {/* Auto-Response Controls */}
                  {settings?.enabled && (
                    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="auto-response-toggle"
                          checked={settings?.auto_response_enabled || false}
                          onCheckedChange={(checked) => updateSettings({ auto_response_enabled: checked })}
                        />
                        <Label htmlFor="auto-response-toggle" className="text-sm font-medium cursor-pointer">
                          Auto Response
                        </Label>
                        {settings?.auto_response_enabled && (
                          <Badge variant="default" className="text-xs">
                            <Zap className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      
                      {settings?.auto_response_enabled && (
                        <div className="flex items-center gap-2 border-l pl-4">
                          <Label htmlFor="delay-select" className="text-sm text-muted-foreground whitespace-nowrap">
                            Delay:
                          </Label>
                          <Select
                            value={String(settings?.double_text_delay_seconds || 2)}
                            onValueChange={(value) => updateSettings({ double_text_delay_seconds: parseInt(value) })}
                          >
                            <SelectTrigger id="delay-select" className="w-24 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 sec</SelectItem>
                              <SelectItem value="2">2 sec</SelectItem>
                              <SelectItem value="5">5 sec</SelectItem>
                              <SelectItem value="10">10 sec</SelectItem>
                              <SelectItem value="15">15 sec</SelectItem>
                              <SelectItem value="30">30 sec</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {settings?.enabled && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateAI}
                        disabled={isGeneratingAI}
                      >
                        <Sparkles className={cn("h-4 w-4 mr-2", isGeneratingAI && "animate-pulse")} />
                        {isGeneratingAI ? 'Generating...' : 'Generate AI Response'}
                      </Button>
                      
                      {/* Templates Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <FileText className="h-4 w-4 mr-2" />
                            Templates
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel>Quick Templates</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {['General', 'Sales', 'Scheduling'].map(category => (
                            <React.Fragment key={category}>
                              <DropdownMenuLabel className="text-xs text-muted-foreground">{category}</DropdownMenuLabel>
                              {SMS_TEMPLATES.filter(t => t.category === category).map(template => (
                                <DropdownMenuItem 
                                  key={template.id}
                                  onClick={() => handleUseTemplate(template)}
                                >
                                  <Zap className="h-4 w-4 mr-2" />
                                  {template.name}
                                </DropdownMenuItem>
                              ))}
                            </React.Fragment>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {settings.enable_image_analysis && (
                        <Badge variant="secondary" className="text-xs">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          Image Analysis
                        </Badge>
                      )}
                      {settings.prevent_double_texting && (
                        <Badge variant="secondary" className="text-xs">
                          Anti-Spam
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* From Number Selector */}
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-dashed">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Sending from:</span>
                    <Select value={selectedFromNumber} onValueChange={setSelectedFromNumber}>
                      <SelectTrigger className="h-8 flex-1 max-w-[250px]">
                        <SelectValue placeholder={loadingNumbers ? "Loading numbers..." : "Select number"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTwilioNumbers.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No SMS numbers available
                          </SelectItem>
                        ) : (
                          availableTwilioNumbers.map((num) => (
                            <SelectItem key={num.number} value={num.number}>
                              {formatPhoneNumber(num.number)}
                              {num.friendly_name && ` (${num.friendly_name})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {selectedFromNumber && (
                      <Badge variant="outline" className="text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="min-h-[60px] resize-none"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || isLoading || !selectedFromNumber}
                      className="self-end"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiSmsConversations;
