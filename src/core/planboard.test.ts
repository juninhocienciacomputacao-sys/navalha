import { describe, expect, it } from "vitest";
import { clientMatches, dateToDay, dayToDate, daysLeft, expiryMessage, firstCycle, matchesQuery, monthlyValue, renewOnPayment, subMatches } from "./planboard";

const plan = { id: "p", name: "Clube", price: 90, quotaUses: 4, periodDays: 30 };

describe("planos: ciclo e pagamento", () => {
  it("converte dias sem perder a data", () => {
    expect(dateToDay(dayToDate("2026-02-28"))).toBe("2026-02-28");
    expect(daysLeft("2026-10-25", "2026-10-20")).toBe(5);
  });

  it("plano em dia estende a partir do fim atual e mantém o início", () => {
    const r = renewOnPayment({ periodStart: "2026-10-01", periodEnd: "2026-10-25", usesInPeriod: 3 }, plan, "2026-10-20");
    expect(r).toEqual({ periodStart: "2026-10-01", periodEnd: "2026-11-24", usesInPeriod: 0 });
  });

  it("plano vencido recomeça no dia do pagamento", () => {
    const r = renewOnPayment({ periodStart: "2026-09-01", periodEnd: "2026-10-01", usesInPeriod: 4 }, plan, "2026-10-20");
    expect(r).toEqual({ periodStart: "2026-10-20", periodEnd: "2026-11-19", usesInPeriod: 0 });
  });

  it("vence hoje ainda conta como em dia ao pagar", () => {
    expect(renewOnPayment({ periodStart: "2026-09-20", periodEnd: "2026-10-20", usesInPeriod: 1 }, plan, "2026-10-20").periodEnd).toBe("2026-11-19");
  });

  it("primeiro ciclo e receita mensal", () => {
    expect(firstCycle(plan, "2026-12-15")).toEqual({ periodStart: "2026-12-15", periodEnd: "2027-01-14", usesInPeriod: 0 });
    expect(monthlyValue(90, 30)).toBe(90);
    expect(monthlyValue(150, 15)).toBe(300);
  });

  it("filtros de assinatura", () => {
    expect(subMatches(3, 5, "attention")).toBe(true);
    expect(subMatches(-1, 5, "attention")).toBe(true);
    expect(subMatches(6, 5, "attention")).toBe(false);
    expect(subMatches(-1, 5, "expired")).toBe(true);
    expect(subMatches(0, 5, "expired")).toBe(false);
    expect(subMatches(6, 5, "ok")).toBe(true);
  });

  it("aviso de vencimento", () => {
    const m = expiryMessage({ clientName: "Pedro Lima", planName: "Clube", shopName: "Dom Bigode", left: -2, endLabel: "18/10", price: "R$ 90" });
    expect(m).toContain("Oi Pedro!");
    expect(m).toContain("venceu em 18/10");
  });
});

describe("clientes: filtros e busca", () => {
  const today = "2026-10-20";
  const base = { lastVisit: "2026-10-10", createdAt: "2026-01-01", subscriber: false, noShows: 0 };
  it("sumido: mais de 30 dias sem vir", () => {
    expect(clientMatches({ ...base, lastVisit: "2026-09-19" }, today, "away")).toBe(true);
    expect(clientMatches({ ...base, lastVisit: "2026-09-20" }, today, "away")).toBe(false);
    expect(clientMatches({ ...base, lastVisit: null }, today, "away")).toBe(true);
  });
  it("novo: cadastrado nos últimos 30 dias", () => {
    expect(clientMatches({ ...base, createdAt: "2026-10-01" }, today, "new")).toBe(true);
    expect(clientMatches(base, today, "new")).toBe(false);
  });
  it("assinantes e faltas", () => {
    expect(clientMatches({ ...base, subscriber: true }, today, "subscribers")).toBe(true);
    expect(clientMatches({ ...base, noShows: 1 }, today, "noshow")).toBe(true);
    expect(clientMatches(base, today, "noshow")).toBe(false);
  });
  it("busca por nome sem acento ou por telefone", () => {
    expect(matchesQuery("André Souza", "+5511980000001", "andre")).toBe(true);
    expect(matchesQuery("André Souza", "+5511980000001", "98000")).toBe(true);
    expect(matchesQuery("André Souza", "+5511980000001", "lima")).toBe(false);
  });
});
