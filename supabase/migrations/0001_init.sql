-- Navalha: esquema inicial (multi-barbearia).
-- Cada linha pertence a uma barbearia (shop_id). Funcionários veem só a própria barbearia;
-- clientes entram pelo WhatsApp (telefone verificado) e veem só os próprios dados.

create extension if not exists btree_gist;

-- ---------- tipos ----------
create type member_role as enum ('owner', 'manager', 'reception', 'barber');
create type pay_kind as enum ('commission', 'chair_rent');
create type appointment_status as enum ('pending', 'confirmed', 'in_service', 'done', 'no_show', 'cancelled');
create type appointment_source as enum ('app', 'whatsapp', 'ai', 'reception', 'walk_in', 'rebook');
create type plan_commission_model as enum ('usage_split', 'quota_split', 'list_price', 'fixed');
create type payout_period as enum ('weekly', 'biweekly', 'monthly');
create type message_trigger as enum ('before_appointment', 'after_appointment', 'plan_expiring', 'plan_expired', 'client_absent', 'birthday', 'campaign');
create type payment_method as enum ('pix', 'card', 'cash');
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type queue_status as enum ('waiting', 'served', 'left');

-- ---------- barbearia e equipe ----------
create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country char(2) not null default 'BR',
  currency char(3) not null default 'BRL',
  default_lang text not null default 'pt' check (default_lang in ('pt', 'en', 'es')),
  timezone text not null default 'America/Sao_Paulo',
  address text,
  -- horário por dia da semana: {"1": {"open": "09:00", "close": "20:00"}, ...}; dia ausente = fechado
  opening_hours jsonb not null default '{}'::jsonb,
  slot_step_min int not null default 15 check (slot_step_min between 5 and 60),
  plan_alert_days int not null default 5,
  block_expired_plans boolean not null default true,
  created_at timestamptz not null default now()
);

create table shop_members (
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null,
  primary key (shop_id, user_id)
);

create table barbers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role_title text,
  color text,
  active boolean not null default true,
  pay pay_kind not null default 'commission',
  commission_pct numeric(5,2) not null default 40 check (commission_pct between 0 and 100),
  chair_rent numeric(10,2) not null default 0,
  monthly_goal numeric(12,2),
  sort int not null default 0
);
create index on barbers (shop_id);

-- ---------- serviços e planos ----------
create table services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name jsonb not null,                -- {"pt": "Corte social", "en": "...", "es": "..."}
  duration_min int not null check (duration_min > 0),
  price numeric(10,2) not null check (price >= 0),
  commission_override_pct numeric(5,2) check (commission_override_pct between 0 and 100),
  active boolean not null default true,
  sort int not null default 0
);
create index on services (shop_id);

create table plans (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  description jsonb,
  price numeric(10,2) not null check (price >= 0),
  quota_uses int check (quota_uses > 0),   -- null = ilimitado
  period_days int not null default 30,
  active boolean not null default true
);

create table plan_services (
  plan_id uuid not null references plans(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (plan_id, service_id)
);

-- ---------- clientes ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  phone_e164 text not null,           -- o cadastro é o número do WhatsApp
  name text not null,
  lang text not null default 'pt' check (lang in ('pt', 'en', 'es')),
  birthdate date,
  preferred_barber_id uuid references barbers(id) on delete set null,
  preferences text,
  photo_consent_at timestamptz,       -- LGPD: fotos só com consentimento registrado
  no_shows int not null default 0,
  referred_by uuid references clients(id) on delete set null,
  referral_code text,
  created_at timestamptz not null default now(),
  unique (shop_id, phone_e164)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid not null references plans(id),
  sold_by_barber_id uuid references barbers(id) on delete set null,
  period_start date not null,
  period_end date not null,
  uses_in_period int not null default 0,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on subscriptions (shop_id, period_end);

-- ---------- agenda ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  barber_id uuid not null references barbers(id),
  client_id uuid references clients(id) on delete set null,
  walk_in_name text,                  -- cliente sem cadastro encaixado na hora
  service_id uuid not null references services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'confirmed',
  source appointment_source not null default 'app',
  subscription_id uuid references subscriptions(id) on delete set null,
  price numeric(10,2) not null default 0,   -- 0 quando coberto pelo plano
  actual_minutes int,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- o mesmo barbeiro não pode ter dois atendimentos ao mesmo tempo
  exclude using gist (barber_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status not in ('cancelled', 'no_show'))
);
create index on appointments (shop_id, starts_at);

-- encaixes de pico guardados para quem chega sem horário
create table walk_in_policy (
  shop_id uuid primary key references shops(id) on delete cascade,
  enabled boolean not null default true,
  per_peak_hour int not null default 2 check (per_peak_hour between 0 and 10),
  peak_starts time[] not null default array['11:00','17:00','18:00','19:00']::time[],
  block_min int not null default 45
);

create table walk_in_queue (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  name text not null,
  service_id uuid references services(id),
  joined_at timestamptz not null default now(),
  via text not null default 'reception' check (via in ('reception', 'app', 'qr')),
  status queue_status not null default 'waiting',
  appointment_id uuid references appointments(id)
);

