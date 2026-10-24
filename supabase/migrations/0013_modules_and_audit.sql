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
