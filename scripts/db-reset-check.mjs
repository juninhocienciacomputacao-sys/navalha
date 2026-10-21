// Testa supabase/recomecar-do-zero.sql num Postgres em memória imitando o Supabase (roda duas vezes e cria uma barbearia).
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
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
const file = fs.readFileSync('supabase/recomecar-do-zero.sql', 'utf8').replace(/^notify .*$/m, '');
// estado quebrado: algumas tabelas sem tipos/funções
await db.exec(`create table public.shops(id int); create table public.lixo(x int);`);
for (const round of [1, 2]) {
  const res = await db.exec(file);
  console.log('rodada', round, JSON.stringify(res.at(-1).rows));
}
const owner = '00000000-0000-0000-0000-000000000050';
await db.exec(`insert into auth.users values ('${owner}', '+5511911112222')`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
const r = await db.query(`select create_shop('Navalha', 'barbearia-navalha') id`);
await db.exec('reset role');
console.log('criou', r.rows[0].id, (await db.query(`select count(*)::int n from message_templates`)).rows[0].n, 'mensagens');
