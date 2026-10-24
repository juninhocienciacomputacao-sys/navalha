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
