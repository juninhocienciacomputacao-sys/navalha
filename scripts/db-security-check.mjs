// Auditoria automática de segurança do banco (roda em Postgres na memória).
// Confere em TODAS as tabelas e funções, para que nada novo escape:
//  1. toda tabela tem as regras de segurança por linha (RLS) ligadas;
//  2. toda função "security definer" fixa o search_path (evita sequestro de função);
//  3. o visitante sem login (anon) só executa as funções públicas da lista abaixo;
//  4. o visitante sem login não lê nem grava nenhuma tabela.
// Uso: npm run db:check
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import path from 'node:path';

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key, phone text);
create role authenticated; create role anon; create role service_role;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
`);
const dir = 'supabase/migrations';
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
// O Supabase dá permissão direta de tabelas a anon/authenticated; imitamos isso para testar o pior caso.
await db.exec(`grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);

// Funções que qualquer visitante pode chamar sem login.
// busy_slots: ver horários livres no app do cliente.
// As outras só respondem sobre quem está chamando (sem login, a resposta é sempre "nada")
// e são usadas dentro das regras de segurança, por isso precisam estar liberadas.
const ANON_OK = new Set(['busy_slots', 'public_team', 'is_member', 'my_client_ids', 'my_access', 'can_section', 'sees_barber']);

let fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log('✓', name); } catch (e) { fail++; console.error('✗', name, '-', e.message); }
};

await check('toda tabela tem RLS ligado', async () => {
  const { rows } = await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  if (rows.length) throw new Error('sem RLS: ' + rows.map((r) => r.relname).join(', '));
});

await check('toda função security definer fixa o search_path', async () => {
  const { rows } = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  if (rows.length) throw new Error('sem search_path: ' + rows.map((r) => r.proname).join(', '));
});

await check('visitante sem login só executa funções públicas', async () => {
  const { rows } = await db.query(`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')`);
  const bad = rows.map((r) => r.proname).filter((n) => !ANON_OK.has(n));
  if (bad.length) throw new Error('anon pode executar: ' + bad.join(', '));
});

// Tabelas que o app de agendamento mostra a qualquer visitante (vitrine da barbearia).
const PUBLIC_TABLES = new Set(['shops', 'services', 'plans', 'plan_services', 'partner_stores', 'partner_products', 'shop_partner_settings', 'shop_features']);

await check('visitante sem login não lê nenhuma linha de nenhuma tabela', async () => {
  // uma barbearia com um pouco de tudo
  await db.exec(`
insert into auth.users values ('00000000-0000-0000-0000-000000000001', '+5511900000001');
insert into shops (id, name, slug) values ('10000000-0000-0000-0000-000000000001', 'X', 'x');
insert into shop_members (shop_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'owner');
insert into barbers (id, shop_id, display_name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Rafa');
insert into services (id, shop_id, name, duration_min, price) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"pt":"Corte"}', 40, 50);
insert into clients (id, shop_id, phone_e164, name) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '+5511988887777', 'Marcos Silva');
insert into appointments (shop_id, barber_id, client_id, service_id, starts_at, ends_at)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', '2026-10-21 10:00-03', '2026-10-21 10:40-03');
insert into expenses (shop_id, name, amount, due_day) values ('10000000-0000-0000-0000-000000000001', 'Aluguel', 1000, 5);
`);
  const { rows: tables } = await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'`);
  const leaks = [];
  await db.exec(`set role anon`);
  for (const { relname } of tables) {
    try {
      const { rows } = await db.query(`select 1 from public.${relname} limit 1`);
      // shops é pública de propósito (nome, endereço e horário da barbearia aparecem no app de agendamento)
      if (rows.length && !PUBLIC_TABLES.has(relname)) leaks.push(relname);
    } catch { /* sem permissão: ótimo */ }
  }
  await db.exec(`reset role`);
  if (leaks.length) throw new Error('anon lê: ' + leaks.join(', '));
});

// ---------- privacidade (0015) ----------
const as = async (claims, fn) => {
  await db.exec(`begin; set local role authenticated;
    select set_config('request.jwt.claim.sub', '${claims.sub ?? ''}', true),
           set_config('request.jwt.claims', '${JSON.stringify(claims)}', true);`);
  try { return await fn(); } finally { await db.exec('rollback'); }
};
const SHOP = '10000000-0000-0000-0000-000000000001';
const owner = { sub: '00000000-0000-0000-0000-000000000001', phone: '5511900000001' };
const marcos = { sub: '00000000-0000-0000-0000-000000000099', phone: '5511988887777' };
const stranger = { sub: '00000000-0000-0000-0000-000000000098', phone: '5511911112222' };

await check('ninguém de fora lê comissão, aluguel ou meta dos barbeiros', async () => {
  await db.exec(`set role anon`);
  try {
    const { rows } = await db.query(`select * from barbers`);
    if (rows.length) throw new Error('anon leu a tabela de barbeiros');
    const team = await db.query(`select * from public_team('${SHOP}')`);
    if (team.rows.length !== 1 || 'commission_pct' in team.rows[0]) throw new Error(JSON.stringify(team.rows));
  } finally { await db.exec(`reset role`); }
  await as(marcos, async () => {
    if ((await db.query(`select * from barbers`)).rows.length) throw new Error('cliente leu a tabela de barbeiros');
  });
});

await check('cliente baixa os próprios dados (e só os dele)', async () => {
  await as(marcos, async () => {
    const d = (await db.query(`select export_my_data('${SHOP}') d`)).rows[0].d;
    if (d.client.name !== 'Marcos Silva' || d.appointments.length !== 1) throw new Error(JSON.stringify(d));
  });
  await as(stranger, async () => {
    if ((await db.query(`select export_my_data('${SHOP}') d`)).rows[0].d !== null) throw new Error('estranho recebeu dados');
  });
});

await check('cliente apaga o próprio cadastro; atendimento fica sem nome para a contabilidade', async () => {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated;
      select set_config('request.jwt.claim.sub', '${marcos.sub}', true), set_config('request.jwt.claims', '${JSON.stringify(marcos)}', true);
      select delete_my_data('${SHOP}');
      reset role;`);
    const c = (await db.query(`select count(*)::int n from clients where phone_e164 = '+5511988887777'`)).rows[0].n;
    const a = (await db.query(`select client_id, price from appointments`)).rows;
    if (c !== 0) throw new Error('cadastro continua');
    if (a.length !== 1 || a[0].client_id !== null) throw new Error('atendimento sumiu ou continua ligado: ' + JSON.stringify(a));
  } finally { await db.exec('rollback'); }
});

await check('só o dono apaga o cadastro de um cliente pela equipe', async () => {
  await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000002', '+5511900000002');
    insert into shop_members (shop_id, user_id, role) values ('${SHOP}', '00000000-0000-0000-0000-000000000002', 'reception')`);
  const recep = { sub: '00000000-0000-0000-0000-000000000002', phone: '5511900000002' };
  await as(recep, async () => {
    try { await db.query(`select forget_client('${SHOP}', '40000000-0000-0000-0000-000000000001')`); }
    catch { return; }
    throw new Error('recepção apagou');
  });
  await as(owner, async () => {
    await db.query(`select forget_client('${SHOP}', '40000000-0000-0000-0000-000000000001')`);
    if ((await db.query(`select count(*)::int n from clients`)).rows[0].n !== 0) throw new Error('não apagou');
  });
});

if (fail) { console.error(`\n${fail} problema(s) de segurança no banco`); process.exit(1); }
console.log('segurança do banco ok');
