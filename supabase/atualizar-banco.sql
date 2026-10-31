-- Gerado por "npm run db:bundle". Atualiza um banco do Navalha que já está no ar, sem apagar dados.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.

-- ===== 0011_barber_photo.sql =====
-- Foto do barbeiro (enviada pelo dono em Equipe). Guardada pequena (256 px, JPEG) direto na linha,
-- para aparecer no painel, na TV e no app do cliente sem precisar de outro serviço.
alter table barbers add column if not exists photo text
  check (photo is null or (photo like 'data:image/%' and length(photo) <= 300000));

-- ===== 0012_team_access.sql =====
-- Níveis de acesso da equipe (dono, gerente, recepção, barbeiro), configuráveis pelo dono.
-- Pode rodar mais de uma vez: cola no SQL Editor do Supabase e clica em Run.

-- O que cada nível vê. Vazio = padrão de access_defaults(). O dono sempre vê tudo.
alter table shops add column if not exists role_access jsonb not null default '{}'::jsonb;

-- Telefone e nome de quem é da equipe (para o dono saber quem é quem na tela de acessos).
alter table shop_members add column if not exists phone_e164 text;
alter table shop_members add column if not exists display_name text;
alter table shop_members add column if not exists added_at timestamptz not null default now();

-- Convites: o dono cadastra o WhatsApp da pessoa e o nível. Quando ela entra com esse número, vira da equipe.
create table if not exists staff_invites (
  shop_id uuid not null references shops(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  role member_role not null,
  barber_id uuid references barbers(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (shop_id, phone_e164)
);
alter table staff_invites enable row level security;
drop policy if exists owner_manage on staff_invites;
create policy owner_manage on staff_invites for all
  using (is_member(shop_id, array['owner']::member_role[]))
  with check (is_member(shop_id, array['owner']::member_role[]));

-- Padrão de cada nível. Igual a DEFAULT_ACCESS em src/core/access.ts (um teste confere).
create or replace function access_defaults()
returns jsonb language sql immutable as $$
  select '{"manager":{"sections":["painel","clientes","planos","financeiro","comissoes","equipe","servicos","mensagens","shopping","recursos"],"agenda":"all"},"reception":{"sections":["clientes","planos"],"agenda":"all"},"barber":{"sections":[],"agenda":"own_free"}}'::jsonb;
$$;

-- Acesso de quem está logado nesta barbearia: {"role", "agenda", "sections"}. Null se não for da equipe.
create or replace function my_access(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when m.role = 'owner'
    then '{"role":"owner","agenda":"all","sections":["painel","clientes","planos","financeiro","comissoes","equipe","servicos","mensagens","shopping","recursos"]}'::jsonb
    else (access_defaults() -> m.role::text) || coalesce(s.role_access -> m.role::text, '{}'::jsonb) || jsonb_build_object('role', m.role)
  end
  from shop_members m join shops s on s.id = m.shop_id
  where m.shop_id = target and m.user_id = auth.uid();
$$;

-- Só o dono muda os acessos (o gerente pode mexer nos Recursos, mas não nos níveis).
create or replace function shops_guard_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role_access is distinct from old.role_access and auth.uid() is not null
     and not is_member(old.id, array['owner']::member_role[]) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;
drop trigger if exists shops_guard_access on shops;
create trigger shops_guard_access before update on shops
  for each row execute function shops_guard_access();

-- Pode abrir/alterar uma tela do painel?
create or replace function can_section(target uuid, section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (a -> 'sections') ? section from (select my_access(target) as a) x where a is not null), false);
$$;

-- Pode ver e mexer nos atendimentos deste barbeiro? (agenda de todos, ou o barbeiro é a própria pessoa)
create or replace function sees_barber(target uuid, p_barber uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select a ->> 'agenda' = 'all'
        or exists (select 1 from barbers b where b.id = p_barber and b.shop_id = target and b.user_id = auth.uid())
    from (select my_access(target) as a) x where a is not null
  ), false);
$$;

-- Guarda o telefone de quem entra na equipe (inclusive o dono, ao criar a barbearia).
create or replace function shop_members_fill_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_e164 is null and new.user_id = auth.uid() then new.phone_e164 := my_phone(); end if;
  return new;
end $$;
drop trigger if exists shop_members_fill_phone on shop_members;
create trigger shop_members_fill_phone before insert on shop_members
  for each row execute function shop_members_fill_phone();

-- equipe já cadastrada: copia o telefone do login
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'phone') then
    update shop_members m set phone_e164 = '+' || ltrim(u.phone, '+')
    from auth.users u where u.id = m.user_id and m.phone_e164 is null and coalesce(u.phone, '') <> '';
  end if;
