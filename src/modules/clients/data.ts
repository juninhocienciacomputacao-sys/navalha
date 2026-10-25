// Clientes: lista com números (visitas, gasto, faltas) e ficha. Demonstração em memória ou Supabase.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed } from "@/data/demo";
import type { AgendaItem, ShopBundle } from "@/data/types";
import type { Lang } from "@/core/types";
import { dayInZone } from "@/core/time";
import { fetchAll, listSubscriptions, type SubRow } from "@/modules/plans/data";
import { demoGlobal } from "@/data/demo-global";

export interface ClientRow {
  id: string;
  name: string;
  phone: string;
  /** Dia do cadastro (AAAA-MM-DD, fuso da barbearia). */
  createdAt: string;
  lastVisit: string | null;
  visits: number;
  totalSpent: number;
  noShows: number;
  /** Preferido no cadastro ou, se vazio, com quem mais cortou. */
  barberId: string | null;
  sub: SubRow | null;
}

export interface Visit {
  id: string;
  startsAt: string;
  serviceName: string;
  barberId: string;
  price: number;
  status: AgendaItem["status"];
  viaPlan: boolean;
}

export interface ClientDetail extends ClientRow {
  lang: Lang;
  preferredBarberId: string | null;
  preferences: string;
  notes: string;
  photoConsentAt: string | null;
  history: Visit[];
}

export interface ClientPatch {
  name: string;
  phone: string;
  preferredBarberId: string | null;
  preferences: string;
  notes: string;
  photoConsent: boolean;
}

/** Preferências no modo demonstração (o cadastro de demonstração só tem `notes`). */
const demoPrefs = demoGlobal("clients.prefs", () => new Map<string, string>());

interface Raw {
  id: string; name: string; phone: string; createdAt: Date; preferredBarberId: string | null; noShows: number;
}
interface RawVisit { clientId: string; barberId: string; startsAt: Date; status: AgendaItem["status"]; price: number }
interface RawPay { clientId: string; amount: number }

/** Junta cadastro, atendimentos e pagamentos avulsos de plano nos números da lista. */
function summarize(b: ShopBundle, clients: Raw[], visits: RawVisit[], planPays: RawPay[], subs: SubRow[]): ClientRow[] {
  const tz = b.shop.timezone;
  const byClient = new Map<string, RawVisit[]>();
  for (const v of visits) (byClient.get(v.clientId) ?? byClient.set(v.clientId, []).get(v.clientId)!).push(v);
  const paid = new Map<string, number>();
  for (const p of planPays) paid.set(p.clientId, (paid.get(p.clientId) ?? 0) + p.amount);
  const subOf = new Map(subs.map((s) => [s.clientId, s]));
  return clients.map((c) => {
    const mine = byClient.get(c.id) ?? [];
    const done = mine.filter((v) => v.status === "done");
    const last = done.reduce<Date | null>((m, v) => (!m || v.startsAt > m ? v.startsAt : m), null);
    const count = new Map<string, number>();
    for (const v of done) count.set(v.barberId, (count.get(v.barberId) ?? 0) + 1);
    const top = [...count].sort((a, z) => z[1] - a[1])[0]?.[0] ?? null;
    return {
      id: c.id, name: c.name, phone: c.phone, createdAt: dayInZone(c.createdAt, tz),
      lastVisit: last ? dayInZone(last, tz) : null, visits: done.length,
      totalSpent: done.reduce((t, v) => t + v.price, 0) + (paid.get(c.id) ?? 0),
      noShows: Math.max(c.noShows, mine.filter((v) => v.status === "no_show").length),
      barberId: c.preferredBarberId ?? top, sub: subOf.get(c.id) ?? null,
    };
  });
}

