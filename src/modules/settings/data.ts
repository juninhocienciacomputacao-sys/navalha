// Equipe, serviços e configurações da barbearia.
// Com o Supabase ligado usa o banco (as regras de segurança valem); sem ele, edita o `store` de demonstração.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed, store } from "@/data/demo";
import type { BarberInfo, ShopBundle, ShopInfo } from "@/data/types";
import type { WalkInPolicy } from "@/core/slots";
import type { I18nText, Lang, Service } from "@/core/types";
import { toHHMM, toMinutes } from "@/core/types";
import { addDays, atMinutes, dayInZone, weekday } from "@/core/time";
import type { StatAppointment } from "@/core/barberStats";
import { FEATURES, withDefaults, type FeatureKey, type FeatureState } from "./features";
import type { Modules } from "@/core/modules";
import { demoGlobal } from "@/data/demo-global";
import { DEFAULT_BOOKING_LIMIT, type BookingLimit } from "@/core/plan-rules";

export interface TeamBarber {
  id: string;
  name: string;
  roleTitle: string | null;
  color: string | null;
  photo: string | null;
  active: boolean;
  pay: "commission" | "chair_rent";
  commissionPct: number;
  chairRent: number;
  monthlyGoal: number | null;
  sort: number;
}

export interface CatalogService {
  id: string;
  name: I18nText;
  durationMin: number;
  price: number;
  commissionOverridePct: number | null;
  active: boolean;
  sort: number;
  planIds: string[];
}

export interface ShopSettings {
  shop: ShopInfo;
  blockExpiredPlans: boolean;
  walkIn: WalkInPolicy;
  features: FeatureState[];
}

export type BarberInput = Omit<TeamBarber, "id" | "active"> & { id?: string };
export type ServiceInput = Omit<CatalogService, "id" | "active" | "planIds"> & { id?: string };
export type ShopPatch = Partial<Pick<ShopInfo, "name" | "address" | "currency" | "defaultLang" | "timezone" | "openingHours" | "slotStepMin" | "planAlertDays">>
  & { blockExpiredPlans?: boolean };

const sb = () => supabaseConfigured();

// ---------------------------------------------------------------- demonstração
// Os objetos de `store.bundle` continuam sendo os mesmos (outras telas editam, por exemplo, os planos de cada serviço).
// Aqui ficam só os campos extras e os itens desativados, que saem do bundle (o app do cliente só vê os ativos).

type BarberExtra = Omit<TeamBarber, keyof BarberInfo> & { obj: BarberInfo };
type ServiceExtra = { obj: Service; commissionOverridePct: number | null; active: boolean; sort: number };

const DEMO_PAY: Record<string, Partial<BarberExtra>> = {
  "b-rafa": { pay: "commission", commissionPct: 45, monthlyGoal: 15000 },
  "b-leo": { pay: "commission", commissionPct: 45, monthlyGoal: 12000 },
  "b-dudu": { pay: "commission", commissionPct: 40, monthlyGoal: 10000 },
  "b-nina": { pay: "chair_rent", commissionPct: 0, chairRent: 2400, monthlyGoal: 12000 },
};

const demo = demoGlobal("settings", () => ({
  barbers: new Map<string, BarberExtra>(),
  services: new Map<string, ServiceExtra>(),
  features: [] as { key: string; enabled: boolean; config: Record<string, string | number | boolean> }[],
  blockExpiredPlans: true,
}));

const historyFlags = demoGlobal("settings.history", () => ({ done: false }));
/**
 * O seed de demonstração só tem 5 semanas para trás. Para os gráficos de 8 semanas,
 * completa (uma vez, sempre igual) as semanas mais antigas, com um movimento um pouco menor.
 */
