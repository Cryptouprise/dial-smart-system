-- Fix silent 'astra' voice on all affected Telnyx assistants
-- Astra voice model is SILENT (produces no audio) per Telnyx reference docs
UPDATE telnyx_assistants 
SET voice = 'Telnyx.KokoroTTS.af_heart',
    updated_at = now()
WHERE voice ILIKE '%astra%';