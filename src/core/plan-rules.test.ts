import { describe, expect, it } from "vitest";
import { checkBookingLimit, checkPlanUse, DEFAULT_BOOKING_LIMIT, nextUseDay } from "./plan-rules";
import type { Plan } from "./types";
import { toMinutes as m } from "./types";

const base: Plan = { id: "p", name: "Clube", price: 90, quotaUses: 4, periodDays: 30 };
const use = (plan: Plan, extra: Partial<Parameters<typeof checkPlanUse>[0]> = {}) =>
  ({ plan, covers: true, periodEnd: "2026-11-20", usesInPeriod: 0, useDays: [], ...extra });
// 2026-10-26 é segunda-feira
const slot = (day = "2026-10-26", start = m("10:00"), barberId = "rafa") => ({ day, start, barberId });

describe("regras de uso do plano", () => {
  it("sem regras: só cota, cobertura e vencimento", () => {
    expect(checkPlanUse(use(base), slot())).toEqual({ ok: true });
    expect(checkPlanUse(use(base, { covers: false }), slot())).toMatchObject({ ok: false, reason: "not_covered", block: false });
    expect(checkPlanUse(use(base, { periodEnd: "2026-10-25" }), slot())).toMatchObject({ ok: false, reason: "expired" });
    expect(checkPlanUse(use(base, { usesInPeriod: 4 }), slot())).toMatchObject({ ok: false, reason: "quota_used", block: false });
  });

  it("intervalo mínimo entre usos olha para trás e para frente", () => {
    const plan = { ...base, rules: { minDaysBetween: 7 } };
    expect(checkPlanUse(use(plan, { useDays: ["2026-10-21"] }), slot())).toEqual({ ok: false, reason: "too_soon", nextDay: "2026-10-28", block: false });
    expect(checkPlanUse(use(plan, { useDays: ["2026-10-19"] }), slot())).toEqual({ ok: true });
    // já tem um uso marcado para dali a 3 dias
    expect(checkPlanUse(use(plan, { useDays: ["2026-10-29"] }), slot())).toMatchObject({ ok: false, reason: "too_soon" });
  });

  it("dias da semana, horário e barbeiros", () => {
    const plan = { ...base, rules: { weekdays: [1, 2, 3, 4], hours: { start: m("09:00"), end: m("17:00") }, barberIds: ["rafa", "leo"] } };
    expect(checkPlanUse(use(plan), slot())).toEqual({ ok: true });
    expect(checkPlanUse(use(plan), slot("2026-10-31"))).toMatchObject({ reason: "weekday" }); // sábado
    expect(checkPlanUse(use(plan), slot(undefined, m("17:00")))).toMatchObject({ reason: "hours" });
    expect(checkPlanUse(use(plan), slot(undefined, undefined, "nina"))).toMatchObject({ reason: "barber" });
  });

  it("o dono escolhe bloquear em vez de cobrar", () => {
    const plan = { ...base, rules: { weekdays: [1], onLimit: "block" as const } };
    expect(checkPlanUse(use(plan), slot("2026-10-27"))).toMatchObject({ reason: "weekday", block: true });
    // serviço fora do plano nunca bloqueia: é pago normalmente
    expect(checkPlanUse(use(plan, { covers: false }), slot("2026-10-27"))).toMatchObject({ block: false });
  });

  it("próximo dia liberado", () => {
    const plan = { ...base, rules: { minDaysBetween: 10 } };
    expect(nextUseDay(plan, ["2026-10-20", "2026-10-05"], "2026-10-24")).toBe("2026-10-30");
    expect(nextUseDay(plan, [], "2026-10-24")).toBe("2026-10-24");
  });
});

describe("limite de agendamentos do cliente", () => {
  const a = { day: "2026-10-26", start: m("10:00"), end: m("10:40") };
  it("um horário por vez (padrão)", () => {
    expect(checkBookingLimit(DEFAULT_BOOKING_LIMIT, [], a)).toEqual({ ok: true });
    expect(checkBookingLimit(DEFAULT_BOOKING_LIMIT, [a], { day: "2026-11-02", start: m("10:00"), end: m("10:40") })).toMatchObject({ reason: "max_upcoming" });
  });
  it("nunca dois ao mesmo tempo, nem dois no mesmo dia se o dono quiser", () => {
    const lim = { on: true, maxUpcoming: 3, onePerDay: true };
    expect(checkBookingLimit(lim, [a], { day: a.day, start: m("10:20"), end: m("10:50") })).toMatchObject({ reason: "overlap" });
    expect(checkBookingLimit(lim, [a], { day: a.day, start: m("15:00"), end: m("15:30") })).toMatchObject({ reason: "same_day" });
    expect(checkBookingLimit({ ...lim, onePerDay: false }, [a], { day: a.day, start: m("15:00"), end: m("15:30") })).toEqual({ ok: true });
    expect(checkBookingLimit({ ...lim, on: false }, [a], a)).toEqual({ ok: true });
  });
});
