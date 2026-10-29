-- Wholesale Lead Machine, core schema (branch `wholesale`, Charles 2026-10-28, kanban P1731).
-- One wholesaler company = one row in public.organizations; its people = organization_users.
-- Everything here is SHARED by the whole team (unlike leads, where only the owning user can edit).
-- Purely additive: new wh_* tables, two helper functions, RLS. Touches no existing table, function or policy.
-- Access lock: when wh_org_settings.access_locked = true (unpaid, paused) every wh_* row disappears for that team.

-- ---------------------------------------------------------------- per-team settings
create table if not exists public.wh_org_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text,
  market text,                                   -- e.g. 'Nashville, TN'
  timezone text not null default 'America/Chicago',
  calling_hours_start time not null default '08:00',
  calling_hours_end time not null default '21:00', -- TCPA window, homeowner local time
  default_caller_id text,                        -- E.164, one of the team's numbers
  twilio_subaccount_sid text,                    -- per-team Twilio sub-account (A2P per brand)
  a2p_status text not null default 'not_started' check (a2p_status in ('not_started','submitted','approved','rejected')),
  ai_caller_agent_id text,                       -- Retell agent for AI calls
  recording_enabled boolean not null default true,
  access_locked boolean not null default false,  -- billing lock: true hides every wh_* row from the team
  locked_reason text,
  stripe_subscription_id text,
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','past_due','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
create or replace function public.wh_org_active(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not s.access_locked from public.wh_org_settings s where s.organization_id = org_id), true);
$$;

-- member of the team AND the team is not locked
create or replace function public.wh_can_use(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.user_in_organization(org_id) and public.wh_org_active(org_id);
$$;

-- ---------------------------------------------------------------- properties (the house)
create table if not exists public.wh_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parcel_id text,
  address text not null,
  city text, state text, zip text,
  county text,
  owner_name text,
  owner_type text check (owner_type in ('person','company','trust','estate','government','unknown')),
  mailing_address text,
  absentee boolean,
  property_type text,                            -- single family, duplex, land...
  beds numeric, baths numeric, sqft integer, lot_acres numeric, year_built integer,
  zoning text,
  assessed_value numeric, land_value numeric, est_value numeric, est_repairs numeric,
  distress jsonb not null default '{}'::jsonb,   -- {foreclosure_sale_date, codes_open, housing_case, liens, probate, vacant, ...}
  score integer,
  tier text check (tier in ('A','B','C')),
  status text not null default 'new' check (status in ('new','working','follow_up','offer_out','under_contract','closed','dead')),
  source text,                                   -- 'distress pull', 'parcel seeker', 'mls', 'import', ...
  source_ref text,                               -- id in the source system
  assigned_to uuid references auth.users(id) on delete set null,
  next_action_at timestamptz,
  tags text[] not null default '{}',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wh_properties_org_parcel_uq on public.wh_properties (organization_id, parcel_id) where parcel_id is not null;
create index if not exists wh_properties_org_status_idx on public.wh_properties (organization_id, status, tier, score desc);
create index if not exists wh_properties_org_zip_idx on public.wh_properties (organization_id, zip);

-- ---------------------------------------------------------------- people tied to a house (owner, listing agent, heir...)
-- phone is the dialable number; lead_id links to public.leads when the AI dialer has a lead row for it.
create table if not exists public.wh_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid,
  role text not null default 'owner' check (role in ('owner','agent','heir','tenant','attorney','other')),
  full_name text,
  phone text,                                    -- E.164
  phone_type text,                               -- mobile / landline / voip
  phone_confidence text,                         -- 'verified owner', 'household', 'probable (landline)', ...
  email text,
  do_not_call boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wh_contacts_org_phone_idx on public.wh_contacts (organization_id, phone);
create index if not exists wh_contacts_property_idx on public.wh_contacts (property_id);

-- ---------------------------------------------------------------- every call the team makes from the browser (and AI calls, mirrored)
create table if not exists public.wh_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,       -- who dialed (null = AI)
  property_id uuid,
  contact_id uuid,
  kind text not null default 'human' check (kind in ('human','ai')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  from_number text, to_number text,
  provider text not null default 'twilio',
  provider_call_sid text unique,
  status text not null default 'initiated',      -- initiated / ringing / in-progress / completed / busy / no-answer / failed / canceled
  started_at timestamptz, answered_at timestamptz, ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  outcome text,                                  -- talked / voicemail / no_answer / wrong_number / not_interested / callback / appointment / offer
  notes text,
  summary text,                                  -- AI summary after the call
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wh_calls_org_created_idx on public.wh_calls (organization_id, created_at desc);
create index if not exists wh_calls_property_idx on public.wh_calls (property_id, created_at desc);

-- ---------------------------------------------------------------- timeline (notes, texts, status changes, offers) for one house
create table if not exists public.wh_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid,
  contact_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('note','call','text_out','text_in','email_out','email_in','status','offer','task','system')),
  body text,
  ref_id uuid,                                   -- wh_calls.id / wh_offers.id / sms_messages.id
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wh_activities_property_idx on public.wh_activities (property_id, created_at desc);

-- ---------------------------------------------------------------- offers
create table if not exists public.wh_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  contact_id uuid,
  amount numeric not null,
  earnest numeric,
  close_by date,
  good_until date,
  terms text,
  status text not null default 'draft' check (status in ('draft','sent','accepted','countered','declined','expired','withdrawn')),
  counter_amount numeric,
  response_note text,
  respond_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),  -- public Accept/Counter link key
  pdf_url text,
  sent_at timestamptz, responded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wh_offers_property_idx on public.wh_offers (property_id, created_at desc);

