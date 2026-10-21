import { freeSlots, type DayHours } from "./slots";
import { overlaps, type Interval, type Minutes } from "./types";

export interface ReserveBlock extends Interval {
  barberId: string;
}

/** Blocos guardados para encaixe que continuam vazios (nenhum atendimento por cima). */
export function openReserves(reserves: Map<string, Interval[]>, busyByBarber: Map<string, Interval[]>): ReserveBlock[] {
  const out: ReserveBlock[] = [];
  for (const [barberId, list] of reserves) {
    const busy = busyByBarber.get(barberId) ?? [];
    for (const r of list) if (!busy.some((b) => overlaps(r, b))) out.push({ barberId, ...r });
  }
  return out.sort((a, b) => a.start - b.start || a.barberId.localeCompare(b.barberId));
}

/** Janelas livres de um barbeiro (do `notBefore` até fechar), com pelo menos `minLen` minutos. */
export function freeGaps(hours: DayHours, busy: Interval[], notBefore: Minutes, minLen: number): Interval[] {
  const start = Math.max(hours.open, Math.ceil(notBefore / hours.step) * hours.step);
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  let t = start;
  for (const b of sorted) {
    if (b.end <= t) continue;
    if (b.start >= hours.close) break;
    if (b.start - t >= minLen) out.push({ start: t, end: Math.min(b.start, hours.close) });
    t = Math.max(t, b.end);
  }
  if (hours.close - t >= minLen) out.push({ start: t, end: hours.close });
  return out;
}

export interface WalkInFitInput {
  hours: DayHours;
  durationMin: number;
  barberIds: string[];
  /** Atendimentos de verdade (os blocos de encaixe NÃO entram aqui: eles existem justamente para isso). */
  busyByBarber: Map<string, Interval[]>;
  reserves?: Map<string, Interval[]>;
  notBefore: Minutes;
}

export interface WalkInFit {
  barberId: string;
  time: Minutes;
  /** O horário cai num bloco guardado para encaixe. */
  reserved: boolean;
}

/**
 * Primeiro horário para quem chegou sem marcar, com qualquer barbeiro.
 * Vale o mais cedo; no empate, prefere o bloco guardado para encaixe e depois quem está com a agenda mais leve.
 */
export function firstWalkInFit(input: WalkInFitInput): WalkInFit | null {
  let best: (WalkInFit & { load: number }) | null = null;
  for (const barberId of input.barberIds) {
    const busy = input.busyByBarber.get(barberId) ?? [];
    const [time] = freeSlots({ hours: input.hours, busy, durationMin: input.durationMin, notBefore: input.notBefore });
    if (time === undefined) continue;
    const slot = { start: time, end: time + input.durationMin };
    const reserved = (input.reserves?.get(barberId) ?? []).some((r) => overlaps(r, slot));
    const load = busy.reduce((t, b) => t + (b.end - b.start), 0);
    const better = !best || time < best.time || (time === best.time && (
      (reserved && !best.reserved) || (reserved === best.reserved && load < best.load)));
    if (better) best = { barberId, time, reserved, load };
  }
  return best && { barberId: best.barberId, time: best.time, reserved: best.reserved };
}

/**
 * Previsão para a fila inteira: encaixa cada pessoa, na ordem de chegada,
 * como se as anteriores já tivessem sido chamadas.
 */
export function planQueue(input: Omit<WalkInFitInput, "durationMin">, durations: number[]): (WalkInFit | null)[] {
  const busy = new Map([...input.busyByBarber].map(([k, v]) => [k, [...v]]));
  return durations.map((durationMin) => {
    const fit = firstWalkInFit({ ...input, busyByBarber: busy, durationMin });
    if (fit) {
      if (!busy.has(fit.barberId)) busy.set(fit.barberId, []);
      busy.get(fit.barberId)!.push({ start: fit.time, end: fit.time + durationMin });
    }
    return fit;
  });
}
