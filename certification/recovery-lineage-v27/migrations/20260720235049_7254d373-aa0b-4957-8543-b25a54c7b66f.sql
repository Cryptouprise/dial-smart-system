ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.phone_numbers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

WITH preferred_org AS (
  SELECT DISTINCT ON (ou.user_id)
    ou.user_id,
    ou.organization_id
  FROM public.organization_users AS ou
  ORDER BY ou.user_id, CASE ou.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, ou.id
)
UPDATE public.leads AS l
SET organization_id = po.organization_id
FROM preferred_org AS po
WHERE l.organization_id IS NULL
  AND po.user_id = l.user_id;

WITH preferred_org AS (
  SELECT DISTINCT ON (ou.user_id)
    ou.user_id,
    ou.organization_id
  FROM public.organization_users AS ou
  ORDER BY ou.user_id, CASE ou.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, ou.id
)
UPDATE public.campaigns AS c
SET organization_id = po.organization_id
FROM preferred_org AS po
WHERE c.organization_id IS NULL
  AND po.user_id = c.user_id;

WITH preferred_org AS (
  SELECT DISTINCT ON (ou.user_id)
    ou.user_id,
    ou.organization_id
  FROM public.organization_users AS ou
  ORDER BY ou.user_id, CASE ou.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, ou.id
)
UPDATE public.phone_numbers AS pn
SET organization_id = po.organization_id
FROM preferred_org AS po
WHERE pn.organization_id IS NULL
  AND po.user_id = pn.user_id;

CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON public.campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_organization_id ON public.phone_numbers(organization_id);