export async function listClients(b: ShopBundle): Promise<ClientRow[]> {
  const subs = await listSubscriptions(b);
  if (!supabaseConfigured()) {
    const s = demoSeed();
    return summarize(b, s.clients,
      s.appointments.filter((a) => a.clientId).map((a) => ({ clientId: a.clientId!, barberId: a.barberId, startsAt: a.startsAt, status: a.status, price: a.price })),
      s.payments.filter((p) => p.clientId && p.status === "paid" && !p.appointmentId).map((p) => ({ clientId: p.clientId!, amount: p.amount })),
      subs);
  }
  const db = await supabaseServer();
  const shop = b.shop.id;
  type C = { id: string; name: string; phone_e164: string; created_at: string; preferred_barber_id: string | null; no_shows: number };
  type A = { client_id: string; barber_id: string; starts_at: string; status: AgendaItem["status"]; price: number };
  type P = { client_id: string; amount: number };
  const [clients, appts, pays] = await Promise.all([
    fetchAll<C>((f, t) => db.from("clients").select("id, name, phone_e164, created_at, preferred_barber_id, no_shows").eq("shop_id", shop).order("name").range(f, t)),
    fetchAll<A>((f, t) => db.from("appointments").select("client_id, barber_id, starts_at, status, price").eq("shop_id", shop)
      .not("client_id", "is", null).in("status", ["done", "no_show"]).order("starts_at").range(f, t)),
    fetchAll<P>((f, t) => db.from("payments").select("client_id, amount").eq("shop_id", shop).eq("status", "paid")
      .not("client_id", "is", null).is("appointment_id", null).order("created_at").range(f, t)),
  ]);
  return summarize(b,
    clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone_e164, createdAt: new Date(c.created_at), preferredBarberId: c.preferred_barber_id, noShows: c.no_shows })),
    appts.map((a) => ({ clientId: a.client_id, barberId: a.barber_id, startsAt: new Date(a.starts_at), status: a.status, price: Number(a.price) })),
    pays.map((p) => ({ clientId: p.client_id, amount: Number(p.amount) })),
    subs);
}

export async function getClient(b: ShopBundle, id: string): Promise<ClientDetail | null> {
  const subs = await listSubscriptions(b, { clientId: id });
  if (!supabaseConfigured()) {
    const s = demoSeed();
    const c = s.clients.find((x) => x.id === id);
    if (!c) return null;
    const appts = s.appointments.filter((a) => a.clientId === id);
    const pays = s.payments.filter((p) => p.clientId === id && p.status === "paid" && !p.appointmentId);
    const [row] = summarize(b, [c], appts.map((a) => ({ clientId: id, barberId: a.barberId, startsAt: a.startsAt, status: a.status, price: a.price })),
      pays.map((p) => ({ clientId: id, amount: p.amount })), subs);
    return {
      ...row, lang: c.lang, preferredBarberId: c.preferredBarberId, preferences: demoPrefs.get(id) ?? "", notes: c.notes,
      photoConsentAt: c.photoConsentAt?.toISOString() ?? null,
      history: appts.sort((a, z) => +z.startsAt - +a.startsAt).slice(0, 60).map((a) => ({
        id: a.id, startsAt: a.startsAt.toISOString(), serviceName: a.serviceName, barberId: a.barberId, price: a.price, status: a.status, viaPlan: a.viaPlan,
      })),
    };
  }
  const db = await supabaseServer();
  const { data: c } = await db.from("clients")
    .select("id, name, phone_e164, lang, created_at, preferred_barber_id, preferences, notes, photo_consent_at, no_shows")
    .eq("shop_id", b.shop.id).eq("id", id).maybeSingle();
  if (!c) return null;
  const [appts, pays] = await Promise.all([
    db.from("appointments").select("id, barber_id, starts_at, status, price, subscription_id, services(name)")
      .eq("shop_id", b.shop.id).eq("client_id", id).order("starts_at", { ascending: false }).limit(300),
    db.from("payments").select("amount").eq("shop_id", b.shop.id).eq("client_id", id).eq("status", "paid").is("appointment_id", null),
  ]);
  type A = { id: string; barber_id: string; starts_at: string; status: AgendaItem["status"]; price: number; subscription_id: string | null; services: { name: { pt: string } } | null };
  const rows = (appts.data ?? []) as unknown as A[];
  const [row] = summarize(b,
    [{ id: c.id, name: c.name, phone: c.phone_e164, createdAt: new Date(c.created_at), preferredBarberId: c.preferred_barber_id, noShows: c.no_shows }],
    rows.map((a) => ({ clientId: id, barberId: a.barber_id, startsAt: new Date(a.starts_at), status: a.status, price: Number(a.price) })),
    (pays.data ?? []).map((p) => ({ clientId: id, amount: Number(p.amount) })), subs);
  return {
    ...row, lang: c.lang as Lang, preferredBarberId: c.preferred_barber_id, preferences: c.preferences ?? "", notes: c.notes ?? "",
    photoConsentAt: c.photo_consent_at,
    history: rows.slice(0, 60).map((a) => ({
      id: a.id, startsAt: a.starts_at, serviceName: a.services?.name.pt ?? "", barberId: a.barber_id, price: Number(a.price),
      status: a.status, viaPlan: a.subscription_id !== null,
    })),
  };
}

const PHONE_TAKEN = "Já existe um cliente com este WhatsApp.";

