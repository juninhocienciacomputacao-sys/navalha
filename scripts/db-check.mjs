// Valida a migração num Postgres em memória (PGlite) e testa regras críticas.
// Uso: npm run db:check
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import path from 'node:path';

const db = new PGlite({ extensions: { btree_gist } });
// Imitação mínima do que o Supabase já fornece (schema auth e papéis).
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key, phone text);
create role authenticated; create role anon;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
`);
const dir = 'supabase/migrations';
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log('ok', f);
}

let fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log('✓', name); } catch (e) { fail++; console.error('✗', name, '-', e.message); }
};
const expectError = async (sql, params) => {
  try { await db.query(sql, params); } catch { return; }
  throw new Error('deveria ter falhado');
};

const owner = '00000000-0000-0000-0000-000000000001';
await db.exec(`
insert into auth.users values ('${owner}', '+5511900000001');
insert into shops (id, name, slug) values ('10000000-0000-0000-0000-000000000001', 'Dom Bigode', 'dom-bigode'),
                                          ('10000000-0000-0000-0000-000000000002', 'Outra', 'outra');
insert into shop_members (shop_id, user_id, role) values ('10000000-0000-0000-0000-000000000001', '${owner}', 'owner');
insert into barbers (id, shop_id, display_name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Rafa');
insert into services (id, shop_id, name, duration_min, price) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '{"pt":"Corte"}', 40, 50);
insert into clients (id, shop_id, phone_e164, name) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '+5511988887777', 'Marcos'),
                                                         ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '+5511977776666', 'Outro');
insert into appointments (shop_id, barber_id, client_id, service_id, starts_at, ends_at)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', '2026-10-21 10:00-03', '2026-10-21 10:40-03');
`);
const appt = (start, end, status = 'confirmed') => [
  `insert into appointments (shop_id, barber_id, service_id, starts_at, ends_at, status)
   values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', $1, $2, $3)`,
  [start, end, status],
];

await check('bloqueia dois horários sobrepostos do mesmo barbeiro', () => expectError(...appt('2026-10-21 10:20-03', '2026-10-21 11:00-03')));
await check('aceita horário logo em seguida', () => db.query(...appt('2026-10-21 10:40-03', '2026-10-21 11:20-03')));
await check('horário cancelado não ocupa a agenda', async () => {
  await db.query(...appt('2026-10-21 12:00-03', '2026-10-21 12:40-03', 'cancelled'));
  await db.query(...appt('2026-10-21 12:00-03', '2026-10-21 12:40-03'));
});
await check('telefone repetido na mesma barbearia é recusado',
  () => expectError(`insert into clients (shop_id, phone_e164, name) values ('10000000-0000-0000-0000-000000000001', '+5511988887777', 'X')`));

// RLS: entrar como usuário logado.
await db.exec(`grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated;`);
const as = async (claims, fn) => {
  await db.exec(`begin; set local role authenticated;
    select set_config('request.jwt.claim.sub', '${claims.sub ?? ''}', true),
           set_config('request.jwt.claims', '${JSON.stringify(claims)}', true);`);
  try { return await fn(); } finally { await db.exec('rollback'); }
};
await check('dono vê só os clientes da própria barbearia', () => as({ sub: owner }, async () => {
  const r = await db.query('select name from clients order by name');
  if (r.rows.map((x) => x.name).join() !== 'Marcos') throw new Error(JSON.stringify(r.rows));
}));
await check('cliente vê só os próprios agendamentos (pelo WhatsApp)', () =>
  as({ sub: '00000000-0000-0000-0000-000000000099', phone: '5511988887777' }, async () => {
    const r = await db.query('select count(*)::int n from appointments');
    if (r.rows[0].n !== 1) throw new Error('viu ' + r.rows[0].n);
  }));
await check('estranho não vê clientes', () => as({ sub: '00000000-0000-0000-0000-000000000098', phone: '5500000000000' }, async () => {
  const r = await db.query('select count(*)::int n from clients');
  if (r.rows[0].n !== 0) throw new Error('viu ' + r.rows[0].n);
}));
await check('catálogo de serviços é público', () => as({}, async () => {
  const r = await db.query('select count(*)::int n from services');
  if (r.rows[0].n !== 1) throw new Error('viu ' + r.rows[0].n);
}));

