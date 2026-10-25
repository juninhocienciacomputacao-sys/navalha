// Colunas de regras da tabela plans (migração 0014) ↔ PlanRules.
import type { PlanRules } from "@/core/plan-rules";

export const PLAN_RULE_COLUMNS = "min_days_between, weekdays, hours_start, hours_end, barber_ids, on_limit, exclusive, max_subscribers, tagline";

export interface PlanRuleRow {
  min_days_between?: number | null;
  weekdays?: number[] | null;
  hours_start?: number | null;
  hours_end?: number | null;
  barber_ids?: string[] | null;
  on_limit?: string | null;
  exclusive?: boolean | null;
  max_subscribers?: number | null;
  tagline?: string | null;
}

export function rulesFromRow(r: PlanRuleRow): PlanRules {
  return {
    minDaysBetween: r.min_days_between ?? null,
    weekdays: r.weekdays?.length ? r.weekdays : null,
    hours: r.hours_start != null && r.hours_end != null ? { start: r.hours_start, end: r.hours_end } : null,
    barberIds: r.barber_ids?.length ? r.barber_ids : null,
    onLimit: r.on_limit === "block" ? "block" : "charge",
    exclusive: Boolean(r.exclusive),
    maxSubscribers: r.max_subscribers ?? null,
    description: r.tagline?.trim() || null,
  };
}

export function rulesToRow(r: PlanRules): Required<PlanRuleRow> {
  return {
    min_days_between: r.minDaysBetween,
    weekdays: r.weekdays?.length ? r.weekdays : null,
    hours_start: r.hours?.start ?? null,
    hours_end: r.hours?.end ?? null,
    barber_ids: r.barberIds?.length ? r.barberIds : null,
    on_limit: r.onLimit,
    exclusive: r.exclusive,
    max_subscribers: r.maxSubscribers,
    tagline: r.description?.trim() || null,
  };
}
