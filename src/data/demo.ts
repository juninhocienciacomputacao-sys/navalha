// Dados de demonstração em memória: o app funciona antes de ligar o Supabase.
import { atMinutes, addDays, dayInZone } from "@/core/time";
import { daysUntil } from "@/core/plans";
import type { AgendaItem, BookInput, BookResult, Busy, Dashboard, Repo, ShopBundle } from "./types";
import { demoGlobal } from "./demo-global";
import { resolveModules } from "@/core/modules";

const TZ = "America/Sao_Paulo";

const bundle: ShopBundle = demoGlobal("bundle", (): ShopBundle => ({
  shop: {
    id: "demo-shop", slug: "dom-bigode", name: "Dom Bigode Barbearia", address: "Rua Augusta, 1200 · São Paulo",
    currency: "BRL", defaultLang: "pt", timezone: TZ, slotStepMin: 15, planAlertDays: 5, modules: resolveModules({}),
    openingHours: Object.fromEntries(["1", "2", "3", "4", "5"].map((d) => [d, { open: "09:00", close: "20:00" }]).concat([["6", { open: "08:00", close: "18:00" }]])),
  },
  barbers: [
    { id: "b-rafa", name: "Rafa", roleTitle: "Degradê e navalhado", color: "#c2410c", photo: null },
    { id: "b-leo", name: "Léo", roleTitle: "Barba e toalha quente", color: "#0f766e", photo: null },
    { id: "b-dudu", name: "Dudu", roleTitle: "Cortes clássicos", color: "#4338ca", photo: null },
    { id: "b-nina", name: "Nina", roleTitle: "Química e platinado", color: "#be185d", photo: null },
  ],
  services: [
    { id: "s-corte", name: { pt: "Corte", en: "Haircut", es: "Corte" }, durationMin: 40, price: 50, planIds: ["p-club", "p-full", "p-vip"] },
    { id: "s-barba", name: { pt: "Barba", en: "Beard", es: "Barba" }, durationMin: 30, price: 40, planIds: ["p-full", "p-vip"] },
    { id: "s-combo", name: { pt: "Corte + barba", en: "Haircut + beard", es: "Corte + barba" }, durationMin: 60, price: 80, planIds: ["p-full", "p-vip"] },
    { id: "s-pezinho", name: { pt: "Pezinho", en: "Neck trim", es: "Perfilado" }, durationMin: 15, price: 20, planIds: ["p-club", "p-full", "p-vip"] },
    { id: "s-luzes", name: { pt: "Luzes", en: "Highlights", es: "Mechas" }, durationMin: 90, price: 150, planIds: [] },
  ],
  plans: [
    { id: "p-club", name: "Clube do Corte", price: 89.9, quotaUses: 4, periodDays: 30,
      rules: { minDaysBetween: 7, description: "Um corte por semana, sempre em dia" } },
    { id: "p-full", name: "Corte + Barba Ilimitado", price: 149.9, quotaUses: null, periodDays: 30 },
    { id: "p-vip", name: "Black VIP", price: 249.9, quotaUses: null, periodDays: 30,
      rules: { exclusive: true, maxSubscribers: 12, barberIds: ["b-rafa", "b-leo"], minDaysBetween: 3, onLimit: "block", description: "Só para convidados da casa" } },
  ],
  walkIn: { enabled: true, perPeakHour: 2, peakStarts: [11 * 60, 17 * 60, 18 * 60, 19 * 60], blockMin: 45 },
}));

const SURNAMES = ["Silva", "Souza", "Lima", "Costa", "Rocha", "Alves", "Gomes", "Ribeiro"];
const NAMES = ["Marcos", "Pedro", "Thiago", "Lucas", "Bruno", "Rafael", "Gustavo", "Felipe", "André", "João", "Caio", "Diego", "Vitor", "Mateus", "Henrique", "Igor"];

