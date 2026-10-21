import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./commission";
import {
  barberStatement, buildBarberPeriod, dueAlerts, dueDateIn, expensesInMonth, expenseTotals, periodFraction, periodRange,
  revenueRows, rulesForPeriod, shiftPeriod, togglePaid, type DoneVisit, type Expense, type SubscriptionCycle,
} from "./finance";

const at = (s: string) => new Date(s + "T12:00:00-03:00");

describe("períodos de pagamento", () => {
  it("semana começa na segunda", () => {
    expect(periodRange("weekly", "2026-10-21")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(periodRange("weekly", "2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });
  it("quinzena vai de 1 a 15 e de 16 ao fim do mês", () => {
    expect(periodRange("biweekly", "2026-02-20")).toEqual({ start: "2026-02-16", end: "2026-02-28" });
    expect(shiftPeriod("biweekly", periodRange("biweekly", "2026-03-03"), -1)).toEqual({ start: "2026-02-16", end: "2026-02-28" });
  });
  it("mês e navegação entre meses", () => {
    expect(periodRange("monthly", "2026-10-20")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(shiftPeriod("monthly", periodRange("monthly", "2026-01-10"), -2)).toEqual({ start: "2025-11-01", end: "2025-11-30" });
  });
  it("metas e garantia ficam proporcionais numa semana", () => {
    const f = periodFraction({ start: "2026-10-19", end: "2026-10-25" });
    expect(f).toBeCloseTo(7 / 31);
    const r = rulesForPeriod({ ...DEFAULT_RULES, monthlyFloor: 3100, tiers: [{ above: 3100, extraPct: 5 }] }, f);
    expect(r.monthlyFloor).toBeCloseTo(700);
    expect(r.tiers[0].above).toBeCloseTo(700);
  });
});

describe("extrato de comissão a partir dos atendimentos", () => {
  const sub: SubscriptionCycle = { id: "s1", planPrice: 100, quotaUses: 4, periodDays: 30, periodStart: at("2026-10-01") };
  const v = (id: string, day: string, extra: Partial<DoneVisit> = {}): DoneVisit =>
    ({ id, barberId: "rafa", serviceId: "corte", servicePrice: 50, price: 0, startsAt: at(day), subscriptionId: "s1", ...extra });
  const visits = [
    v("a", "2026-10-02"), v("b", "2026-10-09", { barberId: "leo" }), v("c", "2026-10-20"),
    v("x", "2026-09-25"), // ciclo anterior: não conta
    v("w", "2026-10-05", { subscriptionId: null, price: 50 }),
    v("z", "2026-10-06", { subscriptionId: null, price: 0 }), // cortesia: não é venda
  ];
  const subs = new Map([["s1", sub]]);
  const from = at("2026-10-01"), to = new Date(at("2026-11-01").getTime());

  it("separa avulsos e conta os usos do plano no ciclo, com qualquer barbeiro", () => {
    const { period, planVisits } = buildBarberPeriod({ barberId: "rafa", visits, subscriptions: subs, from, to, cardByVisit: new Map([["w", 50]]) });
    expect(period.sales).toEqual([{ serviceId: "corte", amount: 50, cardAmount: 50 }]);
    expect(planVisits.map((p) => p.usesInCycle)).toEqual([3, 3]);
  });

  it("no rateio a comissão do plano não passa do valor do plano", () => {
    const rules = { ...DEFAULT_RULES, planPct: 50, deductCardFee: false };
    const all = ["rafa", "leo"].map((barberId) =>
      barberStatement({ barberId, visits, subscriptions: subs, from, to, pay: { kind: "commission", pct: 40 }, rules, range: { start: "2026-10-01", end: "2026-10-31" } }));
    const plan = all.flatMap((s) => s.result.lines).filter((l) => l.key === "plan_visits").reduce((a, l) => a + l.amount, 0);
    expect(plan).toBeCloseTo(50); // 100 × 50%, dividido pelos 3 usos
  });

  it("período fechado no meio do ciclo conta só os usos até ali", () => {
    const { planVisits } = buildBarberPeriod({ barberId: "rafa", visits, subscriptions: subs, from, to: at("2026-10-12") });
    expect(planVisits.map((p) => p.usesInCycle)).toEqual([2]);
  });

  it("aluguel de cadeira proporcional na semana", () => {
    const s = barberStatement({ barberId: "rafa", visits: [], subscriptions: subs, from, to, pay: { kind: "chair_rent", monthlyRent: 3100 },
      rules: DEFAULT_RULES, range: { start: "2026-10-19", end: "2026-10-25" } });
    expect(s.result.total).toBeCloseTo(-700);
  });
});

describe("contas", () => {
  const base: Expense = { id: "e", name: "Aluguel", category: "Estrutura", kind: "fixed", amount: 3000, recurring: true, dueDay: 31,
    dueDate: null, startsOn: "2026-08-10", paidOn: null, paidThrough: null };

  it("recorrente vence todo mês, no último dia em mês curto, a partir do início", () => {
    expect(dueDateIn(base, "2026-09")).toBe("2026-09-30");
    expect(dueDateIn(base, "2026-07")).toBeNull();
    expect(dueDateIn({ ...base, recurring: false, dueDate: "2026-10-03" }, "2026-10")).toBe("2026-10-03");
    expect(dueDateIn({ ...base, recurring: false, dueDate: "2026-10-03" }, "2026-11")).toBeNull();
  });

  it("situação: atrasada, vencendo, a vencer e paga", () => {
    const list = [
      { ...base, id: "a", dueDay: 5 },
      { ...base, id: "b", dueDay: 22 },
      { ...base, id: "c", dueDay: 28, kind: "variable" as const, amount: 200 },
      { ...base, id: "d", dueDay: 1, paidThrough: "2026-10" },
    ];
    const items = expensesInMonth(list, "2026-10", "2026-10-20");
    expect(Object.fromEntries(items.map((x) => [x.expense.id, x.state]))).toEqual({ a: "overdue", b: "due_soon", c: "upcoming", d: "paid" });
    expect(expenseTotals(items)).toMatchObject({ fixed: 9000, variable: 200, paid: 3000, open: 6200 });
    expect(dueAlerts(list, "2026-10-20").map((x) => x.expense.id + x.due)).toContain("a2026-09-05");
  });

  it("marcar mês pago e desmarcar", () => {
    const p = togglePaid(base, "2026-10", "2026-10-20", true);
    expect(p.paidThrough).toBe("2026-10");
    expect(togglePaid({ ...base, ...p }, "2026-10", "2026-10-20", false).paidThrough).toBe("2026-09");
    expect(togglePaid({ ...base, paidThrough: "2026-08" }, "2026-08", "2026-10-20", false).paidThrough).toBeNull();
    expect(togglePaid({ ...base, recurring: false }, "2026-10", "2026-10-20", true)).toEqual({ paidOn: "2026-10-20", paidThrough: null });
  });
});

describe("receita", () => {
  it("usa os pagamentos e completa com avulsos sem pagamento registrado", () => {
    const visits: DoneVisit[] = [
      { id: "v1", barberId: "r", serviceId: "s", servicePrice: 50, price: 50, startsAt: at("2026-10-02"), subscriptionId: null },
      { id: "v2", barberId: "r", serviceId: "s", servicePrice: 50, price: 50, startsAt: at("2026-10-03"), subscriptionId: null },
      { id: "v3", barberId: "r", serviceId: "s", servicePrice: 50, price: 0, startsAt: at("2026-10-03"), subscriptionId: "s1" },
    ];
    const rows = revenueRows([
      { id: "p1", amount: 50, method: "card", subscriptionId: null, appointmentId: "v1", paidAt: at("2026-10-02") },
      { id: "p2", amount: 90, method: "pix", subscriptionId: "s1", appointmentId: null, paidAt: at("2026-10-01") },
    ], visits);
    expect(rows.map((r) => `${r.kind}:${r.method}:${r.amount}`)).toEqual(["service:card:50", "plan:pix:90", "service:unknown:50"]);
  });
});