end $$;

-- Chamado depois do login: aceita os convites feitos para o WhatsApp de quem entrou.
create or replace function claim_staff_invites()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_phone text := my_phone();
  v_n int := 0;
  r record;
begin
  if v_phone is null or auth.uid() is null then return 0; end if;
  for r in select * from staff_invites where phone_e164 = v_phone loop
    insert into shop_members (shop_id, user_id, role, phone_e164, display_name)
    values (r.shop_id, auth.uid(), r.role, v_phone, r.display_name)
    on conflict (shop_id, user_id) do update
      set role = case when shop_members.role = 'owner' then 'owner'::member_role else excluded.role end,
          phone_e164 = excluded.phone_e164,
          display_name = coalesce(excluded.display_name, shop_members.display_name);
    if r.barber_id is not null then
      update barbers set user_id = null where shop_id = r.shop_id and user_id = auth.uid() and id <> r.barber_id;
      update barbers set user_id = auth.uid() where id = r.barber_id and shop_id = r.shop_id;
    end if;
    delete from staff_invites where shop_id = r.shop_id and phone_e164 = v_phone;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- O dono muda o nível de alguém da equipe e liga (ou desliga) o perfil de barbeiro dessa pessoa.
create or replace function set_member_access(p_shop uuid, p_user uuid, p_role member_role, p_barber uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_shop, array['owner']::member_role[]) then raise exception 'forbidden'; end if;
  perform 1 from shop_members where shop_id = p_shop and user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if p_role <> 'owner' and not exists (
    select 1 from shop_members where shop_id = p_shop and role = 'owner' and user_id <> p_user
  ) then raise exception 'last_owner'; end if;
  if p_barber is not null then
    perform 1 from barbers where id = p_barber and shop_id = p_shop;
    if not found then raise exception 'barber_not_found'; end if;
  end if;
  update shop_members set role = p_role where shop_id = p_shop and user_id = p_user;
  update barbers set user_id = null where shop_id = p_shop and user_id = p_user and id is distinct from p_barber;
  if p_barber is not null then update barbers set user_id = p_user where id = p_barber; end if;
end $$;

-- O dono tira alguém da equipe (nunca o último dono).
create or replace function remove_member(p_shop uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_shop, array['owner']::member_role[]) then raise exception 'forbidden'; end if;
  if not exists (select 1 from shop_members where shop_id = p_shop and role = 'owner' and user_id <> p_user) then
    raise exception 'last_owner';
  end if;
  update barbers set user_id = null where shop_id = p_shop and user_id = p_user;
  delete from shop_members where shop_id = p_shop and user_id = p_user;
end $$;

revoke all on function claim_staff_invites() from public;
revoke all on function set_member_access(uuid, uuid, member_role, uuid) from public;
revoke all on function remove_member(uuid, uuid) from public;
grant execute on function claim_staff_invites() to authenticated;
grant execute on function set_member_access(uuid, uuid, member_role, uuid) to authenticated;
grant execute on function remove_member(uuid, uuid) to authenticated;
grant execute on function my_access(uuid) to authenticated;
grant execute on function can_section(uuid, text) to authenticated;
grant execute on function sees_barber(uuid, uuid) to authenticated;

-- ---------- regras do banco por nível ----------

-- Agenda: cada um vê e mexe só no que o nível permite.
drop policy if exists staff_all on appointments;
drop policy if exists staff_agenda on appointments;
create policy staff_agenda on appointments for all
  using (sees_barber(shop_id, barber_id)) with check (sees_barber(shop_id, barber_id));

-- Cadastros que todo mundo da equipe lê, mas só quem tem a tela liberada altera.
do $$
declare
  t text; s text;