// a barbearia de teste abre todo dia das 08:00 às 20:00 (o agendamento confere o horário de funcionamento)
await db.exec(`update shops set opening_hours = (select jsonb_object_agg(d::text, '{"open":"08:00","close":"20:00"}'::jsonb) from generate_series(0, 6) d)
  where id = '10000000-0000-0000-0000-000000000001'`);

const marcos = { sub: '00000000-0000-0000-0000-000000000099', phone: '5511988887777' };
const novo = { sub: '00000000-0000-0000-0000-000000000097', phone: '+5511955554444' };
const book = (start) => db.query(`select book_appointment('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', $1, 'Pedro') id`, [start]);
await check('cliente novo agenda e ganha cadastro pelo WhatsApp', () => as(novo, async () => {
  await book('2030-01-10 09:00-03');
  const r = await db.query(`select name from clients`);
  if (r.rows.length !== 1 || r.rows[0].name !== 'Pedro') throw new Error(JSON.stringify(r.rows));
}));
await check('agendar horário ocupado devolve slot_taken', () => as(novo, async () => {
  await book('2030-01-10 09:00-03');
  try { await book('2030-01-10 09:20-03'); } catch (e) { if (/slot_taken/.test(e.message)) return; throw e; }
  throw new Error('deveria ter falhado');
}));
await check('agendar sem login é recusado', () => as({}, async () => {
  try { await book('2030-01-10 09:00-03'); } catch (e) { if (/not_logged_in/.test(e.message)) return; throw e; }
  throw new Error('deveria ter falhado');
}));
await check('grade pública mostra ocupado sem nomes', () => as({}, async () => {
  const r = await db.query(`select * from busy_slots('10000000-0000-0000-0000-000000000001', '2026-10-21 00:00-03', '2026-10-22 00:00-03')`);
  if (r.rows.length !== 3 || 'client_id' in r.rows[0]) throw new Error(JSON.stringify(r.rows));
}));
await check('cliente cancela o próprio horário, não o de outro', () => as(marcos, async () => {
  const mine = await db.query(`select book_appointment('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '2030-02-01 10:00-03') id`);
  await db.query('select cancel_my_appointment($1)', [mine.rows[0].id]);
}));

await check('agendar fora do horário de funcionamento é recusado', async () => {
  for (const t of ['2030-01-10 03:00-03', '2030-01-10 19:40-03']) {
    await as(novo, async () => {
      try { await book(t); } catch (e) { if (/slot_taken/.test(e.message)) return; throw e; }
      throw new Error('aceitou ' + t);
    });
  }
});
await check('agendar em dia fechado é recusado', async () => {
  await db.exec(`update shops set opening_hours = opening_hours - '0' where id = '10000000-0000-0000-0000-000000000001'`);
  try {
    await as(novo, async () => {
      try { await book('2030-01-13 10:00-03'); } catch (e) { if (/slot_taken/.test(e.message)) return; throw e; } // domingo
      throw new Error('aceitou domingo');
    });
  } finally {
    await db.exec(`update shops set opening_hours = opening_hours || '{"0":{"open":"08:00","close":"20:00"}}' where id = '10000000-0000-0000-0000-000000000001'`);
  }
});
await check('app não chama funções internas do banco', () => as(novo, async () => {
  await expectError(`select insert_default_message_templates('10000000-0000-0000-0000-000000000002')`);
}));
await check('app do cliente lê os módulos e só o liga/desliga público dos recursos', async () => {
  await db.exec(`update shops set modules = '{"financeiro": false}' where id = '10000000-0000-0000-0000-000000000001';
    insert into shop_features (shop_id, key, enabled) values ('10000000-0000-0000-0000-000000000001', 'rebook', true),
                                                           ('10000000-0000-0000-0000-000000000001', 'ai_receptionist', true);`);
  await as({}, async () => {
    const m = await db.query(`select modules from shops where id = '10000000-0000-0000-0000-000000000001'`);
    if (m.rows[0].modules.financeiro !== false) throw new Error(JSON.stringify(m.rows));
    const f = await db.query(`select key from shop_features`);
    if (f.rows.map((x) => x.key).join() !== 'rebook') throw new Error(JSON.stringify(f.rows));
  });
  await expectError(`update shops set modules = '[]' where id = '10000000-0000-0000-0000-000000000001'`);
});
await check('plano sem uso sobrando ou com módulo Planos desligado: horário cobrado', async () => {
  await db.exec(`
    insert into plans (id, shop_id, name, price, quota_uses) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Um corte', 40, 1);
    insert into plan_services values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
    insert into clients (id, shop_id, phone_e164, name) values ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '+5511966665555', 'Assinante');
    insert into subscriptions (shop_id, client_id, plan_id, period_start, period_end)
      values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', current_date, current_date + 30);`);
  const assinante = { sub: '00000000-0000-0000-0000-000000000077', phone: '5511966665555' };
  const at = (days, hour) => `${new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)} ${hour}:00-03`;
  const price = async (t) => {
    const r = await db.query(`select book_appointment('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001', $1) id`, [t]);
    return Number((await db.query(`select price from appointments where id = $1`, [r.rows[0].id])).rows[0].price);
  };
  await as(assinante, async () => {
    if (await price(at(2, '10')) !== 0) throw new Error('primeiro uso deveria sair pelo plano');
    if (await price(at(3, '10')) !== 50) throw new Error('cota acabou: deveria cobrar');
  });
  await db.exec(`update shops set modules = '{"planos": false}' where id = '10000000-0000-0000-0000-000000000001';
    update subscriptions set uses_in_period = 0 where client_id = '40000000-0000-0000-0000-000000000003';`);
  await as(assinante, async () => {
    if (await price(at(4, '10')) !== 50) throw new Error('módulo desligado: deveria cobrar');
  });
  await db.exec(`update shops set modules = '{}' where id = '10000000-0000-0000-0000-000000000001'`);
});

