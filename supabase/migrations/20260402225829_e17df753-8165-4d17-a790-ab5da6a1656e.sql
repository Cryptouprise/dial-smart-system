CREATE POLICY "Public upload for marketing assets"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'marketing-assets');