begin
  for t, s in select * from (values ('barbers', 'equipe'), ('services', 'servicos'), ('plans', 'planos'),
                                    ('subscriptions', 'planos'), ('message_templates', 'mensagens')) v(t, s)
  loop
    execute format('drop policy if exists staff_all on %I', t);
    execute format('drop policy if exists staff_read on %I', t);
    execute format('drop policy if exists section_insert on %I', t);
    execute format('drop policy if exists section_update on %I', t);
    execute format('drop policy if exists section_delete on %I', t);
    execute format('create policy staff_read on %I for select using (is_member(shop_id))', t);
    execute format('create policy section_insert on %I for insert with check (can_section(shop_id, %L))', t, s);
    execute format('create policy section_update on %I for update using (can_section(shop_id, %L)) with check (can_section(shop_id, %L))', t, s, s);
    execute format('create policy section_delete on %I for delete using (can_section(shop_id, %L))', t, s);
  end loop;
end $$;

-- Telas que antes eram só do dono e do gerente passam a seguir a escolha do dono.
drop policy if exists owner_write on shops;
create policy owner_write on shops for update using (can_section(id, 'recursos'));

drop policy if exists owner_only on commission_rules;
create policy owner_only on commission_rules for all
  using (can_section(shop_id, 'comissoes')) with check (can_section(shop_id, 'comissoes'));

drop policy if exists owner_write on shop_features;
create policy owner_write on shop_features for all
  using (can_section(shop_id, 'recursos')) with check (can_section(shop_id, 'recursos'));

drop policy if exists owner_write on walk_in_policy;
create policy owner_write on walk_in_policy for all
  using (can_section(shop_id, 'recursos')) with check (can_section(shop_id, 'recursos'));

drop policy if exists owner_manager on expenses;
create policy owner_manager on expenses for all
  using (can_section(shop_id, 'financeiro')) with check (can_section(shop_id, 'financeiro'));

drop policy if exists owner_manager on commission_payouts;
create policy owner_manager on commission_payouts for all
  using (can_section(shop_id, 'comissoes') or can_section(shop_id, 'financeiro'))
  with check (can_section(shop_id, 'comissoes'));

drop policy if exists owner_write on plan_services;
create policy owner_write on plan_services for all
  using (exists (select 1 from plans p where p.id = plan_id and (can_section(p.shop_id, 'planos') or can_section(p.shop_id, 'servicos'))))
  with check (
    exists (select 1 from plans p where p.id = plan_id and (can_section(p.shop_id, 'planos') or can_section(p.shop_id, 'servicos')))
    and exists (select 1 from services s join plans p on p.shop_id = s.shop_id where s.id = service_id and p.id = plan_id)
  );

drop policy if exists owner_insert on shop_partner_settings;
drop policy if exists owner_update on shop_partner_settings;
drop policy if exists owner_delete on shop_partner_settings;
create policy owner_insert on shop_partner_settings for insert with check (can_section(shop_id, 'shopping'));
create policy owner_update on shop_partner_settings for update
  using (can_section(shop_id, 'shopping')) with check (can_section(shop_id, 'shopping'));
create policy owner_delete on shop_partner_settings for delete using (can_section(shop_id, 'shopping'));

notify pgrst, 'reload schema';

-- ===== 0013_modules_and_audit.sql =====
-- Módulos por barbearia (pacote "Só agendamento" ou "Completo") e correções da auditoria.
-- Pode rodar mais de uma vez.

-- ---------- módulos ----------
-- { "financeiro": false, ... }; chave ausente = ligado (ver src/core/modules.ts).
-- Fica em shops, que o app do cliente já pode ler, para esconder as abas desligadas.
alter table shops add column if not exists modules jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shops_modules_object') then
    alter table shops add constraint shops_modules_object check (jsonb_typeof(modules) = 'object');
  end if;
end $$;

-- O app do cliente precisa saber se "sugerir o próximo horário" está ligado (só esse liga/desliga, sem as outras configurações).
drop policy if exists public_client_flags on shop_features;
create policy public_client_flags on shop_features for select using (key in ('rebook'));

-- ---------- funções internas não podem ser chamadas pelo app ----------
-- No Supabase, "revoke ... from public" não basta: anon e authenticated recebem permissão direta.
-- Sem isto, qualquer pessoa podia encher outra barbearia de modelos de mensagem repetidos.
revoke all on function insert_default_message_templates(uuid) from public, anon, authenticated;
revoke all on function refresh_plan_uses(uuid) from public, anon, authenticated;
revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function cancel_my_appointment(uuid) from public, anon;
revoke all on function create_shop(text, text, text, text, text) from public, anon;

