// Agenda e fila de encaixe: Supabase quando configurado (as regras de segurança valem), senão o banco de demonstração.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed, store } from "@/data/demo";
import type { AgendaItem, ShopBundle } from "@/data/types";
import { demoGlobal } from "@/data/demo-global";

export type ApptStatus = AgendaItem["status"];
export type ApptSource = "app" | "whatsapp" | "ai" | "reception" | "walk_in" | "rebook";

export interface Appt {
  id: string;
  barberId: string;
  clientId: string | null;
  clientName: string;
  /** Telefone do cliente cadastrado (vazio para nome avulso). */
  phone: string;
  serviceId: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  status: ApptStatus;
  price: number;
  viaPlan: boolean;
  source: ApptSource;
}

export interface QueueEntry {
  id: string;
  name: string;
  clientId: string | null;
  serviceId: string | null;
  joinedAt: Date;
  via: "reception" | "app" | "qr";
  status: "waiting" | "served" | "left";
  appointmentId: string | null;
}

export interface ClientLite {
  id: string;
  name: string;
  phone: string;
}

export type Result<T = string> = { ok: true; id: T } | { ok: false; error: string };

/** Atendimento que ocupa o horário (cancelado e falta liberam). */
export const isLive = (s: ApptStatus) => s !== "cancelled" && s !== "no_show";

const svcName = (b: ShopBundle, id: string) => b.services.find((s) => s.id === id)?.name.pt ?? "";

// ---------- demonstração ----------

/** Fila de demonstração (só desta tela). Começa com duas pessoas esperando. */
const demoQueue = demoGlobal("agenda.queue", (): QueueEntry[] => []);
const agendaFlags = demoGlobal("agenda.flags", () => ({ seeded: false }));
function seedQueue() {
  if (agendaFlags.seeded) return;
  agendaFlags.seeded = true;
  const now = Date.now();
  demoQueue.push(
    { id: "q-1", name: "Wesley Martins", clientId: null, serviceId: "s-corte", joinedAt: new Date(now - 14 * 60_000), via: "reception", status: "waiting", appointmentId: null },
    { id: "q-2", name: "Otávio Reis", clientId: null, serviceId: "s-barba", joinedAt: new Date(now - 6 * 60_000), via: "qr", status: "waiting", appointmentId: null },
  );
}

function demoActiveSub(clientId: string | null, serviceId: string, b: ShopBundle, at: Date) {
  if (!clientId) return null;
  const svc = b.services.find((s) => s.id === serviceId);
  return store.subscriptions.find((x) => x.clientId === clientId && !x.cancelledAt && svc?.planIds.includes(x.planId)
    && x.periodStart <= at && x.periodEnd >= at) ?? null;
}

const demoClash = (barberId: string, startsAt: Date, endsAt: Date, exceptId?: string) =>
  store.appointments.some((x) => x.id !== exceptId && isLive(x.status) && x.barberId === barberId && x.startsAt < endsAt && x.endsAt > startsAt);

// ---------- Supabase ----------

type Row = {
  id: string; barber_id: string; client_id: string | null; walk_in_name: string | null; service_id: string;
  starts_at: string; ends_at: string; status: ApptStatus; source: ApptSource; price: number; subscription_id: string | null;
  clients: { name: string; phone_e164: string } | null;
};
const SELECT = "id, barber_id, client_id, walk_in_name, service_id, starts_at, ends_at, status, source, price, subscription_id, clients(name, phone_e164)";

const dbError = (e: { code?: string; message: string }) =>
  e.code === "23P01" ? "slot_taken" : e.code === "42501" ? "forbidden" : "unknown";

// ---------- leitura ----------

export async function listAppointments(b: ShopBundle, from: Date, to: Date): Promise<Appt[]> {
  if (!supabaseConfigured()) {
    demoSeed();
    return store.appointments
      .filter((x) => x.startsAt < to && x.endsAt > from)
      .sort((a, c) => +a.startsAt - +c.startsAt)
      .map((x) => {
        const c = x.clientId ? store.clients.find((k) => k.id === x.clientId) : undefined;
        const src = (x as { source?: ApptSource }).source;
        return {
          id: x.id, barberId: x.barberId, clientId: x.clientId, clientName: x.clientName, phone: c?.phone ?? "",
          serviceId: x.serviceId, serviceName: x.serviceName, startsAt: x.startsAt, endsAt: x.endsAt,
          status: x.status, price: x.price, viaPlan: x.viaPlan, source: src ?? "app",
        };
      });
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("appointments").select(SELECT)
    .eq("shop_id", b.shop.id).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()).order("starts_at");
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((x) => ({
    id: x.id, barberId: x.barber_id, clientId: x.client_id, clientName: x.clients?.name ?? x.walk_in_name ?? "Sem nome",
    phone: x.clients?.phone_e164 ?? "", serviceId: x.service_id, serviceName: svcName(b, x.service_id),
    startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at), status: x.status, price: Number(x.price),
    viaPlan: x.subscription_id !== null, source: x.source,
  }));
}

