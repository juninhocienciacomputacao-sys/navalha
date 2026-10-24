// Regras de uso dos planos (definidas pelo dono) e limite de agendamentos por cliente.
// Funções puras: as mesmas regras valem no app do cliente, no painel e (repetidas em SQL) no banco.
import type { Minutes, Plan } from "./types";
import { overlaps } from "./types";

export interface PlanRules {
  /** Dias mínimos entre dois usos do plano (ex.: 7 = no máximo um uso por semana). `null` = sem intervalo. */
  minDaysBetween: number | null;
  /** Dias da semana em que o plano vale (0 = domingo). `null` = todos. */
  weekdays: number[] | null;
  /** O atendimento precisa começar dentro desta faixa (minutos do dia). `null` = qualquer horário. */
  hours: { start: Minutes; end: Minutes } | null;
  /** Só estes barbeiros atendem pelo plano. `null` = todos. */
  barberIds: string[] | null;
  /** Quando o plano não cobre por uma regra (cota, intervalo, dia, horário, barbeiro): cobrar avulso ou não deixar marcar. */
  onLimit: "charge" | "block";
  /** Plano exclusivo: não aparece no app do cliente, só a equipe vende. */
  exclusive: boolean;
  /** Vagas: máximo de assinantes ao mesmo tempo. `null` = sem limite. */
  maxSubscribers: number | null;
  /** Frase curta que aparece para o cliente (ex.: "Para quem corta toda semana"). */
  description: string | null;
}

export const DEFAULT_RULES: PlanRules = {
  minDaysBetween: null, weekdays: null, hours: null, barberIds: null,
  onLimit: "charge", exclusive: false, maxSubscribers: null, description: null,
};

/** Regras completas de um plano (o que não foi definido usa o padrão: sem restrição). */
export const rulesOf = (p: Pick<Plan, "rules">): PlanRules => ({ ...DEFAULT_RULES, ...(p.rules ?? {}) });

/** O plano tem alguma restrição de uso além da cota? */
export const hasUseRules = (r: PlanRules) => Boolean(r.minDaysBetween || r.weekdays || r.hours || r.barberIds);

export type PlanBlock = "not_covered" | "expired" | "quota_used" | "too_soon" | "weekday" | "hours" | "barber";

export type PlanCheck =
  | { ok: true }
  | { ok: false; reason: PlanBlock; /** Para "too_soon": primeiro dia em que o plano volta a valer. */ nextDay?: string; /** A regra manda bloquear (não só cobrar). */ block: boolean };

const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(d + "T00:00:00Z") / DAY);
const fromNum = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const weekdayOf = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();

export interface PlanUseInput {
  plan: Plan;
  /** O serviço está entre os que o plano cobre. */
  covers: boolean;
  /** Último dia do ciclo pago (AAAA-MM-DD). */
  periodEnd: string;
  usesInPeriod: number;
  /** Dias (AAAA-MM-DD) dos outros usos desta assinatura, sem cancelados e faltas (passados e já marcados). */
  useDays: string[];
  /** Plano vencido não cobre nada (configuração da barbearia). */
  blockExpired?: boolean;
}

export interface Slot {
  day: string;
  start: Minutes;
  barberId: string;
}

/**
 * O plano cobre este horário?
 * "not_covered" e "expired" nunca bloqueiam (o cliente paga avulso, como sempre).
 * As outras razões bloqueiam só se o dono escolheu "não deixar marcar".
 */
export function checkPlanUse(u: PlanUseInput, s: Slot): PlanCheck {
  const r = rulesOf(u.plan);
  const no = (reason: PlanBlock, extra: { nextDay?: string } = {}): PlanCheck =>
    ({ ok: false, reason, block: reason !== "not_covered" && reason !== "expired" && r.onLimit === "block", ...extra });
  if (!u.covers) return no("not_covered");
  if ((u.blockExpired ?? true) && s.day > u.periodEnd) return no("expired");
  if (u.plan.quotaUses !== null && u.usesInPeriod >= u.plan.quotaUses) return no("quota_used");
  if (r.weekdays && !r.weekdays.includes(weekdayOf(s.day))) return no("weekday");
  if (r.hours && (s.start < r.hours.start || s.start >= r.hours.end)) return no("hours");
  if (r.barberIds && !r.barberIds.includes(s.barberId)) return no("barber");
  if (r.minDaysBetween) {
    const target = dayNum(s.day);
    const near = u.useDays.map(dayNum).filter((d) => Math.abs(d - target) < r.minDaysBetween!);
    if (near.length) return no("too_soon", { nextDay: fromNum(Math.max(...near) + r.minDaysBetween) });
  }
  return { ok: true };
}

/** Primeiro dia (a partir de `from`) em que o intervalo mínimo libera um novo uso. */
export function nextUseDay(plan: Plan, useDays: string[], from: string): string {
  const min = rulesOf(plan).minDaysBetween;
  if (!min || !useDays.length) return from;
  const last = Math.max(...useDays.map(dayNum));
  return fromNum(Math.max(dayNum(from), last + min));
}

// ---------------------------------------------------------------- limite de agendamentos do cliente

export interface BookingLimit {
  on: boolean;
  /** Quantos horários futuros o cliente pode ter marcados ao mesmo tempo. */
  maxUpcoming: number;
  /** No máximo um horário por dia. */
  onePerDay: boolean;
}

export const DEFAULT_BOOKING_LIMIT: BookingLimit = { on: true, maxUpcoming: 1, onePerDay: true };

export interface OpenAppt {
  day: string;
  start: Minutes;
  end: Minutes;
}

export type LimitCheck = { ok: true } | { ok: false; reason: "overlap" | "same_day" | "max_upcoming"; with: OpenAppt };

/**
 * O cliente pode marcar mais este horário?
 * `open`: horários futuros dele ainda em aberto (marcados ou confirmados).
 * Dois horários ao mesmo tempo nunca passam com o limite ligado.
 */
export function checkBookingLimit(limit: BookingLimit, open: OpenAppt[], next: OpenAppt): LimitCheck {
  if (!limit.on || !open.length) return { ok: true };
  const clash = open.find((a) => a.day === next.day && overlaps(a, next));
  if (clash) return { ok: false, reason: "overlap", with: clash };
  const sameDay = limit.onePerDay && open.find((a) => a.day === next.day);
  if (sameDay) return { ok: false, reason: "same_day", with: sameDay };
  if (open.length >= limit.maxUpcoming) {
    const first = [...open].sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)[0];
    return { ok: false, reason: "max_upcoming", with: first };
  }
  return { ok: true };
}