-- ---------- agendamento pelo app: regras que faltavam ----------
-- 1) só dentro do horário de funcionamento do dia (antes dava para marcar às 3 da manhã chamando a função direto);
-- 2) o plano vale pela data do horário (não pela data de hoje) e respeita a cota de usos;
-- 3) com o módulo Planos desligado, o horário é cobrado normalmente.
create or replace function book_appointment(
  p_shop uuid, p_barber uuid, p_service uuid, p_starts timestamptz,
  p_name text default null, p_lang text default 'pt'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := my_phone();
  v_shop shops%rowtype;
  v_client uuid;
  v_service services%rowtype;
  v_sub uuid;
  v_id uuid;
  v_local timestamp;
  v_hours jsonb;
  v_start int;
  v_end int;
begin
  if v_phone is null then raise exception 'not_logged_in'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;

  select * into v_shop from shops where id = p_shop;
  if not found then raise exception 'shop_not_found'; end if;
  select * into v_service from services where id = p_service and shop_id = p_shop and active;
  if not found then raise exception 'service_not_found'; end if;
  perform 1 from barbers where id = p_barber and shop_id = p_shop and active;
  if not found then raise exception 'barber_not_found'; end if;

  v_local := p_starts at time zone v_shop.timezone;
  v_hours := v_shop.opening_hours -> (extract(dow from v_local)::int)::text;
  v_start := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_end := v_start + v_service.duration_min;
  if v_hours is null
     or v_start < split_part(v_hours ->> 'open', ':', 1)::int * 60 + split_part(v_hours ->> 'open', ':', 2)::int
     or v_end > split_part(v_hours ->> 'close', ':', 1)::int * 60 + split_part(v_hours ->> 'close', ':', 2)::int then
    raise exception 'slot_taken';
  end if;

  insert into clients (shop_id, phone_e164, name, lang)
  values (p_shop, v_phone, coalesce(nullif(trim(p_name), ''), 'Cliente'), coalesce(p_lang, 'pt'))
  on conflict (shop_id, phone_e164) do update
    set name = coalesce(nullif(trim(excluded.name), ''), clients.name)
  returning id into v_client;

  -- plano ativo no dia do horário, que cobre o serviço e ainda tem uso (o preço fica 0 e a visita entra no rateio da comissão)
  if coalesce(v_shop.modules ->> 'planos', 'true') <> 'false' then
    select s.id into v_sub
    from subscriptions s
    join plan_services ps on ps.plan_id = s.plan_id and ps.service_id = p_service
    join plans pl on pl.id = s.plan_id
    where s.client_id = v_client and s.cancelled_at is null
      and v_local::date between s.period_start and s.period_end
      and (pl.quota_uses is null or s.uses_in_period < pl.quota_uses)
    limit 1;
  end if;

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

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

-- ---------- desempenho ----------
-- telas de clientes e planos buscam por barbearia e por cliente
create index if not exists appointments_client_idx on appointments (client_id, starts_at);
create index if not exists subscriptions_client_idx on subscriptions (client_id);
create index if not exists clients_shop_idx on clients (shop_id, name);
create index if not exists plans_shop_idx on plans (shop_id);

-- ===== 0014_plan_rules.sql =====
-- Planos exclusivos com regras de uso e limite de agendamentos por cliente.
-- Pode rodar mais de uma vez.

-- ---------- regras de uso do plano (o dono escolhe no painel) ----------
alter table plans add column if not exists min_days_between int;            -- dias mínimos entre dois usos (null = sem intervalo)
alter table plans add column if not exists weekdays int[];                  -- dias da semana em que vale, 0 = domingo (null = todos)
alter table plans add column if not exists hours_start int;                 -- faixa de horário em minutos do dia (null = qualquer)
alter table plans add column if not exists hours_end int;
alter table plans add column if not exists barber_ids uuid[];               -- só estes barbeiros atendem pelo plano (null = todos)
alter table plans add column if not exists on_limit text not null default 'charge'; -- regra não cumprida: 'charge' cobra avulso, 'block' não deixa marcar
alter table plans add column if not exists exclusive boolean not null default false; -- não aparece no app, só a equipe vende
alter table plans add column if not exists max_subscribers int;             -- vagas (null = sem limite)
alter table plans add column if not exists tagline text;                    -- frase curta para o cliente

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_rules_valid') then
    alter table plans add constraint plans_rules_valid check (
      (min_days_between is null or min_days_between between 1 and 365)
      and (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]))
      and ((hours_start is null and hours_end is null) or (hours_start between 0 and 1439 and hours_end between 1 and 1440 and hours_end > hours_start))
      and (barber_ids is null or cardinality(barber_ids) >= 1)
      and on_limit in ('charge', 'block')
      and (max_subscribers is null or max_subscribers >= 1)
      and (tagline is null or length(tagline) <= 120)
    );
  end if;
