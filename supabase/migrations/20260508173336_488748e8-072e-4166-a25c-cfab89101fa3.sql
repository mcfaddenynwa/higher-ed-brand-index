create extension if not exists pg_trgm;

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  unitid text not null unique,
  name text not null,
  city text,
  state text,
  sector text,
  carnegie_id text,
  us_news_list text,
  flags jsonb not null default '{}'::jsonb,
  enrollment integer,
  fte integer,
  metrics jsonb not null default '{}'::jsonb,
  finance jsonb not null default '{}'::jsonb,
  rankings jsonb not null default '{}'::jsonb,
  fiscal_year text,
  updated_at timestamptz not null default now()
);

create index institutions_name_trgm_idx on public.institutions using gin (name gin_trgm_ops);
create index institutions_carnegie_idx on public.institutions (carnegie_id);
create index institutions_state_idx on public.institutions (state);

alter table public.institutions enable row level security;

create policy "Institutions are readable by everyone"
  on public.institutions
  for select
  using (true);