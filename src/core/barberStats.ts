import { addDays, atMinutes, dayInZone, minutesInZone, weekday } from "./time";
import { toMinutes } from "./types";

/** Atendimento mínimo para calcular a evolução de um barbeiro. */
export interface StatAppointment {
  barberId: string;
  startsAt: Date;
  endsAt: Date;
  status: "pending" | "confirmed" | "in_service" | "done" | "no_show" | "cancelled";
  price: number;
  /** Minutos reais na cadeira, quando a recepção registrou. Senão usa a duração marcada. */
  actualMinutes?: number | null;
}

export interface WeekStat {
  /** Primeiro dia da semana (AAAA-MM-DD, fuso da barbearia). */
  start: string;
  /** Último dia (inclusive). */
  end: string;
  /** Atendimentos concluídos. */
  appointments: number;
  /** Faturamento avulso (atendimentos de plano entram com preço 0). */
  revenue: number;
  /** Minutos trabalhados (atendimentos concluídos). */
  minutes: number;
  /** Faturamento ÷ atendimentos pagos (avulsos). 0 se não houve. */
  avgTicket: number;
  /** Minutos trabalhados ÷ minutos em que a barbearia esteve aberta (0 a 1). */
  occupancy: number;
  /** Faltas ÷ (concluídos + faltas) (0 a 1). */
  noShowRate: number;
  noShows: number;
  /** Atendimentos concluídos com valor (avulsos). */
  paid: number;
  openMinutes: number;
}

export type OpeningHours = Record<string, { open: string; close: string }>;

/** Minutos de porta aberta num dia; hoje só conta até agora. */
export function openMinutesOn(day: string, hours: OpeningHours, today: string, nowMin: number): number {
  const h = hours[String(weekday(day))];
  if (!h || day > today) return 0;
  const open = toMinutes(h.open);
  const close = day === today ? Math.min(toMinutes(h.close), nowMin) : toMinutes(h.close);
  return Math.max(0, close - open);
}

/**
 * Evolução semanal de cada barbeiro, em janelas de 7 dias que terminam hoje
 * (a última semana é a atual). Ordem: da mais antiga para a mais recente.
 */
export function weeklyStats(input: {
  appointments: StatAppointment[];
  barberIds: string[];
  weeks: number;
  now: Date;
  tz: string;
  openingHours: OpeningHours;
}): Map<string, WeekStat[]> {
  const { appointments, barberIds, weeks, now, tz, openingHours } = input;
  const today = dayInZone(now, tz);
  const nowMin = minutesInZone(now, tz);
  const windows = Array.from({ length: weeks }, (_, i) => {
    const end = addDays(today, -7 * (weeks - 1 - i));
    const start = addDays(end, -6);
    let open = 0;
    for (let d = 0; d < 7; d++) open += openMinutesOn(addDays(start, d), openingHours, today, nowMin);
    return { start, end, open };
  });
  const firstDay = windows[0].start;
  const indexOf = (day: string) => {
    if (day < firstDay || day > today) return -1;
    return windows.findIndex((w) => day >= w.start && day <= w.end);
  };

  const out = new Map<string, WeekStat[]>();
  for (const id of barberIds) {
    out.set(id, windows.map((w) => ({
      start: w.start, end: w.end, appointments: 0, revenue: 0, minutes: 0, avgTicket: 0,
      occupancy: 0, noShowRate: 0, noShows: 0, paid: 0, openMinutes: w.open,
    })));
  }

  for (const a of appointments) {
    const rows = out.get(a.barberId);
    if (!rows) continue;
    if (a.status !== "done" && a.status !== "no_show") continue;
    const k = indexOf(dayInZone(a.startsAt, tz));
    if (k < 0) continue;
    const w = rows[k];
    if (a.status === "no_show") { w.noShows++; continue; }
    w.appointments++;
    w.revenue += a.price;
    w.minutes += a.actualMinutes ?? Math.round((+a.endsAt - +a.startsAt) / 60_000);
    if (a.price > 0) w.paid++;
  }

  for (const rows of out.values()) {
    rows.forEach((w) => {
      w.revenue = Math.round(w.revenue * 100) / 100;
      w.avgTicket = w.paid ? Math.round((w.revenue / w.paid) * 100) / 100 : 0;
      w.occupancy = w.openMinutes ? Math.min(1, w.minutes / w.openMinutes) : 0;
      w.noShowRate = w.appointments + w.noShows ? w.noShows / (w.appointments + w.noShows) : 0;
    });
  }
  return out;
}

/** Soma várias semanas num total (ticket, ocupação e faltas recalculados sobre o total). */
export function totalOf(rows: WeekStat[]): Omit<WeekStat, "start" | "end"> {
  const t = rows.reduce((s, w) => ({
    appointments: s.appointments + w.appointments, revenue: s.revenue + w.revenue, minutes: s.minutes + w.minutes,
    noShows: s.noShows + w.noShows, openMinutes: s.openMinutes + w.openMinutes, paid: s.paid + w.paid,
  }), { appointments: 0, revenue: 0, minutes: 0, noShows: 0, openMinutes: 0, paid: 0 });
  return {
    ...t,
    revenue: Math.round(t.revenue * 100) / 100,
    avgTicket: t.paid ? Math.round((t.revenue / t.paid) * 100) / 100 : 0,
    occupancy: t.openMinutes ? Math.min(1, t.minutes / t.openMinutes) : 0,
    noShowRate: t.appointments + t.noShows ? t.noShows / (t.appointments + t.noShows) : 0,
  };
}

/** Variação da última semana completa contra a anterior (null quando não dá para comparar). */
export function trend(values: number[]): number | null {
  if (values.length < 2) return null;
  const a = values[values.length - 2];
  const b = values[values.length - 1];
  if (!a) return null;
  return b / a - 1;
}

/** Ritmo da meta: quanto do mês já passou e quanto da meta já foi feito. */
export function goalPace(revenueSoFar: number, goal: number, dayOfMonth: number, daysInMonth: number) {
  const done = goal > 0 ? revenueSoFar / goal : 0;
  const expected = dayOfMonth / daysInMonth;
  return { done, expected, onTrack: done >= expected };
}

/** Início do mês corrente no fuso da barbearia. */
export function monthStartIn(now: Date, tz: string): Date {
  return atMinutes(dayInZone(now, tz).slice(0, 8) + "01", 0, tz);
}