-- ---------------------------------------------------------------- deals (under contract -> closed)
create table if not exists public.wh_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  offer_id uuid,
  stage text not null default 'under_contract' check (stage in ('under_contract','marketing','buyer_found','assigned','closing','closed','cancelled')),
  contract_price numeric,
  assignment_fee numeric,
  buyer_name text, buyer_phone text, buyer_email text,
  contract_date date, closing_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------- tenant-matched links (red-team fix 10/28)
-- A child row may only point at a parent row of the SAME company: (organization_id, parent_id) -> parent (organization_id, id).
alter table public.wh_properties add constraint wh_properties_org_id_uq unique (organization_id, id);
alter table public.wh_contacts   add constraint wh_contacts_org_id_uq   unique (organization_id, id);
alter table public.wh_offers     add constraint wh_offers_org_id_uq     unique (organization_id, id);
alter table public.wh_contacts   add constraint wh_contacts_property_fk   foreign key (organization_id, property_id) references public.wh_properties (organization_id, id) on delete cascade;
alter table public.wh_calls      add constraint wh_calls_property_fk      foreign key (organization_id, property_id) references public.wh_properties (organization_id, id) on delete set null (property_id);
alter table public.wh_calls      add constraint wh_calls_contact_fk       foreign key (organization_id, contact_id)  references public.wh_contacts   (organization_id, id) on delete set null (contact_id);
alter table public.wh_activities add constraint wh_activities_property_fk foreign key (organization_id, property_id) references public.wh_properties (organization_id, id) on delete cascade;
alter table public.wh_activities add constraint wh_activities_contact_fk  foreign key (organization_id, contact_id)  references public.wh_contacts   (organization_id, id) on delete set null (contact_id);
alter table public.wh_offers     add constraint wh_offers_property_fk     foreign key (organization_id, property_id) references public.wh_properties (organization_id, id) on delete cascade;
alter table public.wh_offers     add constraint wh_offers_contact_fk      foreign key (organization_id, contact_id)  references public.wh_contacts   (organization_id, id) on delete set null (contact_id);
alter table public.wh_deals      add constraint wh_deals_property_fk      foreign key (organization_id, property_id) references public.wh_properties (organization_id, id) on delete cascade;
alter table public.wh_deals      add constraint wh_deals_offer_fk         foreign key (organization_id, offer_id)    references public.wh_offers     (organization_id, id) on delete set null (offer_id);
create index if not exists wh_activities_org_created_idx on public.wh_activities (organization_id, created_at desc);

