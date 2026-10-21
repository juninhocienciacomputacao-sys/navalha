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
  `    raise exception 'O banco do Navalha ja foi criado neste projeto. Nao precisa rodar de novo.';\n  end if;\nend $guard$;\n\n${parts.join("\n")}`);
console.log("ok supabase/tudo-em-um.sql");
