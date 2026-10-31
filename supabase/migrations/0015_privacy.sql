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