const novoDono = { sub: '00000000-0000-0000-0000-000000000050', phone: '5511911112222' };
await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000050', '+5511911112222')`);
await check('dono novo cadastra a barbearia e vira dono dela', () => as(novoDono, async () => {
  await db.query(`select create_shop('Barbearia do Zé', 'Barbearia do Ze!')`);
  const r = await db.query(`select s.slug, m.role from shops s join shop_members m on m.shop_id = s.id`);
  if (r.rows.length !== 1 || r.rows[0].slug !== 'barbearia-do-ze' || r.rows[0].role !== 'owner') throw new Error(JSON.stringify(r.rows));
}));
await check('endereço já usado é recusado', () => as(novoDono, async () => {
  try { await db.query(`select create_shop('Outra', 'dom-bigode')`); } catch (e) { if (/slug_taken/.test(e.message)) return; throw e; }
  throw new Error('deveria ter falhado');
}));

await check('contador de usos do plano acompanha os atendimentos', async () => {
  await db.exec(`
    insert into plans (id, shop_id, name, price, quota_uses) values ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'Clube', 90, 4);
    insert into subscriptions (id, shop_id, client_id, plan_id, period_start, period_end)
      values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
              '50000000-0000-0000-0000-000000000009', current_date, current_date + 30);
    insert into appointments (id, shop_id, barber_id, client_id, service_id, starts_at, ends_at, subscription_id)
      values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
              '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
              current_date + interval '1 day 3 hours', current_date + interval '1 day 3 hours 40 minutes', '60000000-0000-0000-0000-000000000001');`);
  const uses = async () => (await db.query(`select uses_in_period n from subscriptions where id = '60000000-0000-0000-0000-000000000001'`)).rows[0].n;
  if (await uses() !== 1) throw new Error('esperava 1 uso');
  await db.exec(`update appointments set status = 'cancelled' where id = '70000000-0000-0000-0000-000000000001'`);
  if (await uses() !== 0) throw new Error('cancelado deveria liberar o uso');
});

await check('arquivo de reparo recria funções sem mexer nos dados (e roda duas vezes)', async () => {
  const before = (await db.query('select count(*)::int n from shops')).rows[0].n;
  await db.exec('drop function create_shop(text, text, text, text, text)');
  const repair = fs.readFileSync('supabase/reparar-funcoes.sql', 'utf8').replace(/^notify .*$/m, '');
  await db.exec(repair);
  await db.exec(repair);
  if ((await db.query('select count(*)::int n from shops')).rows[0].n !== before) throw new Error('mudou os dados');
  await as(novoDono, () => db.query(`select create_shop('Depois do reparo', 'depois-do-reparo')`));
});

if (fail) { console.error(`${fail} verificação(ões) falharam`); process.exit(1); }
console.log('banco ok');
