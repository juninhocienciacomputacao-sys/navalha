import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOOKS } from "./defaults";

describe("galeria inicial", () => {
  it("o banco (insert_default_style_looks) tem os mesmos modelos do app, na mesma ordem", () => {
    const sql = fs.readFileSync("supabase/migrations/0015_style_gallery.sql", "utf8");
    const rows = [...sql.matchAll(/\('(cut|beard)', '([a-z0-9-]+)', (\d+), '(\{.*?\})'::jsonb,\s*'(\{.*?\})'::jsonb\)/g)]
      .map((m) => ({ kind: m[1], art: m[2], sort: Number(m[3]), name: JSON.parse(m[4].replaceAll("''", "'")), desc: JSON.parse(m[5].replaceAll("''", "'")) }));
    expect(rows).toEqual(DEFAULT_LOOKS.map((d, i) => ({ kind: d.kind, art: d.art, sort: i, name: d.name, desc: d.desc })));
  });

  it("todo modelo tem desenho, nome e descrição nos 3 idiomas", () => {
    for (const d of DEFAULT_LOOKS) {
      expect(fs.existsSync(`public/galeria/${d.art}.svg`), d.art).toBe(true);
      for (const l of ["pt", "en", "es"] as const) {
        expect(d.name[l], `${d.art} ${l}`).toBeTruthy();
        expect(d.desc[l], `${d.art} ${l}`).toBeTruthy();
      }
    }
    expect(new Set(DEFAULT_LOOKS.map((d) => d.art)).size).toBe(DEFAULT_LOOKS.length);
  });
});