export async function getAppointment(b: ShopBundle, id: string): Promise<Appt | null> {
  if (!supabaseConfigured()) {
    demoSeed();
    const x = store.appointments.find((a) => a.id === id);
    if (!x) return null;
    return (await listAppointments(b, x.startsAt, x.endsAt)).find((a) => a.id === id) ?? null;
  }
  const db = await supabaseServer();
  const { data } = await db.from("appointments").select(SELECT).eq("shop_id", b.shop.id).eq("id", id).maybeSingle();
  if (!data) return null;
  const x = data as unknown as Row;
  return {
    id: x.id, barberId: x.barber_id, clientId: x.client_id, clientName: x.clients?.name ?? x.walk_in_name ?? "Sem nome",
    phone: x.clients?.phone_e164 ?? "", serviceId: x.service_id, serviceName: svcName(b, x.service_id),
    startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at), status: x.status, price: Number(x.price),
    viaPlan: x.subscription_id !== null, source: x.source,
  };
}

/** Busca clientes pelo nome ou telefone (para marcar pela recepção). */
export async function searchClients(b: ShopBundle, q: string, limit = 8): Promise<ClientLite[]> {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  if (!supabaseConfigured()) {
    demoSeed();
    const digits = term.replace(/\D/g, "");
    return store.clients
      .filter((c) => c.name.toLowerCase().includes(term) || (digits.length >= 3 && c.phone.includes(digits)))
      .slice(0, limit).map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  }
  const db = await supabaseServer();
  const safe = term.replace(/[%_,()]/g, " ");
  const digits = term.replace(/\D/g, "");
  const filter = digits.length >= 3 ? `name.ilike.%${safe}%,phone_e164.ilike.%${digits}%` : `name.ilike.%${safe}%`;
  const { data } = await db.from("clients").select("id, name, phone_e164").eq("shop_id", b.shop.id).or(filter).order("name").limit(limit);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone_e164 }));
}

// ---------- gravação ----------

export interface CreateInput {
  barberId: string;
  serviceId: string;
  startsAt: Date;
  clientId: string | null;
  walkInName: string | null;
  source: ApptSource;
}

export async function createAppointment(b: ShopBundle, input: CreateInput): Promise<Result> {
  const svc = b.services.find((s) => s.id === input.serviceId);
  const barber = b.barbers.find((x) => x.id === input.barberId);
  if (!svc || !barber) return { ok: false, error: "not_found" };
  const endsAt = new Date(input.startsAt.getTime() + svc.durationMin * 60_000);

  if (!supabaseConfigured()) {
    demoSeed();
    if (demoClash(input.barberId, input.startsAt, endsAt)) return { ok: false, error: "slot_taken" };
    const client = input.clientId ? store.clients.find((c) => c.id === input.clientId) : undefined;
    if (input.clientId && !client) return { ok: false, error: "not_found" };
    const sub = demoActiveSub(input.clientId, svc.id, b, input.startsAt);
    const id = demoId("ag");
    const row = {
      id, barberId: barber.id, clientId: client?.id ?? null, clientName: client?.name ?? input.walkInName ?? "Sem nome",
      serviceId: svc.id, subscriptionId: sub?.id ?? null, serviceName: svc.name.pt, startsAt: input.startsAt, endsAt,
      status: "confirmed" as const, price: sub ? 0 : svc.price, viaPlan: Boolean(sub), source: input.source,
    };
    store.appointments.push(row);
    return { ok: true, id };
  }

  const db = await supabaseServer();
  // plano ativo do cliente que cobre o serviço: o atendimento sai a 0 e entra no rateio da comissão
  let subId: string | null = null;
  if (input.clientId) {
    const day = input.startsAt.toISOString().slice(0, 10);
    const { data: subs } = await db.from("subscriptions").select("id, plan_id")
      .eq("shop_id", b.shop.id).eq("client_id", input.clientId).is("cancelled_at", null)
      .lte("period_start", day).gte("period_end", day);
    subId = (subs ?? []).find((s) => svc.planIds.includes(s.plan_id))?.id ?? null;
  }
  const { data, error } = await db.from("appointments").insert({
    shop_id: b.shop.id, barber_id: barber.id, client_id: input.clientId, walk_in_name: input.clientId ? null : input.walkInName,
    service_id: svc.id, starts_at: input.startsAt.toISOString(), ends_at: endsAt.toISOString(),
    status: "confirmed", source: input.source, subscription_id: subId, price: subId ? 0 : svc.price,
  }).select("id").single();
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, id: data.id as string };
}

