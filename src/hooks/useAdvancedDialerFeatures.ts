import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DialerSettings {
  enableAMD: boolean;
  enableLocalPresence: boolean;
  enableTimeZoneCompliance: boolean;
  enableDNCCheck: boolean;
  amdSensitivity: 'low' | 'medium' | 'high';
  localPresenceStrategy: 'match_area_code' | 'match_prefix' | 'nearest';
}

interface TimeZoneRule {
  timezone: string;
  callWindowStart: string; // HH:MM format
  callWindowEnd: string;
  allowedDays: number[]; // 0-6, Sunday-Saturday
}

export const useAdvancedDialerFeatures = () => {
  const [settings, setSettings] = useState<DialerSettings>({
    enableAMD: false,
    enableLocalPresence: false,
    enableTimeZoneCompliance: true,
    enableDNCCheck: true,
    amdSensitivity: 'medium',
    localPresenceStrategy: 'match_area_code'
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load dialer settings
  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('advanced_dialer_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings({
          enableAMD: data.enable_amd || false,
          enableLocalPresence: data.enable_local_presence || false,
          enableTimeZoneCompliance: data.enable_timezone_compliance || true,
          enableDNCCheck: data.enable_dnc_check || true,
          amdSensitivity: data.amd_sensitivity || 'medium',
          localPresenceStrategy: data.local_presence_strategy || 'match_area_code'
        });
      }
    } catch (error) {
      console.error('Error loading dialer settings:', error);
    }
  };

  // Update dialer settings
  const updateSettings = async (updates: Partial<DialerSettings>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const newSettings = { ...settings, ...updates };
      
      const { error } = await supabase
        .from('advanced_dialer_settings')
        .upsert({
          user_id: user.id,
          enable_amd: newSettings.enableAMD,
          enable_local_presence: newSettings.enableLocalPresence,
          enable_timezone_compliance: newSettings.enableTimeZoneCompliance,
          enable_dnc_check: newSettings.enableDNCCheck,
          amd_sensitivity: newSettings.amdSensitivity,
          local_presence_strategy: newSettings.localPresenceStrategy,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setSettings(newSettings);
      
      toast({
        title: "Settings Updated",
        description: "Advanced dialer settings have been saved",
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Select caller ID based on local presence strategy
  const selectCallerID = async (destinationNumber: string): Promise<string | null> => {
    if (!settings.enableLocalPresence) {
      // Return first available number
      const { data } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('status', 'active')
        .limit(1)
        .single();
      
      return data?.number || null;
    }

    try {
      // Extract area code from destination
      const destAreaCode = destinationNumber.substring(2, 5); // Assumes +1XXXXXXXXXX format

      let query = supabase
        .from('phone_numbers')
        .select('number')
        .eq('status', 'active');

      switch (settings.localPresenceStrategy) {
        case 'match_area_code':
          // Try to match area code
          query = query.like('number', `%${destAreaCode}%`);
          break;
        
        case 'match_prefix':
          // Try to match first 6 digits (area code + prefix)
          const destPrefix = destinationNumber.substring(2, 8);
          query = query.like('number', `%${destPrefix}%`);
          break;
        
        case 'nearest':
          // Would need geographic database - for now, match area code
          query = query.like('number', `%${destAreaCode}%`);
          break;
      }

      const { data, error } = await query.limit(1).single();

      if (error || !data) {
        // Fallback to any available number
        const { data: fallback } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('status', 'active')
          .limit(1)
          .single();
        
        return fallback?.number || null;
      }

      return data.number;
    } catch (error) {
      console.error('Error selecting caller ID:', error);
      return null;
    }
  };

  // Check if call is allowed based on time zone compliance
  const isCallTimeAllowed = (phoneNumber: string, timezone?: string): boolean => {
    if (!settings.enableTimeZoneCompliance) return true;

    try {
      // Default to Eastern if no timezone provided
      const tz = timezone || 'America/New_York';
      
      // Get current time in target timezone
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { 
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });

      const [hours, minutes] = timeString.split(':').map(Number);
      const currentMinutes = hours * 60 + minutes;

      // Default calling hours: 8 AM - 9 PM
      const startMinutes = 8 * 60; // 8:00 AM
      const endMinutes = 21 * 60; // 9:00 PM

      // Check if within calling window
      if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
        return false;
      }

      // Check day of week (no calling on Sundays by default)
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0) { // Sunday
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking call time:', error);
      return true; // Allow call if check fails
    }
  };

  // Check Do Not Call (DNC) list
  const checkDNCList = async (phoneNumber: string): Promise<boolean> => {
    if (!settings.enableDNCCheck) return true;

    try {
      const { data, error } = await supabase
        .from('dnc_list')
        .select('id')
        .eq('phone_number', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // If found in DNC list, return false (call not allowed)
      return !data;
    } catch (error) {
      console.error('Error checking DNC list:', error);
      return true; // Allow call if check fails
    }
  };

  // Process AMD result (would be called from webhook or real-time processing)
  const processAMDResult = async (
    callId: string, 
    result: 'human' | 'machine' | 'unknown'
  ) => {
    try {
      // Update call log with AMD result
      await supabase
        .from('call_logs')
        .update({
          amd_result: result,
          updated_at: new Date().toISOString()
        })
        .eq('id', callId);

      // If machine detected and AMD is enabled, handle accordingly
      if (result === 'machine' && settings.enableAMD) {
        // Could trigger voicemail drop, hang up, or other action
        console.log(`Machine detected for call ${callId}`);
      }

      return true;
    } catch (error) {
      console.error('Error processing AMD result:', error);
      return false;
    }
  };

  // Pre-flight call validation
  const validateCall = async (phoneNumber: string, timezone?: string): Promise<{
    allowed: boolean;
    reason?: string;
    callerID?: string;
  }> => {
    // Check DNC list
    const dncAllowed = await checkDNCList(phoneNumber);
    if (!dncAllowed) {
      return { allowed: false, reason: 'Number is on Do Not Call list' };
    }

    // Check time zone compliance
    const timeAllowed = isCallTimeAllowed(phoneNumber, timezone);
    if (!timeAllowed) {
      return { allowed: false, reason: 'Outside of allowed calling hours' };
    }

    // Select optimal caller ID
    const callerID = await selectCallerID(phoneNumber);
    if (!callerID) {
      return { allowed: false, reason: 'No available caller ID' };
    }

    return { allowed: true, callerID };
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    isLoading,
    updateSettings,
    selectCallerID,
    isCallTimeAllowed,
    checkDNCList,
    processAMDResult,
    validateCall
  };
};
