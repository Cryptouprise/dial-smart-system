
ALTER TABLE public.pipeline_boards 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_boards_campaign_id ON public.pipeline_boards(campaign_id);

COMMENT ON COLUMN public.pipeline_boards.campaign_id IS 'Optional campaign association. NULL means global/shared pipeline board.';
