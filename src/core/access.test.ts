import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { accessFor, canSee, DEFAULT_ACCESS, homeHref, sanitizeAccess, workableBarbers } from "./access";

describe("níveis de acesso", () => {
  it("dono vê tudo, sempre", () => {
    const a = accessFor("owner", { manager: { sections: [], agenda: "own" } });
    expect(a.agenda).toBe("all");
    expect(canSee(a, "financeiro")).toBe(true);
    expect(canSee(a, "recursos")).toBe(true);
  });

  it("barbeiro, por padrão, vê só a agenda dele e os livres dos colegas", () => {
    const a = accessFor("barber");
    expect(a.agenda).toBe("own_free");
    expect(canSee(a, "agenda")).toBe(true);
    expect(canSee(a, "financeiro")).toBe(false);
    expect(homeHref(a)).toBe("/agenda");
  });

  it("segue a escolha do dono e completa o que faltar com o padrão", () => {
    const a = accessFor("reception", { reception: { sections: ["mensagens"], agenda: "own" } });
    expect(a).toEqual({ sections: ["mensagens"], agenda: "own" });
    const partial = accessFor("barber", sanitizeAccess({ barber: { agenda: "all" } }));
    expect(partial).toEqual({ sections: DEFAULT_ACCESS.barber.sections, agenda: "all" });
  });

  it("ignora telas e escopos desconhecidos", () => {
    expect(sanitizeAccess({ barber: { sections: ["financeiro", "hack"], agenda: "tudo" }, owner: { sections: [] } }))
      .toEqual({ barber: { sections: ["financeiro"], agenda: "own_free" } });
    expect(sanitizeAccess(null)).toEqual({});
  });

  it("gerente com Painel abre no Painel", () => {
    expect(homeHref(accessFor("manager"))).toBe("");
  });

  it("só mexe na agenda dos barbeiros ligados a ela, a não ser com agenda de todos", () => {
    const ids = ["a", "b", "c"];
    expect(workableBarbers(accessFor("barber"), ids, ["b"])).toEqual(["b"]);
    expect(workableBarbers(accessFor("barber"), ids, [])).toEqual([]);
    expect(workableBarbers(accessFor("reception"), ids, [])).toEqual(ids);
  });

  it("o padrão do banco (access_defaults) é igual ao do app", () => {
    const sql = fs.readFileSync("supabase/migrations/0012_team_access.sql", "utf8");
    const json = sql.match(/create or replace function access_defaults\(\)[\s\S]*?select '(\{.*?\})'::jsonb/)?.[1];
    expect(json).toBeTruthy();
    expect(JSON.parse(json!)).toEqual(DEFAULT_ACCESS);
  });
});
