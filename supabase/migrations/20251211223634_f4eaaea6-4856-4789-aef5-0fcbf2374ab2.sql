-- Add voice_speed column to voice_broadcasts
ALTER TABLE public.voice_broadcasts 
ADD COLUMN voice_speed numeric DEFAULT 1.0;