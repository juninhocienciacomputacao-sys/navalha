// Gera supabase/reparar-funcoes.sql: recria todas as funções, permissões e gatilhos do banco
// sem mexer nas tabelas nem nos dados. Pode rodar quantas vezes quiser.
// Uso: npm run db:repair  (rode depois de npm run db:bundle)
import fs from "node:fs";

const src = fs.readFileSync("supabase/tudo-em-um.sql", "utf8");
const out = [
  "grant usage on schema public to anon, authenticated;",
  "grant select, insert, update, delete on all tables in schema public to anon, authenticated;",
  "grant usage, select on all sequences in schema public to anon, authenticated;",
];
// colunas novas (banco antigo ganha a coluna antes das funções que usam ela)
out.push(...(src.match(/^alter table \w+ add column if not exists[^;]*;$/gm) ?? []));
const fns = src.match(/^create or replace function[\s\S]*?\bas \$\$[\s\S]*?\$\$;/gm) ?? [];
out.push(...fns);
out.push(...(src.match(/^drop policy if exists [^\n]*;\ncreate policy [^\n]*;$/gm) ?? []));
out.push(...(src.match(/^(grant|revoke) [^\n]*;$/gm) ?? []));
out.push(...(src.match(/^do \$\$\nbegin\n  if exists \(select 1 from pg_roles[\s\S]*?end \$\$;/gm) ?? []));
for (const t of src.match(/^create trigger[\s\S]*?;/gm) ?? []) {
  const [, name, table] = t.match(/^create trigger (\w+)[\s\S]*? on (\w+)/);
  out.push(`drop trigger if exists ${name} on ${table};\n${t}`);
}
out.push(...(src.match(/^-- barbearias já cadastradas\ndo \$\$[\s\S]*?end \$\$;/gm) ?? []));
out.push("notify pgrst, 'reload schema';");
fs.writeFileSync("supabase/reparar-funcoes.sql",
  `-- Gerado por "npm run db:repair". Recria funções, permissões e gatilhos do Navalha.\n-- Não apaga nem altera dados. Pode rodar mais de uma vez.\n\n` + out.join("\n\n") + "\n");
console.log(`ok supabase/reparar-funcoes.sql (${fns.length} funções)`);
