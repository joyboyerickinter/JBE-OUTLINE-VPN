-- Run this migration in the Supabase SQL Editor before deploying the server-selection UI.
alter table public.outline_vpn_servers
  add column if not exists region text not null default 'Other',
  add column if not exists stock_limit integer not null default 100 check (stock_limit >= 0);

alter table public.outline_vpn_orders
  add column if not exists server_id uuid references public.outline_vpn_servers(id) on delete restrict;

update public.outline_vpn_servers
set region = case env_slot
  when 1 then 'Singapore'
  when 2 then 'Singapore'
  else 'Other'
end
where region = 'Other';

-- Keep an explicit, admin-controlled sale stock limit. Actual availability is
-- the remaining limit after active, unexpired keys are counted.
update public.outline_vpn_servers set stock_limit = 100 where stock_limit = 100;

create index if not exists outline_vpn_orders_server_status_idx
  on public.outline_vpn_orders (server_id, status);
