"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { atMinutes, dayInZone } from "@/core/time";
import { toHHMM } from "@/core/types";
import {
  addToQueue, closeQueueEntry, createAppointment, getQueueEntry, listAppointments,
  rescheduleAppointment, searchClients, setAppointmentStatus,
} from "@/modules/agenda/data";
import { dayRange, fitNow, freeTimes, notBeforeFor } from "@/modules/agenda/plan";

const slugS = z.string().min(1).max(80);
const dayS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idS = z.string().min(1).max(64);
const minutesS = z.number().int().min(0).max(24 * 60);

const touch = (slug: string) => {
  revalidatePath(`/painel/${slug}/agenda`);
  revalidatePath(`/painel/${slug}`);
  revalidatePath(`/tv/${slug}`);
};

export async function loadFreeTimes(slug: string, day: string, serviceId: string, barberId: string, exceptId?: string) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  return freeTimes(bundle, dayS.parse(day), idS.parse(serviceId), idS.parse(barberId), exceptId ? idS.parse(exceptId) : undefined);
}

export async function findClients(slug: string, q: string) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  return searchClients(bundle, z.string().max(60).parse(q));
}

const createS = z.object({
  slug: slugS, day: dayS, minutes: minutesS, serviceId: idS, barberId: idS,
  clientId: idS.nullable(),
  walkInName: z.string().trim().max(80).nullable(),
}).refine((x) => x.clientId || x.walkInName, { message: "name_required" });

export async function createAppt(input: z.infer<typeof createS>) {
  const parsed = createS.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "name_required" };
  const p = parsed.data;
  const { bundle } = await assertStaff(p.slug);
  const nb = notBeforeFor(bundle, p.day);
  if (nb === null || (nb > 0 && p.minutes < nb - bundle.shop.slotStepMin)) return { ok: false as const, error: "slot_in_past" };
  const r = await createAppointment(bundle, {
    barberId: p.barberId, serviceId: p.serviceId, startsAt: atMinutes(p.day, p.minutes, bundle.shop.timezone),
    clientId: p.clientId, walkInName: p.clientId ? null : p.walkInName, source: "reception",
  });
  if (r.ok) touch(p.slug);
  return r;
}

const statusS = z.enum(["confirmed", "in_service", "done", "no_show", "cancelled"]);

export async function changeStatus(slug: string, id: string, status: z.infer<typeof statusS>) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  const r = await setAppointmentStatus(bundle, idS.parse(id), statusS.parse(status));
  if (r.ok) touch(slug);
  return r;
}

const moveS = z.object({ slug: slugS, id: idS, day: dayS, minutes: minutesS, barberId: idS });

export async function reschedule(input: z.infer<typeof moveS>) {
  const p = moveS.parse(input);
  const { bundle } = await assertStaff(p.slug);
  if (notBeforeFor(bundle, p.day) === null) return { ok: false as const, error: "slot_in_past" };
  const r = await rescheduleAppointment(bundle, p.id, p.barberId, atMinutes(p.day, p.minutes, bundle.shop.timezone));
  if (r.ok) touch(p.slug);
  return r;
}

const queueS = z.object({ slug: slugS, name: z.string().trim().min(1).max(80), serviceId: idS.nullable(), clientId: idS.nullable() });

export async function queueAdd(input: z.infer<typeof queueS>) {
  const parsed = queueS.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "name_required" };
  const p = parsed.data;
  const { bundle } = await assertStaff(p.slug);
  const r = await addToQueue(bundle, { name: p.name, serviceId: p.serviceId, clientId: p.clientId });
  if (r.ok) touch(p.slug);
  return r;
}

export async function queueLeave(slug: string, id: string) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  const r = await closeQueueEntry(bundle, idS.parse(id), "left");
  if (r.ok) touch(slug);
  return r;
}

/**
 * Chama a pessoa da fila: encaixa no primeiro horário livre de qualquer barbeiro
 * (ou no lugar escolhido), cria o atendimento como "encaixe" e tira da fila.
 */
export async function queueCall(slug: string, id: string, target?: { barberId: string; minutes: number }) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  const q = await getQueueEntry(bundle, idS.parse(id));
  if (!q) return { ok: false as const, error: "not_found" };
  const tz = bundle.shop.timezone;
  const today = dayInZone(new Date(), tz);
  let barberId: string, minutes: number;
  if (target) {
    barberId = idS.parse(target.barberId);
    minutes = minutesS.parse(target.minutes);
  } else {
    const fit = fitNow(bundle, today, await listAppointments(bundle, ...dayRange(bundle, today)), q.serviceId);
    if (!fit) return { ok: false as const, error: "no_slot" };
    ({ barberId, minutes } = { barberId: fit.barberId, minutes: fit.time });
  }
  const serviceId = q.serviceId ?? bundle.services[0]?.id;
  if (!serviceId) return { ok: false as const, error: "not_found" };
  const made = await createAppointment(bundle, {
    barberId, serviceId, startsAt: atMinutes(today, minutes, tz),
    clientId: q.clientId, walkInName: q.name, source: "walk_in",
  });
  if (!made.ok) return made;
  await closeQueueEntry(bundle, q.id, "served", made.id);
  touch(slug);
  const barber = bundle.barbers.find((b) => b.id === barberId);
  return { ok: true as const, id: made.id, message: `${q.name} encaixado com ${barber?.name ?? "barbeiro"} às ${toHHMM(minutes)}.` };
}

