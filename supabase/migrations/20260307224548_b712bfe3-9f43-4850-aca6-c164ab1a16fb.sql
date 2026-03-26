ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'retell';
COMMENT ON COLUMN public.campaigns.provider IS 'AI voice provider: retell or telnyx';

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS telnyx_assistant_id UUID REFERENCES public.telnyx_assistants(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.campaigns.telnyx_assistant_id IS 'Telnyx assistant ID when provider=telnyx';