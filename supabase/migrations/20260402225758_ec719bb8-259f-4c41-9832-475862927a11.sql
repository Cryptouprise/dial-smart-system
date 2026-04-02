INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-assets',
  'marketing-assets',
  true,
  52428800,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for marketing assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'marketing-assets');

CREATE POLICY "Authenticated users can manage marketing assets"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'marketing-assets')
WITH CHECK (bucket_id = 'marketing-assets');