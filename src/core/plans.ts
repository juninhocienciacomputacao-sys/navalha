import { Plan, Service } from "./types";

export interface Subscription {
  planId: string;
  /** Fim do ciclo pago atual (data, sem hora). */
  periodEnd: Date;
  usesInPeriod: number;
}

export type SubscriptionStatus = "active" | "expiring" | "expired";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const daysUntil = (end: Date, today: Date) =>
  Math.round((startOfDay(end).getTime() - startOfDay(today).getTime()) / DAY);

/** `alertDays`: quantos dias antes do vencimento o painel começa a avisar (definido pelo dono). */
export function subscriptionStatus(sub: Subscription, today: Date, alertDays: number): SubscriptionStatus {
  const left = daysUntil(sub.periodEnd, today);
  if (left < 0) return "expired";
  if (left <= alertDays) return "expiring";
  return "active";
}

/**
 * Pagamento confirmado: o plano volta a valer sozinho.
 * Plano vencido recomeça na data do pagamento; plano em dia estende a partir do fim atual.
 */
export function applyPayment(sub: Subscription, plan: Plan, paidAt: Date): Subscription {
  const expired = daysUntil(sub.periodEnd, paidAt) < 0;
  const base = expired ? startOfDay(paidAt) : startOfDay(sub.periodEnd);
  return { ...sub, periodEnd: new Date(base.getTime() + plan.periodDays * DAY), usesInPeriod: 0 };
}

export type PlanUseCheck =
  | { ok: true }
  | { ok: false; reason: "not_covered" | "expired" | "quota_used" };

/** O plano cobre este atendimento agora? Com `blockExpired`, plano vencido não cobre nada. */
export function canUsePlan(
  sub: Subscription,
  plan: Plan,
  service: Service,
  today: Date,
  blockExpired = true,
): PlanUseCheck {
  if (!service.planIds.includes(plan.id)) return { ok: false, reason: "not_covered" };
  if (blockExpired && daysUntil(sub.periodEnd, today) < 0) return { ok: false, reason: "expired" };
  if (plan.quotaUses !== null && sub.usesInPeriod >= plan.quotaUses) return { ok: false, reason: "quota_used" };
  return { ok: true };
}
