// Testa supabase/atualizar-banco.sql: banco criado com as migrações antigas (até a 0010) e com dados,
// recebe a atualização duas vezes, sem perder nada, e continua cadastrando barbearia.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import path from 'node:path';
const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`
create schema auth; create table auth.users(id uuid primary key, phone text);
create role authenticated; create role anon; create role service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id serial, bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`);
const dir = 'supabase/migrations';
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && f < '0011').sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
const owner = '00000000-0000-0000-0000-000000000050';
await db.exec(`insert into auth.users values ('${owner}', '+5511911112222');
  grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
await db.query(`select create_shop('Antiga', 'barbearia-antiga')`);
await db.exec('reset role');
const file = fs.readFileSync('supabase/atualizar-banco.sql', 'utf8').replace(/^notify .*$/m, '');
for (const round of [1, 2]) { await db.exec(file); console.log('atualização rodada', round, 'ok'); }
const shops = (await db.query(`select slug, modules from shops`)).rows;
if (shops.length !== 1 || JSON.stringify(shops[0].modules) !== '{}') throw new Error('perdeu dados: ' + JSON.stringify(shops));
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
await db.query(`select create_shop('Nova', 'barbearia-nova')`);
await db.exec('reset role');
const looks = (await db.query(`select s.slug, count(l.id)::int n from shops s left join style_looks l on l.shop_id = s.id group by s.slug order by s.slug`)).rows;
if (looks.some((x) => x.n !== 20)) throw new Error('galeria inicial faltando: ' + JSON.stringify(looks));
console.log('atualização ok', (await db.query(`select count(*)::int n from shops`)).rows[0].n, 'barbearias');
