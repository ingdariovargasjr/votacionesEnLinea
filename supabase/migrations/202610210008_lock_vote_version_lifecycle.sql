create or replace function public.validate_vote_version_at_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ballot_row public.ballots%rowtype;
  event_row public.events%rowtype;
  version_row public.ballot_versions%rowtype;
begin
  -- Publish/retire operations lock the ballot first. Sharing that lock keeps a
  -- vote from passing a stale published-version check during a transition.
  select * into ballot_row
  from public.ballots
  where public.ballots.id = new.ballot_id
  for share;
  if not found then raise exception 'voting_closed'; end if;

  select * into event_row
  from public.events
  where public.events.id = ballot_row.event_id
  for share;
  if not found then raise exception 'voting_closed'; end if;

  select * into version_row
  from public.ballot_versions
  where public.ballot_versions.id = new.ballot_version_id
  for share;
  if not found then raise exception 'voting_closed'; end if;
  if version_row.ballot_id <> new.ballot_id
    or version_row.status <> 'published'
    or not version_row.is_current
    or version_row.snapshot->>'votingMode' is distinct from new.voting_mode
    or ballot_row.status <> 'published'
    or event_row.status <> 'published' then
    raise exception 'voting_closed';
  end if;

  new.local_vote_date := (pg_catalog.statement_timestamp() at time zone event_row.timezone)::date;
  return new;
end;
$$;

drop trigger if exists validate_vote_version_at_insert on public.vote_submissions;
create trigger validate_vote_version_at_insert
  before insert on public.vote_submissions
  for each row execute procedure public.validate_vote_version_at_insert();

revoke all on function public.validate_vote_version_at_insert() from public, anon, authenticated;
