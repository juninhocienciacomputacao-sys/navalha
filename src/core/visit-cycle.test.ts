import { describe, expect, it } from "vitest";
import { visitCycleDays } from "./visit-cycle";

describe("visitCycleDays", () => {
  it("usa o padrão sem histórico suficiente", () => {
    expect(visitCycleDays([])).toBe(7);
    expect(visitCycleDays(["2026-10-01"], 10)).toBe(10);
  });
  it("pega a mediana dos intervalos", () => {
    expect(visitCycleDays(["2026-09-01", "2026-09-15", "2026-09-29", "2026-10-30"])).toBe(14);
  });
  it("ignora visitas repetidas no mesmo dia e a ordem", () => {
    expect(visitCycleDays(["2026-10-21", "2026-10-01", "2026-10-11", "2026-10-11"])).toBe(10);
  });
  it("respeita o mínimo e o máximo", () => {
    expect(visitCycleDays(["2026-10-01", "2026-10-03", "2026-10-05"])).toBe(7);
    expect(visitCycleDays(["2026-01-01", "2026-06-01"])).toBe(60);
  });
  it("considera só as últimas visitas", () => {
    const old = ["2025-01-01", "2025-03-01", "2025-05-01"];
    const recent = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06"];
    expect(visitCycleDays([...old, ...recent])).toBe(7);
  });
});
