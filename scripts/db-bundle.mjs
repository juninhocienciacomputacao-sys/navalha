// Junta todas as migrações num arquivo só, para colar de uma vez no SQL Editor do Supabase.
// Uso: npm run db:bundle
import fs from "node:fs";
import path from "node:path";
const dir = "supabase/migrations";
const parts = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}\n`);
fs.writeFileSync("supabase/tudo-em-um.sql",
  `-- Gerado por "npm run db:bundle". Não edite à mão: edite supabase/migrations e gere de novo.\n-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run (só uma vez, num projeto novo).\n\n` +
  `do $guard$ begin\n  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'member_role' and n.nspname = 'public') then\n` +
  `    raise exception 'O banco do Navalha ja foi criado neste projeto. Nao precisa rodar de novo.';\n  end if;\nend $guard$;\n\n${parts.join("\n")}\n-- Avisa a API do Supabase que as funções mudaram.\nnotify pgrst, 'reload schema';\n`);
console.log("ok supabase/tudo-em-um.sql");

// Versão "do zero": apaga o schema public (tabelas, tipos e funções do Navalha) e recria tudo,
// com uma conferência no fim. Só para banco sem dados de verdade.
const reset = `-- Gerado por "npm run db:bundle". ATENÇÃO: apaga tudo o que está no schema public e recria o banco do Navalha.
-- Use só enquanto o banco ainda não tem dados de verdade. Cole o arquivo inteiro no SQL Editor do Supabase e clique em Run.

drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
set search_path = public, extensions;

${parts.join("\n")}
notify pgrst, 'reload schema';

-- Conferência: tudo tem que dar o número indicado e "pode_criar" = true.
select
  (select count(*) from pg_tables where schemaname = 'public') as tabelas_25,
  (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e') as tipos_11,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
    'is_member','my_client_ids','busy_slots','my_phone','book_appointment','cancel_my_appointment','create_shop',
    'insert_default_message_templates','shops_default_messages','start_plan_payment','set_payment_provider_ref','confirm_plan_payment',
    'fail_plan_payment','set_my_photo_consent','create_my_style_project','refresh_plan_uses','appointments_plan_uses','subscriptions_period_changed',
    'access_defaults','my_access','can_section','sees_barber','shops_guard_access','shop_members_fill_phone','claim_staff_invites','set_member_access','remove_member',
    'insert_default_style_looks','shops_default_looks')) as funcoes_29,
  has_function_privilege('authenticated', 'public.create_shop(text,text,text,text,text)', 'execute') as pode_criar;
`;
fs.writeFileSync("supabase/recomecar-do-zero.sql", reset);
console.log("ok supabase/recomecar-do-zero.sql");

// Atualização de um banco que já existe (criado até a 0010): só as migrações novas, todas podem rodar mais de uma vez.
const novas = fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && f >= "0011").sort()
  .map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}\n`);
fs.writeFileSync("supabase/atualizar-banco.sql",
  `-- Gerado por "npm run db:bundle". Atualiza um banco do Navalha que já está no ar, sem apagar dados.\n` +
  `-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run. Pode rodar mais de uma vez.\n\n` +
  `${novas.join("\n")}\n-- Avisa a API do Supabase que as tabelas e funções mudaram.\nnotify pgrst, 'reload schema';\n`);
console.log("ok supabase/atualizar-banco.sql");
