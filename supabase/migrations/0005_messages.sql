-- Mensagens automáticas: modelos padrão para toda barbearia.
-- Um gatilho em `shops` cria os modelos quando a barbearia é cadastrada (por create_shop ou por qualquer outro caminho),
-- e as barbearias que já existem e ainda não têm nenhum modelo recebem os mesmos.
-- O texto é o mesmo de src/modules/messages/defaults.ts.
--
-- "offset" segue src/core/messages.ts: o gatilho dá a direção e o número é sempre positivo
-- (antes do horário: horas antes; depois do atendimento: horas depois; plano: dias; cliente sumido: fator do intervalo).

create index if not exists message_templates_shop_idx on message_templates (shop_id);
create index if not exists message_log_shop_send_idx on message_log (shop_id, send_at);

alter table message_templates
  add constraint message_templates_body_pt check (body ? 'pt' and length(body ->> 'pt') between 1 and 2000),
  add constraint message_templates_name_len check (length(trim(name)) between 1 and 80),
  add constraint message_templates_offset_range check ("offset" between 0 and 720);

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

revoke all on function insert_default_message_templates(uuid) from public;

create or replace function shops_default_messages()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform insert_default_message_templates(new.id);
  return new;
end $$;

drop trigger if exists shops_default_messages on shops;
create trigger shops_default_messages after insert on shops
  for each row execute function shops_default_messages();

-- barbearias já cadastradas
do $$
declare s uuid;
begin
  for s in select id from shops where not exists (select 1 from message_templates m where m.shop_id = shops.id) loop
    perform insert_default_message_templates(s);
  end loop;
end $$;
