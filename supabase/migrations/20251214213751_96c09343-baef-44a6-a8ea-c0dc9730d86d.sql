-- Disable global AI auto-responder to prevent duplicate messages
UPDATE ai_sms_settings SET auto_response_enabled = false WHERE auto_response_enabled = true;