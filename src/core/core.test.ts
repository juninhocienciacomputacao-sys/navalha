import { describe, expect, it } from "vitest";
import { availability, freeSlots, slotsForPreferred, walkInReserves } from "./slots";
import { applyPayment, canUsePlan, subscriptionStatus } from "./plans";
import { computeCommission, DEFAULT_RULES, planVisitValue, PlanVisit } from "./commission";
import { suggestRebook } from "./rebook";
import { renderTemplate, sendAtForAppointment } from "./messages";
import { toMinutes as m } from "./types";

const hours = { open: m("09:00"), close: m("20:00"), step: 15 };

describe("horários livres", () => {
  it("só oferece horários em que o serviço cabe inteiro", () => {
    const s = freeSlots({ hours, busy: [{ start: m("10:00"), end: m("11:00") }], durationMin: 70 });
    expect(s).not.toContain(m("09:00"));
    expect(s).toContain(m("11:00"));
    expect(s.at(-1)).toBe(m("18:45")); // 18:45 + 70 = 19:55
  });

  it("respeita a antecedência mínima", () => {
    const s = freeSlots({ hours, busy: [], durationMin: 30, notBefore: m("14:20") });
    expect(s[0]).toBe(m("14:30"));
  });

  it("encaixes de pico rodam entre os barbeiros e ficam fora do agendamento", () => {
    const r = walkInReserves({ enabled: true, perPeakHour: 2, peakStarts: [m("17:00"), m("18:00")], blockMin: 45 }, ["a", "b", "c"]);
    expect(r.get("a")).toEqual([{ start: m("17:00"), end: m("17:45") }, { start: m("18:00"), end: m("18:45") }]);
    expect(r.get("b")).toEqual([{ start: m("17:00"), end: m("17:45") }]);
    expect(r.get("c")).toEqual([{ start: m("18:00"), end: m("18:45") }]);
    const av = availability({ hours, durationMin: 30, barberIds: ["a", "b", "c"], busyByBarber: new Map(), reserves: r });
    expect(av.find((x) => x.time === m("17:00"))!.barberIds).toEqual(["c"]);
  });

  it("desligado, não reserva nada", () => {
    const r = walkInReserves({ enabled: false, perPeakHour: 2, peakStarts: [m("17:00")], blockMin: 45 }, ["a", "b"]);
    expect(r.get("a")).toEqual([]);
  });

  it("profissional cheio: sugere outros perto do horário desejado", () => {
    const busy = new Map([["rafa", [{ start: m("09:00"), end: m("19:30") }]]]);
    const res = slotsForPreferred({ hours, durationMin: 30, barberIds: ["rafa", "diego", "bruno"], busyByBarber: busy }, "rafa", { aroundTime: m("15:00") });
    expect(res.own).toEqual([m("19:30")]);
    expect(res.alternatives.map((a) => a.barberId).sort()).toEqual(["bruno", "diego"]);
    expect(res.alternatives.every((a) => a.time === m("15:00"))).toBe(true);
  });
});

describe("planos", () => {
  const plan = { id: "p", name: "Clube", price: 169, quotaUses: 4, periodDays: 30 };
  const svc = { id: "s", name: { pt: "Corte" }, durationMin: 40, price: 45, planIds: ["p"] };
  const today = new Date(2026, 9, 20);

  it("classifica em dia, vencendo e vencido conforme o aviso do dono", () => {
    expect(subscriptionStatus({ planId: "p", periodEnd: new Date(2026, 9, 30), usesInPeriod: 0 }, today, 5)).toBe("active");
    expect(subscriptionStatus({ planId: "p", periodEnd: new Date(2026, 9, 24), usesInPeriod: 0 }, today, 5)).toBe("expiring");
    expect(subscriptionStatus({ planId: "p", periodEnd: new Date(2026, 9, 18), usesInPeriod: 0 }, today, 5)).toBe("expired");
  });

  it("pagamento reativa sozinho: vencido recomeça hoje, em dia estende", () => {
    const vencido = applyPayment({ planId: "p", periodEnd: new Date(2026, 9, 18), usesInPeriod: 3 }, plan, today);
    expect(vencido.periodEnd).toEqual(new Date(2026, 10, 19));
    expect(vencido.usesInPeriod).toBe(0);
    const emDia = applyPayment({ planId: "p", periodEnd: new Date(2026, 9, 24), usesInPeriod: 1 }, plan, today);
    expect(emDia.periodEnd).toEqual(new Date(2026, 10, 23));
  });

  it("bloqueia plano vencido, cota usada e serviço fora do plano", () => {
    expect(canUsePlan({ planId: "p", periodEnd: new Date(2026, 9, 18), usesInPeriod: 0 }, plan, svc, today)).toEqual({ ok: false, reason: "expired" });
    expect(canUsePlan({ planId: "p", periodEnd: new Date(2026, 9, 18), usesInPeriod: 0 }, plan, svc, today, false)).toEqual({ ok: true });
    expect(canUsePlan({ planId: "p", periodEnd: new Date(2026, 9, 30), usesInPeriod: 4 }, plan, svc, today)).toEqual({ ok: false, reason: "quota_used" });
    expect(canUsePlan({ planId: "p", periodEnd: new Date(2026, 9, 30), usesInPeriod: 0 }, plan, { ...svc, planIds: [] }, today)).toEqual({ ok: false, reason: "not_covered" });
  });
});

