-- Create storage bucket for broadcast audio files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('broadcast-audio', 'broadcast-audio', true, 52428800, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own audio
CREATE POLICY "Users can upload broadcast audio"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'broadcast-audio' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow anyone to read broadcast audio (for Twilio to access)
CREATE POLICY "Broadcast audio is publicly accessible"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'broadcast-audio');

-- Allow users to update their own audio files
CREATE POLICY "Users can update their broadcast audio"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'broadcast-audio' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own audio files
CREATE POLICY "Users can delete their broadcast audio"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'broadcast-audio' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);