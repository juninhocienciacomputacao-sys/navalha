import { describe, expect, it } from "vitest";
import { MODULE_KEYS, PACKAGES, packageOf, resolveModules, sectionOn } from "./modules";

describe("módulos", () => {
  it("barbearia antiga (nada salvo) fica com tudo ligado", () => {
    expect(resolveModules({})).toEqual(PACKAGES.find((p) => p.key === "completo")!.modules);
    expect(resolveModules(null)).toEqual(resolveModules({}));
    expect(resolveModules("lixo")).toEqual(resolveModules({}));
  });

  it("só desliga o que foi salvo como false", () => {
    const m = resolveModules({ financeiro: false, planos: "não", tv: 0 });
    expect(m.financeiro).toBe(false);
    expect(m.planos).toBe(true);
    expect(m.tv).toBe(true);
  });

  it("reconhece os pacotes e o personalizado", () => {
    for (const p of PACKAGES) expect(packageOf(p.modules)).toBe(p.key);
    expect(packageOf({ ...PACKAGES[0].modules, financeiro: true })).toBe("personalizado");
  });

  it("todo pacote define todos os módulos", () => {
    for (const p of PACKAGES) expect(Object.keys(p.modules).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("telas da base nunca somem", () => {
    const off = resolveModules(Object.fromEntries(MODULE_KEYS.map((k) => [k, false])));
    for (const s of ["", "agenda", "clientes", "equipe", "servicos", "recursos"]) expect(sectionOn(off, s)).toBe(true);
    expect(sectionOn(off, "financeiro")).toBe(false);
    expect(sectionOn(resolveModules({}), "financeiro")).toBe(true);
  });
});
