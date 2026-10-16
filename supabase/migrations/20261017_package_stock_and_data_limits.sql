-- Package-specific inventory and per-key data limits.
-- Run after the server-selection migration.
alter table public.outline_vpn_packages
  add column if not exists data_limit_gb integer null
  check (data_limit_gb is null or data_limit_gb > 0);

create table if not exists public.outline_vpn_package_server_stock (
  package_id uuid not null references public.outline_vpn_packages(id) on delete cascade,
  server_id uuid not null references public.outline_vpn_servers(id) on delete restrict,
  stock_limit integer not null default 0 check (stock_limit >= 0),
  updated_at timestamptz not null default now(),
  primary key (package_id, server_id)
);

alter table public.outline_vpn_package_server_stock enable row level security;
revoke all on public.outline_vpn_package_server_stock from anon, authenticated;

-- Existing packages start with zero package-specific stock until admin configures it.
-- Backfill package data limit as Unlimited (NULL) so existing products remain usable.
create index if not exists outline_vpn_package_server_stock_server_idx
  on public.outline_vpn_package_server_stock (server_id, package_id);

alter table public.outline_vpn_orders
  add column if not exists data_limit_gb_snapshot integer null
  check (data_limit_gb_snapshot is null or data_limit_gb_snapshot > 0);