-- ---------- dinheiro ----------
create table payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  subscription_id uuid references subscriptions(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  amount numeric(10,2) not null,
  method payment_method not null,
  status payment_status not null default 'pending',
  provider text,
  provider_ref text,
  split jsonb,                        -- partes do Pix dividido: [{"barber_id": ..., "amount": ...}]
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table commission_rules (
  shop_id uuid primary key references shops(id) on delete cascade,
  plan_model plan_commission_model not null default 'usage_split',
  plan_pct numeric(5,2) not null default 45,
  list_price_pct numeric(5,2) not null default 40,
  fixed_per_visit numeric(10,2) not null default 18,
  product_pct numeric(5,2) not null default 10,
  plan_sale_bonus_pct numeric(5,2) not null default 10,
  deduct_card_fee boolean not null default true,
  card_fee_pct numeric(5,2) not null default 3.2,
  supplies_per_visit numeric(10,2) not null default 0,
  tiers jsonb not null default '[]'::jsonb,     -- [{"above": 15000, "extra_pct": 3}]
  monthly_floor numeric(10,2) not null default 0,
  payout payout_period not null default 'weekly',
  pix_split boolean not null default false
);

-- ---------- mensagens ----------
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  trigger message_trigger not null,
  "offset" numeric(6,2) not null default 0,
  enabled boolean not null default true,
  body jsonb not null                 -- {"pt": "...", "en": "...", "es": "..."}
);

create table message_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  template_id uuid references message_templates(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  channel text not null default 'whatsapp',
  status text not null default 'queued',  -- queued, sent, delivered, read, failed
  provider_ref text,
  send_at timestamptz not null,
  sent_at timestamptz,
  unique (template_id, appointment_id)    -- nunca manda o mesmo lembrete duas vezes
);

-- ---------- recursos liga/desliga ----------
create table shop_features (
  shop_id uuid not null references shops(id) on delete cascade,
  key text not null,                  -- ai_receptionist, style_passport, autofill, qr_checkin, referral, shopping, ideal_cut, rebook, no_show_deposit, network
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  primary key (shop_id, key)
);

-- ---------- estilo ----------
create table style_passports (
  client_id uuid primary key references clients(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,   -- máquina, pente, medidas, produto
  shared_with_network boolean not null default false,
  updated_at timestamptz not null default now()
);

create table style_projects (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  barber_id uuid references barbers(id) on delete set null,
  goal text not null,
  steps jsonb not null default '[]'::jsonb,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- segurança (RLS) ----------
create or replace function is_member(target uuid, roles member_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members
    where shop_id = target and user_id = auth.uid()
      and (roles is null or role = any(roles))
  );
$$;

-- cliente logado pelo WhatsApp: o telefone verificado no token liga ao cadastro na barbearia
create or replace function my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from clients where phone_e164 = '+' || ltrim(coalesce(auth.jwt() ->> 'phone', ''), '+');
$$;

do $$
declare t text;
begin
  foreach t in array array['barbers','services','plans','clients','subscriptions','appointments','walk_in_queue',
                           'payments','message_templates','message_log','style_passports','style_projects']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all using (is_member(shop_id)) with check (is_member(shop_id))', t);
  end loop;
end $$;

alter table shops enable row level security;
create policy staff_read on shops for select using (is_member(id));
create policy owner_write on shops for update using (is_member(id, array['owner','manager']::member_role[]));
create policy public_read on shops for select using (true);  -- nome, endereço e horário aparecem no app de agendamento

alter table shop_members enable row level security;
create policy see_own_team on shop_members for select using (is_member(shop_id));
create policy owner_manage on shop_members for all using (is_member(shop_id, array['owner']::member_role[]));

alter table commission_rules enable row level security;
create policy owner_only on commission_rules for all using (is_member(shop_id, array['owner','manager']::member_role[]));
alter table shop_features enable row level security;
create policy staff_read on shop_features for select using (is_member(shop_id));
create policy owner_write on shop_features for all using (is_member(shop_id, array['owner','manager']::member_role[]));
alter table walk_in_policy enable row level security;
create policy staff_read on walk_in_policy for select using (is_member(shop_id));
create policy owner_write on walk_in_policy for all using (is_member(shop_id, array['owner','manager']::member_role[]));
alter table plan_services enable row level security;
create policy public_read on plan_services for select using (true);

-- o app do cliente lê o catálogo da barbearia e só os próprios dados
create policy public_catalog on services for select using (active);
create policy public_catalog on plans for select using (active);
create policy public_team on barbers for select using (active);
create policy client_self on clients for select using (id in (select my_client_ids()));
create policy client_self on subscriptions for select using (client_id in (select my_client_ids()));
create policy client_self on appointments for select using (client_id in (select my_client_ids()));
create policy client_self on style_passports for select using (client_id in (select my_client_ids()));
create policy client_self on style_projects for select using (client_id in (select my_client_ids()));
create policy client_self on payments for select using (client_id in (select my_client_ids()));
-- agendar, cancelar e pagar passam por funções no servidor, que checam horário livre, plano e regras do dono.
