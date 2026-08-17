
-- Public buckets serve reads via /storage/v1/object/public/... which bypasses RLS.
-- No SELECT policy is required. Removing them eliminates the "broad SELECT" listing risk.
DROP POLICY IF EXISTS "Authenticated can read broadcast audio via API" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read marketing assets via API" ON storage.objects;
