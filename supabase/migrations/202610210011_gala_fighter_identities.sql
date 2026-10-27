create table if not exists public.event_fighters (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  identity_note text not null default '' check (char_length(identity_note) <= 100),
  normalized_name text not null,
  created_at timestamptz not null default now(),
  unique (event_id, id)
);

create index if not exists event_fighters_event_name_idx
  on public.event_fighters (event_id, normalized_name, name);

create table if not exists public.event_nominee_fighters (
  event_id uuid not null references public.events (id) on delete cascade,
  nominee_id uuid not null,
  fighter_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, nominee_id),
  foreign key (event_id, fighter_id) references public.event_fighters (event_id, id) on delete restrict
);

create index if not exists event_nominee_fighters_fighter_idx
  on public.event_nominee_fighters (event_id, fighter_id);

alter table public.event_fighters enable row level security;
alter table public.event_nominee_fighters enable row level security;

-- Create a starting roster from existing snapshot names. Administrators can
-- split homonyms or consolidate aliases by changing nominee-to-fighter links.
with source_names as (
  select ballot.event_id, nominee.id as nominee_id, nominee.name
  from public.ballots as ballot
  join public.nominees as nominee on nominee.ballot_id = ballot.id
  union all
  select ballot.event_id, (item.value->>'id')::uuid, item.value->>'name'
  from public.ballot_versions as version
  join public.ballots as ballot on ballot.id = version.ballot_id
  cross join lateral jsonb_array_elements(version.snapshot->'nominees') as item(value)
), normalized_names as (
  select event_id, nominee_id,
    btrim(regexp_replace(name, '\s+', ' ', 'g')) as name,
    lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) as normalized_name
  from source_names
  where nullif(btrim(name), '') is not null
), distinct_fighters as (
  select event_id, normalized_name, min(name) as name
  from normalized_names
  group by event_id, normalized_name
)
insert into public.event_fighters (event_id, name, normalized_name)
select source.event_id, source.name, source.normalized_name
from distinct_fighters as source
where not exists (
  select 1 from public.event_fighters as fighter
  where fighter.event_id = source.event_id
    and fighter.normalized_name = source.normalized_name
);

with source_names as (
  select ballot.event_id, nominee.id as nominee_id, nominee.name
  from public.ballots as ballot
  join public.nominees as nominee on nominee.ballot_id = ballot.id
  union all
  select ballot.event_id, (item.value->>'id')::uuid, item.value->>'name'
  from public.ballot_versions as version
  join public.ballots as ballot on ballot.id = version.ballot_id
  cross join lateral jsonb_array_elements(version.snapshot->'nominees') as item(value)
), normalized_names as (
  select event_id, nominee_id,
    lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) as normalized_name
  from source_names
  where nominee_id is not null and nullif(btrim(name), '') is not null
), nominee_names as (
  select event_id, nominee_id, min(normalized_name) as normalized_name
  from normalized_names
  group by event_id, nominee_id
)
insert into public.event_nominee_fighters (event_id, nominee_id, fighter_id)
select nominee.event_id, nominee.nominee_id, fighter.id
from nominee_names as nominee
join public.event_fighters as fighter
  on fighter.event_id = nominee.event_id
  and fighter.normalized_name = nominee.normalized_name
on conflict (event_id, nominee_id) do nothing;

