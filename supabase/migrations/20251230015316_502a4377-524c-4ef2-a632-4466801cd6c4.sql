-- Store short-lived lead context for voice-broadcast transfers into Retell
-- This lets retell-inbound-webhook resolve the correct lead even when caller ID is our Twilio number.

CREATE TABLE IF NOT EXISTS public.retell_transfer_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_number text NOT NULL,
  to_number text NOT NULL,
  lead_id uuid NULL,
  lead_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.retell_transfer_context ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose: only service-role edge functions should read/write this mapping.

CREATE INDEX IF NOT EXISTS retell_transfer_context_lookup_idx
  ON public.retell_transfer_context (to_number, from_number, created_at DESC);

CREATE INDEX IF NOT EXISTS retell_transfer_context_expires_idx
  ON public.retell_transfer_context (expires_at);