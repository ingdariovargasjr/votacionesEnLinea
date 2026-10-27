create table if not exists public.participant_social_requirement_confirmations (
  participant_id uuid not null,
  program_id uuid not null references public.social_access_programs (id) on delete cascade,
  requirement_id uuid not null,
  network text not null check (network in ('Facebook', 'Instagram', 'TikTok')),
  action_type text not null check (action_type in ('follow', 'like')),
  page_name text not null check (char_length(page_name) between 2 and 100),
  page_url text not null check (page_url ~ '^https://'),
  confirmed_at timestamptz not null default now(),
  confirmation_method text not null default 'manual' check (confirmation_method = 'manual'),
  primary key (participant_id, program_id, requirement_id)
);

create index if not exists participant_social_confirmations_program_idx
  on public.participant_social_requirement_confirmations (participant_id, program_id, confirmed_at);

alter table public.participant_social_requirement_confirmations enable row level security;

create or replace function public.confirm_participant_social_access(
  p_participant_id uuid,
  p_program_id uuid,
  p_requirement_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requirement_count integer;
  confirmation_time timestamptz := pg_catalog.statement_timestamp();
  access_row public.participant_social_access%rowtype;
begin
  if p_requirement_ids is null or pg_catalog.cardinality(p_requirement_ids) = 0
    or pg_catalog.cardinality(p_requirement_ids) > 4 then
    raise exception 'social_requirements_not_configured';
  end if;

  perform 1 from public.social_access_programs
  where public.social_access_programs.id = p_program_id
  for share;
  if not found then raise exception 'social_program_not_found'; end if;

  select pg_catalog.count(*)::integer into requirement_count
  from public.social_requirements
  where public.social_requirements.program_id = p_program_id;
  if requirement_count = 0 then raise exception 'social_requirements_not_configured'; end if;

  if pg_catalog.cardinality(p_requirement_ids) <> requirement_count
    or (select pg_catalog.count(distinct submitted.requirement_id)::integer from pg_catalog.unnest(p_requirement_ids) as submitted(requirement_id)) <> requirement_count
    or exists (
      select 1 from pg_catalog.unnest(p_requirement_ids) as submitted(requirement_id)
      where not exists (
        select 1 from public.social_requirements
        where public.social_requirements.program_id = p_program_id
          and public.social_requirements.id = submitted.requirement_id
      )
    ) then
    raise exception 'social_requirement_set_mismatch';
  end if;

  insert into public.participant_social_requirement_confirmations (
    participant_id, program_id, requirement_id, network, action_type, page_name, page_url, confirmed_at, confirmation_method
  )
  select p_participant_id, p_program_id, requirement.id, requirement.network, requirement.action_type,
    requirement.page_name, requirement.page_url, confirmation_time, 'manual'
  from public.social_requirements as requirement
  where requirement.program_id = p_program_id
    and requirement.id = any(p_requirement_ids)
  on conflict (participant_id, program_id, requirement_id) do nothing;

  insert into public.participant_social_access (participant_id, program_id, confirmed_at, confirmation_method)
  values (p_participant_id, p_program_id, confirmation_time, 'manual')
  on conflict (participant_id, program_id) do nothing;

  select * into access_row
  from public.participant_social_access
  where public.participant_social_access.participant_id = p_participant_id
    and public.participant_social_access.program_id = p_program_id;

  return pg_catalog.jsonb_build_object(
    'programId', p_program_id,
    'confirmedAt', access_row.confirmed_at,
    'confirmationMethod', access_row.confirmation_method,
    'confirmedRequirements', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('requirementId', confirmation.requirement_id, 'confirmedAt', confirmation.confirmed_at)
        order by confirmation.confirmed_at, confirmation.requirement_id
      ), '[]'::jsonb)
      from public.participant_social_requirement_confirmations as confirmation
      where confirmation.participant_id = p_participant_id
        and confirmation.program_id = p_program_id
    )
  );
end;
$$;

revoke all on function public.confirm_participant_social_access(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.confirm_participant_social_access(uuid, uuid, uuid[]) to service_role;