-- a row never changes company; the Accept/Counter token is always made by the database for browser inserts
create or replace function public.wh_guard_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'wh: a record cannot move to another company' using errcode = '42501';
  end if;
  if tg_table_name = 'wh_offers' and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.respond_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    else
      new.respond_token := old.respond_token;
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['wh_org_settings','wh_properties','wh_contacts','wh_calls','wh_activities','wh_offers','wh_deals'] loop
    execute format('drop trigger if exists %I_guard on public.%I', t, t);
    execute format('create trigger %I_guard before insert or update on public.%I for each row execute function public.wh_guard_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['wh_org_settings','wh_properties','wh_contacts','wh_calls','wh_offers','wh_deals'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.update_updated_at_column()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- row level security
alter table public.wh_org_settings enable row level security;
alter table public.wh_properties  enable row level security;
alter table public.wh_contacts    enable row level security;
alter table public.wh_calls       enable row level security;
alter table public.wh_activities  enable row level security;
alter table public.wh_offers      enable row level security;
alter table public.wh_deals       enable row level security;

-- settings: any member can READ (so a locked team sees the "account paused" banner); only owners/admins edit,
-- and nobody in the browser can flip the billing fields (those change only through service_role / Stripe webhook).
drop policy if exists wh_org_settings_select on public.wh_org_settings;
create policy wh_org_settings_select on public.wh_org_settings for select to authenticated using (public.user_in_organization(organization_id));
drop policy if exists wh_org_settings_update on public.wh_org_settings;
create policy wh_org_settings_update on public.wh_org_settings for update to authenticated
  using (public.is_org_admin(organization_id) and public.wh_org_active(organization_id))
  with check (public.is_org_admin(organization_id) and public.wh_org_active(organization_id));
revoke insert, update, delete on public.wh_org_settings from anon, authenticated;
grant update (company_name, market, timezone, calling_hours_start, calling_hours_end, default_caller_id, ai_caller_agent_id, recording_enabled)
  on public.wh_org_settings to authenticated;

-- team tables: member of the team + team not locked, for every verb. Deletes are owner/admin only.
do $$
declare t text;
begin
  foreach t in array array['wh_properties','wh_contacts','wh_activities','wh_offers','wh_deals'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.wh_can_use(organization_id))', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.wh_can_use(organization_id))', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.wh_can_use(organization_id)) with check (public.wh_can_use(organization_id))', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.wh_can_use(organization_id) and public.is_org_admin(organization_id))', t, t);
  end loop;
end $$;

-- calls are written by the voice edge functions (service_role) so the record cannot be faked from the browser;
-- the team can read them and edit only the human fields (outcome, notes) afterwards.
drop policy if exists wh_calls_select on public.wh_calls;
create policy wh_calls_select on public.wh_calls for select to authenticated using (public.wh_can_use(organization_id));
drop policy if exists wh_calls_update on public.wh_calls;
create policy wh_calls_update on public.wh_calls for update to authenticated using (public.wh_can_use(organization_id)) with check (public.wh_can_use(organization_id));
revoke insert, update, delete on public.wh_calls from anon, authenticated;
grant update (outcome, notes, property_id, contact_id) on public.wh_calls to authenticated;

-- the Accept/Counter token is a public key: never readable from the browser by other teams (RLS) and
-- not editable by anyone (the respond function uses service_role).
revoke update on public.wh_offers from authenticated;
grant update (contact_id, amount, earnest, close_by, good_until, terms, status, counter_amount, response_note, pdf_url, sent_at, responded_at)
  on public.wh_offers to authenticated;

revoke execute on function public.wh_org_active(uuid) from public, anon;
revoke execute on function public.wh_can_use(uuid) from public, anon;
grant execute on function public.wh_org_active(uuid) to authenticated;
grant execute on function public.wh_can_use(uuid) to authenticated;
