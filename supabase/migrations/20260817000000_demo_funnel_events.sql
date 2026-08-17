create table if not exists public.demo_funnel_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  demo_session_id uuid null references public.demo_sessions(id) on delete set null,
  funnel text not null default 'generic',
  event_name text not null,
  source text null,
  utm_source text null,
  utm_medium text null,
  utm_campaign text null,
  utm_content text null,
  utm_term text null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null
);

create index if not exists demo_funnel_events_created_at_idx on public.demo_funnel_events (created_at desc);
create index if not exists demo_funnel_events_funnel_event_idx on public.demo_funnel_events (funnel, event_name, created_at desc);
create index if not exists demo_funnel_events_session_idx on public.demo_funnel_events (demo_session_id, created_at);

alter table public.demo_funnel_events enable row level security;

-- Public browsers do not write directly to analytics tables. The server-side
-- demo-funnel-track Edge Function validates event names and strips PII before
-- inserting with the service-role key.
