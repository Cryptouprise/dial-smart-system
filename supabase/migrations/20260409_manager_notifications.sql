-- Add manager notification columns to autonomous_settings
-- Required by ManagerNotifications.tsx to store manager phone and preferences

ALTER TABLE public.autonomous_settings
  ADD COLUMN IF NOT EXISTS manager_phone TEXT,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.autonomous_settings.manager_phone IS 'Manager mobile number for SMS notifications (E.164 format preferred)';
COMMENT ON COLUMN public.autonomous_settings.notification_prefs IS 'Manager notification preferences: {enabled, onTransfer, onAppointment, onCampaignError, onDailySummary, onSpamAlert, onCampaignComplete, quietHoursStart, quietHoursEnd}';
