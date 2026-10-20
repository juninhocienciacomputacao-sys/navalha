import { availability, slotsForPreferred, walkInReserves, type PreferredResult, type SlotOption } from "@/core/slots";
import { atMinutes, dayInZone, minutesInZone, weekday } from "@/core/time";
import { toMinutes, type Interval } from "@/core/types";
import type { Repo, ShopBundle } from "./types";

export interface DaySlots {
  day: string;
  closed: boolean;
  options: SlotOption[];
  preferred: PreferredResult | null;
}

/** Antecedência mínima para marcar no mesmo dia. */
const LEAD_MIN = 30;

export async function daySlots(r: Repo, b: ShopBundle, day: string, serviceId: string, barberId?: string, now = new Date()): Promise<DaySlots> {
  const { shop } = b;
  const h = shop.openingHours[String(weekday(day))];
  const service = b.services.find((s) => s.id === serviceId);
  const today = dayInZone(now, shop.timezone);
  if (!h || !service || day < today) return { day, closed: true, options: [], preferred: null };

  const hours = { open: toMinutes(h.open), close: toMinutes(h.close), step: shop.slotStepMin };
  const busy = await r.busy(shop.id, atMinutes(day, 0, shop.timezone), atMinutes(day, 24 * 60, shop.timezone));
  const busyByBarber = new Map<string, Interval[]>(b.barbers.map((x) => [x.id, []]));
  for (const x of busy) {
    busyByBarber.get(x.barberId)?.push({ start: minutesInZone(x.startsAt, shop.timezone), end: minutesInZone(x.endsAt, shop.timezone) });
  }
  const barberIds = b.barbers.map((x) => x.id);
  const input = {
    hours, durationMin: service.durationMin, barberIds, busyByBarber,
    reserves: walkInReserves(b.walkIn, barberIds),
    notBefore: day === today ? minutesInZone(now, shop.timezone) + LEAD_MIN : 0,
  };
  return {
    day, closed: false,
    options: availability(input),
    preferred: barberId && barberIds.includes(barberId) ? slotsForPreferred(input, barberId) : null,
  };
}