end $$;

-- ---------- o app do cliente lê o limite de agendamentos (para avisar antes de tentar) ----------
drop policy if exists public_client_flags on shop_features;
create policy public_client_flags on shop_features for select using (key in ('rebook', 'booking_limit'));

-- ---------- agendamento pelo app ----------
-- Além do que a 0013 já conferia:
-- 1) limite de agendamentos do cliente (Recursos → "Um horário por vez"): nunca dois ao mesmo tempo,
--    no máximo N horários em aberto e, se o dono quiser, um por dia. Ligado por padrão (1 horário).
-- 2) regras do plano: cota, intervalo mínimo entre usos, dias da semana, faixa de horário e barbeiros.
--    Regra não cumprida: cobra avulso, ou recusa o horário se o dono escolheu "não deixar marcar".
create or replace function book_appointment(
  p_shop uuid, p_barber uuid, p_service uuid, p_starts timestamptz,
  p_name text default null, p_lang text default 'pt'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := my_phone();
  v_shop shops%rowtype;
  v_client uuid;
  v_service services%rowtype;
  v_ends timestamptz;
  v_sub uuid;
  v_plan plans%rowtype;
  v_uses int;
  v_reason text;
  v_id uuid;
  v_local timestamp;
  v_hours jsonb;
  v_start int;
  v_end int;
  v_lim record;
  v_max int;
  v_one_day boolean;
begin
  if v_phone is null then raise exception 'not_logged_in'; end if;
  if p_starts < now() then raise exception 'slot_in_past'; end if;

  select * into v_shop from shops where id = p_shop;
  if not found then raise exception 'shop_not_found'; end if;
  select * into v_service from services where id = p_service and shop_id = p_shop and active;
  if not found then raise exception 'service_not_found'; end if;
  perform 1 from barbers where id = p_barber and shop_id = p_shop and active;
  if not found then raise exception 'barber_not_found'; end if;

  v_ends := p_starts + make_interval(mins => v_service.duration_min);
  v_local := p_starts at time zone v_shop.timezone;
  v_hours := v_shop.opening_hours -> (extract(dow from v_local)::int)::text;
  v_start := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_end := v_start + v_service.duration_min;
  if v_hours is null
     or v_start < split_part(v_hours ->> 'open', ':', 1)::int * 60 + split_part(v_hours ->> 'open', ':', 2)::int
     or v_end > split_part(v_hours ->> 'close', ':', 1)::int * 60 + split_part(v_hours ->> 'close', ':', 2)::int then
    raise exception 'slot_taken';
  end if;

  insert into clients (shop_id, phone_e164, name, lang)
  values (p_shop, v_phone, coalesce(nullif(trim(p_name), ''), 'Cliente'), coalesce(p_lang, 'pt'))
  on conflict (shop_id, phone_e164) do update
    set name = coalesce(nullif(trim(excluded.name), ''), clients.name)
  returning id into v_client;

  -- um pedido de cada vez por cliente: dois toques ao mesmo tempo não furam o limite
  perform pg_advisory_xact_lock(hashtext('navalha-client-' || v_client::text));

  -- plano ativo no dia do horário que cobre o serviço (o preço fica 0 e a visita entra no rateio da comissão)
  if coalesce(v_shop.modules ->> 'planos', 'true') <> 'false' then
    select s.id, s.uses_in_period into v_sub, v_uses
    from subscriptions s
    join plan_services ps on ps.plan_id = s.plan_id and ps.service_id = p_service
    where s.client_id = v_client and s.cancelled_at is null
      and v_local::date between s.period_start and s.period_end
    order by s.period_end desc
    limit 1;
    if v_sub is not null then
      select pl.* into v_plan from plans pl join subscriptions s on s.plan_id = pl.id where s.id = v_sub;
      v_reason := case
        when v_plan.quota_uses is not null and v_uses >= v_plan.quota_uses then 'quota_used'
        when v_plan.weekdays is not null and not (extract(dow from v_local)::int = any (v_plan.weekdays)) then 'weekday'
        when v_plan.hours_start is not null and (v_start < v_plan.hours_start or v_start >= v_plan.hours_end) then 'hours'
        when v_plan.barber_ids is not null and not (p_barber = any (v_plan.barber_ids)) then 'barber'
        when v_plan.min_days_between is not null and exists (
          select 1 from appointments a
          where a.subscription_id = v_sub and a.status not in ('cancelled', 'no_show')
            and abs((a.starts_at at time zone v_shop.timezone)::date - v_local::date) < v_plan.min_days_between
        ) then 'too_soon'
      end;
      if v_reason is not null then
        if v_plan.on_limit = 'block' then raise exception 'plan_rule_%', v_reason; end if;
        v_sub := null;
      end if;
    end if;
  end if;

  begin
    insert into appointments (shop_id, barber_id, client_id, service_id, starts_at, ends_at, source, subscription_id, price)
    values (p_shop, p_barber, v_client, p_service, p_starts, v_ends, 'app', v_sub,
            case when v_sub is null then v_service.price else 0 end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  -- limite de agendamentos (depois do insert: horário ocupado continua respondendo slot_taken; o erro desfaz o insert)
  select enabled, config into v_lim from shop_features where shop_id = p_shop and key = 'booking_limit';
  if coalesce(v_lim.enabled, true) then
    v_max := greatest(1, coalesce((v_lim.config ->> 'maxUpcoming')::int, 1));
    v_one_day := coalesce((v_lim.config ->> 'onePerDay')::boolean, true);
    if exists (select 1 from appointments a where a.client_id = v_client and a.id <> v_id
               and a.status in ('pending', 'confirmed') and a.starts_at < v_ends and a.ends_at > p_starts) then
      raise exception 'booking_limit_overlap';
    end if;
    if v_one_day and exists (select 1 from appointments a where a.client_id = v_client and a.id <> v_id
               and a.status in ('pending', 'confirmed') and (a.starts_at at time zone v_shop.timezone)::date = v_local::date) then
      raise exception 'booking_limit_same_day';
    end if;
    if (select count(*) from appointments a where a.client_id = v_client and a.id <> v_id
        and a.status in ('pending', 'confirmed') and a.starts_at > now()) >= v_max then
      raise exception 'booking_limit_max_upcoming';
    end if;
  end if;
  return v_id;
end $$;

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

-- ===== 0015_privacy.sql =====
-- Privacidade (LGPD no Brasil, GDPR na Europa) e correções da auditoria de segurança de 2026-10-31.
-- Pode rodar mais de uma vez.

-- ---------- 1) Equipe na vitrine ----------
-- O app de agendamento e a TV só precisam de nome, cargo, cor e foto de cada barbeiro.
-- Antes, qualquer pessoa com a chave pública conseguia ler também a comissão, o aluguel de cadeira
-- e a meta de cada barbeiro direto na tabela. Agora a tabela é só da equipe e a vitrine vem desta função.
drop policy if exists public_team on barbers;

create or replace function public_team(p_shop uuid)
returns table (id uuid, display_name text, role_title text, color text, photo text, sort int)
language sql stable security definer set search_path = public as $$
  select b.id, b.display_name, b.role_title, b.color, b.photo, b.sort
  from barbers b where b.shop_id = p_shop and b.active
  order by b.sort, b.display_name
$$;
revoke all on function public_team(uuid) from public;
grant execute on function public_team(uuid) to anon, authenticated;

-- ---------- 2) Direitos do titular: ver e apagar os próprios dados ----------