// gerador fixo: os mesmos dados a cada reinício
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoClient {
  id: string; name: string; phone: string; lang: "pt" | "en" | "es"; createdAt: Date;
  preferredBarberId: string | null; notes: string; photoConsentAt: Date | null; noShows: number;
}
export interface DemoAppointment extends AgendaItem {
  clientId: string | null; serviceId: string; subscriptionId: string | null;
  source?: "app" | "whatsapp" | "ai" | "reception" | "walk_in" | "rebook";
}
export interface DemoSubscription {
  id: string; clientId: string; planId: string; periodStart: Date; periodEnd: Date; usesInPeriod: number;
  soldByBarberId: string | null; cancelledAt: Date | null;
}
export interface DemoPayment {
  id: string; clientId: string | null; subscriptionId: string | null; appointmentId: string | null;
  amount: number; method: "pix" | "card" | "cash"; status: "pending" | "paid" | "failed" | "refunded"; paidAt: Date | null;
}

/**
 * Banco de demonstração em memória, compartilhado por todas as telas.
 * Some quando o servidor reinicia. Cada módulo pode guardar coleções próprias em arquivo próprio.
 */
export const store = demoGlobal("store", () => ({
  bundle,
  clients: [] as DemoClient[],
  appointments: [] as DemoAppointment[],
  subscriptions: [] as DemoSubscription[],
  payments: [] as DemoPayment[],
}));
const rows = store.appointments;
const ids = demoGlobal("ids", () => ({ n: 1 }));
export const demoId = (prefix: string) => `${prefix}-${ids.n++}`;
/** Garante que os dados de exemplo existem. Chame antes de ler o `store`. */
export function demoSeed() { seed(); return store; }

function seed() {
  if (rows.length) return;
  const today = dayInZone(new Date(), TZ);
  const r = rng(42);
  NAMES.forEach((_, i) => SURNAMES.forEach((sn, j) => {
    const n = j * NAMES.length + i;
    store.clients.push({
      id: `c-${n}`, name: `${NAMES[i]} ${sn}`, phone: `+55119${String(80000000 + n).padStart(8, "0")}`, lang: "pt",
      createdAt: new Date(Date.now() - (30 + n * 3) * 86_400_000), preferredBarberId: bundle.barbers[n % 4].id,
      notes: "", photoConsentAt: n % 3 === 0 ? new Date() : null, noShows: 0,
    });
  }));
  const planIds = bundle.plans.map((p) => p.id);
  for (let n = 0; n < 34; n++) {
    const endIn = n === 0 ? 2 : n === 1 ? -3 : n === 2 ? 4 : n === 3 ? -9 : Math.floor(r() * 28) + 1;
    const end = new Date(Date.now() + endIn * 86_400_000);
    store.subscriptions.push({
      id: `sub-${n}`, clientId: `c-${n}`, planId: planIds[n % planIds.length],
      periodStart: new Date(end.getTime() - 30 * 86_400_000), periodEnd: end, usesInPeriod: Math.floor(r() * 4),
      soldByBarberId: bundle.barbers[n % 4].id, cancelledAt: null,
    });
    store.payments.push({ id: `pay-${n}`, clientId: `c-${n}`, subscriptionId: `sub-${n}`, appointmentId: null,
      amount: bundle.plans.find((p) => p.id === planIds[n % planIds.length])!.price, method: n % 3 ? "pix" : "card",
      status: "paid", paidAt: new Date(end.getTime() - 30 * 86_400_000) });
  }
  for (let d = -35; d <= 6; d++) {
    const day = addDays(today, d);
    const wd = String(new Date(day + "T12:00:00Z").getUTCDay());
    const hours = bundle.shop.openingHours[wd];
    if (!hours) continue;
    const [oh] = hours.open.split(":").map(Number);
    const [ch] = hours.close.split(":").map(Number);
    for (const b of bundle.barbers) {
      let t = oh * 60;
      while (t < ch * 60 - 40) {
        const fill = d < 0 ? 0.75 : d === 0 ? 0.6 : 0.45 - d * 0.05;
        const svc = bundle.services[Math.floor(r() * 4)];
        if (r() < fill && t + svc.durationMin <= ch * 60) {
          let n = Math.floor(r() * store.clients.length);
          // os clientes do "Ver como" começam sem horário futuro, para dar para testar o agendamento
          if (d >= 0 && n < 2) n += 2;
          const client = store.clients[n];
          const sub = store.subscriptions.find((x) => x.clientId === client.id && svc.planIds.includes(x.planId));
          const viaPlan = Boolean(sub) && r() < 0.8;
          const startsAt = atMinutes(day, t, TZ);
          rows.push({
            id: String(ids.n++), barberId: b.id, clientName: client.name, clientId: client.id, serviceId: svc.id,
            subscriptionId: viaPlan ? sub!.id : null,
            serviceName: svc.name.pt, startsAt, endsAt: new Date(startsAt.getTime() + svc.durationMin * 60_000),
            status: startsAt.getTime() > Date.now() ? "confirmed" : startsAt.getTime() + svc.durationMin * 60_000 > Date.now() ? "in_service" : r() < 0.05 ? "no_show" : "done", price: viaPlan ? 0 : svc.price, viaPlan,
          });
          t += svc.durationMin;
        } else t += 15;
      }
    }
  }
}

