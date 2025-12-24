import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';

export interface VoiceBroadcast {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  status: string;
  message_text: string;
  voice_id: string | null;
  voice_model: string | null;
  audio_url?: string | null;
  ivr_enabled: boolean | null;
  ivr_mode: string | null;
  ivr_prompt: string | null;
  dtmf_actions: Json;
  ai_system_prompt: string | null;
  ai_transfer_keywords: string[] | null;
  max_attempts: number | null;
  retry_delay_minutes: number | null;
  calling_hours_start: string | null;
  calling_hours_end: string | null;
  timezone: string | null;
  calls_per_minute: number | null;
  total_leads: number | null;
  calls_made: number | null;
  calls_answered: number | null;
  transfers_completed: number | null;
  callbacks_scheduled: number | null;
  dnc_requests: number | null;
  created_at: string | null;
  updated_at: string | null;
  caller_id: string | null;
}

export interface DTMFAction {
  digit: string;
  action: 'transfer' | 'callback' | 'dnc' | 'replay' | 'custom';
  transfer_to?: string;
  delay_hours?: number;
  label: string;
  custom_message?: string;
  // Enhanced callback options
  callback_options?: {
    create_calendar_event?: boolean;
    send_sms_reminder?: boolean;
    auto_callback_call?: boolean;
    sms_reminder_hours_before?: number;
    sms_reminder_template?: string;
  };
}

export interface BroadcastQueueItem {
  id: string;
  broadcast_id: string;
  lead_id?: string | null;
  phone_number: string;
  lead_name?: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  dtmf_pressed?: string | null;
  call_duration_seconds?: number | null;
  transfer_status?: string | null;
  callback_scheduled_at?: string | null;
  ai_transcript?: string | null;
}

// Helper to parse DTMF actions from JSON
export const parseDTMFActions = (json: Json): DTMFAction[] => {
  if (Array.isArray(json)) {
    return json as unknown as DTMFAction[];
  }
  return [];
};

