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
