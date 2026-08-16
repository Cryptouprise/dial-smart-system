create table if not exists public.law_firm_beta_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  demo_session_id uuid null references public.demo_sessions(id) on delete set null,
  website_url text null,
  firm_name text null,
  contact_name text null,
  email text null,
  phone text null,
  interest text not null default 'start_beta' check (interest in ('start_beta', 'talk', 'lead_recovery')),
  status text not null default 'new',
  source text not null default 'law_firm_demo',
  legal_inbound_config jsonb not null default '{}'::jsonb,
  retell_call_id text null,
  ip_address text null,
  user_agent text null,
  notes text null
);

create index if not exists law_firm_beta_leads_created_at_idx
  on public.law_firm_beta_leads (created_at desc);

create index if not exists law_firm_beta_leads_status_idx
  on public.law_firm_beta_leads (status);

create index if not exists law_firm_beta_leads_email_idx
  on public.law_firm_beta_leads (lower(email))
  where email is not null;

alter table public.law_firm_beta_leads enable row level security;

-- Public clients do not receive direct table policies. Anonymous lead creation is
-- performed by the server-side law-firm-beta-submit Edge Function using the
-- service-role key, keeping validation and abuse controls at the API boundary.
