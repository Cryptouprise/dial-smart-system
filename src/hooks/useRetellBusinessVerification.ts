import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BusinessProfile {
  id: string;
  business_name: string;
  business_registration_number: string;
  business_address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  contact_phone: string;
  website_url: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_at?: string;
  approved_at?: string;
  rejection_reason?: string;
}

interface VerifiedNumber {
  id: string;
  business_profile_id: string;
  phone_number: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  approved_at?: string;
  rejection_reason?: string;
  business_profile?: BusinessProfile;
}

interface BrandedCall {
  id: string;
  business_profile_id: string;
  phone_number: string;
  display_name_short: string;
  display_name_long: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  approved_at?: string;
  rejection_reason?: string;
  business_profile?: BusinessProfile;
}

export const useRetellBusinessVerification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const createBusinessProfile = async (profileData: Omit<BusinessProfile, 'id' | 'status' | 'submitted_at' | 'approved_at' | 'rejection_reason'>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'create_profile',
          profileData
        }
      });

      if (error) throw error;

      toast({
        title: "Business Profile Created",
        description: "Your business profile has been created successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create business profile",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const listBusinessProfiles = async (): Promise<BusinessProfile[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'list_profiles'
        }
      });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load business profiles",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const submitVerification = async (business_profile_id: string, phone_number: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'submit_verification',
          verificationData: {
            business_profile_id,
            phone_number
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Verification Submitted",
        description: "Your phone number verification request has been submitted. Approval takes 1-2 weeks.",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit verification",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const submitBrandedCall = async (business_profile_id: string, phone_number: string, display_name_short: string, display_name_long: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'submit_branded',
          brandedData: {
            business_profile_id,
            phone_number,
            display_name_short,
            display_name_long
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Branded Call Submitted",
        description: "Your branded call request has been submitted. Approval takes 1-2 weeks.",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit branded call",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const listVerifications = async (): Promise<VerifiedNumber[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'list_verifications'
        }
      });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load verifications",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const listBrandedCalls = async (): Promise<BrandedCall[]> => {
    setIsLoading(true);
    try {
      const { data, error} = await supabase.functions.invoke('retell-business-verification', {
        body: {
          action: 'list_branded'
        }
      });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load branded calls",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createBusinessProfile,
    listBusinessProfiles,
    submitVerification,
    submitBrandedCall,
    listVerifications,
    listBrandedCalls,
    isLoading
  };
};