-- Gerado por "npm run db:bundle". ATENÇÃO: apaga tudo o que está no schema public e recria o banco do Navalha.
-- Use só enquanto o banco ainda não tem dados de verdade. Cole o arquivo inteiro no SQL Editor do Supabase e clique em Run.

drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
set search_path = public, extensions;

-- ===== 0001_init.sql =====
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

-- ===== 0002_booking.sql =====
-- Agendamento pelo cliente. O cliente não escreve direto nas tabelas:
-- passa por estas funções, que validam tudo no servidor.

-- Horários ocupados de um dia, sem nomes de clientes (para o app público montar a grade).
create or replace function busy_slots(p_shop uuid, p_from timestamptz, p_to timestamptz)
returns table (barber_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.barber_id, a.starts_at, a.ends_at
  from appointments a
  where a.shop_id = p_shop
    and a.status not in ('cancelled', 'no_show')
    and a.starts_at < p_to and a.ends_at > p_from;
$$;

-- Telefone verificado do usuário logado, no formato +5511...
create or replace function my_phone()
returns text language sql stable as $$
  select nullif('+' || ltrim(coalesce(auth.jwt() ->> 'phone', ''), '+'), '+');
$$;

-- Cria (ou atualiza o nome do) cadastro do cliente na barbearia e marca o horário.
create or replace function book_appointment(
  p_shop uuid, p_barber uuid, p_service uuid, p_starts timestamptz,
  p_name text default null, p_lang text default 'pt'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := my_phone();
  v_client uuid;
  v_service services%rowtype;
  v_sub uuid;
  v_id uuid;
begin
  if v_phone is null then raise exception 'not_logged_in'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;

  select * into v_service from services where id = p_service and shop_id = p_shop and active;
  if not found then raise exception 'service_not_found'; end if;
  perform 1 from barbers where id = p_barber and shop_id = p_shop and active;
  if not found then raise exception 'barber_not_found'; end if;

  insert into clients (shop_id, phone_e164, name, lang)
  values (p_shop, v_phone, coalesce(nullif(trim(p_name), ''), 'Cliente'), coalesce(p_lang, 'pt'))
  on conflict (shop_id, phone_e164) do update
    set name = coalesce(nullif(trim(excluded.name), ''), clients.name)
  returning id into v_client;

  -- plano ativo que cobre o serviço (o preço fica 0 e a visita entra no rateio da comissão)
  select s.id into v_sub
  from subscriptions s join plan_services ps on ps.plan_id = s.plan_id and ps.service_id = p_service
  where s.client_id = v_client and s.cancelled_at is null
    and current_date between s.period_start and s.period_end
  limit 1;

  begin
    insert into appointments (shop_id, barber_id, client_id, service_id, starts_at, ends_at, source, subscription_id, price)
    values (p_shop, p_barber, v_client, p_service, p_starts,
            p_starts + make_interval(mins => v_service.duration_min), 'app', v_sub,
            case when v_sub is null then v_service.price else 0 end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;
  return v_id;
end $$;

-- O cliente cancela o próprio horário (até o início).
create or replace function cancel_my_appointment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update appointments set status = 'cancelled'
  where id = p_id and client_id in (select my_client_ids()) and starts_at > now()
    and status in ('pending', 'confirmed');
  if not found then raise exception 'cannot_cancel'; end if;
end $$;

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public;
revoke all on function cancel_my_appointment(uuid) from public;
grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function cancel_my_appointment(uuid) to authenticated;
grant execute on function busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;

-- ===== 0003_onboarding.sql =====
-- Cadastro da barbearia pelo próprio dono, logo depois de entrar pelo WhatsApp.
create or replace function create_shop(
  p_name text, p_slug text,
  p_timezone text default 'America/Sao_Paulo', p_currency text default 'BRL', p_lang text default 'pt'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_slug text := trim(both '-' from lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9-]+', '-', 'g')));
begin
  if auth.uid() is null then raise exception 'not_logged_in'; end if;
  if length(trim(p_name)) < 2 then raise exception 'invalid_name'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{2,40}$' then raise exception 'invalid_slug'; end if;
  -- limite simples contra abuso: até 5 barbearias por conta
  if (select count(*) from shop_members where user_id = auth.uid() and role = 'owner') >= 5 then
    raise exception 'too_many_shops';
  end if;

  begin
    insert into shops (name, slug, timezone, currency, default_lang, opening_hours)
    values (trim(p_name), v_slug, p_timezone, upper(p_currency), p_lang,
      '{"1":{"open":"09:00","close":"19:00"},"2":{"open":"09:00","close":"19:00"},"3":{"open":"09:00","close":"19:00"},
        "4":{"open":"09:00","close":"19:00"},"5":{"open":"09:00","close":"19:00"},"6":{"open":"09:00","close":"17:00"}}')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;

  insert into shop_members (shop_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into commission_rules (shop_id) values (v_id);
  insert into walk_in_policy (shop_id) values (v_id);
  return v_id;
end $$;

revoke all on function create_shop(text, text, text, text, text) from public;
grant execute on function create_shop(text, text, text, text, text) to authenticated;

-- ===== 0004_finance.sql =====
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

-- ===== 0005_messages.sql =====
-- Mensagens automáticas: modelos padrão para toda barbearia.
-- Um gatilho em `shops` cria os modelos quando a barbearia é cadastrada (por create_shop ou por qualquer outro caminho),
-- e as barbearias que já existem e ainda não têm nenhum modelo recebem os mesmos.
-- O texto é o mesmo de src/modules/messages/defaults.ts.
--
-- "offset" segue src/core/messages.ts: o gatilho dá a direção e o número é sempre positivo
-- (antes do horário: horas antes; depois do atendimento: horas depois; plano: dias; cliente sumido: fator do intervalo).

create index if not exists message_templates_shop_idx on message_templates (shop_id);
create index if not exists message_log_shop_send_idx on message_log (shop_id, send_at);

alter table message_templates
  add constraint message_templates_body_pt check (body ? 'pt' and length(body ->> 'pt') between 1 and 2000),
  add constraint message_templates_name_len check (length(trim(name)) between 1 and 80),
  add constraint message_templates_offset_range check ("offset" between 0 and 720);

create or replace function insert_default_message_templates(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into message_templates (shop_id, name, trigger, "offset", enabled, body) values
    (p_shop, E'Lembrete 1 dia antes', 'before_appointment', 24, true,
     jsonb_build_object('pt', E'Olá, {nome}! Passando para lembrar do seu horário amanhã, {data}, às {hora}, com {barbeiro} ({servico}).\n\nSe precisar remarcar: {link}',
                        'en', E'Hi {nome}! Just a reminder of your visit tomorrow, {data}, at {hora}, with {barbeiro} ({servico}).\n\nNeed to reschedule? {link}',
                        'es', E'¡Hola, {nome}! Te recordamos tu turno de mañana, {data}, a las {hora}, con {barbeiro} ({servico}).\n\nSi necesitas cambiarlo: {link}')),
    (p_shop, E'Lembrete 2 horas antes', 'before_appointment', 2, true,
     jsonb_build_object('pt', E'{nome}, falta pouco! Seu {servico} com {barbeiro} é hoje às {hora}.\nEstamos na {endereco}. Até já! 💈',
                        'en', E'{nome}, almost time! Your {servico} with {barbeiro} is today at {hora}.\nWe are at {endereco}. See you soon! 💈',
                        'es', E'¡{nome}, falta poco! Tu {servico} con {barbeiro} es hoy a las {hora}.\nEstamos en {endereco}. ¡Hasta pronto! 💈')),
    (p_shop, E'Obrigado e avaliação', 'after_appointment', 1, true,
     jsonb_build_object('pt', E'Valeu pela visita, {nome}! De 0 a 10, quanto você indicaria a {barbearia}? Sua nota ajuda o {barbeiro} a crescer.',
                        'en', E'Thanks for coming, {nome}! From 0 to 10, how likely are you to recommend {barbearia}? Your score helps {barbeiro} grow.',
                        'es', E'¡Gracias por venir, {nome}! Del 0 al 10, ¿cuánto recomendarías {barbearia}? Tu nota ayuda a {barbeiro} a crecer.')),
    (p_shop, E'Plano vencendo', 'plan_expiring', 5, true,
     jsonb_build_object('pt', E'Oi, {nome}! Seu plano {plano} vence em {dias} dias ({vencimento}).\nRenove e mantenha seus horários garantidos: {link}',
                        'en', E'Hi {nome}! Your {plano} plan renews in {dias} days ({vencimento}).\nRenew now and keep your visits: {link}',
                        'es', E'¡Hola, {nome}! Tu plan {plano} vence en {dias} días ({vencimento}).\nRenuévalo y mantén tus turnos: {link}')),
    (p_shop, E'Plano vencido', 'plan_expired', 1, true,
     jsonb_build_object('pt', E'Oi, {nome}. Seu plano {plano} venceu em {vencimento}.\nPague pelo link e ele volta a valer na hora: {link}',
                        'en', E'Hi {nome}. Your {plano} plan expired on {vencimento}.\nPay through the link and it works again right away: {link}',
                        'es', E'Hola, {nome}. Tu plan {plano} venció el {vencimento}.\nPaga por el enlace y vuelve a valer al instante: {link}')),
    (p_shop, E'Cliente sumido', 'client_absent', 1.5, false,
     jsonb_build_object('pt', E'{nome}, faz {dias} dias desde seu último corte com {barbeiro}. Bora deixar o visual em dia? Agende aqui: {link}',
                        'en', E'{nome}, it has been {dias} days since your last cut with {barbeiro}. Time for a fresh look? Book here: {link}',
                        'es', E'{nome}, ya son {dias} días desde tu último corte con {barbeiro}. ¿Renovamos el look? Reserva aquí: {link}')),
    (p_shop, E'Aniversário', 'birthday', 0, true,
     jsonb_build_object('pt', E'Feliz aniversário, {nome}! 🎉 A {barbearia} deseja um ótimo dia. Passa aqui para ficar no estilo: {link}',
                        'en', E'Happy birthday, {nome}! 🎉 Everyone at {barbearia} wishes you a great day. Come by for a fresh look: {link}',
                        'es', E'¡Feliz cumpleaños, {nome}! 🎉 {barbearia} te desea un gran día. Pasa a renovar tu estilo: {link}'));
end $$;

revoke all on function insert_default_message_templates(uuid) from public;

create or replace function shops_default_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform insert_default_message_templates(new.id);
  return new;
end $$;

drop trigger if exists shops_default_messages on shops;
create trigger shops_default_messages after insert on shops
  for each row execute function shops_default_messages();

-- barbearias já cadastradas
do $$
declare s uuid;
begin
  for s in select id from shops where not exists (select 1 from message_templates m where m.shop_id = shops.id) loop
    perform insert_default_message_templates(s);
  end loop;
end $$;

-- ===== 0006_clients_plans.sql =====
-- Telas de Clientes e Planos.

-- Observações internas da equipe sobre o cliente (separadas das preferências de corte).
alter table clients add column if not exists notes text;

-- Quais serviços cada plano cobre: o dono e o gerente editam pelo painel.
-- (A leitura pública do catálogo continua valendo pela política public_read da 0001.)
create policy owner_write on plan_services for all
  using (exists (select 1 from plans p where p.id = plan_id and is_member(p.shop_id, array['owner','manager']::member_role[])))
  with check (
    exists (select 1 from plans p where p.id = plan_id and is_member(p.shop_id, array['owner','manager']::member_role[]))
    and exists (select 1 from services s join plans p on p.shop_id = s.shop_id where s.id = service_id and p.id = plan_id)
  );

create index if not exists subscriptions_client_idx on subscriptions (client_id);
create index if not exists appointments_client_idx on appointments (client_id, starts_at);
create index if not exists payments_subscription_idx on payments (subscription_id);

-- ===== 0008_shopping.sql =====
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

-- ===== 0009_client_app.sql =====
-- App do cliente: pagar o plano, consentimento de foto (LGPD) e projeto de visual.
-- O cliente continua sem gravar direto nas tabelas: tudo passa por estas funções, que conferem quem é.

-- ---------- pagamento do plano ----------

-- O cliente pede para pagar (Pix ou cartão) o próprio plano. Cria a cobrança "pending".
-- Quem cria a cobrança no provedor (Asaas, Mercado Pago ou Stripe) é o servidor do app,
-- que depois grava provider/provider_ref com set_payment_provider_ref.
create or replace function start_plan_payment(p_subscription uuid, p_method payment_method)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions%rowtype;
  v_price numeric(10,2);
  v_id uuid;
begin
  if my_phone() is null then raise exception 'not_logged_in'; end if;
  if p_method not in ('pix', 'card') then raise exception 'invalid_method'; end if;
  select * into v_sub from subscriptions
  where id = p_subscription and client_id in (select my_client_ids()) and cancelled_at is null;
  if not found then raise exception 'subscription_not_found'; end if;
  select price into v_price from plans where id = v_sub.plan_id;

  -- dois toques seguidos não geram duas cobranças
  select id into v_id from payments
  where subscription_id = v_sub.id and status = 'pending' and method = p_method
    and created_at > now() - interval '1 hour'
  order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  insert into payments (shop_id, client_id, subscription_id, amount, method, status)
  values (v_sub.shop_id, v_sub.client_id, v_sub.id, v_price, p_method, 'pending')
  returning id into v_id;
  return v_id;
end $$;

-- Guarda o id da cobrança no provedor (chamada pelo servidor com a chave service_role).
create or replace function set_payment_provider_ref(p_payment uuid, p_provider text, p_provider_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon', 'authenticated') then raise exception 'forbidden'; end if;
  update payments set provider = p_provider, provider_ref = p_provider_ref where id = p_payment and status = 'pending';
end $$;

-- Pagamento confirmado pelo provedor (webhook): marca pago e o plano volta a valer sozinho.
-- Mesma regra de src/core/plans.ts (applyPayment): plano vencido recomeça no dia do pagamento,
-- plano em dia estende a partir do fim atual; os usos do ciclo zeram.
-- Pode ser chamada mais de uma vez (webhooks repetem): a segunda não faz nada.
-- Devolve o novo fim do ciclo.
create or replace function confirm_plan_payment(
  p_payment uuid, p_provider text default null, p_provider_ref text default null,
  p_amount numeric default null, p_paid_at timestamptz default now()
) returns date
language plpgsql security definer set search_path = public as $$
declare
  v_pay payments%rowtype;
  v_sub subscriptions%rowtype;
  v_days int;
  v_tz text;
  v_paid_day date;
  v_base date;
  v_end date;
begin
  -- só o servidor (service_role ou dono do banco); nunca o navegador do cliente
  if coalesce(auth.jwt() ->> 'role', '') in ('anon', 'authenticated') then raise exception 'forbidden'; end if;

  select * into v_pay from payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;
  if v_pay.status = 'paid' then
    return (select period_end from subscriptions where id = v_pay.subscription_id);
  end if;
  if v_pay.status <> 'pending' then raise exception 'payment_not_pending'; end if;
  if p_amount is not null and p_amount < v_pay.amount then raise exception 'amount_mismatch'; end if;
  if v_pay.subscription_id is null then raise exception 'not_a_plan_payment'; end if;

  select * into v_sub from subscriptions where id = v_pay.subscription_id for update;
  select period_days into v_days from plans where id = v_sub.plan_id;
  select timezone into v_tz from shops where id = v_pay.shop_id;
  v_paid_day := (p_paid_at at time zone v_tz)::date;
  v_base := case when v_sub.period_end < v_paid_day then v_paid_day else v_sub.period_end end;
  v_end := v_base + v_days;

  update payments
  set status = 'paid', paid_at = p_paid_at,
      provider = coalesce(p_provider, provider), provider_ref = coalesce(p_provider_ref, provider_ref)
  where id = v_pay.id;
  update subscriptions
  set period_start = case when v_sub.period_end < v_paid_day then v_paid_day else period_start end,
      period_end = v_end, uses_in_period = 0, cancelled_at = null
  where id = v_sub.id;
  return v_end;
end $$;

-- Pagamento recusado ou expirado no provedor.
create or replace function fail_plan_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon', 'authenticated') then raise exception 'forbidden'; end if;
  update payments set status = 'failed' where id = p_payment and status = 'pending';
end $$;

-- ---------- foto e LGPD ----------

-- O cliente autoriza (ou retira a autorização) o uso das fotos dele nesta barbearia.
create or replace function set_my_photo_consent(p_shop uuid, p_consent boolean)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if my_phone() is null then raise exception 'not_logged_in'; end if;
  update clients
  set photo_consent_at = case when p_consent then coalesce(photo_consent_at, now()) else null end
  where shop_id = p_shop and id in (select my_client_ids())
  returning photo_consent_at into v_at;
  if not found then raise exception 'client_not_found'; end if;
  return v_at;
end $$;

-- ---------- projeto de visual ----------

-- O cliente cria o próprio projeto a partir da sugestão de corte. O barbeiro acompanha e marca as etapas.
create or replace function create_my_style_project(
  p_shop uuid, p_goal text, p_steps jsonb, p_photo_path text default null, p_barber uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_client clients%rowtype;
  v_barber uuid;
  v_id uuid;
begin
  if my_phone() is null then raise exception 'not_logged_in'; end if;
  select * into v_client from clients where shop_id = p_shop and id in (select my_client_ids()) limit 1;
  if not found then raise exception 'client_not_found'; end if;
  if length(trim(coalesce(p_goal, ''))) not between 2 and 80 then raise exception 'invalid_goal'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) not between 1 and 12 then raise exception 'invalid_steps'; end if;
  if p_photo_path is not null then
    if v_client.photo_consent_at is null then raise exception 'no_photo_consent'; end if;
    -- a foto precisa estar na pasta do próprio cliente: <shop>/<client>/arquivo
    if p_photo_path not like p_shop::text || '/' || v_client.id::text || '/%' then raise exception 'invalid_photo'; end if;
  end if;
  select id into v_barber from barbers
  where shop_id = p_shop and active and id = coalesce(p_barber, v_client.preferred_barber_id);

  insert into style_projects (shop_id, client_id, barber_id, goal, steps, photo_paths)
  values (p_shop, v_client.id, v_barber, trim(p_goal), p_steps,
          case when p_photo_path is null then '{}'::text[] else array[p_photo_path] end)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- permissões ----------
-- O Supabase dá EXECUTE a anon/authenticated por padrão: as funções do servidor tiram isso explicitamente.
revoke all on function start_plan_payment(uuid, payment_method) from public, anon;
revoke all on function set_my_photo_consent(uuid, boolean) from public, anon;
revoke all on function create_my_style_project(uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function start_plan_payment(uuid, payment_method) to authenticated;
grant execute on function set_my_photo_consent(uuid, boolean) to authenticated;
grant execute on function create_my_style_project(uuid, text, jsonb, text, uuid) to authenticated;

revoke all on function confirm_plan_payment(uuid, text, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function set_payment_provider_ref(uuid, text, text) from public, anon, authenticated;
revoke all on function fail_plan_payment(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function confirm_plan_payment(uuid, text, text, numeric, timestamptz) to service_role;
    grant execute on function set_payment_provider_ref(uuid, text, text) to service_role;
    grant execute on function fail_plan_payment(uuid) to service_role;
  end if;
end $$;

-- ---------- fotos (Supabase Storage) ----------
-- Bucket privado "client-photos". Caminho: <shop_id>/<client_id>/<arquivo>.
-- O cliente só envia e lê na própria pasta, e só depois de autorizar o uso da foto; a equipe da barbearia lê.
-- Fica condicional porque o Postgres local de teste não tem o schema storage.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('client-photos', 'client-photos', false)
    on conflict (id) do nothing;

    execute 'drop policy if exists client_photos_own_insert on storage.objects';
    execute 'drop policy if exists client_photos_own_read on storage.objects';
    execute 'drop policy if exists client_photos_own_delete on storage.objects';
    execute 'drop policy if exists client_photos_staff_read on storage.objects';
    execute $p$
      create policy client_photos_own_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'client-photos' and exists (
        select 1 from public.clients c
        where c.id in (select public.my_client_ids()) and c.photo_consent_at is not null
          and c.shop_id::text = (storage.foldername(name))[1] and c.id::text = (storage.foldername(name))[2]))
    $p$;
    execute $p$
      create policy client_photos_own_read on storage.objects for select to authenticated
      using (bucket_id = 'client-photos' and (storage.foldername(name))[2] in (select id::text from public.my_client_ids()))
    $p$;
    execute $p$
      create policy client_photos_own_delete on storage.objects for delete to authenticated
      using (bucket_id = 'client-photos' and (storage.foldername(name))[2] in (select id::text from public.my_client_ids()))
    $p$;
    execute $p$
      create policy client_photos_staff_read on storage.objects for select to authenticated
      using (bucket_id = 'client-photos' and exists (
        select 1 from public.shops s where s.id::text = (storage.foldername(name))[1] and public.is_member(s.id)))
    $p$;
  end if;
end $$;

-- ===== 0010_plan_uses.sql =====
-- Mantém o contador de usos do plano certo sozinho: conta os atendimentos do ciclo
-- que usaram o plano (sem cancelados e faltas), seja pelo app, recepção ou encaixe.
create or replace function refresh_plan_uses(p_sub uuid)
returns void language sql security definer set search_path = public as $$
  update subscriptions s set uses_in_period = (
    select count(*) from appointments a
    where a.subscription_id = s.id
      and a.status not in ('cancelled', 'no_show')
      and a.starts_at::date between s.period_start and s.period_end
  ) where s.id = p_sub;
$$;

create or replace function appointments_plan_uses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.subscription_id is not null then
    perform refresh_plan_uses(new.subscription_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.subscription_id is not null
     and (tg_op = 'DELETE' or old.subscription_id is distinct from new.subscription_id) then
    perform refresh_plan_uses(old.subscription_id);
  end if;
  return null;
end $$;

create trigger appointments_plan_uses
after insert or update of status, subscription_id, starts_at or delete on appointments
for each row execute function appointments_plan_uses();

-- ao renovar o ciclo, recalcula também
create or replace function subscriptions_period_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_plan_uses(new.id);
  return null;
end $$;

create trigger subscriptions_period_changed
after update of period_start, period_end on subscriptions
for each row execute function subscriptions_period_changed();

notify pgrst, 'reload schema';

-- Conferência: tudo tem que dar o número indicado e "pode_criar" = true.
select
  (select count(*) from pg_tables where schemaname = 'public') as tabelas_23,
  (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e') as tipos_11,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
    'is_member','my_client_ids','busy_slots','my_phone','book_appointment','cancel_my_appointment','create_shop',
    'insert_default_message_templates','shops_default_messages','start_plan_payment','set_payment_provider_ref','confirm_plan_payment',
    'fail_plan_payment','set_my_photo_consent','create_my_style_project','refresh_plan_uses','appointments_plan_uses','subscriptions_period_changed')) as funcoes_18,
  has_function_privilege('authenticated', 'public.create_shop(text,text,text,text,text)', 'execute') as pode_criar;
