-- Create storage bucket for broadcast audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('broadcast-audio', 'broadcast-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to broadcast audio
CREATE POLICY "Public read access for broadcast audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'broadcast-audio');

-- Allow authenticated users to upload audio
CREATE POLICY "Authenticated users can upload broadcast audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'broadcast-audio' AND auth.role() = 'authenticated');

-- Allow service role to manage audio files
CREATE POLICY "Service role can manage broadcast audio"
ON storage.objects FOR ALL
USING (bucket_id = 'broadcast-audio' AND auth.role() = 'service_role');