-- Shopping: catálogo global de lojas parceiras (cuidados masculinos) com link de afiliado.
-- Lojas e produtos são da plataforma: leitura pública, e só o service role grava (nenhuma policy de escrita).
-- Cada barbearia escolhe quais lojas aparecem no app dela e quais produtos destacar.

create table partner_stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category jsonb not null default '{}'::jsonb,     -- {"pt": "Barba e cabelo", "en": "...", "es": "..."}
  commission_pct numeric(5,2) not null check (commission_pct between 0 and 100),  -- comissão que a loja paga por venda indicada
  rating numeric(2,1) check (rating between 0 and 5),
  currency char(3) not null default 'BRL',          -- a vitrine só mostra lojas na moeda da barbearia
  countries char(2)[] not null default array['BR']::char(2)[],
  site_url text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table partner_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references partner_stores(id) on delete cascade,
  name jsonb not null,                              -- {"pt": "...", "en": "...", "es": "..."}
  category text not null check (category in ('beard', 'hair', 'skin', 'kits')),
  price numeric(10,2) not null check (price >= 0),
  rating numeric(2,1) check (rating between 0 and 5),
  art text not null default 'bottle' check (art in ('bottle', 'jar', 'tube', 'kit')),  -- desenho simples no app, sem imagem externa
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  affiliate_url text not null check (affiliate_url ~ '^https://'),
  active boolean not null default true,
  sort int not null default 0
);
create index on partner_products (store_id);

create table shop_partner_settings (
  shop_id uuid not null references shops(id) on delete cascade,
  store_id uuid not null references partner_stores(id) on delete cascade,
  enabled boolean not null default true,
  featured_product_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (shop_id, store_id)
);

alter table partner_stores enable row level security;
create policy public_catalog on partner_stores for select using (active);
alter table partner_products enable row level security;
create policy public_catalog on partner_products for select using (active);

-- quais lojas a barbearia mostra também é catálogo: o app do cliente precisa ler para montar a vitrine
alter table shop_partner_settings enable row level security;
create policy public_read on shop_partner_settings for select using (true);
create policy owner_insert on shop_partner_settings for insert
  with check (is_member(shop_id, array['owner','manager']::member_role[]));
create policy owner_update on shop_partner_settings for update
  using (is_member(shop_id, array['owner','manager']::member_role[]))
  with check (is_member(shop_id, array['owner','manager']::member_role[]));
create policy owner_delete on shop_partner_settings for delete
  using (is_member(shop_id, array['owner','manager']::member_role[]));
