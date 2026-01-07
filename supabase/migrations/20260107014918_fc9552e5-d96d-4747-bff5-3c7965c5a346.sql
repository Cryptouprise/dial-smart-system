-- Add rotation control columns to phone_numbers
ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS rotation_enabled BOOLEAN DEFAULT true;

ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS max_daily_calls INTEGER DEFAULT 100;

-- Add AMD columns to voice_broadcasts
ALTER TABLE voice_broadcasts
ADD COLUMN IF NOT EXISTS enable_amd BOOLEAN DEFAULT true;

ALTER TABLE voice_broadcasts
ADD COLUMN IF NOT EXISTS voicemail_action VARCHAR(50) DEFAULT 'hangup';

ALTER TABLE voice_broadcasts
ADD COLUMN IF NOT EXISTS voicemail_audio_url TEXT;