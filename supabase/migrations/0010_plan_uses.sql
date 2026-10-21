-- Mantém o contador de usos do plano certo sozinho: conta os atendimentos do ciclo
-- que usaram o plano (sem cancelados e faltas), seja pelo app, recepção ou encaixe.
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

create trigger appointments_plan_uses
after insert or update of status, subscription_id, starts_at or delete on appointments
for each row execute function appointments_plan_uses();

-- ao renovar o ciclo, recalcula também
create or replace function subscriptions_period_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_plan_uses(new.id);
  return null;
end $$;

create trigger subscriptions_period_changed
after update of period_start, period_end on subscriptions
for each row execute function subscriptions_period_changed();
