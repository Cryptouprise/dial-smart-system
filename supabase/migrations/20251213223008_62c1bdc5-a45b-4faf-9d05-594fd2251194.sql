-- Create default calendar availability for the user
INSERT INTO public.calendar_availability (
  user_id,
  timezone,
  weekly_schedule,
  buffer_before_minutes,
  buffer_after_minutes,
  default_meeting_duration,
  min_notice_hours,
  max_days_ahead,
  slot_interval_minutes,
  check_calendar_conflicts
) VALUES (
  '5969774f-5340-4e4f-8517-bcc89fa6b1eb',
  'America/Chicago',
  '{"monday": [{"start": "09:00", "end": "17:00"}], "tuesday": [{"start": "09:00", "end": "17:00"}], "wednesday": [{"start": "09:00", "end": "17:00"}], "thursday": [{"start": "09:00", "end": "17:00"}], "friday": [{"start": "09:00", "end": "17:00"}], "saturday": [], "sunday": []}'::jsonb,
  15,
  15,
  30,
  2,
  30,
  30,
  true
) ON CONFLICT (user_id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  weekly_schedule = EXCLUDED.weekly_schedule;