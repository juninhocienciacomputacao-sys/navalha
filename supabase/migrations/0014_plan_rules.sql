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