-- Apaga o cadastro de um cliente numa barbearia.
-- Horários futuros são cancelados (o barbeiro fica livre). Atendimentos passados e pagamentos continuam,
-- sem nome e sem observações, porque a barbearia precisa deles na contabilidade (obrigação legal).
-- Plano, passaporte de estilo e projetos de visual são apagados junto.
-- Devolve os caminhos das fotos, que o app apaga do armazenamento.
create or replace function erase_client(p_client uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_photos text[];
begin
  select coalesce(array_agg(p), '{}') into v_photos
    from style_projects sp, unnest(sp.photo_paths) p where sp.client_id = p_client;
  update appointments set status = 'cancelled'
    where client_id = p_client and starts_at > now() and status in ('pending', 'confirmed');
  update appointments set notes = null where client_id = p_client;
  update walk_in_queue set name = 'Cliente removido' where client_id = p_client;
  delete from clients where id = p_client;
  return v_photos;
end $$;
revoke all on function erase_client(uuid) from public, anon, authenticated;

-- O cliente (logado pelo WhatsApp) baixa tudo o que a barbearia guarda sobre ele.
create or replace function export_my_data(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_client uuid;
begin
  select id into v_client from clients where shop_id = p_shop and phone_e164 = my_phone();
  if v_client is null then return null; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'shop', (select jsonb_build_object('name', s.name, 'address', s.address) from shops s where s.id = p_shop),
    'client', (select to_jsonb(c) - 'shop_id' - 'id' - 'referred_by' - 'preferred_barber_id' from clients c where c.id = v_client),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object('starts_at', a.starts_at, 'status', a.status, 'price', a.price,
        'service', sv.name, 'barber', b.display_name, 'via_plan', a.subscription_id is not null) order by a.starts_at)
      from appointments a left join services sv on sv.id = a.service_id left join barbers b on b.id = a.barber_id
      where a.client_id = v_client), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object('plan', p.name, 'period_start', x.period_start, 'period_end', x.period_end,
        'uses_in_period', x.uses_in_period, 'cancelled_at', x.cancelled_at) order by x.created_at)
      from subscriptions x join plans p on p.id = x.plan_id where x.client_id = v_client), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('amount', y.amount, 'method', y.method, 'status', y.status, 'paid_at', y.paid_at,
        'created_at', y.created_at) order by y.created_at)
      from payments y where y.client_id = v_client), '[]'::jsonb),
    'style_passport', (select sp.data from style_passports sp where sp.client_id = v_client),
    'style_projects', coalesce((
      select jsonb_agg(jsonb_build_object('goal', sp.goal, 'steps', sp.steps, 'photos', cardinality(sp.photo_paths),
        'created_at', sp.created_at) order by sp.created_at)
      from style_projects sp where sp.client_id = v_client), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('channel', m.channel, 'status', m.status, 'send_at', m.send_at, 'sent_at', m.sent_at)
        order by m.send_at)
      from message_log m where m.client_id = v_client), '[]'::jsonb)
  );
