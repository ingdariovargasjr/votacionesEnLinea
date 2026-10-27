create table if not exists public.social_access_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_programs_owner_idx on public.social_access_programs (owner_id, created_at desc);

create table if not exists public.social_requirements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.social_access_programs (id) on delete cascade,
  network text not null check (network in ('Facebook', 'Instagram', 'TikTok')),
  action_type text not null check (action_type in ('follow', 'like')),
  page_name text not null check (char_length(page_name) between 2 and 100),
  page_url text not null check (page_url ~ '^https://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists social_requirements_program_idx on public.social_requirements (program_id, sort_order);

create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  voting_mode text not null check (voting_mode in ('single_daily', 'five_daily')),
  social_program_id uuid references public.social_access_programs (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ballots_event_order_idx on public.ballots (event_id, sort_order, created_at);
create index if not exists ballots_social_program_idx on public.ballots (social_program_id);

create table if not exists public.nominees (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  image_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists nominees_ballot_order_idx on public.nominees (ballot_id, sort_order, created_at);

alter table public.social_access_programs enable row level security;
alter table public.social_requirements enable row level security;
alter table public.ballots enable row level security;
alter table public.nominees enable row level security;

-- Las tablas solo se leen/escriben desde la API, que valida cuenta, propiedad
-- y suscripción antes de usar la service_role.

create or replace function public.replace_ballot_nominees(p_ballot_id uuid, p_nominees jsonb)
returns table(id uuid, ballot_id uuid, name text, image_path text, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.nominees as current_nominee where current_nominee.ballot_id = p_ballot_id;

  insert into public.nominees (ballot_id, name, sort_order)
  select p_ballot_id, item.value->>'name', coalesce((item.value->>'sortOrder')::integer, item.ordinality::integer - 1)
  from jsonb_array_elements(coalesce(p_nominees, '[]'::jsonb)) with ordinality as item(value, ordinality);

  return query
    select nominee.id, nominee.ballot_id, nominee.name, nominee.image_path, nominee.sort_order
    from public.nominees as nominee
    where nominee.ballot_id = p_ballot_id
    order by nominee.sort_order, nominee.created_at;
end;
$$;

revoke all on function public.replace_ballot_nominees(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_ballot_nominees(uuid, jsonb) to service_role;
