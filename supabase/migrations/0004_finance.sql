-- Financeiro: contas da barbearia (despesas) e fechamento de comissões.
-- Só dono e gerente enxergam e mexem em dinheiro da barbearia.

create type expense_kind as enum ('fixed', 'variable');

create table expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  category text not null default 'Outros',
  kind expense_kind not null default 'fixed',
  amount numeric(12,2) not null check (amount >= 0),
  -- recorrente: repete todo mês no dia `due_day` a partir de `starts_on`;
  -- avulsa: vence uma vez em `due_date`
  recurring boolean not null default true,
  due_day int check (due_day between 1 and 31),
  due_date date,
  starts_on date not null default current_date,
  -- avulsa: paga quando `paid_at` existe. Recorrente: paga até o mês de `paid_through` (1º dia do mês).
  paid_at timestamptz,
  paid_through date,
  notes text,
  created_at timestamptz not null default now(),
  check ((recurring and due_day is not null) or (not recurring and due_date is not null))
);
create index on expenses (shop_id);

-- comissão já paga a cada profissional, por período fechado
create table commission_payouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  barber_id uuid not null references barbers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount numeric(12,2) not null,
  paid_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (barber_id, period_start, period_end)
);
create index on commission_payouts (shop_id, period_start);

alter table expenses enable row level security;
create policy owner_manager on expenses for all
  using (is_member(shop_id, array['owner','manager']::member_role[]))
  with check (is_member(shop_id, array['owner','manager']::member_role[]));

alter table commission_payouts enable row level security;
create policy owner_manager on commission_payouts for all
  using (is_member(shop_id, array['owner','manager']::member_role[]))
  with check (is_member(shop_id, array['owner','manager']::member_role[]));
