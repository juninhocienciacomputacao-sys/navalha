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
