insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nominee-images',
  'nominee-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.replace_ballot_nominees(p_ballot_id uuid, p_nominees jsonb)
returns table(id uuid, ballot_id uuid, name text, image_path text, sort_order integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(coalesce(p_nominees, '[]'::jsonb)) <> 'array' then
    raise exception 'nominees_must_be_an_array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_nominees, '[]'::jsonb)) as item(value)
    where item.value ? 'id'
      and not exists (
        select 1
        from public.nominees as current_nominee
        where current_nominee.id = (item.value->>'id')::uuid
          and current_nominee.ballot_id = p_ballot_id
      )
  ) then
    raise exception 'nominee_does_not_belong_to_ballot';
  end if;

  delete from public.nominees as current_nominee
  where current_nominee.ballot_id = p_ballot_id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_nominees, '[]'::jsonb)) as item(value)
      where item.value->>'id' = current_nominee.id::text
    );

  update public.nominees as current_nominee
  set name = item.value->>'name',
      sort_order = coalesce((item.value->>'sortOrder')::integer, item.ordinality::integer - 1)
  from jsonb_array_elements(coalesce(p_nominees, '[]'::jsonb)) with ordinality as item(value, ordinality)
  where item.value ? 'id'
    and current_nominee.id = (item.value->>'id')::uuid
    and current_nominee.ballot_id = p_ballot_id;

  insert into public.nominees (ballot_id, name, sort_order)
  select p_ballot_id,
         item.value->>'name',
         coalesce((item.value->>'sortOrder')::integer, item.ordinality::integer - 1)
  from jsonb_array_elements(coalesce(p_nominees, '[]'::jsonb)) with ordinality as item(value, ordinality)
  where not (item.value ? 'id');

  return query
    select current_nominee.id, current_nominee.ballot_id, current_nominee.name, current_nominee.image_path, current_nominee.sort_order
    from public.nominees as current_nominee
    where current_nominee.ballot_id = p_ballot_id
    order by current_nominee.sort_order, current_nominee.created_at;
end;
$$;

revoke all on function public.replace_ballot_nominees(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_ballot_nominees(uuid, jsonb) to service_role;