function demoHistory() {
  if (historyFlags.done) return;
  historyFlags.done = true;
  const tz = store.bundle.shop.timezone;
  const first = store.appointments.reduce((m, x) => (x.startsAt < m ? x.startsAt : m), new Date());
  const firstDay = dayInZone(first, tz);
  const today = dayInZone(new Date(), tz);
  let seed = 7;
  const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const services = store.bundle.services.slice(0, 4);
  if (!services.length || !store.clients.length) return;
  for (let d = -63; ; d++) {
    const day = addDays(today, d);
    if (day >= firstDay) break;
    const h = store.bundle.shop.openingHours[String(weekday(day))];
    if (!h) continue;
    const growth = 0.5 + ((d + 63) / 28) * 0.15; // mais antigo, mais vazio
    store.bundle.barbers.forEach((b, bi) => {
      let t = toMinutes(h.open);
      while (t < toMinutes(h.close) - 40) {
        const svc = services[Math.floor(r() * services.length)];
        if (r() < growth - bi * 0.04 && t + svc.durationMin <= toMinutes(h.close)) {
          const client = store.clients[Math.floor(r() * store.clients.length)];
          const startsAt = atMinutes(day, t, tz);
          const viaPlan = r() < 0.3 && svc.planIds.length > 0;
          store.appointments.push({
            id: demoId("hist"), barberId: b.id, clientName: client.name, clientId: client.id, serviceId: svc.id, subscriptionId: null,
            serviceName: svc.name.pt, startsAt, endsAt: new Date(+startsAt + svc.durationMin * 60_000),
            status: r() < 0.06 ? "no_show" : "done", price: viaPlan ? 0 : svc.price, viaPlan,
          });
          t += svc.durationMin;
        } else t += 15;
      }
    });
  }
}

function demoTeam() {
  demoSeed();
  demoHistory();
  store.bundle.barbers.forEach((b, i) => {
    if (!demo.barbers.has(b.id)) {
      demo.barbers.set(b.id, { obj: b, active: true, pay: "commission", commissionPct: 40, chairRent: 0, monthlyGoal: null, sort: i, ...DEMO_PAY[b.id] });
    } else demo.barbers.get(b.id)!.obj = b;
  });
  store.bundle.services.forEach((s, i) => {
    if (!demo.services.has(s.id)) demo.services.set(s.id, { obj: s, commissionOverridePct: s.id === "s-luzes" ? 30 : null, active: true, sort: i });
    else demo.services.get(s.id)!.obj = s;
  });
  return demo;
}

function syncBundle() {
  const barbers = [...demo.barbers.values()].filter((x) => x.active).sort((a, b) => a.sort - b.sort).map((x) => x.obj);
  store.bundle.barbers.splice(0, store.bundle.barbers.length, ...barbers);
  const services = [...demo.services.values()].filter((x) => x.active).sort((a, b) => a.sort - b.sort).map((x) => x.obj);
  store.bundle.services.splice(0, store.bundle.services.length, ...services);
}

const isDemoShop = (shopId: string) => {
  if (shopId !== store.bundle.shop.id) throw new Error("not_found");
};

// ---------------------------------------------------------------- equipe

export async function listBarbers(shopId: string): Promise<TeamBarber[]> {
  if (!sb()) {
    isDemoShop(shopId);
    return [...demoTeam().barbers.values()].map(({ obj, ...x }) => ({ ...obj, ...x })).sort((a, b) => a.sort - b.sort);
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("barbers")
    .select("id, display_name, role_title, color, photo, active, pay, commission_pct, chair_rent, monthly_goal, sort")
    .eq("shop_id", shopId).order("sort").order("display_name");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    id: b.id, name: b.display_name, roleTitle: b.role_title, color: b.color, photo: b.photo ?? null, active: b.active, pay: b.pay,
    commissionPct: Number(b.commission_pct), chairRent: Number(b.chair_rent),
    monthlyGoal: b.monthly_goal === null ? null : Number(b.monthly_goal), sort: b.sort,
  }));
}