/** Cliente da barbearia que já usa este WhatsApp (o celular é a identidade do cliente). */
export type SameClient = { id: string; name: string; phone: string };
/** Resultado de cadastrar/editar: quando o número já é de outro cliente, diz quem é. */
export type ClientResult = { ok: true; id?: string } | { ok: false; error: string; existing?: SameClient };

export async function findClientByPhone(b: ShopBundle, phone: string, exceptId?: string): Promise<SameClient | null> {
  if (!supabaseConfigured()) {
    const c = demoSeed().clients.find((x) => x.phone === phone && x.id !== exceptId);
    return c ? { id: c.id, name: c.name, phone: c.phone } : null;
  }
  const db = await supabaseServer();
  const { data } = await db.from("clients").select("id, name, phone_e164").eq("shop_id", b.shop.id).eq("phone_e164", phone).maybeSingle();
  return data && data.id !== exceptId ? { id: data.id, name: data.name, phone: data.phone_e164 } : null;
}

async function taken(b: ShopBundle, phone: string, exceptId?: string): Promise<ClientResult> {
  const existing = await findClientByPhone(b, phone, exceptId);
  return existing
    ? { ok: false, error: `Este WhatsApp já é do cliente ${existing.name}.`, existing }
    : { ok: false, error: PHONE_TAKEN };
}

export async function createClient(b: ShopBundle, input: { name: string; phone: string }): Promise<ClientResult> {
  if (!supabaseConfigured()) {
    const s = demoSeed();
    if (s.clients.some((c) => c.phone === input.phone)) return taken(b, input.phone);
    const id = demoId("c");
    s.clients.push({ id, name: input.name, phone: input.phone, lang: b.shop.defaultLang, createdAt: new Date(),
      preferredBarberId: null, notes: "", photoConsentAt: null, noShows: 0 });
    return { ok: true, id };
  }
  // confere antes para dizer quem é; o banco (único por barbearia + celular) garante mesmo com dois cadastros ao mesmo tempo
  if (await findClientByPhone(b, input.phone)) return taken(b, input.phone);
  const db = await supabaseServer();
  const { data, error } = await db.from("clients")
    .insert({ shop_id: b.shop.id, name: input.name, phone_e164: input.phone, lang: b.shop.defaultLang }).select("id").single();
  if (error) return error.code === "23505" ? taken(b, input.phone) : { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function updateClient(b: ShopBundle, id: string, p: ClientPatch): Promise<ClientResult> {
  if (p.preferredBarberId && !b.barbers.some((x) => x.id === p.preferredBarberId)) return { ok: false, error: "Barbeiro não encontrado." };
  if (!supabaseConfigured()) {
    const s = demoSeed();
    const c = s.clients.find((x) => x.id === id);
    if (!c) return { ok: false, error: "Cliente não encontrado." };
    if (s.clients.some((x) => x.id !== id && x.phone === p.phone)) return taken(b, p.phone, id);
    const renamed = c.name !== p.name;
    Object.assign(c, {
      name: p.name, phone: p.phone, preferredBarberId: p.preferredBarberId, notes: p.notes,
      photoConsentAt: p.photoConsent ? c.photoConsentAt ?? new Date() : null,
    });
    demoPrefs.set(id, p.preferences);
    if (renamed) for (const a of s.appointments) if (a.clientId === id) a.clientName = p.name;
    return { ok: true };
  }
  const db = await supabaseServer();
  const { data: cur } = await db.from("clients").select("photo_consent_at").eq("id", id).eq("shop_id", b.shop.id).maybeSingle();
  if (!cur) return { ok: false, error: "Cliente não encontrado." };
  const { error } = await db.from("clients").update({
    name: p.name, phone_e164: p.phone, preferred_barber_id: p.preferredBarberId,
    preferences: p.preferences || null, notes: p.notes || null,
    photo_consent_at: p.photoConsent ? cur.photo_consent_at ?? new Date().toISOString() : null,
  }).eq("id", id).eq("shop_id", b.shop.id);
  if (error) return error.code === "23505" ? taken(b, p.phone, id) : { ok: false, error: error.message };
  return { ok: true };
}

/** Lista curta para escolher o cliente ao vender um plano. */
export async function clientOptions(b: ShopBundle): Promise<{ id: string; name: string; phone: string }[]> {
  if (!supabaseConfigured()) return demoSeed().clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone })).sort((a, z) => a.name.localeCompare(z.name));
  const db = await supabaseServer();
  const rows = await fetchAll<{ id: string; name: string; phone_e164: string }>((f, t) =>
    db.from("clients").select("id, name, phone_e164").eq("shop_id", b.shop.id).order("name").range(f, t));
  return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone_e164 }));
}
