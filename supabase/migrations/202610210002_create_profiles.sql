create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('member', 'superuser')),
  plan_code text check (plan_code is null or plan_code in ('free', 'paid')),
  subscription_status text not null default 'payment_required'
    check (subscription_status in ('payment_required', 'active', 'past_due', 'canceled', 'free')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Solo el API con service_role modifica perfiles. Roles y estados de pago nunca
-- se aceptan desde el frontend ni desde user_metadata.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, plan_code, subscription_status)
  values (new.id, lower(new.email), 'member', null, 'payment_required')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();
