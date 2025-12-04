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
} from 'lucide-react';
import { useAiSmsMessaging, type SmsConversation, type SmsMessage } from '@/hooks/useAiSmsMessaging';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

  const [selectedConversation, setSelectedConversation] = useState<SmsConversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  const handleSelectConversation = (conversation: SmsConversation) => {
    setSelectedConversation(conversation);
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageText.trim()) return;

    // Get available numbers
    const { data: numbers } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('status', 'active')
      .limit(1);

    if (!numbers || numbers.length === 0) {
      toast({
        title: 'No Phone Number',
        description: 'Please add a phone number first',
        variant: 'destructive',
      });
      return;
    }

    const success = await sendMessage(
      selectedConversation.id,
      selectedConversation.contact_phone,
      numbers[0].number,
      messageText
    );

    if (success) {
      setMessageText('');
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

    // Format phone number
    let formattedPhone = newContactPhone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
      formattedPhone = '1' + formattedPhone;
    }
    formattedPhone = '+' + formattedPhone;

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
        .eq('contact_phone', formattedPhone)
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
          contact_phone: formattedPhone,
          contact_name: newContactName.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Conversation Created',
        description: `Started conversation with ${formattedPhone}`,
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

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      conv.contact_phone.includes(search) ||
      (conv.contact_name && conv.contact_name.toLowerCase().includes(search))
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

              {/* AI Personality */}
              <div className="space-y-2">
                <Label htmlFor="ai-personality">AI Personality</Label>
                <Textarea
                  id="ai-personality"
                  value={settings?.ai_personality || ''}
                  onChange={(e) => updateSettings({ ai_personality: e.target.value })}
                  placeholder="e.g., professional and helpful, friendly and casual, etc."
                  rows={3}
                />
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

              {/* Image Analysis */}
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

              {/* Reaction Detection */}
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

              {/* Double Texting Prevention */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="double-text-prevention">Prevent Double Texting</Label>
                  <p className="text-sm text-muted-foreground">Avoid sending multiple messages in quick succession</p>
                </div>
                <Switch
                  id="double-text-prevention"
                  checked={settings?.prevent_double_texting || false}
                  onCheckedChange={(checked) => updateSettings({ prevent_double_texting: checked })}
                />
              </div>

              {/* Context Window Size */}
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
                  Number of previous messages to include for context
                </p>
              </div>
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
            <div className="flex gap-2">
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
                      <Label htmlFor="new-phone">Phone Number *</Label>
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
                    <Button onClick={handleCreateConversation}>
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
            <div className="mb-4">
              <Input 
                placeholder="Search conversations..." 
                className="w-full"
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
                              {conv.contact_name || formatPhone(conv.contact_phone)}
                            </p>
                            {conv.unread_count > 0 && (
                              <Badge variant="default" className="ml-2">
                                {conv.unread_count}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {formatPhone(conv.contact_phone)}
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
                      disabled={!messageText.trim() || isLoading}
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
