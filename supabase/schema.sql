-- Idempotent reference schema for the dedicated JBE-OUTLINE-VPN Supabase project.
-- Applied to project ref txxfhxlhlxclzxpekngj on 2026-10-14.

create extension if not exists pgcrypto;

create table if not exists public.outline_vpn_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  env_slot smallint not null unique check (env_slot between 1 and 3),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.outline_vpn_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration_days integer not null check (duration_days > 0),
  price_mmk integer not null check (price_mmk >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outline_vpn_payment_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('KBZPay','AYAPay')),
  account_name text not null,
  account_number text not null,
  instructions text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.outline_vpn_orders (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  telegram_username text,
  telegram_first_name text,
  package_id uuid references public.outline_vpn_packages(id) on delete restrict,
  package_name_snapshot text not null,
  duration_days_snapshot integer not null check (duration_days_snapshot > 0),
  price_mmk integer not null check (price_mmk >= 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','payment_submitted','approved','rejected','fulfilled','expired','cancelled')),
  payment_proof_path text,
  payment_provider text check (payment_provider in ('KBZPay','AYAPay')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outline_vpn_orders_user_created_idx
  on public.outline_vpn_orders (telegram_user_id, created_at desc);
create index if not exists outline_vpn_orders_status_created_idx
  on public.outline_vpn_orders (status, created_at);

create table if not exists public.outline_vpn_keys (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.outline_vpn_orders(id) on delete restrict,
  server_id uuid not null references public.outline_vpn_servers(id) on delete restrict,
  outline_key_id text not null,
  access_url text not null,
  status text not null default 'active' check (status in ('active','revoked','expired','error')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists outline_vpn_keys_expiry_idx
  on public.outline_vpn_keys (status, expires_at);

alter table public.outline_vpn_servers enable row level security;
alter table public.outline_vpn_packages enable row level security;
alter table public.outline_vpn_payment_settings enable row level security;
alter table public.outline_vpn_orders enable row level security;
alter table public.outline_vpn_keys enable row level security;

revoke all on public.outline_vpn_servers from anon, authenticated;
revoke all on public.outline_vpn_packages from anon, authenticated;
revoke all on public.outline_vpn_payment_settings from anon, authenticated;
revoke all on public.outline_vpn_orders from anon, authenticated;
revoke all on public.outline_vpn_keys from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('outline-vpn-payment-proofs', 'outline-vpn-payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

insert into public.outline_vpn_servers (name, env_slot, active, sort_order)
values ('Outline Server 1',1,true,1),('Outline Server 2',2,true,2),('Outline Server 3',3,true,3)
on conflict (env_slot) do update set name = excluded.name, active = excluded.active, sort_order = excluded.sort_order;
