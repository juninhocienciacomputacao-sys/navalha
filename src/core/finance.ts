/**
 * Regras do financeiro: períodos de pagamento, extrato de comissão a partir dos atendimentos,
 * contas fixas e variáveis (vencimento e pagamento) e receita do mês.
 * Datas são dias "AAAA-MM-DD" e meses "AAAA-MM" já no fuso da barbearia.
 */
import { computeCommission, type BarberPay, type BarberPeriod, type CommissionResult, type CommissionRules, type PlanVisit } from "./commission";
import { addDays, weekday } from "./time";

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_MS = 86_400_000;

// ---------- períodos ----------

export type PayoutPeriod = "weekly" | "biweekly" | "monthly";

/** Intervalo de dias, inclusive nas duas pontas. */
export interface DayRange {
  start: string;
  end: string;
}

export const monthOf = (day: string) => day.slice(0, 7);

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const monthRange = (month: string): DayRange => ({ start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` });

/** Diferença em dias entre dois AAAA-MM-DD (b - a). */
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY_MS);

/** Semana de segunda a domingo; quinzena de 1 a 15 e de 16 ao fim do mês; ou o mês inteiro. */
export function periodRange(kind: PayoutPeriod, day: string): DayRange {
  if (kind === "weekly") {
    const start = addDays(day, -((weekday(day) + 6) % 7));
    return { start, end: addDays(start, 6) };
  }
  const month = monthOf(day);
  const r = monthRange(month);
  if (kind === "monthly") return r;
  return Number(day.slice(8)) <= 15 ? { start: r.start, end: `${month}-15` } : { start: `${month}-16`, end: r.end };
}

/** Período anterior (n < 0) ou seguinte (n > 0). */
export function shiftPeriod(kind: PayoutPeriod, r: DayRange, n: number): DayRange {
  let cur = r;
  for (let i = 0; i < Math.abs(n); i++) cur = periodRange(kind, n < 0 ? addDays(cur.start, -1) : addDays(cur.end, 1));
  return cur;
}

/** Que fração de um mês o período representa (semana ≈ 0,23; mês = 1). */
export function periodFraction(r: DayRange): number {
  return Math.min(1, (dayDiff(r.start, r.end) + 1) / daysInMonth(monthOf(r.start)));
}

/**
 * Metas, garantia mínima e aluguel de cadeira são mensais.
 * Num fechamento semanal ou quinzenal eles valem proporcionalmente ao tamanho do período.
 */
export function rulesForPeriod(rules: CommissionRules, fraction: number): CommissionRules {
  if (fraction >= 1) return rules;
  return {
    ...rules,
    monthlyFloor: rules.monthlyFloor * fraction,
    tiers: rules.tiers.map((t) => ({ ...t, above: t.above * fraction })),
  };
}

export function payForPeriod(pay: BarberPay, fraction: number): BarberPay {
  return pay.kind === "chair_rent" && fraction < 1 ? { ...pay, monthlyRent: pay.monthlyRent * fraction } : pay;
}

// ---------- extrato de comissão ----------

/** Atendimento concluído. */
export interface DoneVisit {
  id: string;
  barberId: string;
  serviceId: string;
  /** Preço de tabela do serviço. */
  servicePrice: number;
  /** Quanto foi cobrado (0 quando coberto pelo plano). */
  price: number;
  startsAt: Date;
  subscriptionId: string | null;
}

export interface SubscriptionCycle {
  id: string;
  planPrice: number;
  quotaUses: number | null;
  periodDays: number;
  /** Início de um ciclo conhecido (os outros ciclos são contados a partir dele). */
  periodStart: Date;
}

/** Início e fim (ms) do ciclo da assinatura que contém `at`. */
export function cycleOf(sub: SubscriptionCycle, at: Date): { start: number; end: number } {
  const len = Math.max(1, sub.periodDays) * DAY_MS;
  const k = Math.floor((at.getTime() - sub.periodStart.getTime()) / len);
  const start = sub.periodStart.getTime() + k * len;
  return { start, end: start + len };
}

export interface PlanVisitDetail extends PlanVisit {
  visitId: string;
  subscriptionId: string;
  startsAt: Date;
}

export interface BuildPeriodInput {
  barberId: string;
  /** Todos os atendimentos concluídos (de todos os barbeiros), incluindo antes do período, para contar os usos do ciclo. */
  visits: DoneVisit[];
  subscriptions: Map<string, SubscriptionCycle>;
  from: Date;
  /** Fim do período (exclusivo). */
  to: Date;
  /** Quanto de cada atendimento foi pago com cartão. */
  cardByVisit?: Map<string, number>;
  productSales?: number;
  plansSold?: { firstPayment: number }[];
}

/**
 * Monta o período de um barbeiro para `computeCommission`.
 * - Avulso: atendimento cobrado (preço > 0) sem assinatura.
 * - Plano: atendimento com assinatura. `usesInCycle` conta os usos do cliente no ciclo do plano
 *   (com qualquer barbeiro) até o fim do período. Assim todas as visitas do ciclo dividem o mesmo
 *   valor e, no rateio, a soma nunca passa do valor do plano.
 */
export function buildBarberPeriod(input: BuildPeriodInput): { period: BarberPeriod; planVisits: PlanVisitDetail[] } {
  const { barberId, visits, subscriptions, from, to } = input;
  const inPeriod = visits.filter((v) => v.barberId === barberId && v.startsAt >= from && v.startsAt < to);
  const sales = inPeriod
    .filter((v) => !v.subscriptionId && v.price > 0)
    .map((v) => ({ serviceId: v.serviceId, amount: v.price, cardAmount: Math.min(v.price, input.cardByVisit?.get(v.id) ?? 0) }));

  const planVisits: PlanVisitDetail[] = inPeriod.filter((v) => v.subscriptionId).map((v) => {
    const sub = subscriptions.get(v.subscriptionId!);
    const base = { visitId: v.id, subscriptionId: v.subscriptionId!, startsAt: v.startsAt, serviceId: v.serviceId, servicePrice: v.servicePrice };
    if (!sub) return { ...base, planPrice: 0, quotaUses: null, usesInCycle: 1 };
    const c = cycleOf(sub, v.startsAt);
    const limit = Math.min(c.end, to.getTime());
    const uses = visits.filter((o) => o.subscriptionId === sub.id && o.startsAt.getTime() >= c.start && o.startsAt.getTime() < limit).length;
    return { ...base, planPrice: sub.planPrice, quotaUses: sub.quotaUses, usesInCycle: Math.max(1, uses) };
  });

  return {
    period: { sales, planVisits, productSales: input.productSales ?? 0, plansSold: input.plansSold ?? [] },
    planVisits,
  };
}

export interface Statement {
  barberId: string;
  period: BarberPeriod;
  planVisits: PlanVisitDetail[];
  result: CommissionResult;
}

/** Extrato completo de um barbeiro num período (com metas, garantia e aluguel proporcionais). */
export function barberStatement(input: BuildPeriodInput & { pay: BarberPay; rules: CommissionRules; range: DayRange }): Statement {
  const { period, planVisits } = buildBarberPeriod(input);
  const f = periodFraction(input.range);
  const result = computeCommission(payForPeriod(input.pay, f), period, rulesForPeriod(input.rules, f));
  return { barberId: input.barberId, period, planVisits, result };
}

// ---------- contas (despesas) ----------

export type ExpenseKind = "fixed" | "variable";

export interface Expense {
  id: string;
  name: string;
  category: string;
  kind: ExpenseKind;
  amount: number;
  /** Repete todo mês no dia `dueDay`, a partir do mês de `startsOn`. */
  recurring: boolean;
  dueDay: number | null;
  /** Vencimento da conta avulsa. */
  dueDate: string | null;
  startsOn: string;
  /** Dia em que foi marcada como paga (avulsa) ou a última vez (recorrente). */
  paidOn: string | null;
  /** Recorrente: meses pagos até este (AAAA-MM), inclusive. */
  paidThrough: string | null;
  notes?: string | null;
}

/** Vencimento da conta no mês, ou null se ela não existe nesse mês. Dia 31 vira o último dia em meses curtos. */
export function dueDateIn(e: Expense, month: string): string | null {
  if (!e.recurring) return e.dueDate && monthOf(e.dueDate) === month ? e.dueDate : null;
  if (monthOf(e.startsOn) > month || !e.dueDay) return null;
  return `${month}-${pad(Math.min(e.dueDay, daysInMonth(month)))}`;
}

export function isPaidIn(e: Expense, month: string): boolean {
  return e.recurring ? Boolean(e.paidThrough && e.paidThrough >= month) : Boolean(e.paidOn);
}

export type ExpenseState = "paid" | "overdue" | "due_soon" | "upcoming";

export interface ExpenseInMonth {
  expense: Expense;
  due: string;
  state: ExpenseState;
  /** Dias até o vencimento (negativo = atrasada). */
  daysLeft: number;
}

/** Contas que existem no mês, com a situação de cada uma vista de `today`. */
export function expensesInMonth(list: Expense[], month: string, today: string, alertDays = 5): ExpenseInMonth[] {
  return list.flatMap((e) => {
    const due = dueDateIn(e, month);
    if (!due) return [];
    const daysLeft = dayDiff(today, due);
    const state: ExpenseState = isPaidIn(e, month) ? "paid" : daysLeft < 0 ? "overdue" : daysLeft <= alertDays ? "due_soon" : "upcoming";
    return [{ expense: e, due, state, daysLeft }];
  }).sort((a, b) => Number(a.state === "paid") - Number(b.state === "paid") || a.due.localeCompare(b.due));
}

/** Contas atrasadas ou vencendo nos próximos dias (olha o mês atual e o anterior). */
export function dueAlerts(list: Expense[], today: string, alertDays = 5): ExpenseInMonth[] {
  const month = monthOf(today);
  return [addMonths(month, -1), month]
    .flatMap((m) => expensesInMonth(list, m, today, alertDays))
    .filter((x) => x.state === "overdue" || x.state === "due_soon");
}

export function expenseTotals(items: ExpenseInMonth[]) {
  const fixed = items.filter((x) => x.expense.kind === "fixed").reduce((a, x) => a + x.expense.amount, 0);
  const variable = items.filter((x) => x.expense.kind === "variable").reduce((a, x) => a + x.expense.amount, 0);
  const paid = items.filter((x) => x.state === "paid").reduce((a, x) => a + x.expense.amount, 0);
  return { fixed, variable, total: fixed + variable, paid, open: fixed + variable - paid };
}

/** O que gravar ao marcar (ou desmarcar) a conta como paga naquele mês. */
export function togglePaid(e: Expense, month: string, today: string, paid: boolean): Pick<Expense, "paidOn" | "paidThrough"> {
  if (!e.recurring) return { paidOn: paid ? today : null, paidThrough: null };
  if (paid) return { paidOn: today, paidThrough: e.paidThrough && e.paidThrough > month ? e.paidThrough : month };
  const prev = addMonths(month, -1);
  return { paidOn: e.paidOn, paidThrough: prev >= monthOf(e.startsOn) ? prev : null };
}

// ---------- receita ----------

export type RevenueMethod = "pix" | "card" | "cash" | "unknown";

export interface PaidPayment {
  id: string;
  amount: number;
  method: Exclude<RevenueMethod, "unknown">;
  subscriptionId: string | null;
  appointmentId: string | null;
  paidAt: Date;
}

export interface RevenueRow {
  amount: number;
  method: RevenueMethod;
  kind: "service" | "plan";
  at: Date;
}

/**
 * Receita = pagamentos recebidos. Atendimento avulso concluído sem pagamento registrado
 * também entra (pelo preço cobrado), com forma de pagamento "não informada".
 */
export function revenueRows(payments: PaidPayment[], visits: DoneVisit[]): RevenueRow[] {
  const linked = new Set(payments.map((p) => p.appointmentId).filter(Boolean));
  return [
    ...payments.map((p): RevenueRow => ({ amount: p.amount, method: p.method, kind: p.subscriptionId ? "plan" : "service", at: p.paidAt })),
    ...visits
      .filter((v) => !v.subscriptionId && v.price > 0 && !linked.has(v.id))
      .map((v): RevenueRow => ({ amount: v.price, method: "unknown", kind: "service", at: v.startsAt })),
  ];
}

export function sumBy<T, K extends string>(rows: T[], key: (r: T) => K, value: (r: T) => number): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + value(r);
  return out;
}