export async function saveBarber(shopId: string, input: BarberInput): Promise<string> {
  if (!sb()) {
    isDemoShop(shopId);
    const d = demoTeam();
    const { id, name, roleTitle, color, photo, ...extra } = input;
    let row = id ? d.barbers.get(id) : undefined;
    if (id && !row) throw new Error("not_found");
    if (!row) {
      row = { obj: { id: demoId("b"), name, roleTitle, color, photo }, active: true, ...extra };
      d.barbers.set(row.obj.id, row);
    } else {
      Object.assign(row.obj, { name, roleTitle, color, photo });
      Object.assign(row, extra);
    }
    syncBundle();
    return row.obj.id;
  }
  const db = await supabaseServer();
  const row = {
    display_name: input.name, role_title: input.roleTitle, color: input.color, photo: input.photo, pay: input.pay,
    commission_pct: input.commissionPct, chair_rent: input.chairRent, monthly_goal: input.monthlyGoal, sort: input.sort,
  };
  if (input.id) {
    const { error } = await db.from("barbers").update(row).eq("id", input.id).eq("shop_id", shopId);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db.from("barbers").insert({ ...row, shop_id: shopId }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function setBarberActive(shopId: string, id: string, active: boolean) {
  if (!sb()) {
    isDemoShop(shopId);
    const row = demoTeam().barbers.get(id);
    if (!row) throw new Error("not_found");
    row.active = active;
    syncBundle();
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("barbers").update({ active }).eq("id", id).eq("shop_id", shopId);
  if (error) throw error;
}

/** Atendimentos concluídos e faltas no período, para os gráficos de evolução. */
export async function statAppointments(shopId: string, from: Date, to: Date): Promise<StatAppointment[]> {
  if (!sb()) {
    isDemoShop(shopId);
    demoTeam();
    return store.appointments
      .filter((x) => (x.status === "done" || x.status === "no_show") && x.startsAt >= from && x.startsAt < to)
      .map(({ barberId, startsAt, endsAt, status, price }) => ({ barberId, startsAt, endsAt, status, price }));
  }
  const db = await supabaseServer();
  const out: StatAppointment[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db.from("appointments")
      .select("barber_id, starts_at, ends_at, status, price, actual_minutes")
      .eq("shop_id", shopId).in("status", ["done", "no_show"])
      .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString())
      .order("starts_at").range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    for (const x of data ?? []) {
      out.push({ barberId: x.barber_id, startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at), status: x.status,
        price: Number(x.price), actualMinutes: x.actual_minutes });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------- serviços

export async function listServices(shopId: string): Promise<CatalogService[]> {
  if (!sb()) {
    isDemoShop(shopId);
    return [...demoTeam().services.values()]
      .map(({ obj, ...x }) => ({ ...x, id: obj.id, name: obj.name, durationMin: obj.durationMin, price: obj.price, planIds: [...obj.planIds] }))
      .sort((a, b) => a.sort - b.sort);
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("services")
    .select("id, name, duration_min, price, commission_override_pct, active, sort, plan_services(plan_id)")
    .eq("shop_id", shopId).order("sort");
  if (error) throw error;
  type Row = { id: string; name: I18nText; duration_min: number; price: number; commission_override_pct: number | null;
    active: boolean; sort: number; plan_services: { plan_id: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((s) => ({
    id: s.id, name: s.name, durationMin: s.duration_min, price: Number(s.price),
    commissionOverridePct: s.commission_override_pct === null ? null : Number(s.commission_override_pct),
    active: s.active, sort: s.sort, planIds: (s.plan_services ?? []).map((p) => p.plan_id),
  }));
}

export async function saveService(shopId: string, input: ServiceInput): Promise<string> {
  const name: I18nText = { pt: input.name.pt };
  if (input.name.en) name.en = input.name.en;
  if (input.name.es) name.es = input.name.es;
  if (!sb()) {
    isDemoShop(shopId);
    const d = demoTeam();
    let row = input.id ? d.services.get(input.id) : undefined;
    if (input.id && !row) throw new Error("not_found");
    if (!row) {
      row = { obj: { id: demoId("s"), name, durationMin: input.durationMin, price: input.price, planIds: [] },
        commissionOverridePct: input.commissionOverridePct, active: true, sort: input.sort };
      d.services.set(row.obj.id, row);
    } else {
      Object.assign(row.obj, { name, durationMin: input.durationMin, price: input.price });
      Object.assign(row, { commissionOverridePct: input.commissionOverridePct, sort: input.sort });
    }
    syncBundle();
    return row.obj.id;
  }
  const db = await supabaseServer();
  const row = { name, duration_min: input.durationMin, price: input.price, commission_override_pct: input.commissionOverridePct, sort: input.sort };
  if (input.id) {
    const { error } = await db.from("services").update(row).eq("id", input.id).eq("shop_id", shopId);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db.from("services").insert({ ...row, shop_id: shopId }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function setServiceActive(shopId: string, id: string, active: boolean) {
  if (!sb()) {
    isDemoShop(shopId);
    const row = demoTeam().services.get(id);
    if (!row) throw new Error("not_found");
    row.active = active;
    syncBundle();
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("services").update({ active }).eq("id", id).eq("shop_id", shopId);
  if (error) throw error;
}

/** Todos os planos (ativos ou não), só para mostrar o nome na tela de serviços. */
export async function planNames(shopId: string): Promise<{ id: string; name: string; active: boolean }[]> {
  if (!sb()) {
    isDemoShop(shopId);
    return store.bundle.plans.map((p) => ({ id: p.id, name: p.name, active: true }));
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("plans").select("id, name, active").eq("shop_id", shopId).order("name");
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------- recursos e configurações

export async function getSettings(shopId: string, shop: ShopInfo, walkIn: WalkInPolicy): Promise<ShopSettings> {
  if (!sb()) {
    isDemoShop(shopId);
    const saved = demo.features.some((f) => f.key === "walk_in") ? demo.features
      : [...demo.features, { key: "walk_in", enabled: store.bundle.walkIn.enabled, config: {} }];
    const features = withDefaults(saved).map((f) => (f.key === "walk_in" ? { ...f, enabled: store.bundle.walkIn.enabled } : f));
    return { shop: store.bundle.shop, blockExpiredPlans: demo.blockExpiredPlans, walkIn: store.bundle.walkIn, features };
  }
  const db = await supabaseServer();
  const [s, f] = await Promise.all([
    db.from("shops").select("block_expired_plans").eq("id", shopId).single(),
    db.from("shop_features").select("key, enabled, config").eq("shop_id", shopId),
  ]);
  if (s.error) throw s.error;
  if (f.error) throw f.error;
  // a política de encaixe manda no liga/desliga de encaixes (é ela que a agenda usa)
  const features = withDefaults(f.data ?? []).map((x) => (x.key === "walk_in" ? { ...x, enabled: walkIn.enabled } : x));
  return { shop, blockExpiredPlans: s.data.block_expired_plans, walkIn, features };
}

export async function saveShop(shopId: string, patch: ShopPatch) {
  if (!sb()) {
    isDemoShop(shopId);
    const { blockExpiredPlans, ...rest } = patch;
    if (blockExpiredPlans !== undefined) demo.blockExpiredPlans = blockExpiredPlans;
    Object.assign(store.bundle.shop, rest);
    return;
  }
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.currency !== undefined) row.currency = patch.currency;
  if (patch.defaultLang !== undefined) row.default_lang = patch.defaultLang satisfies Lang;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.openingHours !== undefined) row.opening_hours = patch.openingHours;
  if (patch.slotStepMin !== undefined) row.slot_step_min = patch.slotStepMin;
  if (patch.planAlertDays !== undefined) row.plan_alert_days = patch.planAlertDays;
  if (patch.blockExpiredPlans !== undefined) row.block_expired_plans = patch.blockExpiredPlans;
  const db = await supabaseServer();
  const { error } = await db.from("shops").update(row).eq("id", shopId);
  if (error) throw error;
}

export async function saveWalkIn(shopId: string, p: WalkInPolicy) {
  if (!sb()) {
    isDemoShop(shopId);
    Object.assign(store.bundle.walkIn, { ...p, peakStarts: [...p.peakStarts].sort((a, b) => a - b) });
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("walk_in_policy").upsert({
    shop_id: shopId, enabled: p.enabled, per_peak_hour: p.perPeakHour, block_min: p.blockMin,
    peak_starts: [...p.peakStarts].sort((a, b) => a - b).map(toHHMM),
  });
  if (error) throw error;
  await saveFeatureRow(shopId, "walk_in", p.enabled, {});
}

export async function saveFeature(shopId: string, key: FeatureKey, enabled: boolean, config: Record<string, string | number | boolean>, walkIn: WalkInPolicy) {
  if (key === "walk_in") return saveWalkIn(shopId, { ...walkIn, enabled });
  if (!sb()) {
    isDemoShop(shopId);
    const row = demo.features.find((f) => f.key === key);
    if (row) Object.assign(row, { enabled, config });
    else demo.features.push({ key, enabled, config });
    return;
  }
  await saveFeatureRow(shopId, key, enabled, config);
}

async function saveFeatureRow(shopId: string, key: string, enabled: boolean, config: Record<string, unknown>) {
  if (!sb()) return;
  const db = await supabaseServer();
  const { error } = await db.from("shop_features").upsert({ shop_id: shopId, key, enabled, config }, { onConflict: "shop_id,key" });
  if (error) throw error;
}

/** Recursos da barbearia (com padrões), para outras telas consultarem se algo está ligado. */
export async function featureStates(bundle: ShopBundle): Promise<FeatureState[]> {
  return (await getSettings(bundle.shop.id, bundle.shop, bundle.walkIn)).features;
}

// ---------------------------------------------------------------- módulos (pacote)

export async function saveModules(shopId: string, modules: Modules) {
  if (!sb()) {
    isDemoShop(shopId);
    store.bundle.shop.modules = { ...modules };
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("shops").update({ modules }).eq("id", shopId);
  if (error) throw error;
}

/**
 * Liga/desliga de "sugerir o próximo horário" e quantos dias depois, para o app do cliente
 * (o banco deixa qualquer um ler só a linha "rebook" dos recursos).
 */
/** Limite de agendamentos por cliente (Recursos → "Um horário por vez"). O app do cliente também pode ler. */
export async function bookingLimitSetting(shopId: string): Promise<BookingLimit> {
  let row: { key: string; enabled: boolean; config: unknown } | undefined;
  if (!sb()) row = demo.features.find((f) => f.key === "booking_limit");
  else {
    const db = await supabaseServer();
    const { data } = await db.from("shop_features").select("key, enabled, config").eq("shop_id", shopId).eq("key", "booking_limit").maybeSingle();
    row = data ?? undefined;
  }
  const st = withDefaults(row ? [row] : []).find((f) => f.key === "booking_limit")!;
  return {
    on: st.enabled,
    maxUpcoming: Math.max(1, Number(st.config.maxUpcoming) || DEFAULT_BOOKING_LIMIT.maxUpcoming),
    onePerDay: st.config.onePerDay !== false,
  };
}

export async function rebookSetting(shopId: string): Promise<{ on: boolean; days: number }> {
  const def = FEATURES.find((f) => f.key === "rebook")!;
  let row: { key: string; enabled: boolean; config: unknown } | undefined;
  if (!sb()) row = demo.features.find((f) => f.key === "rebook");
  else {
    const db = await supabaseServer();
    const { data } = await db.from("shop_features").select("key, enabled, config").eq("shop_id", shopId).eq("key", "rebook").maybeSingle();
    row = data ?? undefined;
  }
  const st = withDefaults(row ? [row] : []).find((f) => f.key === "rebook")!;
  return { on: st.enabled, days: Number(st.config.days ?? def.defaults.days) || 7 };
}