export const useVoiceBroadcast = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState<VoiceBroadcast[]>([]);
  const { toast } = useToast();

  const loadBroadcasts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('voice_broadcasts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBroadcasts(data || []);
      return data;
    } catch (error: any) {
      console.error('Error loading broadcasts:', error);
      return [];
    }
  };

  const createBroadcast = async (broadcast: {
    name: string;
    description?: string;
    message_text: string;
    voice_id?: string;
    voice_model?: string;
    ivr_enabled?: boolean;
    ivr_mode?: string;
    ivr_prompt?: string;
    dtmf_actions?: DTMFAction[];
    ai_system_prompt?: string;
    ai_transfer_keywords?: string[];
    max_attempts?: number;
    calling_hours_start?: string;
    calling_hours_end?: string;
    timezone?: string;
    calls_per_minute?: number;
    caller_id?: string | null;
  }) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('voice_broadcasts')
        .insert({
          user_id: user.id,
          name: broadcast.name,
          description: broadcast.description,
          message_text: broadcast.message_text,
          voice_id: broadcast.voice_id || 'EXAVITQu4vr4xnSDxMaL',
          voice_model: broadcast.voice_model || 'eleven_turbo_v2_5',
          ivr_enabled: broadcast.ivr_enabled ?? true,
          ivr_mode: broadcast.ivr_mode || 'dtmf',
          ivr_prompt: broadcast.ivr_prompt,
          dtmf_actions: broadcast.dtmf_actions as unknown as Json,
          ai_system_prompt: broadcast.ai_system_prompt,
          ai_transfer_keywords: broadcast.ai_transfer_keywords,
          max_attempts: broadcast.max_attempts || 1,
          calling_hours_start: broadcast.calling_hours_start || '09:00',
          calling_hours_end: broadcast.calling_hours_end || '17:00',
          timezone: broadcast.timezone || 'America/New_York',
          calls_per_minute: broadcast.calls_per_minute || 50,
          caller_id: broadcast.caller_id || null,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: "Broadcast Created",
        description: `${broadcast.name} has been created successfully`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error creating broadcast:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create broadcast",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateBroadcast = async (id: string, updates: Partial<{
    name: string;
    description: string;
    message_text: string;
    voice_id: string;
    voice_model: string;
    ivr_enabled: boolean;
    ivr_mode: string;
    ivr_prompt: string;
    dtmf_actions: DTMFAction[];
    ai_system_prompt: string;
    ai_transfer_keywords: string[];
    max_attempts: number;
    calling_hours_start: string;
    calling_hours_end: string;
    timezone: string;
    calls_per_minute: number;
    status: string;
    caller_id: string | null;
  }>) => {
    setIsLoading(true);
    try {
      const updateData: Record<string, unknown> = { ...updates };
      if (updates.dtmf_actions) {
        updateData.dtmf_actions = updates.dtmf_actions as unknown as Json;
      }

      const { data, error } = await supabase
        .from('voice_broadcasts')
        .update(updateData)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: "Broadcast Updated",
        description: "Changes have been saved",
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error updating broadcast:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update broadcast",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBroadcast = async (id: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('voice_broadcasts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Broadcast Deleted",
        description: "The broadcast has been removed",
      });

      await loadBroadcasts();
    } catch (error: any) {
      console.error('Error deleting broadcast:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete broadcast",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateAudio = async (broadcastId: string, messageText: string, voiceId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-tts', {
        body: { broadcastId, messageText, voiceId }
      });

      if (error) throw error;
      
      // Check for error in response body
      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Audio Generated",
        description: "Your message has been converted to speech",
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error generating audio:', error);
      
      // Parse ElevenLabs-specific errors for better UX
      let errorMessage = error.message || "Failed to generate audio";
      const isBillingIssue = errorMessage.toLowerCase().includes('payment') || 
                            errorMessage.toLowerCase().includes('subscription') ||
                            errorMessage.toLowerCase().includes('billing');
      const isQuotaIssue = errorMessage.toLowerCase().includes('quota') || 
                          errorMessage.toLowerCase().includes('limit');
      
      if (isBillingIssue) {
        errorMessage = "ElevenLabs billing issue detected. Please update your payment at: https://elevenlabs.io/subscription";
      } else if (isQuotaIssue) {
        errorMessage = "ElevenLabs quota exceeded. Upgrade at: https://elevenlabs.io/subscription";
      }
      
      toast({
        title: isBillingIssue ? "ElevenLabs Billing Issue" : "Audio Generation Failed",
        description: errorMessage,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const addLeadsToBroadcast = async (broadcastId: string, leadIds: string[]) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'add_leads', broadcastId, leadIds }
      });

      if (error) throw error;

      toast({
        title: "Leads Added",
        description: `${data.added} leads added to broadcast queue${data.skipped > 0 ? ` (${data.skipped} already in queue)` : ''}`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error adding leads:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add leads",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const addPhoneNumbersToBroadcast = async (broadcastId: string, phoneNumbers: string[]) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'add_numbers', broadcastId, phoneNumbers }
      });

      if (error) throw error;

      toast({
        title: "Phone Numbers Added",
        description: `${data.added} numbers added${data.dnc_filtered > 0 ? ` (${data.dnc_filtered} filtered by DNC)` : ''}`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error adding phone numbers:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add phone numbers",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const clearBroadcastQueue = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'clear_queue', broadcastId }
      });

      if (error) throw error;

      toast({
        title: "Queue Cleared",
        description: "Pending queue items have been removed",
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error clearing queue:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to clear queue",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const resetBroadcastQueue = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'reset_queue', broadcastId }
      });

      if (error) throw error;

      toast({
        title: "Queue Reset",
        description: `${data?.reset_count || 0} items reset to pending. Ready to run again!`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error resetting queue:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset queue",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const startBroadcast = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      // Pre-flight validation before starting
      const { data: broadcast } = await supabase
        .from('voice_broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .maybeSingle();

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      // Check for required components
      const validationErrors: string[] = [];

      if (!broadcast.audio_url && !broadcast.message_text) {
        validationErrors.push('Missing audio or message text');
      }

      // Check for active phone numbers
      const { data: phoneNumbers } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('status', 'active')
        .limit(1);

      if (!phoneNumbers || phoneNumbers.length === 0) {
        validationErrors.push('No active phone numbers available');
      }

      // Check for leads in queue
      const { data: queueItems, count } = await supabase
        .from('voice_broadcast_queue')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', 'pending');

      if (!count || count === 0) {
        validationErrors.push('No leads in the queue. Add leads first.');
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join('; '));
      }

      // All checks passed, start the broadcast
      const { data, error } = await supabase.functions.invoke('voice-broadcast-engine', {
        body: { action: 'start', broadcastId }
      });

      if (error) throw error;

      toast({
        title: "Broadcast Started",
        description: `Making calls to ${count} leads`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error starting broadcast:', error);
      
      toast({
        title: "Cannot Start Broadcast",
        description: error.message || "Failed to start broadcast",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const stopBroadcast = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-engine', {
        body: { action: 'stop', broadcastId }
      });

      if (error) throw error;

      toast({
        title: "Broadcast Stopped",
        description: "All calls have been paused",
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error stopping broadcast:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to stop broadcast",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getBroadcastStats = async (broadcastId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-engine', {
        body: { action: 'stats', broadcastId }
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error getting stats:', error);
      return null;
    }
  };

  const getQueueItems = async (broadcastId: string, status?: string) => {
    try {
      let query = supabase
        .from('broadcast_queue')
        .select('*')
        .eq('broadcast_id', broadcastId)
        .order('scheduled_at', { ascending: true });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BroadcastQueueItem[];
    } catch (error: any) {
      console.error('Error loading queue:', error);
      return [];
    }
  };

  const removeQueueItems = async (broadcastId: string, itemIds: string[]) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'remove_items', broadcastId, itemIds }
      });

      if (error) throw error;

      toast({
        title: "Items Removed",
        description: `${data.removed} item(s) removed from queue`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error removing queue items:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove items",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupStuckCalls = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'cleanup_stuck_calls', broadcastId }
      });

      if (error) throw error;

      if (data.cleaned > 0) {
        toast({
          title: "Stuck Calls Cleaned",
          description: `${data.cleaned} stuck call(s) recovered`,
        });
      }

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error cleaning stuck calls:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cleanup stuck calls",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const retryFailedCalls = async (broadcastId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('voice-broadcast-queue', {
        body: { action: 'retry_failed', broadcastId }
      });

      if (error) throw error;

      toast({
        title: "Failed Calls Queued for Retry",
        description: `${data.retried} call(s) will be retried`,
      });

      await loadBroadcasts();
      return data;
    } catch (error: any) {
      console.error('Error retrying failed calls:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to retry calls",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    broadcasts,
    isLoading,
    loadBroadcasts,
    createBroadcast,
    updateBroadcast,
    deleteBroadcast,
    generateAudio,
    addLeadsToBroadcast,
    addPhoneNumbersToBroadcast,
    clearBroadcastQueue,
    resetBroadcastQueue,
    startBroadcast,
    stopBroadcast,
    getBroadcastStats,
    getQueueItems,
    removeQueueItems,
    cleanupStuckCalls,
    retryFailedCalls,
    parseDTMFActions,
  };
};