export async function setAppointmentStatus(b: ShopBundle, id: string, status: ApptStatus): Promise<Result> {
  if (!supabaseConfigured()) {
    demoSeed();
    const x = store.appointments.find((a) => a.id === id);
    if (!x) return { ok: false, error: "not_found" };
    // voltar um cancelado/falta para a agenda só se o horário ainda estiver livre
    if (!isLive(x.status) && isLive(status) && demoClash(x.barberId, x.startsAt, x.endsAt, x.id)) return { ok: false, error: "slot_taken" };
    const c = x.clientId ? store.clients.find((k) => k.id === x.clientId) : undefined;
    if (c && status === "no_show" && x.status !== "no_show") c.noShows++;
    if (c && x.status === "no_show" && status !== "no_show") c.noShows = Math.max(0, c.noShows - 1);
    x.status = status;
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data: before } = await db.from("appointments").select("status, client_id").eq("shop_id", b.shop.id).eq("id", id).maybeSingle();
  if (!before) return { ok: false, error: "not_found" };
  const { error } = await db.from("appointments").update({ status }).eq("shop_id", b.shop.id).eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  const delta = status === "no_show" && before.status !== "no_show" ? 1 : before.status === "no_show" && status !== "no_show" ? -1 : 0;
  if (delta && before.client_id) {
    const { data: c } = await db.from("clients").select("no_shows").eq("id", before.client_id).maybeSingle();
    if (c) await db.from("clients").update({ no_shows: Math.max(0, c.no_shows + delta) }).eq("id", before.client_id);
  }
  return { ok: true, id };
}

/** Muda dia, horário e/ou barbeiro mantendo a duração do serviço. */
export async function rescheduleAppointment(b: ShopBundle, id: string, barberId: string, startsAt: Date): Promise<Result> {
  if (!b.barbers.some((x) => x.id === barberId)) return { ok: false, error: "not_found" };
  if (!supabaseConfigured()) {
    demoSeed();
    const x = store.appointments.find((a) => a.id === id);
    if (!x) return { ok: false, error: "not_found" };
    const endsAt = new Date(startsAt.getTime() + (+x.endsAt - +x.startsAt));
    if (demoClash(barberId, startsAt, endsAt, x.id)) return { ok: false, error: "slot_taken" };
    Object.assign(x, { barberId, startsAt, endsAt, status: isLive(x.status) && x.status !== "done" ? x.status : "confirmed" });
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data: cur } = await db.from("appointments").select("starts_at, ends_at, status").eq("shop_id", b.shop.id).eq("id", id).maybeSingle();
  if (!cur) return { ok: false, error: "not_found" };
  const endsAt = new Date(startsAt.getTime() + (+new Date(cur.ends_at) - +new Date(cur.starts_at)));
  const status = cur.status === "cancelled" || cur.status === "no_show" || cur.status === "done" ? "confirmed" : cur.status;
  const { error } = await db.from("appointments")
    .update({ barber_id: barberId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status })
    .eq("shop_id", b.shop.id).eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, id };
}

// ---------- fila de encaixe ----------

export async function listQueue(b: ShopBundle): Promise<QueueEntry[]> {
  if (!supabaseConfigured()) {
    seedQueue();
    return demoQueue.filter((q) => q.status === "waiting").sort((a, c) => +a.joinedAt - +c.joinedAt);
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("walk_in_queue").select("id, name, client_id, service_id, joined_at, via, status, appointment_id")
    .eq("shop_id", b.shop.id).eq("status", "waiting").order("joined_at");
  if (error) throw error;
  return (data ?? []).map((q) => ({
    id: q.id, name: q.name, clientId: q.client_id, serviceId: q.service_id, joinedAt: new Date(q.joined_at),
    via: q.via, status: q.status, appointmentId: q.appointment_id,
  }));
}

export async function getQueueEntry(b: ShopBundle, id: string): Promise<QueueEntry | null> {
  return (await listQueue(b)).find((q) => q.id === id) ?? null;
}

export async function addToQueue(b: ShopBundle, input: { name: string; serviceId: string | null; clientId: string | null }): Promise<Result> {
  if (input.serviceId && !b.services.some((s) => s.id === input.serviceId)) return { ok: false, error: "not_found" };
  if (!supabaseConfigured()) {
    seedQueue();
    const id = demoId("q");
    demoQueue.push({ id, name: input.name, clientId: input.clientId, serviceId: input.serviceId, joinedAt: new Date(), via: "reception", status: "waiting", appointmentId: null });
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("walk_in_queue")
    .insert({ shop_id: b.shop.id, name: input.name, service_id: input.serviceId, client_id: input.clientId, via: "reception" })
    .select("id").single();
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, id: data.id as string };
}

export async function closeQueueEntry(b: ShopBundle, id: string, status: "served" | "left", appointmentId: string | null = null): Promise<Result> {
  if (!supabaseConfigured()) {
    seedQueue();
    const q = demoQueue.find((x) => x.id === id && x.status === "waiting");
    if (!q) return { ok: false, error: "not_found" };
    q.status = status;
    q.appointmentId = appointmentId;
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("walk_in_queue").update({ status, appointment_id: appointmentId })
    .eq("shop_id", b.shop.id).eq("id", id).eq("status", "waiting").select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!data?.length) return { ok: false, error: "not_found" };
  return { ok: true, id };
}