create or replace function public.replace_ballot_nominees_with_fighters(p_ballot_id uuid, p_nominees jsonb)
returns table(id uuid, ballot_id uuid, name text, image_path text, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ballot_event_id uuid;
  item record;
  nominee_uuid uuid;
  fighter_uuid uuid;
begin
  select ballot.event_id into ballot_event_id
  from public.ballots as ballot
  where ballot.id = p_ballot_id
  for update;
  if not found then raise exception 'ballot_not_found'; end if;

  if p_nominees is null or pg_catalog.jsonb_typeof(p_nominees) <> 'array' then
    raise exception 'nominees_must_be_an_array';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
    where pg_catalog.jsonb_typeof(submitted.value) <> 'object'
  ) then raise exception 'invalid_nominee_payload'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
    where not (submitted.value ? 'name')
      or pg_catalog.jsonb_typeof(submitted.value->'name') <> 'string'
      or (submitted.value ? 'eventFighterId' and pg_catalog.jsonb_typeof(submitted.value->'eventFighterId') not in ('string', 'null'))
  ) then raise exception 'invalid_nominee_payload'; end if;
  if exists (
    select submitted.value->>'id'
    from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
    where submitted.value ? 'id'
    group by submitted.value->>'id'
    having pg_catalog.count(*) > 1
  ) then raise exception 'duplicate_nominee_id'; end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
    where submitted.value ? 'id'
      and not exists (
        select 1 from public.nominees as current_nominee
        where current_nominee.id = (submitted.value->>'id')::uuid
          and current_nominee.ballot_id = p_ballot_id
      )
  ) then raise exception 'nominee_does_not_belong_to_ballot'; end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
    where pg_catalog.jsonb_typeof(submitted.value->'eventFighterId') = 'string'
      and not exists (
        select 1 from public.event_fighters as fighter
        where fighter.id = (submitted.value->>'eventFighterId')::uuid
          and fighter.event_id = ballot_event_id
      )
  ) then raise exception 'event_fighter_does_not_belong_to_event'; end if;

  delete from public.nominees as current_nominee
  where current_nominee.ballot_id = p_ballot_id
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_nominees) as submitted(value)
      where submitted.value->>'id' = current_nominee.id::text
    );

  for item in
    select submitted.value, submitted.ordinality
    from pg_catalog.jsonb_array_elements(p_nominees) with ordinality as submitted(value, ordinality)
  loop
    if item.value ? 'id' then
      nominee_uuid := (item.value->>'id')::uuid;
      update public.nominees as current_nominee
      set name = item.value->>'name', sort_order = item.ordinality::integer - 1
      where current_nominee.id = nominee_uuid and current_nominee.ballot_id = p_ballot_id;
    else
      insert into public.nominees (ballot_id, name, sort_order)
      values (p_ballot_id, item.value->>'name', item.ordinality::integer - 1)
      returning public.nominees.id into nominee_uuid;
    end if;

    fighter_uuid := nullif(item.value->>'eventFighterId', '')::uuid;
    if fighter_uuid is null then
      delete from public.event_nominee_fighters as link
      where link.event_id = ballot_event_id and link.nominee_id = nominee_uuid;
    else
      insert into public.event_nominee_fighters (event_id, nominee_id, fighter_id)
      values (ballot_event_id, nominee_uuid, fighter_uuid)
      on conflict (event_id, nominee_id) do update set fighter_id = excluded.fighter_id;
    end if;
  end loop;

  return query
    select current_nominee.id, current_nominee.ballot_id, current_nominee.name,
      current_nominee.image_path, current_nominee.sort_order
    from public.nominees as current_nominee
    where current_nominee.ballot_id = p_ballot_id
    order by current_nominee.sort_order, current_nominee.created_at;
end;
$$;

