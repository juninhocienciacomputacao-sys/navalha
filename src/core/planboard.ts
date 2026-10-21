// Regras das telas de Clientes e Planos. Datas de ciclo são dias "AAAA-MM-DD" no fuso da barbearia.
import { applyPayment, daysUntil } from "./plans";
import type { Plan } from "./types";

/** "2026-10-20" → meia-noite local (o formato que `plans.ts` usa). */
export function dayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Meia-noite local → "AAAA-MM-DD". Soma 12 h para não errar o dia em troca de horário de verão. */
export function dateToDay(d: Date): string {
  const x = new Date(d.getTime() + 12 * 3_600_000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Dias entre hoje e o fim do ciclo (negativo = vencido). */
export const daysLeft = (periodEnd: string, today: string) => daysUntil(dayToDate(periodEnd), dayToDate(today));

export interface Cycle { periodStart: string; periodEnd: string; usesInPeriod: number }

/**
 * Pagamento do plano: vencido recomeça no dia do pagamento; em dia estende a partir do fim atual.
 * O início do ciclo só muda quando estava vencido (assim a agenda continua reconhecendo o plano hoje).
 */
export function renewOnPayment(sub: Cycle, plan: Plan, paidDay: string): Cycle {
  const expired = daysLeft(sub.periodEnd, paidDay) < 0;
  const next = applyPayment({ planId: plan.id, periodEnd: dayToDate(sub.periodEnd), usesInPeriod: sub.usesInPeriod }, plan, dayToDate(paidDay));
  return { periodStart: expired ? paidDay : sub.periodStart, periodEnd: dateToDay(next.periodEnd), usesInPeriod: next.usesInPeriod };
}

/** Primeiro ciclo de um plano vendido hoje. */
export function firstCycle(plan: Plan, today: string): Cycle {
  return { periodStart: today, periodEnd: dateToDay(new Date(dayToDate(today).getTime() + plan.periodDays * 86_400_000)), usesInPeriod: 0 };
}

/** Quanto o plano rende por mês (planos de ciclo diferente de 30 dias são convertidos). */
export const monthlyValue = (price: number, periodDays: number) => (periodDays > 0 ? (price * 30) / periodDays : 0);

export type SubFilter = "attention" | "expired" | "ok" | "all";

export function subMatches(left: number, alertDays: number, f: SubFilter): boolean {
  if (f === "attention") return left <= alertDays;
  if (f === "expired") return left < 0;
  if (f === "ok") return left > alertDays;
  return true;
}

export type ClientFilter = "all" | "subscribers" | "away" | "new" | "noshow";

export interface ClientFacts { lastVisit: string | null; createdAt: string; subscriber: boolean; noShows: number }

/** `awayDays`: depois de quantos dias sem vir o cliente conta como sumido (e até quantos dias de cadastro é novo). */
export function clientMatches(c: ClientFacts, today: string, f: ClientFilter, awayDays = 30): boolean {
  if (f === "subscribers") return c.subscriber;
  if (f === "noshow") return c.noShows > 0;
  if (f === "new") return -daysLeft(c.createdAt, today) <= awayDays;
  if (f === "away") return -daysLeft(c.lastVisit ?? c.createdAt, today) > awayDays;
  return true;
}

/** Busca por nome (sem acento, sem maiúscula) ou por pedaço do telefone. */
export function matchesQuery(name: string, phone: string, q: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const text = norm(q.trim());
  if (!text) return true;
  const digits = q.replace(/\D/g, "");
  return norm(name).includes(text) || (digits.length >= 2 && phone.replace(/\D/g, "").includes(digits));
}

/** Link wa.me com mensagem pronta. */
export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Texto de aviso de vencimento do plano. */
export function expiryMessage(o: { clientName: string; planName: string; shopName: string; left: number; endLabel: string; price: string }): string {
  const first = o.clientName.trim().split(/\s+/)[0] || o.clientName;
  const when = o.left < 0 ? `venceu em ${o.endLabel}` : o.left === 0 ? "vence hoje" : o.left === 1 ? `vence amanhã (${o.endLabel})` : `vence em ${o.left} dias (${o.endLabel})`;
  return `Oi ${first}! Seu plano ${o.planName} na ${o.shopName} ${when}. Para renovar (${o.price}) é só pagar por Pix, cartão ou no balcão na próxima visita. Qualquer dúvida, responde aqui. 💈`;
}
