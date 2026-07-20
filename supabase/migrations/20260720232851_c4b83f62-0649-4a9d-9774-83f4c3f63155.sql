
-- SUPA_public_bucket_allows_listing:
-- Public buckets (broadcast-audio, marketing-assets) remain public=true so /public URLs
-- still bypass RLS for Twilio playback and marketing image reads. We drop the broad
-- `SELECT to public` policies on storage.objects that let anonymous clients list bucket
-- contents via the storage API. Add authenticated-only SELECT so admins can still list.

DROP POLICY IF EXISTS "Broadcast audio is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for broadcast audio" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for marketing assets" ON storage.objects;

CREATE POLICY "Authenticated can read broadcast audio via API"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'broadcast-audio');

CREATE POLICY "Authenticated can read marketing assets via API"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-assets');

-- marketing_assets_bucket_any_authenticated_write:
-- Previously ANY authenticated user could upload/delete/modify any marketing asset.
-- Restrict writes to admins only (via has_role); public read via /public URL is unchanged.

DROP POLICY IF EXISTS "Authenticated users can manage marketing assets" ON storage.objects;

CREATE POLICY "Admins can manage marketing assets"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'marketing-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'marketing-assets' AND public.has_role(auth.uid(), 'admin'));

-- edge_function_errors_public_insert:
-- Edge functions write these via service_role (which bypasses RLS). No end user
-- should be inserting error rows. Drop the authenticated INSERT policy entirely.

DROP POLICY IF EXISTS "Users insert their own edge function errors" ON public.edge_function_errors;
