create or replace function public.get_event_vote_results(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with event_ballots as (
    select ballot.id, ballot.title, ballot.status, ballot.sort_order, ballot.created_at
    from public.ballots as ballot
    where ballot.event_id = p_event_id
  ),
  published_versions as (
    select
      version.id,
      version.ballot_id,
      version.version_number,
      version.status,
      version.is_current,
      version.published_at,
      version.snapshot
    from public.ballot_versions as version
    join event_ballots as ballot on ballot.id = version.ballot_id
    where version.status in ('published', 'archived', 'closed')
  ),
  submission_totals as (
    select
      submission.ballot_version_id,
      count(distinct submission.id)::bigint as total_submissions,
      coalesce(sum(assignment.quantity), 0)::bigint as total_votes
    from public.vote_submissions as submission
    left join public.vote_assignments as assignment on assignment.submission_id = submission.id
    join published_versions as version on version.id = submission.ballot_version_id
    group by submission.ballot_version_id
  ),
  nominee_totals as (
    select
      submission.ballot_version_id,
      assignment.nominee_id,
      sum(assignment.quantity)::bigint as total_votes
    from public.vote_submissions as submission
    join public.vote_assignments as assignment on assignment.submission_id = submission.id
    join published_versions as version on version.id = submission.ballot_version_id
    group by submission.ballot_version_id, assignment.nominee_id
  ),
  version_results as (
    select
      version.id,
      version.ballot_id,
      version.version_number,
      version.status,
      version.is_current,
      version.published_at,
      coalesce(submissions.total_submissions, 0)::bigint as total_submissions,
      coalesce(submissions.total_votes, 0)::bigint as total_votes,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'nomineeId', nominee.value->>'id',
            'name', nominee.value->>'name',
            'sortOrder', coalesce((nominee.value->>'sortOrder')::integer, 0),
            'votes', coalesce(nominee_total.total_votes, 0)
          ) order by coalesce((nominee.value->>'sortOrder')::integer, 0), nominee.value->>'id'
        )
        from jsonb_array_elements(version.snapshot->'nominees') as nominee(value)
        left join nominee_totals as nominee_total
          on nominee_total.ballot_version_id = version.id
          and nominee_total.nominee_id = (nominee.value->>'id')::uuid
      ), '[]'::jsonb) as nominees
    from published_versions as version
    left join submission_totals as submissions on submissions.ballot_version_id = version.id
  )
  select jsonb_build_object(
    'eventId', p_event_id,
    'totalSubmissions', coalesce((select sum(result.total_submissions) from version_results as result), 0),
    'totalVotes', coalesce((select sum(result.total_votes) from version_results as result), 0),
    'ballots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'ballotId', ballot.id,
          'title', ballot.title,
          'status', ballot.status,
          'versions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'versionId', result.id,
                'versionNumber', result.version_number,
                'status', result.status,
                'isCurrent', result.is_current,
                'publishedAt', result.published_at,
                'totalSubmissions', result.total_submissions,
                'totalVotes', result.total_votes,
                'nominees', result.nominees
              ) order by result.version_number desc
            )
            from version_results as result
            where result.ballot_id = ballot.id
          ), '[]'::jsonb)
        ) order by ballot.sort_order, ballot.created_at
      )
      from event_ballots as ballot
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_event_vote_results(uuid) from public, anon, authenticated;
grant execute on function public.get_event_vote_results(uuid) to service_role;
