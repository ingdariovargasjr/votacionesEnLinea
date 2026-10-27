create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 500),
  timezone text not null default 'America/Mexico_City',
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_owner_created_idx on public.events (owner_id, created_at desc);

alter table public.events enable row level security;

-- La app Vue no consulta esta tabla directamente. El API valida el JWT,
-- verifica ADMIN_USER_IDS y usa la clave service_role solo en el servidor.
-- RLS permanece activa y sin políticas para bloquear acceso directo anon/authenticated.
