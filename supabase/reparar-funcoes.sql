-- Gerado por "npm run db:repair". Recria funções, permissões e gatilhos do Navalha.
-- Não apaga dados (só cria colunas novas que faltarem). Pode rodar mais de uma vez.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

alter table clients add column if not exists notes text;

alter table barbers add column if not exists photo text
  check (photo is null or (photo like 'data:image/%' and length(photo) <= 300000));

alter table shops add column if not exists role_access jsonb not null default '{}'::jsonb;

alter table shop_members add column if not exists phone_e164 text;

alter table shop_members add column if not exists display_name text;

alter table shop_members add column if not exists added_at timestamptz not null default now();

alter table shops add column if not exists modules jsonb not null default '{}'::jsonb;

alter table plans add column if not exists min_days_between int;

alter table plans add column if not exists weekdays int[];

alter table plans add column if not exists hours_start int;

alter table plans add column if not exists hours_end int;

alter table plans add column if not exists barber_ids uuid[];

alter table plans add column if not exists on_limit text not null default 'charge';

alter table plans add column if not exists exclusive boolean not null default false;

alter table plans add column if not exists max_subscribers int;

alter table plans add column if not exists tagline text;

create or replace function is_member(target uuid, roles member_role[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shop_members
    where shop_id = target and user_id = auth.uid()
      and (roles is null or role = any(roles))
  );
$$;

create or replace function my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from clients where phone_e164 = '+' || ltrim(coalesce(auth.jwt() ->> 'phone', ''), '+');
$$;

create or replace function busy_slots(p_shop uuid, p_from timestamptz, p_to timestamptz)
returns table (barber_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.barber_id, a.starts_at, a.ends_at
  from appointments a
  where a.shop_id = p_shop
    and a.status not in ('cancelled', 'no_show')
    and a.starts_at < p_to and a.ends_at > p_from;
$$;

create or replace function my_phone()
returns text language sql stable as $$
  select nullif('+' || ltrim(coalesce(auth.jwt() ->> 'phone', ''), '+'), '+');
$$;

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

create or replace function cancel_my_appointment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update appointments set status = 'cancelled'
  where id = p_id and client_id in (select my_client_ids()) and starts_at > now()
    and status in ('pending', 'confirmed');
  if not found then raise exception 'cannot_cancel'; end if;
end $$;

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

create or replace function shops_default_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform insert_default_message_templates(new.id);
  return new;
end $$;

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

create or replace function set_payment_provider_ref(p_payment uuid, p_provider text, p_provider_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon', 'authenticated') then raise exception 'forbidden'; end if;
  update payments set provider = p_provider, provider_ref = p_provider_ref where id = p_payment and status = 'pending';
end $$;

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

create or replace function fail_plan_payment(p_payment uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') in ('anon', 'authenticated') then raise exception 'forbidden'; end if;
  update payments set status = 'failed' where id = p_payment and status = 'pending';
end $$;

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

create or replace function subscriptions_period_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_plan_uses(new.id);
  return null;
end $$;

create or replace function access_defaults()
returns jsonb language sql immutable as $$
  select '{"manager":{"sections":["painel","clientes","planos","financeiro","comissoes","equipe","servicos","mensagens","shopping","recursos"],"agenda":"all"},"reception":{"sections":["clientes","planos"],"agenda":"all"},"barber":{"sections":[],"agenda":"own_free"}}'::jsonb;
$$;

create or replace function my_access(target uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when m.role = 'owner'
    then '{"role":"owner","agenda":"all","sections":["painel","clientes","planos","financeiro","comissoes","equipe","servicos","mensagens","shopping","recursos"]}'::jsonb
    else (access_defaults() -> m.role::text) || coalesce(s.role_access -> m.role::text, '{}'::jsonb) || jsonb_build_object('role', m.role)
  end
  from shop_members m join shops s on s.id = m.shop_id
  where m.shop_id = target and m.user_id = auth.uid();
$$;

create or replace function shops_guard_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role_access is distinct from old.role_access and auth.uid() is not null
     and not is_member(old.id, array['owner']::member_role[]) then
    raise exception 'forbidden';
  end if;
  return new;
end $$;

create or replace function can_section(target uuid, section text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (a -> 'sections') ? section from (select my_access(target) as a) x where a is not null), false);
$$;

create or replace function sees_barber(target uuid, p_barber uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select a ->> 'agenda' = 'all'
        or exists (select 1 from barbers b where b.id = p_barber and b.shop_id = target and b.user_id = auth.uid())
    from (select my_access(target) as a) x where a is not null
  ), false);
$$;

create or replace function shop_members_fill_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_e164 is null and new.user_id = auth.uid() then new.phone_e164 := my_phone(); end if;
  return new;
end $$;

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

create or replace function public_team(p_shop uuid)
returns table (id uuid, display_name text, role_title text, color text, photo text, sort int)
language sql stable security definer set search_path = public as $$
  select b.id, b.display_name, b.role_title, b.color, b.photo, b.sort
  from barbers b where b.shop_id = p_shop and b.active
  order by b.sort, b.display_name
$$;

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

create or replace function delete_my_data(p_shop uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_client uuid;
begin
  select id into v_client from clients where shop_id = p_shop and phone_e164 = my_phone();
  if v_client is null then return null; end if;
  return erase_client(v_client);
end $$;

create or replace function forget_client(p_shop uuid, p_client uuid)
returns text[] language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_shop, array['owner']::member_role[]) then raise exception 'forbidden'; end if;
  if not exists (select 1 from clients where id = p_client and shop_id = p_shop) then raise exception 'not_found'; end if;
  return erase_client(p_client);
end $$;

drop policy if exists owner_manage on staff_invites;

drop policy if exists staff_all on appointments;

drop policy if exists staff_agenda on appointments;

drop policy if exists owner_write on shops;

drop policy if exists owner_only on commission_rules;

drop policy if exists owner_write on shop_features;

drop policy if exists owner_write on walk_in_policy;

drop policy if exists owner_manager on expenses;

drop policy if exists owner_manager on commission_payouts;

drop policy if exists owner_write on plan_services;

drop policy if exists owner_insert on shop_partner_settings;

drop policy if exists owner_update on shop_partner_settings;

drop policy if exists owner_delete on shop_partner_settings;

drop policy if exists public_client_flags on shop_features;

drop policy if exists public_client_flags on shop_features;

drop policy if exists public_team on barbers;

drop policy if exists owner_write on shops;
create policy owner_write on shops for update using (can_section(id, 'recursos'));

drop policy if exists public_client_flags on shop_features;
create policy public_client_flags on shop_features for select using (key in ('rebook'));

drop policy if exists public_client_flags on shop_features;
create policy public_client_flags on shop_features for select using (key in ('rebook', 'booking_limit'));

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public;

revoke all on function cancel_my_appointment(uuid) from public;

grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

grant execute on function cancel_my_appointment(uuid) to authenticated;

grant execute on function busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;

revoke all on function create_shop(text, text, text, text, text) from public;

grant execute on function create_shop(text, text, text, text, text) to authenticated;

revoke all on function insert_default_message_templates(uuid) from public;

revoke all on function start_plan_payment(uuid, payment_method) from public, anon;

revoke all on function set_my_photo_consent(uuid, boolean) from public, anon;

revoke all on function create_my_style_project(uuid, text, jsonb, text, uuid) from public, anon;

grant execute on function start_plan_payment(uuid, payment_method) to authenticated;

grant execute on function set_my_photo_consent(uuid, boolean) to authenticated;

grant execute on function create_my_style_project(uuid, text, jsonb, text, uuid) to authenticated;

revoke all on function confirm_plan_payment(uuid, text, text, numeric, timestamptz) from public, anon, authenticated;

revoke all on function set_payment_provider_ref(uuid, text, text) from public, anon, authenticated;

revoke all on function fail_plan_payment(uuid) from public, anon, authenticated;

revoke all on function claim_staff_invites() from public;

revoke all on function set_member_access(uuid, uuid, member_role, uuid) from public;

revoke all on function remove_member(uuid, uuid) from public;

grant execute on function claim_staff_invites() to authenticated;

grant execute on function set_member_access(uuid, uuid, member_role, uuid) to authenticated;

grant execute on function remove_member(uuid, uuid) to authenticated;

grant execute on function my_access(uuid) to authenticated;

grant execute on function can_section(uuid, text) to authenticated;

grant execute on function sees_barber(uuid, uuid) to authenticated;

revoke all on function insert_default_message_templates(uuid) from public, anon, authenticated;

revoke all on function refresh_plan_uses(uuid) from public, anon, authenticated;

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;

revoke all on function cancel_my_appointment(uuid) from public, anon;

revoke all on function create_shop(text, text, text, text, text) from public, anon;

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;

grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) from public, anon;

grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text) to authenticated;

revoke all on function public_team(uuid) from public;

grant execute on function public_team(uuid) to anon, authenticated;

revoke all on function erase_client(uuid) from public, anon, authenticated;

revoke all on function export_my_data(uuid) from public, anon;

revoke all on function delete_my_data(uuid) from public, anon;

revoke all on function forget_client(uuid, uuid) from public, anon;

grant execute on function export_my_data(uuid) to authenticated;

grant execute on function delete_my_data(uuid) to authenticated;

grant execute on function forget_client(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function confirm_plan_payment(uuid, text, text, numeric, timestamptz) to service_role;
    grant execute on function set_payment_provider_ref(uuid, text, text) to service_role;
    grant execute on function fail_plan_payment(uuid) to service_role;
  end if;
end $$;

drop trigger if exists shops_default_messages on shops;
create trigger shops_default_messages after insert on shops
  for each row execute function shops_default_messages();

drop trigger if exists appointments_plan_uses on appointments;
create trigger appointments_plan_uses
after insert or update of status, subscription_id, starts_at or delete on appointments
for each row execute function appointments_plan_uses();

drop trigger if exists subscriptions_period_changed on subscriptions;
create trigger subscriptions_period_changed
after update of period_start, period_end on subscriptions
for each row execute function subscriptions_period_changed();

drop trigger if exists shops_guard_access on shops;
create trigger shops_guard_access before update on shops
  for each row execute function shops_guard_access();

drop trigger if exists shop_members_fill_phone on shop_members;
create trigger shop_members_fill_phone before insert on shop_members
  for each row execute function shop_members_fill_phone();

-- barbearias já cadastradas
do $$
declare s uuid;
begin
  for s in select id from shops where not exists (select 1 from message_templates m where m.shop_id = shops.id) loop
    perform insert_default_message_templates(s);
  end loop;
end $$;

notify pgrst, 'reload schema';
