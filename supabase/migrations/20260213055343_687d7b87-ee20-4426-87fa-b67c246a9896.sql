
-- Enable strategist features for existing user
UPDATE public.autonomous_settings 
SET enable_daily_planning = true, enable_strategic_insights = true 
WHERE user_id = '5969774f-5340-4e4f-8517-bcc89fa6b1eb';
