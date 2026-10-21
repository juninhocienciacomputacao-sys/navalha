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