end $$;

-- O cliente apaga o próprio cadastro nesta barbearia.
create or replace function delete_my_data(p_shop uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select id into v_client from clients where shop_id = p_shop and phone_e164 = my_phone();
  if v_client is null then return null; end if;
  return erase_client(v_client);
end $$;

-- O dono apaga o cadastro de um cliente que pediu (por WhatsApp, no balcão...). Só o dono.
create or replace function forget_client(p_shop uuid, p_client uuid)
returns text[] language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_shop, array['owner']::member_role[]) then raise exception 'forbidden'; end if;
  if not exists (select 1 from clients where id = p_client and shop_id = p_shop) then raise exception 'not_found'; end if;
  return erase_client(p_client);
end $$;

revoke all on function export_my_data(uuid) from public, anon;
revoke all on function delete_my_data(uuid) from public, anon;
revoke all on function forget_client(uuid, uuid) from public, anon;
grant execute on function export_my_data(uuid) to authenticated;
grant execute on function delete_my_data(uuid) to authenticated;
grant execute on function forget_client(uuid, uuid) to authenticated;

-- O dono apaga as fotos de um cliente que pediu para ser esquecido (o cliente já apaga as próprias).
-- Condicional porque o Postgres local de teste não tem o schema storage.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists client_photos_owner_delete on storage.objects';
    execute $p$
      create policy client_photos_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'client-photos' and exists (
        select 1 from public.shops s where s.id::text = (storage.foldername(name))[1]
          and public.is_member(s.id, array['owner']::public.member_role[])))
    $p$;
  end if;
end $$;

-- Avisa a API do Supabase que as tabelas e funções mudaram.
notify pgrst, 'reload schema';
