import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useTwilioSIPTrunking = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const createTrunk = async (config: {
    friendlyName: string;
    domainName?: string;
    disasterRecoveryUrl?: string;
    secure?: boolean;
    cnamLookupEnabled?: boolean;
  }) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'create_trunk', ...config }
      });

      if (error) throw error;

      toast({
        title: "SIP Trunk Created",
        description: `${config.friendlyName} created successfully`,
      });

      return data;
    } catch (error) {
      console.error('Trunk creation error:', error);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create SIP trunk",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const listTrunks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'list_trunks' }
      });

      if (error) throw error;
      
      return data.trunks || [];
    } catch (error) {
      console.error('List trunks error:', error);
      toast({
        title: "Failed to Load Trunks",
        description: error.message || "Could not fetch SIP trunks",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const getTrunkDetails = async (trunkSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'get_trunk_details', trunkSid }
      });

      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Get trunk details error:', error);
      toast({
        title: "Failed to Load Details",
        description: error.message || "Could not fetch trunk details",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTrunk = async (trunkSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'delete_trunk', trunkSid }
      });

      if (error) throw error;

      toast({
        title: "SIP Trunk Deleted",
        description: "Trunk deleted successfully",
      });

      return data;
    } catch (error) {
      console.error('Delete trunk error:', error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to delete SIP trunk",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const addOriginationUri = async (
    trunkSid: string, 
    sipAddress: string,
    config?: { priority?: number; weight?: number; enabled?: boolean; friendlyName?: string }
  ) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'add_origination_uri', trunkSid, sipAddress, ...config }
      });

      if (error) throw error;

      toast({
        title: "Origination URI Added",
        description: "SIP address configured successfully",
      });

      return data;
    } catch (error) {
      console.error('Add URI error:', error);
      toast({
        title: "Configuration Failed",
        description: error.message || "Failed to add origination URI",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const addPhoneNumber = async (trunkSid: string, phoneNumberSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'add_phone_number', trunkSid, phoneNumberSid }
      });

      if (error) throw error;

      toast({
        title: "Phone Number Added",
        description: "Number added to SIP trunk successfully",
      });

      return data;
    } catch (error) {
      console.error('Add phone number error:', error);
      toast({
        title: "Failed to Add Number",
        description: error.message || "Failed to add phone number to trunk",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const listPhoneNumbers = async (trunkSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'list_phone_numbers', trunkSid }
      });

      if (error) throw error;
      
      return data.phoneNumbers || [];
    } catch (error) {
      console.error('List phone numbers error:', error);
      toast({
        title: "Failed to Load Numbers",
        description: error.message || "Could not fetch trunk phone numbers",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const configureTrunk = async (trunkSid: string, config: {
    friendlyName?: string;
    domainName?: string;
    disasterRecoveryUrl?: string;
    secure?: boolean;
    cnamLookupEnabled?: boolean;
  }) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-sip-trunking', {
        body: { action: 'configure_trunk', trunkSid, ...config }
      });

      if (error) throw error;

      toast({
        title: "Trunk Configured",
        description: "SIP trunk settings updated successfully",
      });

      return data;
    } catch (error) {
      console.error('Configure trunk error:', error);
      toast({
        title: "Configuration Failed",
        description: error.message || "Failed to configure trunk",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createTrunk,
    listTrunks,
    getTrunkDetails,
    deleteTrunk,
    addOriginationUri,
    addPhoneNumber,
    listPhoneNumbers,
    configureTrunk,
    isLoading
  };
};
