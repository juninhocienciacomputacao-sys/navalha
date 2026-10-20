// Dados de demonstração em memória: o app funciona antes de ligar o Supabase.
import { atMinutes, addDays, dayInZone } from "@/core/time";
import { daysUntil } from "@/core/plans";
import type { AgendaItem, BookInput, BookResult, Busy, Dashboard, Repo, ShopBundle } from "./types";

const TZ = "America/Sao_Paulo";

const bundle: ShopBundle = {
  shop: {
    id: "demo-shop", slug: "dom-bigode", name: "Dom Bigode Barbearia", address: "Rua Augusta, 1200 · São Paulo",
    currency: "BRL", defaultLang: "pt", timezone: TZ, slotStepMin: 15, planAlertDays: 5,
    openingHours: Object.fromEntries(["1", "2", "3", "4", "5"].map((d) => [d, { open: "09:00", close: "20:00" }]).concat([["6", { open: "08:00", close: "18:00" }]])),
  },
  barbers: [
    { id: "b-rafa", name: "Rafa", roleTitle: "Degradê e navalhado", color: "#c2410c" },
    { id: "b-leo", name: "Léo", roleTitle: "Barba e toalha quente", color: "#0f766e" },
    { id: "b-dudu", name: "Dudu", roleTitle: "Cortes clássicos", color: "#4338ca" },
    { id: "b-nina", name: "Nina", roleTitle: "Química e platinado", color: "#be185d" },
  ],
  services: [
    { id: "s-corte", name: { pt: "Corte", en: "Haircut", es: "Corte" }, durationMin: 40, price: 50, planIds: ["p-club", "p-full"] },
    { id: "s-barba", name: { pt: "Barba", en: "Beard", es: "Barba" }, durationMin: 30, price: 40, planIds: ["p-full"] },
    { id: "s-combo", name: { pt: "Corte + barba", en: "Haircut + beard", es: "Corte + barba" }, durationMin: 60, price: 80, planIds: ["p-full"] },
    { id: "s-pezinho", name: { pt: "Pezinho", en: "Neck trim", es: "Perfilado" }, durationMin: 15, price: 20, planIds: ["p-club", "p-full"] },
    { id: "s-luzes", name: { pt: "Luzes", en: "Highlights", es: "Mechas" }, durationMin: 90, price: 150, planIds: [] },
  ],
  plans: [
    { id: "p-club", name: "Clube do Corte", price: 89.9, quotaUses: 4, periodDays: 30 },
    { id: "p-full", name: "Corte + Barba Ilimitado", price: 149.9, quotaUses: null, periodDays: 30 },
  ],
  walkIn: { enabled: true, perPeakHour: 2, peakStarts: [11 * 60, 17 * 60, 18 * 60, 19 * 60], blockMin: 45 },
};

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

interface Row extends AgendaItem { clientPhone: string }
const rows: Row[] = [];
let nextId = 1;

function seed() {
  if (rows.length) return;
  const today = dayInZone(new Date(), TZ);
  const r = rng(42);
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
          const viaPlan = svc.planIds.length > 0 && r() < 0.35;
          const n = Math.floor(r() * NAMES.length * SURNAMES.length);
          const startsAt = atMinutes(day, t, TZ);
          rows.push({
            id: String(nextId++), barberId: b.id, clientName: `${NAMES[n % NAMES.length]} ${SURNAMES[Math.floor(n / NAMES.length)]}`, clientPhone: `+55119${String(80000000 + n).padStart(8, "0")}`,
            serviceName: svc.name.pt, startsAt, endsAt: new Date(startsAt.getTime() + svc.durationMin * 60_000),
            status: startsAt.getTime() < Date.now() ? (r() < 0.05 ? "no_show" : "done") : "confirmed", price: viaPlan ? 0 : svc.price, viaPlan,
          });
          t += svc.durationMin;
        } else t += 15;
      }
    }
  }
}

const SUBS = [
  { clientName: "Marcos", phone: "+5511980000000", planId: "p-club", endInDays: 2 },
  { clientName: "Pedro", phone: "+5511980000001", planId: "p-full", endInDays: -3 },
  { clientName: "Thiago", phone: "+5511980000002", planId: "p-club", endInDays: 4 },
  { clientName: "Lucas", phone: "+5511980000003", planId: "p-full", endInDays: 18 },
  { clientName: "Bruno", phone: "+5511980000004", planId: "p-club", endInDays: 25 },
];

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
    const id = String(nextId++);
    rows.push({ id, barberId: input.barberId, clientName: input.name || "Cliente", clientPhone: input.phone ?? "", serviceName: svc.name.pt,
      startsAt: input.startsAt, endsAt, status: "confirmed", price: svc.price, viaPlan: false });
    return { ok: true, id };
  },
  async agenda(_shopId, from, to) {
    seed();
    return rows.filter((x) => x.startsAt < to && x.endsAt > from).sort((a, b) => +a.startsAt - +b.startsAt);
  },
  async dashboard(_shopId, monthStart, now): Promise<Dashboard> {
    seed();
    const month = rows.filter((x) => x.status === "done" && x.startsAt >= monthStart && x.startsAt <= now);
    const subs = SUBS.map((s) => ({ ...s, plan: bundle.plans.find((p) => p.id === s.planId)!, periodEnd: new Date(now.getTime() + s.endInDays * 86_400_000) }));
    const planRevenue = subs.filter((s) => s.endInDays >= 0).reduce((t, s) => t + s.plan.price, 0);
    return {
      revenueMonth: month.reduce((t, x) => t + x.price, 0) + planRevenue,
      appointmentsMonth: month.length,
      clients: new Set(rows.map((x) => x.clientPhone)).size,
      activeSubscriptions: subs.filter((s) => s.endInDays >= 0).length,
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
