/**
 * useSmsMessaging Hook
 * 
 * React hook for sending SMS messages through Twilio.
 * Provides methods for:
 * - Sending SMS messages via Twilio
 * - Viewing message history
 * - Getting available SMS-enabled phone numbers
 * 
 * Note: Currently supports Twilio. Multi-carrier support (Telnyx) is planned.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SmsMessage {
  id: string;
  to_number: string;
  from_number: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  provider_type: string | null;
  created_at: string;
  sent_at: string | null;
  error_message: string | null;
}

export interface SendSmsParams {
  to: string;
  from: string;
  body: string;
  leadId?: string;
}

export const useSmsMessaging = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const { toast } = useToast();

  /**
   * Send an SMS message via Twilio
   */
  const sendSms = useCallback(async (params: SendSmsParams): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-messaging', {
        body: {
          action: 'send_sms',
          to: params.to,
          from: params.from,
          body: params.body,
          lead_id: params.leadId,
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'SMS Sent',
          description: `Message sent to ${params.to}`,
        });
        return true;
      } else {
        throw new Error(data?.error || 'Failed to send SMS');
      }
    } catch (error) {
      console.error('[useSmsMessaging] Failed to send SMS:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send SMS',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Get SMS message history
   */
  const getMessages = useCallback(async (limit: number = 50): Promise<SmsMessage[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sms-messaging', {
        body: {
          action: 'get_messages',
          limit,
        }
      });

      if (error) throw error;

      const messageList = data?.messages || [];
      setMessages(messageList);
      return messageList;
    } catch (error) {
      console.error('[useSmsMessaging] Failed to get messages:', error);
      toast({
        title: 'Error',
        description: 'Failed to load message history',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Get available phone numbers for SMS
   */
  const getAvailableNumbers = useCallback(async (): Promise<string[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('sms-messaging', {
        body: {
          action: 'get_available_numbers',
        }
      });

      if (error) throw error;
      return data?.numbers || [];
    } catch (error) {
      console.error('[useSmsMessaging] Failed to get available numbers:', error);
      return [];
    }
  }, []);

  return {
    isLoading,
    messages,
    sendSms,
    getMessages,
    getAvailableNumbers,
  };
};

export default useSmsMessaging;
