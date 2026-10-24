"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff, type Staff } from "@/lib/staff";
import { atMinutes, dayInZone } from "@/core/time";
import { toHHMM } from "@/core/types";
import {
  addToQueue, closeQueueEntry, createAppointment, getAppointment, getQueueEntry, listAppointments,
  rescheduleAppointment, searchClients, setAppointmentStatus,
} from "@/modules/agenda/data";
import { dayRange, fitNow, freeTimes, notBeforeFor } from "@/modules/agenda/plan";
import { getClient, listClients, updateClient } from "@/modules/clients/data";

const slugS = z.string().min(1).max(80);
const dayS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idS = z.string().min(1).max(64);
const minutesS = z.number().int().min(0).max(24 * 60);

const FORBIDDEN = { ok: false as const, error: "forbidden" };
/** Pode mexer na agenda deste barbeiro? (agenda de todos, ou é a própria agenda) */
const may = (s: Staff, barberId: string) => s.workable.includes(barberId);

const touch = (slug: string) => {
  revalidatePath(`/painel/${slug}/agenda`);
  revalidatePath(`/painel/${slug}`);
  revalidatePath(`/tv/${slug}`);
};

export async function loadFreeTimes(slug: string, day: string, serviceId: string, barberId: string, exceptId?: string) {
  const s = await assertStaff(slugS.parse(slug));
  const { bundle } = s;
  if (!may(s, barberId)) return [];
  return freeTimes(bundle, dayS.parse(day), idS.parse(serviceId), idS.parse(barberId), exceptId ? idS.parse(exceptId) : undefined);
}

export async function findClients(slug: string, q: string) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  return searchClients(bundle, z.string().max(60).parse(q));
}

/** Clientes que vieram por último (para tocar em vez de buscar). */
export async function recentClients(slug: string, limit = 12) {
  const { bundle } = await assertStaff(slugS.parse(slug));
  const rows = await listClients(bundle);
  return rows
    .sort((a, z) => (z.lastVisit ?? z.createdAt).localeCompare(a.lastVisit ?? a.createdAt))
    .slice(0, Math.min(30, limit))
    .map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
}

/** Anotação rápida (ex.: "Chegou atrasado") que vai para a ficha do cliente do atendimento, com a data. */
export async function noteOnClient(slug: string, apptId: string, note: string) {
  const s = await assertStaff(slugS.parse(slug));
  const { bundle } = s;
  const appt = await getAppointment(bundle, idS.parse(apptId));
  if (appt && !may(s, appt.barberId)) return FORBIDDEN;
  if (!appt?.clientId) return { ok: false as const, error: "Esse atendimento não tem cliente cadastrado." };
  const c = await getClient(bundle, appt.clientId);
  if (!c) return { ok: false as const, error: "Cliente não encontrado." };
  const tz = bundle.shop.timezone;
  const [, m, d] = dayInZone(appt.startsAt, tz).split("-");
  const line = `${d}/${m}: ${z.string().trim().min(1).max(200).parse(note)}`;
  const notes = (c.notes ? `${c.notes}; ${line}` : line).slice(-2000);
  const r = await updateClient(bundle, c.id, {
    name: c.name, phone: c.phone, preferredBarberId: c.preferredBarberId, preferences: c.preferences, notes, photoConsent: Boolean(c.photoConsentAt),
  });
  if (r.ok) revalidatePath(`/painel/${slug}/clientes/${c.id}`);
  return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
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
  const s = await assertStaff(p.slug);
  const { bundle } = s;
  if (!may(s, p.barberId)) return FORBIDDEN;
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
  const s = await assertStaff(slugS.parse(slug));
  const { bundle } = s;
  const appt = await getAppointment(bundle, idS.parse(id));
  if (!appt) return { ok: false as const, error: "not_found" };
  if (!may(s, appt.barberId)) return FORBIDDEN;
  const r = await setAppointmentStatus(bundle, idS.parse(id), statusS.parse(status));
  if (r.ok) touch(slug);
  return r;
}

const moveS = z.object({ slug: slugS, id: idS, day: dayS, minutes: minutesS, barberId: idS });

export async function reschedule(input: z.infer<typeof moveS>) {
  const p = moveS.parse(input);
  const s = await assertStaff(p.slug);
  const { bundle } = s;
  const appt = await getAppointment(bundle, p.id);
  if (!appt) return { ok: false as const, error: "not_found" };
  if (!may(s, appt.barberId) || !may(s, p.barberId)) return FORBIDDEN;
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
  const s = await assertStaff(p.slug);
  if (s.access.agenda !== "all") return FORBIDDEN;
  const { bundle } = s;
  const r = await addToQueue(bundle, { name: p.name, serviceId: p.serviceId, clientId: p.clientId });
  if (r.ok) touch(p.slug);
  return r;
}

export async function queueLeave(slug: string, id: string) {
  const s = await assertStaff(slugS.parse(slug));
  if (s.access.agenda !== "all") return FORBIDDEN;
  const { bundle } = s;
  const r = await closeQueueEntry(bundle, idS.parse(id), "left");
  if (r.ok) touch(slug);
  return r;
}

/**
 * Chama a pessoa da fila: encaixa no primeiro horário livre de qualquer barbeiro
 * (ou no lugar escolhido), cria o atendimento como "encaixe" e tira da fila.
 */
export async function queueCall(slug: string, id: string, target?: { barberId: string; minutes: number }) {
  const s = await assertStaff(slugS.parse(slug));
  if (s.access.agenda !== "all") return FORBIDDEN;
  const { bundle } = s;
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

