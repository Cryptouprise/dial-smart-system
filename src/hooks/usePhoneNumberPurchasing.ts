
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const usePhoneNumberPurchasing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const purchaseNumbers = async (areaCode: string, quantity: number, provider = 'retell') => {
    setIsLoading(true);
    try {
      console.log(`Purchasing ${quantity} numbers in area code ${areaCode}`);

      const { data, error } = await supabase.functions.invoke('phone-number-purchasing', {
        method: 'POST',
        body: {
          areaCode,
          quantity,
          provider
        }
      });

      if (error) throw error;

      toast({
        title: "Numbers Purchased Successfully",
        description: `${quantity} numbers purchased in area code ${areaCode}`,
      });

      return data;
    } catch (error) {
      console.error('Purchase error:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase phone numbers",
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