describe("comissão de plano", () => {
  const visit = (usesInCycle: number): PlanVisit => ({ serviceId: "s4", servicePrice: 85, planPrice: 169, quotaUses: 4, usesInCycle });

  it("rateio pelo uso nunca passa do valor do plano", () => {
    for (const uses of [1, 3, 8]) {
      const perVisit = planVisitValue(visit(uses), DEFAULT_RULES);
      expect(perVisit * uses).toBeCloseTo(169 * 0.45);
    }
  });

  it("divisão pela cota usa a cota fixa", () => {
    expect(planVisitValue(visit(3), { ...DEFAULT_RULES, planModel: "quota_split" })).toBeCloseTo((169 / 4) * 0.45);
  });

  it("preço de tabela e valor fixo", () => {
    expect(planVisitValue(visit(3), { ...DEFAULT_RULES, planModel: "list_price" })).toBeCloseTo(34);
    expect(planVisitValue(visit(3), { ...DEFAULT_RULES, planModel: "fixed" })).toBe(18);
  });
});

describe("comissão do mês", () => {
  const period = {
    sales: [
      { serviceId: "s1", amount: 1000, cardAmount: 500 },
      { serviceId: "s7", amount: 190, cardAmount: 0 },
    ],
    planVisits: [{ serviceId: "s4", servicePrice: 85, planPrice: 169, quotaUses: 4, usesInCycle: 2 }],
    productSales: 300,
    plansSold: [{ firstPayment: 169 }],
  };

  it("aplica exceção por serviço, produtos, bônus de venda e taxa de cartão", () => {
    const r = computeCommission({ kind: "commission", pct: 45 }, period, { ...DEFAULT_RULES, serviceOverrides: { s7: 30 } });
    const line = (k: string) => r.lines.find((l) => l.key === k)?.amount;
    expect(line("services")).toBeCloseTo(450 + 57);
    expect(line("plan_visits")).toBeCloseTo((169 / 2) * 0.45, 1);
    expect(line("products")).toBe(30);
    expect(line("plan_sale_bonus")).toBeCloseTo(16.9);
    expect(line("card_fee")).toBeCloseTo(-(500 * 0.45 * 0.032));
  });

  it("meta escalonada usa o maior degrau atingido e a garantia mínima completa o valor", () => {
    const rules = { ...DEFAULT_RULES, deductCardFee: false, tiers: [{ above: 500, extraPct: 3 }, { above: 1000, extraPct: 5 }], monthlyFloor: 2000 };
    const r = computeCommission({ kind: "commission", pct: 45 }, period, rules);
    expect(r.lines.find((l) => l.key === "tier_bonus")!.amount).toBeCloseTo(1190 * 0.05);
    expect(r.total).toBe(2000);
    expect(r.lines.some((l) => l.key === "floor")).toBe(true);
  });

  it("cadeira alugada: barbeiro fica com o faturamento e paga o aluguel", () => {
    const r = computeCommission({ kind: "chair_rent", monthlyRent: 1000 }, period, DEFAULT_RULES);
    expect(r.total).toBeCloseTo(1190 + 84.5 - 1000);
  });
});

describe("reagendamento automático", () => {
  it("mesmo barbeiro, horário mais próximo, pulando domingo", () => {
    const sat = new Date(2026, 9, 17); // sábado
    const s = suggestRebook(
      { date: sat, start: m("15:30"), barberId: "rafa", serviceId: "s4" },
      8, // cairia no domingo 25
      (d) => d.getDay() !== 0,
      (b) => (b === "rafa" ? [m("14:00"), m("16:00")] : []),
      ["diego"],
    );
    expect(s!.date).toEqual(new Date(2026, 9, 26));
    expect(s!.start).toBe(m("16:00"));
    expect(s!.barberId).toBe("rafa");
  });

  it("profissional cheio: usa outro", () => {
    const s = suggestRebook({ date: new Date(2026, 9, 20), start: m("15:30"), barberId: "rafa", serviceId: "s4" }, 7, () => true, (b) => (b === "diego" ? [m("15:15")] : []), ["diego"]);
    expect(s!.barberId).toBe("diego");
  });
});

describe("mensagens", () => {
  it("preenche variáveis e mantém as desconhecidas", () => {
    expect(renderTemplate("Oi {nome}, {x}", { nome: "Marcos" })).toBe("Oi Marcos, {x}");
  });
  it("calcula o momento do lembrete", () => {
    const t = { id: "1", name: "", trigger: "before_appointment" as const, offset: 2, enabled: true, body: { pt: "" } };
    expect(sendAtForAppointment(t, new Date("2026-10-21T15:30:00Z"), new Date("2026-10-21T16:40:00Z"))!.toISOString()).toBe("2026-10-21T13:30:00.000Z");
  });
});
