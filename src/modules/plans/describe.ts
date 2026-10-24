// Regras do plano em frases curtas (painel e app do cliente, PT/EN/ES). Sem servidor.
import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import type { PlanBlock, PlanRules } from "@/core/plan-rules";
import { locale } from "@/i18n";

const T = {
  pt: {
    every: "1 uso a cada {n} dias", days: "Vale {d}", weekdays: "de segunda a sexta", hours: "Das {a} às {b}", barbers: "Com {b}",
    block: "Fora da regra não marca", charge: "Fora da regra cobra avulso", exclusive: "Exclusivo", spots: "{n} vagas",
    too_soon: "o plano libera um novo uso em {d}", weekday: "o plano não vale neste dia", hours_r: "o plano vale das {a} às {b}",
    barber: "o plano vale só com {b}", quota_used: "os usos deste ciclo acabaram", expired: "o plano está vencido", not_covered: "serviço fora do plano",
    and: " e ",
  },
  en: {
    every: "1 visit every {n} days", days: "Valid {d}", weekdays: "Monday to Friday", hours: "From {a} to {b}", barbers: "With {b}",
    block: "Outside the rules: not bookable", charge: "Outside the rules: regular price", exclusive: "Exclusive", spots: "{n} spots",
    too_soon: "your plan allows a new visit on {d}", weekday: "your plan isn't valid on this day", hours_r: "your plan is valid from {a} to {b}",
    barber: "your plan is only valid with {b}", quota_used: "you've used all visits this cycle", expired: "your plan has expired", not_covered: "service not in your plan",
    and: " and ",
  },
  es: {
    every: "1 uso cada {n} días", days: "Vale {d}", weekdays: "de lunes a viernes", hours: "De {a} a {b}", barbers: "Con {b}",
    block: "Fuera de la regla no se reserva", charge: "Fuera de la regla se cobra aparte", exclusive: "Exclusivo", spots: "{n} cupos",
    too_soon: "tu plan libera un nuevo uso el {d}", weekday: "tu plan no vale este día", hours_r: "tu plan vale de {a} a {b}",
    barber: "tu plan vale solo con {b}", quota_used: "ya usaste las visitas de este ciclo", expired: "tu plan está vencido", not_covered: "servicio fuera del plan",
    and: " y ",
  },
} as const;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** "seg, ter e qua" no idioma. 2026-10-25 é domingo. */
export function weekdayList(days: number[], lang: Lang): string {
  const t = T[lang] ?? T.pt;
  const sorted = [...days].sort();
  if (sorted.join() === "1,2,3,4,5") return t.weekdays;
  const names = sorted.map((d) => new Date(Date.UTC(2026, 9, 25 + d, 12)).toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" }).replace(".", ""));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")}${t.and}${names.at(-1)}` : names[0] ?? "";
}

const shortDay = (d: string, lang: Lang) =>
  new Date(d + "T12:00:00Z").toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(/\./g, "");

/** Frases das regras de uso (sem cota e serviços, que já aparecem em outro lugar). */
export function ruleLines(r: PlanRules, lang: Lang, barberName: (id: string) => string | undefined, opts: { owner?: boolean } = {}): string[] {
  const t = T[lang] ?? T.pt;
  const out: string[] = [];
  if (r.minDaysBetween) out.push(fill(t.every, { n: String(r.minDaysBetween) }));
  if (r.weekdays) out.push(fill(t.days, { d: weekdayList(r.weekdays, lang) }));
  if (r.hours) out.push(fill(t.hours, { a: toHHMM(r.hours.start), b: toHHMM(r.hours.end) }));
  if (r.barberIds) out.push(fill(t.barbers, { b: r.barberIds.map(barberName).filter(Boolean).join(", ") }));
  if (opts.owner) {
    if (out.length) out.push(r.onLimit === "block" ? t.block : t.charge);
    if (r.maxSubscribers) out.push(fill(t.spots, { n: String(r.maxSubscribers) }));
  }
  return out;
}

/** Por que o plano não cobre este horário, para o cliente. */
export function blockReason(reason: PlanBlock, r: PlanRules, lang: Lang, barberName: (id: string) => string | undefined, nextDay?: string): string {
  const t = T[lang] ?? T.pt;
  switch (reason) {
    case "too_soon": return fill(t.too_soon, { d: nextDay ? shortDay(nextDay, lang) : "" });
    case "weekday": return r.weekdays ? `${t.weekday} (${weekdayList(r.weekdays, lang)})` : t.weekday;
    case "hours": return r.hours ? fill(t.hours_r, { a: toHHMM(r.hours.start), b: toHHMM(r.hours.end) }) : t.weekday;
    case "barber": return fill(t.barber, { b: (r.barberIds ?? []).map(barberName).filter(Boolean).join(", ") });
    case "quota_used": return t.quota_used;
    case "expired": return t.expired;
    default: return t.not_covered;
  }
}
