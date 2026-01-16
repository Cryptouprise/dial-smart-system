
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type PhoneNumberPurpose = 'sip_broadcast' | 'voice_ai' | 'sms' | 'inbound' | 'programmable_voice';

export const usePhoneNumberPurchasing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const purchaseNumbers = async (
    areaCode: string,
    quantity: number,
    provider = 'retell',
    purpose: PhoneNumberPurpose = 'voice_ai'
  ) => {
    setIsLoading(true);
    try {
      console.log(`Purchasing ${quantity} numbers in area code ${areaCode} for ${purpose}`);

      const { data, error } = await supabase.functions.invoke('phone-number-purchasing', {
        method: 'POST',
        body: {
          areaCode,
          quantity,
          provider,
          purpose
        }
      });

      if (error) throw error;

      const purposeLabels: Record<PhoneNumberPurpose, string> = {
        'sip_broadcast': 'Voice Broadcast',
        'voice_ai': 'AI Calling',
        'sms': 'SMS',
        'inbound': 'Inbound',
        'programmable_voice': 'Programmable Voice'
      };

      toast({
        title: "Numbers Purchased Successfully",
        description: `${quantity} ${purposeLabels[purpose]} numbers purchased in area code ${areaCode}${purpose === 'sip_broadcast' ? ' - added to rotator' : ''}`,
      });

      return data;
    } catch (error: any) {
      console.error('Purchase error:', error);
      
      // Parse error message for user-friendly display
      let errorMessage = error.message || "Failed to purchase phone numbers";
      let errorTitle = "Purchase Failed";
      
      // Check for specific error patterns
      if (errorMessage.includes('No phone numbers available') || errorMessage.includes('no available')) {
        errorTitle = "No Numbers Available";
        errorMessage = `No phone numbers are available in area code ${areaCode}. Please try a different area code (e.g., 415, 212, 310, 702).`;
      } else if (errorMessage.includes('Invalid area code')) {
        errorTitle = "Invalid Area Code";
        errorMessage = "The area code you entered is invalid. Please enter a valid 3-digit US area code.";
      } else if (errorMessage.includes('authentication') || errorMessage.includes('API key')) {
        errorTitle = "Authentication Error";
        errorMessage = "Unable to connect to the phone provider. Please check your API settings.";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getOrderHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('phone-number-purchasing', {
        method: 'GET'
      });

      if (error) throw error;
      return data.orders;
    } catch (error) {
      console.error('Order history error:', error);
      toast({
        title: "Failed to Load Orders",
        description: error.message || "Failed to load order history",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    purchaseNumbers,
    getOrderHistory,
    isLoading
  };
};