const live = (x: AgendaItem) => x.status !== "cancelled" && x.status !== "no_show";

export const demoRepo: Repo = {
  mode: "demo",
  async shopBySlug(slug) {
    return slug === bundle.shop.slug ? bundle : null;
  },
  async busy(_shopId, from, to): Promise<Busy[]> {
    seed();
    return rows.filter((x) => live(x) && x.startsAt < to && x.endsAt > from)
      .map(({ barberId, startsAt, endsAt }) => ({ barberId, startsAt, endsAt }));
  },
  async book(input: BookInput): Promise<BookResult> {
    seed();
    const svc = bundle.services.find((s) => s.id === input.serviceId);
    if (!svc || !bundle.barbers.some((b) => b.id === input.barberId)) return { ok: false, error: "not_found" };
    if (input.startsAt.getTime() < Date.now()) return { ok: false, error: "slot_in_past" };
    const endsAt = new Date(input.startsAt.getTime() + svc.durationMin * 60_000);
    if (rows.some((x) => live(x) && x.barberId === input.barberId && x.startsAt < endsAt && x.endsAt > input.startsAt)) {
      return { ok: false, error: "slot_taken" };
    }
    const id = String(ids.n++);
    let client = input.phone ? store.clients.find((c) => c.phone === input.phone) : undefined;
    if (!client) {
      client = { id: demoId("c"), name: input.name || "Cliente", phone: input.phone ?? "", lang: "pt", createdAt: new Date(),
        preferredBarberId: input.barberId, notes: "", photoConsentAt: null, noShows: 0 };
      store.clients.push(client);
    }
    rows.push({ id, barberId: input.barberId, clientName: client.name, clientId: client.id, serviceId: svc.id, subscriptionId: null,
      serviceName: svc.name.pt, startsAt: input.startsAt, endsAt, status: "confirmed", price: svc.price, viaPlan: false });
    return { ok: true, id };
  },
  async agenda(_shopId, from, to) {
    seed();
    return rows.filter((x) => x.startsAt < to && x.endsAt > from).sort((a, b) => +a.startsAt - +b.startsAt);
  },
  async dashboard(_shopId, monthStart, now): Promise<Dashboard> {
    seed();
    const month = rows.filter((x) => x.status === "done" && x.startsAt >= monthStart && x.startsAt <= now);
    const subs = store.subscriptions.filter((x) => !x.cancelledAt).map((x) => {
      const c = store.clients.find((c) => c.id === x.clientId)!;
      return { ...x, clientName: c.name, phone: c.phone, plan: bundle.plans.find((p) => p.id === x.planId)! };
    });
    const planRevenue = store.payments.filter((p) => p.status === "paid" && p.paidAt && p.paidAt >= monthStart && p.paidAt <= now)
      .reduce((t, p) => t + p.amount, 0);
    return {
      revenueMonth: month.reduce((t, x) => t + x.price, 0) + planRevenue,
      appointmentsMonth: month.length,
      clients: store.clients.length,
      activeSubscriptions: subs.filter((s) => daysUntil(s.periodEnd, now) >= 0).length,
      planAlerts: subs.filter((s) => daysUntil(s.periodEnd, now) <= bundle.shop.planAlertDays)
        .map((s) => ({ clientName: s.clientName, phone: s.phone, planName: s.plan.name, periodEnd: s.periodEnd }))
        .sort((a, b) => +a.periodEnd - +b.periodEnd),
      perBarber: bundle.barbers.map((b) => {
        const mine = month.filter((x) => x.barberId === b.id);
        return { barberId: b.id, appointments: mine.length, revenue: mine.reduce((t, x) => t + x.price, 0),
          minutes: mine.reduce((t, x) => t + (+x.endsAt - +x.startsAt) / 60_000, 0) };
      }),
    };
  },
};