revoke all on function public.replace_ballot_nominees_with_fighters(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_ballot_nominees_with_fighters(uuid, jsonb) to service_role;

create or replace function public.get_event_vote_results(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with event_ballots as (
    select ballot.id, ballot.event_id, ballot.title, ballot.status, ballot.sort_order, ballot.created_at
    from public.ballots as ballot
    where ballot.event_id = p_event_id
  ),
  published_versions as (
    select version.id, version.ballot_id, ballot.event_id, version.version_number,
      version.status, version.is_current, version.published_at, version.snapshot
    from public.ballot_versions as version
    join event_ballots as ballot on ballot.id = version.ballot_id
    where version.status in ('published', 'archived', 'closed')
  ),
  vote_rows as (
    select submission.ballot_version_id, assignment.nominee_id,
      submission.participant_id, assignment.quantity
    from public.vote_submissions as submission
    join public.vote_assignments as assignment on assignment.submission_id = submission.id
    join published_versions as version on version.id = submission.ballot_version_id
  ),
  submission_totals as (
    select submission.ballot_version_id,
      count(distinct submission.id)::bigint as total_submissions,
      coalesce(sum(assignment.quantity), 0)::bigint as total_votes
    from public.vote_submissions as submission
    left join public.vote_assignments as assignment on assignment.submission_id = submission.id
    join published_versions as version on version.id = submission.ballot_version_id
    group by submission.ballot_version_id
  ),
  nominee_totals as (
    select vote_row.ballot_version_id, vote_row.nominee_id,
      count(distinct vote_row.participant_id)::bigint as unique_voters,
      sum(vote_row.quantity)::bigint as total_votes
    from vote_rows as vote_row
    group by vote_row.ballot_version_id, vote_row.nominee_id
  ),
  nominee_occurrences as (
    select version.event_id, version.ballot_id, version.id as ballot_version_id,
      (nominee.value->>'id')::uuid as nominee_id,
      nominee.value->>'name' as nominee_name,
      fighter.id as event_fighter_id,
      fighter.name as fighter_name,
      fighter.identity_note,
      fighter.id is not null as is_assigned,
      coalesce(fighter.id::text, 'unassigned:' || (nominee.value->>'id')) as identity_key
    from published_versions as version
    cross join lateral pg_catalog.jsonb_array_elements(version.snapshot->'nominees') as nominee(value)
    left join public.event_nominee_fighters as link
      on link.event_id = version.event_id and link.nominee_id = (nominee.value->>'id')::uuid
    left join public.event_fighters as fighter
      on fighter.event_id = version.event_id
      and fighter.id = coalesce(nullif(nominee.value->>'eventFighterId', '')::uuid, link.fighter_id)
  ),
  version_results as (
    select version.id, version.ballot_id, version.version_number, version.status,
      version.is_current, version.published_at,
      coalesce(submissions.total_submissions, 0)::bigint as total_submissions,
      coalesce(submissions.total_votes, 0)::bigint as total_votes,
      coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'nomineeId', nominee.value->>'id',
            'name', nominee.value->>'name',
            'sortOrder', coalesce((nominee.value->>'sortOrder')::integer, 0),
            'votes', coalesce(nominee_total.total_votes, 0),
            'uniqueVoters', coalesce(nominee_total.unique_voters, 0),
            'eventFighterId', occurrence.event_fighter_id
          ) order by coalesce((nominee.value->>'sortOrder')::integer, 0), nominee.value->>'id'
        )
        from pg_catalog.jsonb_array_elements(version.snapshot->'nominees') as nominee(value)
        left join nominee_totals as nominee_total
          on nominee_total.ballot_version_id = version.id
          and nominee_total.nominee_id = (nominee.value->>'id')::uuid
        left join nominee_occurrences as occurrence
          on occurrence.ballot_version_id = version.id
          and occurrence.nominee_id = (nominee.value->>'id')::uuid
      ), '[]'::jsonb) as nominees
    from published_versions as version
    left join submission_totals as submissions on submissions.ballot_version_id = version.id
  ),
  fighter_results as (
    select occurrence.identity_key, occurrence.event_fighter_id,
      coalesce(occurrence.fighter_name, min(occurrence.nominee_name)) as name,
      coalesce(occurrence.identity_note, '') as identity_note,
      occurrence.is_assigned,
      count(distinct occurrence.ballot_id)::integer as category_count,
      count(distinct vote.participant_id)::bigint as unique_voters,
      coalesce(sum(vote.quantity), 0)::bigint as total_votes
    from nominee_occurrences as occurrence
    left join vote_rows as vote
      on vote.ballot_version_id = occurrence.ballot_version_id
      and vote.nominee_id = occurrence.nominee_id
    group by occurrence.identity_key, occurrence.event_fighter_id,
      occurrence.fighter_name, occurrence.identity_note, occurrence.is_assigned
  )
  select pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'totalSubmissions', coalesce((select sum(result.total_submissions) from version_results as result), 0),
    'totalVotes', coalesce((select sum(result.total_votes) from version_results as result), 0),
    'fighters', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'identityKey', fighter.identity_key,
        'eventFighterId', fighter.event_fighter_id,
        'name', fighter.name,
        'identityNote', fighter.identity_note,
        'isAssigned', fighter.is_assigned,
        'categoryCount', fighter.category_count,
        'uniqueVoters', fighter.unique_voters,
        'totalVotes', fighter.total_votes
      ) order by fighter.is_assigned desc, fighter.unique_voters desc,
        fighter.total_votes desc, fighter.name)
      from fighter_results as fighter
    ), '[]'::jsonb),
    'ballots', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'ballotId', ballot.id,
        'title', ballot.title,
        'status', ballot.status,
        'versions', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'versionId', result.id,
            'versionNumber', result.version_number,
            'status', result.status,
            'isCurrent', result.is_current,
            'publishedAt', result.published_at,
            'totalSubmissions', result.total_submissions,
            'totalVotes', result.total_votes,
            'nominees', result.nominees
          ) order by result.version_number desc)
          from version_results as result
          where result.ballot_id = ballot.id
        ), '[]'::jsonb)
      ) order by ballot.sort_order, ballot.created_at)
      from event_ballots as ballot
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_event_vote_results(uuid) from public, anon, authenticated;
grant execute on function public.get_event_vote_results(uuid) to service_role;
