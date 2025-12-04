/**
 * useAiSmsMessaging Hook
 * 
 * React hook for AI-powered SMS messaging with:
 * - Conversation threading
 * - AI response generation
 * - Image analysis
 * - Context management
 * - Reaction detection
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SmsConversation {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name: string | null;
  last_message_at: string;
  unread_count: number;
  context_summary: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface SmsMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  to_number: string;
  from_number: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: string;
  provider_type: string | null;
  provider_message_id: string | null;
  lead_id: string | null;
  is_ai_generated: boolean;
  has_image: boolean;
  image_url: string | null;
  image_analysis: any;
  is_reaction: boolean;
  reaction_type: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  metadata: any;
  created_at: string;
}

export interface AiSmsSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  context_window_size: number;
  max_context_tokens: number;
  enable_image_analysis: boolean;
  enable_reaction_detection: boolean;
  prevent_double_texting: boolean;
  double_text_delay_seconds: number;
  use_number_rotation: boolean;
  retell_agent_id: string | null;
  ai_personality: string;
  auto_response_enabled: boolean;
  business_hours_only: boolean;
  ai_provider: 'lovable' | 'retell';
  retell_llm_id: string | null;
  retell_voice_id: string | null;
  // New comprehensive AI configuration fields
  custom_instructions: string | null;
  knowledge_base: string | null;
  dynamic_variables_enabled: boolean;
  include_lead_context: boolean;
  include_call_history: boolean;
  include_sms_history: boolean;
  max_history_items: number;
  created_at: string;
  updated_at: string;
}

export const useAiSmsMessaging = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [currentMessages, setCurrentMessages] = useState<SmsMessage[]>([]);
  const [settings, setSettings] = useState<AiSmsSettings | null>(null);
  const { toast } = useToast();

  // Load conversations
  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[AI SMS] No user authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('sms_conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('[AI SMS] Failed to load conversations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setCurrentMessages((data || []) as SmsMessage[]);
    } catch (error) {
      console.error('[AI SMS] Failed to load messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Send SMS with AI assistance
  const sendMessage = useCallback(async (
    conversationId: string,
    toNumber: string,
    fromNumber: string,
    body: string,
    useAI: boolean = false
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-messaging', {
        body: {
          action: 'send_sms',
          to: toNumber,
          from: fromNumber,
          body: body,
          conversation_id: conversationId,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Message Sent',
          description: `Message sent to ${toNumber}`,
        });
        
        // Reload messages
        await loadMessages(conversationId);
        return true;
      } else {
        throw new Error(data?.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('[AI SMS] Failed to send message:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, loadMessages]);

  // Generate AI response
  const generateAIResponse = useCallback(async (
    conversationId: string,
    prompt?: string
  ): Promise<string | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-sms-processor', {
        body: {
          action: 'generate_response',
          conversationId,
          prompt: prompt || 'Generate a contextual response based on the conversation history',
        }
      });

      if (error) throw error;

      if (data?.success) {
        return data.response;
      } else {
        throw new Error(data?.error || 'Failed to generate response');
      }
    } catch (error) {
      console.error('[AI SMS] Failed to generate AI response:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate AI response',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load or create settings
  const loadSettings = useCallback(async () => {
    try {
      // Get current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[AI SMS] No user authenticated, skipping settings load');
        return;
      }

      const { data, error } = await supabase
        .from('ai_sms_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create default settings
        const { data: newSettings, error: createError } = await supabase
          .from('ai_sms_settings')
          .insert([{ user_id: user.id }])
          .select()
          .single();

        if (createError) throw createError;
        setSettings(newSettings as AiSmsSettings);
      } else {
        setSettings({
          ...data,
          ai_provider: (data.ai_provider as 'lovable' | 'retell') || 'lovable'
        } as AiSmsSettings);
      }
    } catch (error) {
      console.error('[AI SMS] Failed to load settings:', error);
    }
  }, []);

  // Update settings
  const updateSettings = useCallback(async (updates: Partial<AiSmsSettings>): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('ai_sms_settings')
        .update(updates)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .select()
        .single();

      if (error) throw error;

      setSettings({
        ...data,
        ai_provider: (data.ai_provider as 'lovable' | 'retell') || 'lovable'
      } as AiSmsSettings);
      toast({
        title: 'Settings Updated',
        description: 'Your AI SMS settings have been saved',
      });
      return true;
    } catch (error) {
      console.error('[AI SMS] Failed to update settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update settings',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast]);

  // Note: Real-time subscription moved to AiSmsConversations component for auto-response handling

  // Load initial data
  useEffect(() => {
    loadConversations();
    loadSettings();
  }, [loadConversations, loadSettings]);

  return {
    isLoading,
    conversations,
    currentMessages,
    settings,
    loadConversations,
    loadMessages,
    sendMessage,
    generateAIResponse,
    updateSettings,
  };
};

export default useAiSmsMessaging;
