-- Create calendar integrations table
CREATE TABLE public.calendar_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Provider info
  provider TEXT NOT NULL, -- 'google', 'ghl', 'outlook', 'calendly'
  provider_account_id TEXT,
  provider_account_email TEXT,
  
  -- OAuth tokens (encrypted)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Calendar settings
  calendar_id TEXT, -- specific calendar to use
  calendar_name TEXT,
  is_primary BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  
  -- Sync settings
  sync_direction TEXT DEFAULT 'bidirectional', -- 'import', 'export', 'bidirectional'
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_errors JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT calendar_integrations_user_id_unique UNIQUE (user_id, provider, calendar_id)
);

-- Create calendar availability settings
CREATE TABLE public.calendar_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  
  -- Default availability
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  
  -- Weekly schedule (JSON with day -> time slots)
  weekly_schedule JSONB NOT NULL DEFAULT '{
    "monday": [{"start": "09:00", "end": "17:00"}],
    "tuesday": [{"start": "09:00", "end": "17:00"}],
    "wednesday": [{"start": "09:00", "end": "17:00"}],
    "thursday": [{"start": "09:00", "end": "17:00"}],
    "friday": [{"start": "09:00", "end": "17:00"}],
    "saturday": [],
    "sunday": []
  }'::jsonb,
  
  -- Buffer times
  buffer_before_minutes INTEGER DEFAULT 15,
  buffer_after_minutes INTEGER DEFAULT 15,
  
  -- Meeting preferences
  default_meeting_duration INTEGER DEFAULT 30,
  min_notice_hours INTEGER DEFAULT 2, -- Minimum hours notice for booking
  max_days_ahead INTEGER DEFAULT 30, -- How far in advance bookings allowed
  
  -- Slot settings
  slot_interval_minutes INTEGER DEFAULT 15, -- Slot intervals (15, 30, 60)
  
  -- Busy time detection
  check_calendar_conflicts BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT calendar_availability_user_unique UNIQUE (user_id)
);

-- Create scheduled appointments table
CREATE TABLE public.calendar_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Appointment details
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  meeting_link TEXT,
  
  -- Timing
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  
  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'
  
  -- External calendar IDs
  google_event_id TEXT,
  ghl_appointment_id TEXT,
  outlook_event_id TEXT,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  notes TEXT,
  outcome TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_appointments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own calendar integrations"
ON public.calendar_integrations FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own availability"
ON public.calendar_availability FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own appointments"
ON public.calendar_appointments FOR ALL USING (auth.uid() = user_id);

-- Create triggers for updated_at
CREATE TRIGGER update_calendar_integrations_updated_at
BEFORE UPDATE ON public.calendar_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_availability_updated_at
BEFORE UPDATE ON public.calendar_availability
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_appointments_updated_at
BEFORE UPDATE ON public.calendar_appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();