import { Minutes } from "./types";

export interface LastVisit {
  date: Date;
  start: Minutes;
  barberId: string;
  serviceId: string;
}

export interface RebookSuggestion {
  date: Date;
  start: Minutes;
  barberId: string;
  serviceId: string;
}

/**
 * Depois que um assinante é atendido, sugere o próximo horário:
 * mesmo profissional e horário mais parecido, `daysAhead` dias depois.
 * Se o dia estiver fechado, pula para o próximo aberto. Se o profissional estiver cheio, tenta os outros.
 */
export function suggestRebook(
  last: LastVisit,
  daysAhead: number,
  isOpen: (d: Date) => boolean,
  slotsFor: (barberId: string, d: Date) => Minutes[],
  otherBarbers: string[],
  maxDaysToTry = 7,
): RebookSuggestion | null {
  let d = new Date(last.date.getFullYear(), last.date.getMonth(), last.date.getDate() + daysAhead);
  for (let tries = 0; tries < maxDaysToTry; tries++, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!isOpen(d)) continue;
    for (const barberId of [last.barberId, ...otherBarbers.filter((b) => b !== last.barberId)]) {
      const slots = slotsFor(barberId, d);
      if (!slots.length) continue;
      const start = slots.reduce((best, t) => (Math.abs(t - last.start) < Math.abs(best - last.start) ? t : best));
      return { date: d, start, barberId, serviceId: last.serviceId };
    }
  }
  return null;
}
