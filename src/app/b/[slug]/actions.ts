"use server";

import { z } from "zod";
import { repo } from "@/data";
import { daySlots } from "@/data/booking";
import { atMinutes } from "@/core/time";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function loadSlots(slug: string, d: string, serviceId: string, barberId?: string) {
  const r = repo();
  const b = await r.shopBySlug(slug);
  if (!b) return null;
  return daySlots(r, b, day.parse(d), serviceId, barberId);
}

const bookSchema = z.object({
  slug: z.string(), day, minutes: z.number().int().min(0).max(1440),
  serviceId: z.string(), barberId: z.string(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
});

export async function confirmBooking(input: z.infer<typeof bookSchema>) {
  const p = bookSchema.parse(input);
  const r = repo();
  const b = await r.shopBySlug(p.slug);
  if (!b) return { ok: false as const, error: "not_found" };
  return r.book({
    shopId: b.shop.id, barberId: p.barberId, serviceId: p.serviceId, name: p.name, phone: p.phone,
    startsAt: atMinutes(p.day, p.minutes, b.shop.timezone),
  });
}
