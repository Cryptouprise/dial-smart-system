import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BusinessProfileData {
  friendlyName: string;
  email: string;
  businessName?: string;
  businessType?: string;
  businessWebsite?: string;
  businessAddress?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  businessContactFirstName?: string;
  businessContactLastName?: string;
  businessContactEmail?: string;
  businessContactPhone?: string;
  businessIdentity?: {
    businessTaxId?: string;
    businessIndustry?: string;
    businessRegistrationNumber?: string;
  };
}

interface BrandRegistrationData {
  customerProfileSid: string;
  displayName: string;
  companyName: string;
  ein?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  vertical?: string;
  website?: string;
  brandType?: 'STANDARD' | 'SOLE_PROPRIETOR';
}

interface CampaignData {
  brandSid: string;
  usecase?: string;
  usecaseDescription: string;
  messageFlow?: string;
  optInMessage?: string;
  optInKeywords?: string[];
  optOutMessage?: string;
  optOutKeywords?: string[];
  helpMessage?: string;
  helpKeywords?: string[];
  messageSamples?: string[];
}

export const useTwilioA2PRegistration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const createBusinessProfile = async (profileData: BusinessProfileData) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'create_business_profile', ...profileData }
      });

      if (error) throw error;

      toast({
        title: "Business Profile Created",
        description: data.message || "Profile created successfully. Submit for verification next.",
      });

      return data;
    } catch (error) {
      console.error('Profile creation error:', error);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create business profile",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const submitBusinessProfile = async (customerProfileSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'submit_business_profile', customerProfileSid }
      });

      if (error) throw error;

      toast({
        title: "Profile Submitted",
        description: data.message || "Business profile submitted for verification",
      });

      return data;
    } catch (error) {
      console.error('Submission error:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit profile",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const registerBrand = async (brandData: BrandRegistrationData) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'register_brand', ...brandData }
      });

      if (error) throw error;

      toast({
        title: "Brand Registered",
        description: data.message || "Brand registered successfully. One-time fee: $4",
      });

      return data;
    } catch (error) {
      console.error('Brand registration error:', error);
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register brand",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const createCampaign = async (campaignData: CampaignData) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'create_campaign', ...campaignData }
      });

      if (error) throw error;

      toast({
        title: "Campaign Created",
        description: data.message || "A2P campaign created successfully",
      });

      return data;
    } catch (error) {
      console.error('Campaign creation error:', error);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create campaign",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const listBusinessProfiles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'list_business_profiles' }
      });

      if (error) throw error;
      
      return data.profiles || [];
    } catch (error) {
      console.error('List profiles error:', error);
      toast({
        title: "Failed to Load Profiles",
        description: error.message || "Could not fetch business profiles",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const listBrands = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'list_brands' }
      });

      if (error) throw error;
      
      return data.brands || [];
    } catch (error) {
      console.error('List brands error:', error);
      toast({
        title: "Failed to Load Brands",
        description: error.message || "Could not fetch brands",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const getBrandStatus = async (brandSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'get_brand_status', brandSid }
      });

      if (error) throw error;
      
      toast({
        title: "Brand Status",
        description: data.message || `Status: ${data.status}`,
      });

      return data;
    } catch (error) {
      console.error('Get brand status error:', error);
      toast({
        title: "Failed to Get Status",
        description: error.message || "Could not fetch brand status",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const assignNumberToCampaign = async (phoneNumberSid: string, messagingServiceSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-a2p-registration', {
        body: { action: 'assign_number_to_campaign', phoneNumberSid, messagingServiceSid }
      });

      if (error) throw error;

      toast({
        title: "Number Assigned",
        description: "Phone number assigned to campaign successfully",
      });

      return data;
    } catch (error) {
      console.error('Assignment error:', error);
      toast({
        title: "Assignment Failed",
        description: error.message || "Failed to assign number",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createBusinessProfile,
    submitBusinessProfile,
    registerBrand,
    createCampaign,
    listBusinessProfiles,
    listBrands,
    getBrandStatus,
    assignNumberToCampaign,
    isLoading
  };
};
