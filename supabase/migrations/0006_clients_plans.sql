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
