alter table public.events
  add column if not exists allowed_embed_origins text[] not null default '{}'
    check (cardinality(allowed_embed_origins) <= 20);

create table if not exists public.ballot_versions (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('published', 'archived', 'closed')),
  is_current boolean not null default false,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source_updated_at timestamptz not null,
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ballot_id, version_number)
);

create unique index if not exists ballot_versions_one_current_idx
  on public.ballot_versions (ballot_id) where is_current;
create index if not exists ballot_versions_public_status_idx
  on public.ballot_versions (public_id, status);

alter table public.ballot_versions enable row level security;

create or replace function public.prevent_ballot_version_snapshot_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ballot_id is distinct from old.ballot_id
    or new.public_id is distinct from old.public_id
    or new.version_number is distinct from old.version_number
    or new.snapshot is distinct from old.snapshot
    or new.source_updated_at is distinct from old.source_updated_at
    or new.published_at is distinct from old.published_at then
    raise exception 'ballot_version_snapshot_is_immutable';
  end if;

  if new.status is distinct from old.status
    and (old.status <> 'published' or new.status not in ('archived', 'closed')) then
    raise exception 'invalid_ballot_version_status_transition';
  end if;

  if not old.is_current and new.is_current then
    raise exception 'archived_ballot_version_cannot_become_current';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_ballot_version_snapshot_change on public.ballot_versions;
create trigger prevent_ballot_version_snapshot_change
  before update on public.ballot_versions
  for each row execute procedure public.prevent_ballot_version_snapshot_change();

create or replace function public.publish_ballot_version(p_ballot_id uuid)
returns table(id uuid, public_id uuid, version_number integer, status text, is_current boolean, published_at timestamptz, source_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_ballot public.ballots%rowtype;
  current_event_status text;
  current_version public.ballot_versions%rowtype;
  version_snapshot jsonb;
  nominee_count integer;
  next_version integer;
  published_time timestamptz := clock_timestamp();
begin
  select * into current_ballot
  from public.ballots
  where public.ballots.id = p_ballot_id
  for update;
  if not found then raise exception 'ballot_not_found'; end if;
  if current_ballot.status = 'closed' then raise exception 'ballot_closed'; end if;

  select public.events.status into current_event_status
  from public.events
  where public.events.id = current_ballot.event_id
  for update;
  if not found then raise exception 'event_not_found'; end if;
  if current_event_status = 'closed' then raise exception 'event_closed'; end if;

  select count(*) into nominee_count
  from public.nominees
  where public.nominees.ballot_id = p_ballot_id;
  if nominee_count < 2 then raise exception 'at_least_two_nominees_required'; end if;

  version_snapshot := jsonb_build_object(
    'title', current_ballot.title,
    'description', current_ballot.description,
    'votingMode', current_ballot.voting_mode,
    'socialProgramId', current_ballot.social_program_id,
    'nominees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', nominee.id,
        'name', nominee.name,
        'imagePath', nominee.image_path,
        'sortOrder', nominee.sort_order
      ) order by nominee.sort_order, nominee.created_at)
      from public.nominees as nominee
      where nominee.ballot_id = p_ballot_id
    ), '[]'::jsonb)
  );

  select * into current_version
  from public.ballot_versions
  where ballot_versions.ballot_id = p_ballot_id and ballot_versions.is_current
  for update;
  if found and current_version.snapshot = version_snapshot then
    return query select current_version.id, current_version.public_id, current_version.version_number,
      current_version.status, current_version.is_current, current_version.published_at, current_version.source_updated_at;
    return;
  end if;

  update public.ballot_versions
  set status = 'archived', is_current = false
  where ballot_versions.ballot_id = p_ballot_id and ballot_versions.is_current;

  select coalesce(max(ballot_versions.version_number), 0) + 1 into next_version
  from public.ballot_versions where ballot_versions.ballot_id = p_ballot_id;

  insert into public.ballot_versions (ballot_id, version_number, status, is_current, snapshot, source_updated_at, published_at)
  values (p_ballot_id, next_version, 'published', true, version_snapshot, published_time, published_time)
  returning * into current_version;

  update public.ballots
  set status = 'published', updated_at = published_time
  where public.ballots.id = p_ballot_id;
  update public.events
  set status = 'published', updated_at = published_time
  where public.events.id = current_ballot.event_id;

  return query select current_version.id, current_version.public_id, current_version.version_number,
    current_version.status, current_version.is_current, current_version.published_at, current_version.source_updated_at;
end;
$$;

create or replace function public.close_ballot_version(p_ballot_id uuid)
returns table(id uuid, public_id uuid, version_number integer, status text, is_current boolean, published_at timestamptz, source_updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version public.ballot_versions%rowtype;
  closed_time timestamptz := clock_timestamp();
begin
  perform 1 from public.ballots where public.ballots.id = p_ballot_id for update;
  if not found then raise exception 'ballot_not_found'; end if;

  update public.ballot_versions
  set status = 'closed', is_current = false, retired_at = closed_time
  where ballot_versions.ballot_id = p_ballot_id
    and ballot_versions.is_current
    and ballot_versions.status = 'published'
  returning * into current_version;
  if not found then raise exception 'published_version_not_found'; end if;

  update public.ballots set status = 'closed', updated_at = closed_time where public.ballots.id = p_ballot_id;
  return query select current_version.id, current_version.public_id, current_version.version_number,
    current_version.status, current_version.is_current, current_version.published_at, current_version.source_updated_at;
end;
$$;

revoke all on function public.prevent_ballot_version_snapshot_change() from public, anon, authenticated;
revoke all on function public.publish_ballot_version(uuid) from public, anon, authenticated;
revoke all on function public.close_ballot_version(uuid) from public, anon, authenticated;
grant execute on function public.publish_ballot_version(uuid) to service_role;
grant execute on function public.close_ballot_version(uuid) to service_role;
