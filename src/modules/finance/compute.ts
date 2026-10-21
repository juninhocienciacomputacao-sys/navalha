// Junta dados e regras: extratos de comissão de um período e o resumo financeiro de um mês.
import type { ShopBundle } from "@/data/types";
import {
  addMonths, barberStatement, expensesInMonth, expenseTotals, monthOf, monthRange, revenueRows, sumBy,
  type DayRange, type Expense, type RevenueMethod, type Statement,
} from "@/core/finance";
import { addDays, atMinutes, dayInZone } from "@/core/time";
import { getRules, listExpenses, listPayouts, loadActivity, payBarbers, type Activity, type PayBarber, type StoredRules } from "./data";

export const rangeDates = (r: DayRange, tz: string) => ({ from: atMinutes(r.start, 0, tz), to: atMinutes(addDays(r.end, 1), 0, tz) });

function statementsFor(act: Activity, barbers: PayBarber[], stored: StoredRules, range: DayRange, tz: string) {
  const { from, to } = rangeDates(range, tz);
  return barbers.map((br) => ({
    barber: br,
    statement: barberStatement({
      barberId: br.id, pay: br.pay, rules: stored.rules, range, from, to,
      visits: act.visits, subscriptions: act.subscriptions, cardByVisit: act.cardByVisit,
      plansSold: act.plansSold.filter((p) => p.barberId === br.id && p.at >= from && p.at < to),
    }),
  }))
    // profissional desativado só aparece se trabalhou no período
    .filter((x) => x.barber.active || x.statement.period.sales.length + x.statement.period.planVisits.length > 0);
}

export interface BarberStatement {
  barber: PayBarber;
  statement: Statement;
  /** Faturamento do período: avulsos + preço de tabela dos atendimentos de plano. */
  turnover: number;
  paidOn: string | null;
}

export async function commissionStatements(b: ShopBundle, range: DayRange) {
  const tz = b.shop.timezone;
  const { from, to } = rangeDates(range, tz);
  const [stored, barbers, act, payouts] = await Promise.all([getRules(b.shop.id), payBarbers(b.shop.id), loadActivity(b, from, to), listPayouts(b, range.start, range.end)]);
  const list: BarberStatement[] = statementsFor(act, barbers, stored, range, tz).map((x) => ({
    ...x,
    turnover: x.statement.period.sales.reduce((a, s) => a + s.amount, 0) + x.statement.period.planVisits.reduce((a, v) => a + v.servicePrice, 0),
    paidOn: payouts.find((p) => p.barberId === x.barber.id)?.paidOn ?? null,
  }));
  return { stored, barbers, list };
}

export interface MonthPoint {
  month: string;
  revenue: number;
  expenses: number;
  commissions: number;
}

export const METHOD_LABEL: Record<RevenueMethod, string> = { pix: "Pix", card: "Cartão", cash: "Dinheiro", unknown: "Não informado" };

/** Resumo de um mês e a série dos 6 meses que terminam nele. */
export async function monthFinance(b: ShopBundle, month: string) {
  const tz = b.shop.timezone;
  const today = dayInZone(new Date(), tz);
  const first = addMonths(month, -5);
  const whole: DayRange = { start: monthRange(first).start, end: monthRange(month).end };
  const { from, to } = rangeDates(whole, tz);
  const [stored, barbers, act, expenses] = await Promise.all([getRules(b.shop.id), payBarbers(b.shop.id), loadActivity(b, from, to), listExpenses(b)]);
  const revenue = revenueRows(act.payments, act.visits.filter((v) => v.startsAt >= from));
  const inMonth = <T extends { at: Date }>(rows: T[], m: string) => rows.filter((r) => monthOf(dayInZone(r.at, tz)) === m);

  const series: MonthPoint[] = [];
  let current: { statements: ReturnType<typeof statementsFor> } | null = null;
  for (let i = 0; i < 6; i++) {
    const m = addMonths(first, i);
    const statements = statementsFor(act, barbers, stored, monthRange(m), tz);
    const exp = expenseTotals(expensesInMonth(expenses, m, today));
    series.push({
      month: m,
      revenue: inMonth(revenue, m).reduce((a, r) => a + r.amount, 0),
      expenses: exp.total,
      commissions: statements.reduce((a, s) => a + Math.max(0, s.statement.result.total), 0),
    });
    if (m === month) current = { statements };
  }

  const rows = inMonth(revenue, month);
  const { from: mFrom, to: mTo } = rangeDates(monthRange(month), tz);
  const done = act.visits.filter((v) => v.startsAt >= mFrom && v.startsAt < mTo);
  const items = expensesInMonth(expenses, month, today);
  return {
    month,
    today,
    series,
    revenue: {
      services: rows.filter((r) => r.kind === "service").reduce((a, r) => a + r.amount, 0),
      plans: rows.filter((r) => r.kind === "plan").reduce((a, r) => a + r.amount, 0),
      byMethod: sumBy(rows, (r) => r.method, (r) => r.amount),
    },
    visits: done.length,
    clients: new Set(done.map((v) => v.clientKey)).size,
    expenses: items,
    totals: expenseTotals(items),
    allExpenses: expenses as Expense[],
    statements: current!.statements,
  };
}
