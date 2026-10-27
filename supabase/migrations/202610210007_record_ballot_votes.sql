create table if not exists public.participant_social_access (
  participant_id uuid not null,
  program_id uuid not null references public.social_access_programs (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  confirmation_method text not null default 'manual' check (confirmation_method = 'manual'),
  primary key (participant_id, program_id)
);

create table if not exists public.vote_submissions (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references public.ballots (id) on delete restrict,
  ballot_version_id uuid not null references public.ballot_versions (id) on delete restrict,
  participant_id uuid not null,
  idempotency_key uuid not null,
  voting_mode text not null check (voting_mode in ('single_daily', 'five_daily')),
  local_vote_date date not null,
  request_assignments jsonb not null check (jsonb_typeof(request_assignments) = 'array'),
  created_at timestamptz not null default now(),
  unique (participant_id, ballot_id, local_vote_date),
  unique (participant_id, idempotency_key)
);

create index if not exists vote_submissions_version_date_idx
  on public.vote_submissions (ballot_version_id, local_vote_date);

create table if not exists public.vote_assignments (
  submission_id uuid not null references public.vote_submissions (id) on delete restrict,
  nominee_id uuid not null,
  quantity integer not null check (quantity > 0),
  primary key (submission_id, nominee_id)
);

alter table public.vote_submissions enable row level security;
alter table public.vote_assignments enable row level security;
alter table public.participant_social_access enable row level security;

create or replace function public.prevent_vote_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'vote_history_is_immutable';
end;
$$;

drop trigger if exists prevent_vote_submission_mutation on public.vote_submissions;
create trigger prevent_vote_submission_mutation
  before update or delete on public.vote_submissions
  for each row execute procedure public.prevent_vote_history_mutation();

drop trigger if exists prevent_vote_assignment_mutation on public.vote_assignments;
create trigger prevent_vote_assignment_mutation
  before update or delete on public.vote_assignments
  for each row execute procedure public.prevent_vote_history_mutation();

create or replace function public.get_ballot_vote_status(p_public_id uuid, p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version public.ballot_versions%rowtype;
  current_date_in_event date;
  mode_value text;
  social_program_id uuid;
begin
  select * into current_version
  from public.ballot_versions
  where public.ballot_versions.public_id = p_public_id;
  if not found then raise exception 'voting_version_not_found'; end if;

  select (pg_catalog.statement_timestamp() at time zone public.events.timezone)::date
    into current_date_in_event
  from public.events
  join public.ballots on public.ballots.event_id = public.events.id
  where public.ballots.id = current_version.ballot_id;
  if not found then raise exception 'event_not_found'; end if;

  mode_value := current_version.snapshot->>'votingMode';
  social_program_id := nullif(current_version.snapshot->>'socialProgramId', '')::uuid;

  return pg_catalog.jsonb_build_object(
    'alreadyVoted', exists (
      select 1 from public.vote_submissions
      where public.vote_submissions.participant_id = p_participant_id
        and public.vote_submissions.ballot_id = current_version.ballot_id
        and public.vote_submissions.local_vote_date = current_date_in_event
    ),
    'localDate', current_date_in_event,
    'votingMode', mode_value,
    'socialAccessGranted', mode_value <> 'five_daily' or exists (
      select 1 from public.participant_social_access
      where public.participant_social_access.participant_id = p_participant_id
        and public.participant_social_access.program_id = social_program_id
    )
  );
end;
$$;

create or replace function public.submit_ballot_votes(
  p_public_id uuid,
  p_participant_id uuid,
  p_idempotency_key uuid,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version public.ballot_versions%rowtype;
  current_ballot public.ballots%rowtype;
  event_status text;
  event_timezone text;
  mode_value text;
  social_program_id uuid;
  normalized_assignments jsonb;
  total_quantity integer;
  selected_nominee_count integer;
  vote_date date;
  inserted_submission_id uuid;
  existing_submission public.vote_submissions%rowtype;
begin
  if p_assignments is null or pg_catalog.jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'invalid_vote_assignments';
  end if;
  if pg_catalog.jsonb_array_length(p_assignments) = 0 then raise exception 'invalid_vote_assignments'; end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_assignments) as assignment(value)
    where pg_catalog.jsonb_typeof(assignment.value) <> 'object'
  ) then
    raise exception 'invalid_vote_assignments';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_assignments) as assignment(value)
    where not (assignment.value ? 'nomineeId')
      or not (assignment.value ? 'quantity')
      or assignment.value - 'nomineeId' - 'quantity' <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(assignment.value->'nomineeId') <> 'string'
      or pg_catalog.jsonb_typeof(assignment.value->'quantity') <> 'number'
      or (assignment.value->>'quantity') !~ '^[0-5]$'
  ) then
    raise exception 'invalid_vote_assignments';
  end if;

  if exists (
    select assignment.value->>'nomineeId'
    from pg_catalog.jsonb_array_elements(p_assignments) as assignment(value)
    group by assignment.value->>'nomineeId'
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'duplicate_vote_nominee';
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('nomineeId', assignment.value->>'nomineeId', 'quantity', (assignment.value->>'quantity')::integer)
    order by assignment.value->>'nomineeId'
  ) filter (where (assignment.value->>'quantity')::integer > 0), '[]'::jsonb)
    into normalized_assignments
  from pg_catalog.jsonb_array_elements(p_assignments) as assignment(value);

  select coalesce(pg_catalog.sum((assignment.value->>'quantity')::integer), 0), pg_catalog.count(*)::integer
    into total_quantity, selected_nominee_count
  from pg_catalog.jsonb_array_elements(normalized_assignments) as assignment(value);

  select * into current_version
  from public.ballot_versions
  where public.ballot_versions.public_id = p_public_id;
  if not found then raise exception 'voting_version_not_found'; end if;

  select * into current_ballot
  from public.ballots
  where public.ballots.id = current_version.ballot_id;
  if not found then raise exception 'voting_version_not_found'; end if;

  select public.events.status, public.events.timezone
    into event_status, event_timezone
  from public.events
  where public.events.id = current_ballot.event_id;
  if not found then raise exception 'event_not_found'; end if;

  mode_value := current_version.snapshot->>'votingMode';
  social_program_id := nullif(current_version.snapshot->>'socialProgramId', '')::uuid;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(normalized_assignments) as assignment(value)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(current_version.snapshot->'nominees') as nominee(value)
      where (nominee.value->>'id')::uuid = (assignment.value->>'nomineeId')::uuid
    )
  ) then
    raise exception 'nominee_not_in_published_version';
  end if;

  if mode_value = 'single_daily' and (total_quantity <> 1 or selected_nominee_count <> 1) then
    raise exception 'single_vote_requires_one_assignment';
  elsif mode_value = 'five_daily' and total_quantity <> 5 then
    raise exception 'five_votes_require_exactly_five';
  elsif mode_value not in ('single_daily', 'five_daily') then
    raise exception 'invalid_published_voting_mode';
  end if;

  select * into existing_submission
  from public.vote_submissions
  where public.vote_submissions.participant_id = p_participant_id
    and public.vote_submissions.idempotency_key = p_idempotency_key;
  if found then
    if existing_submission.ballot_id <> current_ballot.id
      or existing_submission.ballot_version_id <> current_version.id
      or existing_submission.request_assignments <> normalized_assignments then
      raise exception 'idempotency_key_conflict';
    end if;
    return pg_catalog.jsonb_build_object(
      'submissionId', existing_submission.id,
      'localDate', existing_submission.local_vote_date,
      'alreadySubmitted', true,
      'idempotentReplay', true
    );
  end if;

  if current_version.status <> 'published' or not current_version.is_current
    or current_ballot.status <> 'published' or event_status <> 'published' then
    raise exception 'voting_closed';
  end if;

  if mode_value = 'five_daily' and (
    social_program_id is null or not exists (
      select 1 from public.participant_social_access
      where public.participant_social_access.participant_id = p_participant_id
        and public.participant_social_access.program_id = social_program_id
    )
  ) then
    raise exception 'social_access_required';
  end if;

  vote_date := (pg_catalog.statement_timestamp() at time zone event_timezone)::date;
  insert into public.vote_submissions (
    ballot_id, ballot_version_id, participant_id, idempotency_key, voting_mode, local_vote_date, request_assignments
  ) values (
    current_ballot.id, current_version.id, p_participant_id, p_idempotency_key, mode_value, vote_date, normalized_assignments
  ) on conflict do nothing
  returning id into inserted_submission_id;

  if inserted_submission_id is null then
    select * into existing_submission
    from public.vote_submissions
    where public.vote_submissions.participant_id = p_participant_id
      and public.vote_submissions.idempotency_key = p_idempotency_key;
    if found then
      if existing_submission.ballot_id <> current_ballot.id
        or existing_submission.ballot_version_id <> current_version.id
        or existing_submission.request_assignments <> normalized_assignments then
        raise exception 'idempotency_key_conflict';
      end if;
      return pg_catalog.jsonb_build_object(
        'submissionId', existing_submission.id,
        'localDate', existing_submission.local_vote_date,
        'alreadySubmitted', true,
        'idempotentReplay', true
      );
    end if;
    raise exception 'daily_vote_limit_reached';
  end if;

  insert into public.vote_assignments (submission_id, nominee_id, quantity)
  select inserted_submission_id, (assignment.value->>'nomineeId')::uuid, (assignment.value->>'quantity')::integer
  from pg_catalog.jsonb_array_elements(normalized_assignments) as assignment(value);

  return pg_catalog.jsonb_build_object(
    'submissionId', inserted_submission_id,
    'localDate', vote_date,
    'alreadySubmitted', false,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.prevent_vote_history_mutation() from public, anon, authenticated;
revoke all on function public.get_ballot_vote_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_ballot_votes(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_ballot_vote_status(uuid, uuid) to service_role;
grant execute on function public.submit_ballot_votes(uuid, uuid, uuid, jsonb) to service_role;
