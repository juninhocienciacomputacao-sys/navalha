import { Interval, Minutes, overlaps } from "./types";

export interface DayHours {
  open: Minutes;
  close: Minutes;
  /** Intervalo entre horários oferecidos (ex.: 15 min). */
  step: Minutes;
}

/**
 * Encaixes para quem chega sem horário.
 * Em cada hora de pico, `perPeakHour` barbeiros diferentes ficam com um bloco livre,
 * em rodízio para não sobrecarregar sempre os mesmos.
 */
export interface WalkInPolicy {
  enabled: boolean;
  perPeakHour: number;
  peakStarts: Minutes[];
  blockMin: number;
}

export function walkInReserves(policy: WalkInPolicy, barberIds: string[]): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>(barberIds.map((id) => [id, []]));
  if (!policy.enabled || barberIds.length === 0) return out;
  const per = Math.min(policy.perPeakHour, barberIds.length);
  policy.peakStarts.forEach((start, k) => {
    for (let w = 0; w < per; w++) {
      const id = barberIds[(k * per + w) % barberIds.length];
      out.get(id)!.push({ start, end: start + policy.blockMin });
    }
  });
  return out;
}

export interface FreeSlotsInput {
  hours: DayHours;
  busy: Interval[];
  durationMin: number;
  /** Não oferecer horários antes disso (ex.: agora + antecedência mínima). */
  notBefore?: Minutes;
}

/** Horários em que o serviço cabe inteiro, sem bater em nada ocupado. */
export function freeSlots({ hours, busy, durationMin, notBefore = 0 }: FreeSlotsInput): Minutes[] {
  const out: Minutes[] = [];
  const first = Math.max(hours.open, Math.ceil(notBefore / hours.step) * hours.step);
  for (let t = first; t + durationMin <= hours.close; t += hours.step) {
    const slot = { start: t, end: t + durationMin };
    if (!busy.some((b) => overlaps(slot, b))) out.push(t);
  }
  return out;
}

export interface AvailabilityInput {
  hours: DayHours;
  durationMin: number;
  barberIds: string[];
  busyByBarber: Map<string, Interval[]>;
  reserves?: Map<string, Interval[]>;
  notBefore?: Minutes;
}

export interface SlotOption {
  time: Minutes;
  barberIds: string[];
}

/** Para cada horário, quais profissionais estão livres. Encaixes reservados contam como ocupados. */
export function availability(input: AvailabilityInput): SlotOption[] {
  const byTime = new Map<Minutes, string[]>();
  for (const id of input.barberIds) {
    const busy = [...(input.busyByBarber.get(id) ?? []), ...(input.reserves?.get(id) ?? [])];
    for (const t of freeSlots({ hours: input.hours, busy, durationMin: input.durationMin, notBefore: input.notBefore })) {
      byTime.set(t, [...(byTime.get(t) ?? []), id]);
    }
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, barberIds]) => ({ time, barberIds }));
}

export interface PreferredResult {
  own: Minutes[];
  /** Preenchido quando o profissional escolhido tem poucos horários. */
  alternatives: { time: Minutes; barberId: string }[];
}

/**
 * Horários do profissional que o cliente escolheu. Se forem poucos,
 * sugere os horários mais próximos com outros profissionais.
 */
export function slotsForPreferred(
  input: AvailabilityInput,
  preferredId: string,
  options: { fewThreshold?: number; maxAlternatives?: number; aroundTime?: Minutes } = {},
): PreferredResult {
  const { fewThreshold = 5, maxAlternatives = 4 } = options;
  const all = availability(input);
  const own = all.filter((s) => s.barberIds.includes(preferredId)).map((s) => s.time);
  if (own.length >= fewThreshold) return { own, alternatives: [] };
  const target = options.aroundTime ?? own[0] ?? input.hours.open;
  const alternatives = all
    .flatMap((s) => s.barberIds.filter((b) => b !== preferredId).map((barberId) => ({ time: s.time, barberId })))
    .sort((a, b) => Math.abs(a.time - target) - Math.abs(b.time - target) || a.time - b.time)
    .filter((alt, i, arr) => arr.findIndex((x) => x.barberId === alt.barberId) === i)
    .slice(0, maxAlternatives)
    .sort((a, b) => a.time - b.time);
  return { own, alternatives };
}
