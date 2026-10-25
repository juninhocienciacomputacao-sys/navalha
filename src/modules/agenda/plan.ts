// Contas da agenda de um dia: horário de funcionamento, ocupação por barbeiro e encaixes.
import { freeSlots, walkInReserves, type DayHours } from "@/core/slots";
import { atMinutes, dayInZone, minutesInZone, weekday } from "@/core/time";
import { toMinutes, overlaps, type Interval, type Minutes } from "@/core/types";
import { firstWalkInFit, openReserves, planQueue, type ReserveBlock, type WalkInFit } from "@/core/walkin";
import type { ShopBundle } from "@/data/types";
import { isLive, listAppointments, type Appt, type QueueEntry } from "./data";
import type { BarberView, DayItem, QueueView, ServiceView } from "./view";

export function dayHours(b: ShopBundle, day: string): DayHours | null {
  const h = b.shop.openingHours[String(weekday(day))];
  return h ? { open: toMinutes(h.open), close: toMinutes(h.close), step: b.shop.slotStepMin } : null;
}

export const dayRange = (b: ShopBundle, day: string) =>
  [atMinutes(day, 0, b.shop.timezone), atMinutes(day, 24 * 60, b.shop.timezone)] as const;

/** Ocupação de cada barbeiro no dia, em minutos do fuso da barbearia. */
export function busyByBarber(b: ShopBundle, appts: Appt[], exceptId?: string) {
  const tz = b.shop.timezone;
  const map = new Map<string, Interval[]>(b.barbers.map((x) => [x.id, []]));
  for (const a of appts) {
    if (a.id === exceptId || !isLive(a.status)) continue;
    map.get(a.barberId)?.push({ start: minutesInZone(a.startsAt, tz), end: minutesInZone(a.endsAt, tz) });
  }
  return map;
}

/** Blocos guardados para encaixe nas horas de pico (só nos dias abertos, dentro do horário). */
export function reservesFor(b: ShopBundle, day: string) {
  const hours = dayHours(b, day);
  const raw = walkInReserves(b.walkIn, b.barbers.map((x) => x.id));
  const out = new Map<string, Interval[]>();
  for (const [id, list] of raw) out.set(id, hours ? list.filter((r) => r.start >= hours.open && r.end <= hours.close) : []);
  return out;
}

export function openReserveBlocks(b: ShopBundle, day: string, appts: Appt[]): ReserveBlock[] {
  return openReserves(reservesFor(b, day), busyByBarber(b, appts));
}

/** "Agora" arredondado para o próximo horário da grade (ou 0 para dias futuros). */
export function notBeforeFor(b: ShopBundle, day: string, now = new Date()): Minutes | null {
  const today = dayInZone(now, b.shop.timezone);
  if (day < today) return null;
  return day === today ? minutesInZone(now, b.shop.timezone) : 0;
}

export interface FreeTime {
  time: Minutes;
  /** Cai num bloco guardado para encaixe. */
  reserved: boolean;
}

/** Horários livres de um barbeiro para um serviço (a recepção pode usar os blocos de encaixe). */
export async function freeTimes(b: ShopBundle, day: string, serviceId: string, barberId: string, exceptId?: string, now = new Date()): Promise<FreeTime[]> {
  const hours = dayHours(b, day);
  const svc = b.services.find((s) => s.id === serviceId);
  const notBefore = notBeforeFor(b, day, now);
  if (!hours || !svc || notBefore === null) return [];
  const appts = await listAppointments(b, ...dayRange(b, day));
  const busy = busyByBarber(b, appts, exceptId).get(barberId) ?? [];
  const reserves = reservesFor(b, day).get(barberId) ?? [];
  return freeSlots({ hours, busy, durationMin: svc.durationMin, notBefore }).map((time) => ({
    time, reserved: reserves.some((r) => overlaps(r, { start: time, end: time + svc.durationMin })),
  }));
}

const durationOf = (b: ShopBundle, serviceId: string | null) =>
  (b.services.find((s) => s.id === serviceId) ?? b.services[0])?.durationMin ?? 30;

/** Onde cada pessoa da fila seria encaixada hoje, se fosse chamada na ordem. */
export function queueForecast(b: ShopBundle, today: string, appts: Appt[], queue: QueueEntry[], now = new Date()): (WalkInFit | null)[] {
  const hours = dayHours(b, today);
  if (!hours) return queue.map(() => null);
  return planQueue(
    { hours, barberIds: b.barbers.map((x) => x.id), busyByBarber: busyByBarber(b, appts), reserves: reservesFor(b, today), notBefore: minutesInZone(now, b.shop.timezone) },
    queue.map((q) => durationOf(b, q.serviceId)),
  );
}

/** Primeiro encaixe para um serviço agora, com qualquer barbeiro. */
export function fitNow(b: ShopBundle, today: string, appts: Appt[], serviceId: string | null, now = new Date()) {
  const hours = dayHours(b, today);
  if (!hours) return null;
  return firstWalkInFit({
    hours, durationMin: durationOf(b, serviceId), barberIds: b.barbers.map((x) => x.id),
    busyByBarber: busyByBarber(b, appts), reserves: reservesFor(b, today), notBefore: minutesInZone(now, b.shop.timezone),
  });
}

/** "Marcos Silva" → "Marcos S." (privacidade na TV). */
export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0] ?? "";
}


/** Converte para o formato das telas (minutos no fuso da barbearia, sem Date). */
export function toDayItems(b: ShopBundle, appts: Appt[]): DayItem[] {
  const tz = b.shop.timezone;
  return appts.map((a) => ({
    id: a.id, barberId: a.barberId, clientName: a.clientName, phone: a.phone, serviceId: a.serviceId, serviceName: a.serviceName,
    start: minutesInZone(a.startsAt, tz), end: minutesInZone(a.endsAt, tz), status: a.status, viaPlan: a.viaPlan, walkIn: a.source === "walk_in", price: a.price,
  }));
}

export function toQueueViews(b: ShopBundle, queue: QueueEntry[], forecast: (WalkInFit | null)[]): QueueView[] {
  return queue.map((q, i) => ({
    id: q.id, name: q.name, serviceId: q.serviceId,
    serviceName: b.services.find((s) => s.id === q.serviceId)?.name.pt ?? "Atendimento",
    joinedAt: q.joinedAt.getTime(), via: q.via, forecast: forecast[i] ?? null,
  }));
}

export const toBarberViews = (b: ShopBundle): BarberView[] => b.barbers.map((x) => ({ id: x.id, name: x.name, color: x.color ?? "#525252", photo: x.photo }));
export const toServiceViews = (b: ShopBundle): ServiceView[] => b.services.map((s) => ({ id: s.id, name: s.name.pt, durationMin: s.durationMin }));
