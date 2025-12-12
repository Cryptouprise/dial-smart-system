import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CalendarIntegration {
  id: string;
  user_id: string;
  provider: 'google' | 'ghl' | 'outlook' | 'calendly';
  provider_account_id?: string;
  provider_account_email?: string;
  calendar_id?: string;
  calendar_name?: string;
  is_primary: boolean;
  sync_enabled: boolean;
  sync_direction: 'import' | 'export' | 'bidirectional';
  last_sync_at?: string;
  sync_errors?: any[];
}

export interface CalendarAvailability {
  id: string;
  user_id: string;
  timezone: string;
  weekly_schedule: {
    [key: string]: { start: string; end: string }[];
  };
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  default_meeting_duration: number;
  min_notice_hours: number;
  max_days_ahead: number;
  slot_interval_minutes: number;
  check_calendar_conflicts: boolean;
}

export interface CalendarAppointment {
  id: string;
  user_id: string;
  lead_id?: string;
  title: string;
  description?: string;
  location?: string;
  meeting_link?: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  google_event_id?: string;
  ghl_appointment_id?: string;
  outlook_event_id?: string;
  notes?: string;
  outcome?: string;
  lead?: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    email?: string;
  };
}

const defaultAvailability: Omit<CalendarAvailability, 'id' | 'user_id'> = {
  timezone: 'America/New_York',
  weekly_schedule: {
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }],
    saturday: [],
    sunday: []
  },
  buffer_before_minutes: 15,
  buffer_after_minutes: 15,
  default_meeting_duration: 30,
  min_notice_hours: 2,
  max_days_ahead: 30,
  slot_interval_minutes: 15,
  check_calendar_conflicts: true
};

export const useCalendarIntegration = () => {
  const [integrations, setIntegrations] = useState<CalendarIntegration[]>([]);
  const [availability, setAvailability] = useState<CalendarAvailability | null>(null);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadIntegrations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('calendar_integrations')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;
      setIntegrations((data || []) as CalendarIntegration[]);
    } catch (error) {
      console.error('Error loading integrations:', error);
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('calendar_availability')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const parsed = {
          ...data,
          weekly_schedule: typeof data.weekly_schedule === 'string' 
            ? JSON.parse(data.weekly_schedule) 
            : data.weekly_schedule
        };
        setAvailability(parsed as CalendarAvailability);
      } else {
        setAvailability({
          id: '',
          user_id: user.id,
          ...defaultAvailability
        });
      }
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  }, []);

  const loadAppointments = useCallback(async (filters?: { 
    startDate?: string; 
    endDate?: string;
    status?: string;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('calendar_appointments')
        .select(`
          *,
          lead:leads(first_name, last_name, phone_number, email)
        `)
        .eq('user_id', user.id)
        .order('start_time', { ascending: true });

      if (filters?.startDate) {
        query = query.gte('start_time', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('start_time', filters.endDate);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAppointments((data || []) as CalendarAppointment[]);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
    loadAvailability();
    loadAppointments();
  }, [loadIntegrations, loadAvailability, loadAppointments]);

  const saveAvailability = async (updates: Partial<CalendarAvailability>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('calendar_availability')
        .upsert({
          user_id: user.id,
          ...updates,
          weekly_schedule: JSON.stringify(updates.weekly_schedule || availability?.weekly_schedule)
        }, { onConflict: 'user_id' });

      if (error) throw error;

      await loadAvailability();
      toast({ title: 'Availability Saved', description: 'Your availability settings have been updated' });
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const createAppointment = async (appointment: Omit<CalendarAppointment, 'id' | 'user_id'>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('calendar_appointments')
        .insert({
          ...appointment,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Sync to external calendars
      await syncAppointmentToCalendars(data as CalendarAppointment);

      await loadAppointments();
      toast({ title: 'Appointment Created', description: `Scheduled for ${new Date(appointment.start_time).toLocaleString()}` });
      return data;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateAppointment = async (id: string, updates: Partial<CalendarAppointment>) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('calendar_appointments')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      await loadAppointments();
      toast({ title: 'Appointment Updated' });
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const cancelAppointment = async (id: string) => {
    return updateAppointment(id, { status: 'cancelled' });
  };

  const syncAppointmentToCalendars = async (appointment: CalendarAppointment) => {
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: {
          action: 'sync_appointment',
          appointment
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error syncing to calendars:', error);
    }
  };

  const connectGoogleCalendar = async () => {
    setIsLoading(true);
    try {
      // Check if user signed in with Google and has calendar tokens
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({ 
          title: 'Sign In Required', 
          description: 'Please sign in first.',
          variant: 'destructive' 
        });
        return;
      }

      // Check if signed in with Google (has provider token)
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;
      
      if (!providerToken) {
        // User is signed in but not with Google OAuth
        toast({ 
          title: 'Google Sign-In Required', 
          description: 'To connect Google Calendar, you need to sign out and sign back in using the "Continue with Google" button on the login page. This grants calendar access permissions.',
          variant: 'destructive',
          duration: 10000, // Show for 10 seconds so user can read it
        });
        return;
      }

      // Save the Google tokens to calendar_integrations
      const { error: saveError } = await supabase.from('calendar_integrations').upsert({
        user_id: session.user.id,
        provider: 'google',
        provider_account_email: session.user.email,
        access_token_encrypted: providerToken,
        refresh_token_encrypted: providerRefreshToken || null,
        sync_enabled: true,
        is_primary: true,
        calendar_name: 'Google Calendar',
      }, {
        onConflict: 'user_id,provider'
      });

      if (saveError) throw saveError;

      toast({ 
        title: 'Google Calendar Connected', 
        description: 'Your Google Calendar has been connected successfully!',
      });
      
      await loadIntegrations();
    } catch (error: any) {
      console.error('Google Calendar connect error:', error);
      toast({ 
        title: 'Connection Failed', 
        description: error.message || 'Failed to connect to Google Calendar',
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const syncGHLCalendar = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: { action: 'sync_ghl_calendar' }
      });

      if (error) throw error;

      await loadAppointments();
      toast({ 
        title: 'GHL Calendar Synced', 
        description: `Synced ${data?.synced || 0} appointments` 
      });
      return data;
    } catch (error: any) {
      toast({ title: 'Sync Failed', description: error.message, variant: 'destructive' });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableSlots = async (date: string, duration?: number) => {
    try {
      const { data, error } = await supabase.functions.invoke('calendar-integration', {
        body: {
          action: 'get_available_slots',
          date,
          duration: duration || availability?.default_meeting_duration || 30
        }
      });

      if (error) throw error;
      return data?.slots || [];
    } catch (error) {
      console.error('Error getting available slots:', error);
      return [];
    }
  };

  const disconnectIntegration = async (integrationId: string) => {
    try {
      const { error } = await supabase
        .from('calendar_integrations')
        .delete()
        .eq('id', integrationId);

      if (error) throw error;

      await loadIntegrations();
      toast({ title: 'Disconnected', description: 'Calendar integration removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  return {
    integrations,
    availability,
    appointments,
    isLoading,
    loadIntegrations,
    loadAvailability,
    loadAppointments,
    saveAvailability,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    connectGoogleCalendar,
    syncGHLCalendar,
    getAvailableSlots,
    disconnectIntegration,
    defaultAvailability
  };
};
