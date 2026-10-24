// Dados do app do cliente. Com Supabase: leitura pelas regras de segurança (o cliente só vê o que é dele)
// e gravação só pelas funções do banco (0002_booking.sql e 0009_client_app.sql). Sem Supabase: `store` de demonstração.
import { repo, type Repo, type ShopBundle } from "@/data";
import { demoId, demoSeed, store, type DemoAppointment } from "@/data/demo";
import { daySlots, type DaySlots } from "@/data/booking";
import { currentUser, supabaseServer } from "@/lib/supabase";
import { addDays, atMinutes, dayInZone, minutesInZone } from "@/core/time";
import { applyPayment, canUsePlan, subscriptionStatus } from "@/core/plans";
import { suggestRebook } from "@/core/rebook";
import { visitCycleDays } from "@/core/visit-cycle";
import type { I18nText } from "@/core/types";
import type {
  ClientHome, ClientMe, MyAppointment, MyPayment, MyPlan, PayStart, ProjectStep, RebookOffer, StyleProject, Viewer,
} from "./types";
import { createProviderCharge } from "./payments";
import { demoGlobal } from "@/data/demo-global";

/** Clientes de exemplo do modo demonstração (um com plano vencendo, outro vencido). */
export const DEMO_CLIENTS = ["c-0", "c-1"] as const;
const PHOTO_BUCKET = "client-photos";

const DAY = 86_400_000;
const diffDays = (from: string, to: string) => Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY);
/** Meia-noite local de um AAAA-MM-DD (as regras de src/core usam datas locais). */
const localDate = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const normPhone = (p: string) => "+" + p.replace(/\D/g, "");

// ---------- quem está usando ----------

export async function resolveViewer(r: Repo, as?: string): Promise<Viewer> {
  if (r.mode === "demo") {
    const s = demoSeed();
    const id = DEMO_CLIENTS.includes(as as (typeof DEMO_CLIENTS)[number]) ? as! : DEMO_CLIENTS[0];
    return {
      kind: "demo", clientId: id,
      choices: DEMO_CLIENTS.map((c) => ({ id: c, label: s.clients.find((x) => x.id === c)?.name ?? c })),
    };
  }
  const user = await currentUser();
  return user?.phone ? { kind: "user", phone: normPhone(user.phone) } : { kind: "guest" };
}

// ---------- leitura ----------

/** rebook: "sugerir o próximo horário" (Recursos) ligado e em quantos dias, quando o histórico ainda não diz. */
type Ctx = { r: Repo; b: ShopBundle; now: Date; today: string; rebook: { on: boolean; days: number } };

function planFrom(b: ShopBundle, today: string, sub: { id: string; planId: string; periodEnd: string; usesInPeriod: number }): MyPlan | null {
  const plan = b.plans.find((p) => p.id === sub.planId);
  if (!plan) return null;
  const status = subscriptionStatus({ planId: plan.id, periodEnd: localDate(sub.periodEnd), usesInPeriod: sub.usesInPeriod }, localDate(today), b.shop.planAlertDays);
  return {
    subscriptionId: sub.id, planId: plan.id, planName: plan.name, price: plan.price, quotaUses: plan.quotaUses,
    usesInPeriod: sub.usesInPeriod, periodDays: plan.periodDays, periodEnd: sub.periodEnd, daysLeft: diffDays(today, sub.periodEnd), status,
    serviceIds: b.services.filter((s) => s.planIds.includes(plan.id)).map((s) => s.id),
  };
}

function apptFrom(b: ShopBundle, x: { id: string; startsAt: Date; barberId: string; serviceId: string | null; serviceName?: I18nText; status: MyAppointment["status"]; viaPlan: boolean; price: number }): MyAppointment {
  const tz = b.shop.timezone;
  const svc = b.services.find((s) => s.id === x.serviceId);
  return {
    id: x.id, startsAt: x.startsAt.toISOString(), day: dayInZone(x.startsAt, tz), minutes: minutesInZone(x.startsAt, tz),
    barberId: x.barberId, serviceId: svc ? svc.id : null, serviceName: svc?.name ?? x.serviceName ?? { pt: "" },
    status: x.status, viaPlan: x.viaPlan, price: x.price,
  };
}

function split(all: MyAppointment[], now: Date) {
  const upcoming = all.filter((a) => new Date(a.startsAt) > now && (a.status === "confirmed" || a.status === "pending"))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const history = all.filter((a) => a.status === "done" || a.status === "no_show")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { upcoming, history };
}

/**
 * Sugestão de reagendamento para assinante: mesmo barbeiro e horário mais parecido,
 * `ciclo` dias depois do último horário (concluído ou já marcado). O ciclo vem do histórico.
 */
async function rebookOffer(c: Ctx, all: MyAppointment[], history: MyAppointment[]): Promise<RebookOffer | null> {
  const live = all.filter((a) => a.serviceId && a.status !== "cancelled" && a.status !== "no_show")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const base = live[0];
  if (!base || !base.serviceId || !c.b.services.some((s) => s.id === base.serviceId)) return null;
  const cycle = visitCycleDays(history.filter((a) => a.status === "done").map((a) => a.day), c.rebook.days);
  let start = addDays(base.day, cycle);
  if (start < c.today) start = c.today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const slots = new Map<string, DaySlots>(
    await Promise.all(days.map(async (d) => [d, await daySlots(c.r, c.b, d, base.serviceId!, undefined, c.now)] as const)),
  );
  const s = suggestRebook(
    { date: localDate(base.day), start: base.minutes, barberId: base.barberId, serviceId: base.serviceId },
    diffDays(base.day, start),
    (d) => slots.get(localDay(d))?.closed === false,
    (barberId, d) => (slots.get(localDay(d))?.options ?? []).filter((o) => o.barberIds.includes(barberId)).map((o) => o.time),
    c.b.barbers.map((x) => x.id),
  );
  if (!s) return null;
  return {
    day: localDay(s.date), minutes: s.start, barberId: s.barberId, serviceId: s.serviceId, cycle,
    baseDay: base.day, baseUpcoming: new Date(base.startsAt) > c.now,
  };
}

/** Tudo o que a tela Início/Meu plano precisa. `null` = sem login, ou logado mas ainda sem cadastro nesta barbearia. */
export async function loadClientHome(r: Repo, b: ShopBundle, viewer: Viewer, now = new Date(),
  rebook: { on: boolean; days: number } = { on: true, days: 7 }): Promise<ClientHome | null> {
  const c: Ctx = { r, b, now, today: dayInZone(now, b.shop.timezone), rebook };
  if (viewer.kind === "guest") return null;
  return viewer.kind === "demo" ? demoHome(c, viewer.clientId) : supabaseHome(c, viewer.phone);
}

async function demoHome(c: Ctx, clientId: string): Promise<ClientHome | null> {
  const s = demoSeed();
  const client = s.clients.find((x) => x.id === clientId);
  if (!client) return null;
  const tz = c.b.shop.timezone;
  const sub = s.subscriptions.find((x) => x.clientId === clientId && !x.cancelledAt);
  const plan = sub && c.b.shop.modules.planos ? planFrom(c.b, c.today, { id: sub.id, planId: sub.planId, periodEnd: dayInZone(sub.periodEnd, tz), usesInPeriod: sub.usesInPeriod }) : null;
  const all = s.appointments.filter((x) => x.clientId === clientId).map((x) => apptFrom(c.b, { ...x, serviceName: { pt: x.serviceName } }));
  const { upcoming, history } = split(all, c.now);
  const me: ClientMe = { id: client.id, name: client.name, phone: client.phone, photoConsentAt: client.photoConsentAt?.toISOString() ?? null };
  return {
    me, plan, upcoming, history: history.slice(0, 12),
    payments: s.payments.filter((p) => p.clientId === clientId)
      .map((p): MyPayment => ({ id: p.id, amount: p.amount, method: p.method, status: p.status, at: (p.paidAt ?? new Date()).toISOString() }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    projects: demoProjectsFor(clientId, c.today),
    rebook: plan && c.rebook.on ? await rebookOffer(c, all, history) : null,
  };
}

async function supabaseHome(c: Ctx, phone: string): Promise<ClientHome | null> {
  const db = await supabaseServer();
  const shopId = c.b.shop.id;
  // filtro pelo telefone: um funcionário logado também enxerga os clientes da barbearia, e aqui só queremos "eu"
  const { data: client } = await db.from("clients").select("id, name, phone_e164, photo_consent_at")
    .eq("shop_id", shopId).eq("phone_e164", phone).maybeSingle();
  if (!client) return null;
  const [subs, appts, pays, projs] = await Promise.all([
    db.from("subscriptions").select("id, plan_id, period_end, uses_in_period").eq("client_id", client.id).is("cancelled_at", null)
      .order("period_end", { ascending: false }).limit(1),
    db.from("appointments").select("id, barber_id, service_id, starts_at, status, price, subscription_id, services(name)")
      .eq("client_id", client.id).order("starts_at", { ascending: false }).limit(80),
    db.from("payments").select("id, amount, method, status, paid_at, created_at").eq("client_id", client.id)
      .order("created_at", { ascending: false }).limit(12),
    db.from("style_projects").select("id, goal, barber_id, steps, photo_paths, created_at").eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);
  const sub = subs.data?.[0];
  const plan = sub && c.b.shop.modules.planos ? planFrom(c.b, c.today, { id: sub.id, planId: sub.plan_id, periodEnd: sub.period_end, usesInPeriod: sub.uses_in_period }) : null;
  type A = { id: string; barber_id: string; service_id: string; starts_at: string; status: MyAppointment["status"]; price: number; subscription_id: string | null; services: { name: I18nText } | null };
  const all = ((appts.data ?? []) as unknown as A[]).map((x) => apptFrom(c.b, {
    id: x.id, startsAt: new Date(x.starts_at), barberId: x.barber_id, serviceId: x.service_id, serviceName: x.services?.name,
    status: x.status, viaPlan: x.subscription_id !== null, price: Number(x.price),
  }));
  const { upcoming, history } = split(all, c.now);
  const projects: StyleProject[] = await Promise.all((projs.data ?? []).map(async (p) => {
    let photoUrl: string | null = null;
    if (p.photo_paths?.[0]) {
      const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(p.photo_paths[0], 3600);
      photoUrl = data?.signedUrl ?? null;
    }
    return { id: p.id, goal: p.goal, barberId: p.barber_id, createdAt: p.created_at, steps: (p.steps ?? []) as ProjectStep[], photoUrl, cutShape: shapeFor(p.goal) };
  }));
  return {
    me: { id: client.id, name: client.name, phone: client.phone_e164, photoConsentAt: client.photo_consent_at },
    plan, upcoming, history: history.slice(0, 12),
    payments: (pays.data ?? []).map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, status: p.status, at: p.paid_at ?? p.created_at })),
    projects,
    rebook: plan && c.rebook.on ? await rebookOffer(c, all, history) : null,
  };
}

// ---------- agendar, cancelar ----------

export interface BookAs { day: string; minutes: number; serviceId: string; barberId: string; name: string; phone?: string }

/** Agenda como o cliente atual. No modo demonstração liga ao cliente de exemplo e aplica o plano (como o banco faz). */
export async function bookAsViewer(b: ShopBundle, viewer: Viewer, p: BookAs) {
  const r = repo();
  const startsAt = atMinutes(p.day, p.minutes, b.shop.timezone);
  // Só aceita um horário que a própria grade oferece (dentro do expediente, sem encaixe reservado, no intervalo da agenda).
  // Sem isso, dava para marcar qualquer minuto mandando o pedido direto.
  const grid = await daySlots(r, b, p.day, p.serviceId, p.barberId);
  if (!grid.options.some((o) => o.time === p.minutes && o.barberIds.includes(p.barberId))) return { ok: false as const, error: "slot_taken" };
  if (viewer.kind !== "demo") {
    return r.book({ shopId: b.shop.id, barberId: p.barberId, serviceId: p.serviceId, name: p.name, phone: p.phone, startsAt });
  }
  const s = demoSeed();
  const client = s.clients.find((x) => x.id === viewer.clientId)!;
  const res = await r.book({ shopId: b.shop.id, barberId: p.barberId, serviceId: p.serviceId, name: client.name, phone: client.phone, startsAt });
  if (res.ok) {
    const appt = s.appointments.find((x) => x.id === res.id) as DemoAppointment | undefined;
    const sub = s.subscriptions.find((x) => x.clientId === client.id && !x.cancelledAt);
    const plan = sub && b.plans.find((x) => x.id === sub.planId);
    const svc = b.services.find((x) => x.id === p.serviceId);
    if (b.shop.modules.planos && appt && sub && plan && svc && canUsePlan(sub, plan, svc, new Date()).ok) {
      appt.subscriptionId = sub.id; appt.viaPlan = true; appt.price = 0;
    }
  }
  return res;
}

export async function cancelAsViewer(viewer: Viewer, appointmentId: string): Promise<{ ok: boolean; error?: string }> {
  if (viewer.kind === "guest") return { ok: false, error: "not_logged_in" };
  if (viewer.kind === "demo") {
    const a = demoSeed().appointments.find((x) => x.id === appointmentId && x.clientId === viewer.clientId);
    if (!a || a.startsAt <= new Date() || (a.status !== "confirmed" && a.status !== "pending")) return { ok: false, error: "cannot_cancel" };
    a.status = "cancelled";
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.rpc("cancel_my_appointment", { p_id: appointmentId });
  return error ? { ok: false, error: "cannot_cancel" } : { ok: true };
}

// ---------- pagamento do plano ----------

/**
 * Cliente toca em "Pagar e reativar".
 * Demonstração: aprova na hora e reativa com `applyPayment`.
 * Supabase: cria a cobrança `pending` no banco e pede a cobrança ao provedor (ver payments.ts).
 * O plano reativa quando o provedor avisa pelo webhook (`confirmPlanPayment`).
 */
export async function startPlanPayment(b: ShopBundle, viewer: Viewer, method: "pix" | "card"): Promise<PayStart> {
  if (viewer.kind === "guest") return { ok: false, error: "not_logged_in" };
  if (!b.shop.modules.planos) return { ok: false, error: "subscription_not_found" };
  if (viewer.kind === "demo") {
    const s = demoSeed();
    const sub = s.subscriptions.find((x) => x.clientId === viewer.clientId && !x.cancelledAt);
    const plan = sub && b.plans.find((p) => p.id === sub.planId);
    if (!sub || !plan) return { ok: false, error: "subscription_not_found" };
    const paidAt = new Date();
    const tz = b.shop.timezone;
    const today = dayInZone(paidAt, tz);
    // regra de src/core/plans.ts, em datas do fuso da barbearia (como o confirm_plan_payment do banco)
    const cur = { planId: sub.planId, periodEnd: localDate(dayInZone(sub.periodEnd, tz)), usesInPeriod: sub.usesInPeriod };
    const wasExpired = dayInZone(sub.periodEnd, tz) < today;
    const next = applyPayment(cur, plan, localDate(today));
    if (wasExpired) sub.periodStart = atMinutes(today, 0, tz);
    sub.periodEnd = atMinutes(localDay(next.periodEnd), 12 * 60, tz);
    sub.usesInPeriod = next.usesInPeriod;
    const id = demoId("pay");
    s.payments.push({ id, clientId: viewer.clientId, subscriptionId: sub.id, appointmentId: null, amount: plan.price, method, status: "paid", paidAt });
    return { ok: true, mode: "demo", paymentId: id, periodEnd: dayInZone(sub.periodEnd, b.shop.timezone) };
  }
  const home = await supabaseHome({ r: repo(), b, now: new Date(), today: dayInZone(new Date(), b.shop.timezone), rebook: { on: false, days: 7 } }, viewer.phone);
  if (!home?.plan) return { ok: false, error: "subscription_not_found" };
  const db = await supabaseServer();
  const { data, error } = await db.rpc("start_plan_payment", { p_subscription: home.plan.subscriptionId, p_method: method });
  if (error) return { ok: false, error: ["not_logged_in", "subscription_not_found"].find((k) => error.message.includes(k)) ?? "error" };
  const paymentId = data as string;
  const charge = await createProviderCharge({
    paymentId, amount: home.plan.price, currency: b.shop.currency, method,
    description: `${b.shop.name} · ${home.plan.planName}`, customer: { name: home.me.name, phone: home.me.phone },
  });
  return { ok: true, mode: "pending", paymentId, pixCode: charge?.pixCode ?? null, checkoutUrl: charge?.checkoutUrl ?? null };
}

/** Situação de um pagamento do próprio cliente (para o botão "Já paguei, verificar"). */
export async function paymentStatus(viewer: Viewer, paymentId: string): Promise<MyPayment["status"] | null> {
  if (viewer.kind === "guest") return null;
  if (viewer.kind === "demo") return demoSeed().payments.find((p) => p.id === paymentId && p.clientId === viewer.clientId)?.status ?? null;
  const db = await supabaseServer();
  const { data } = await db.from("payments").select("status").eq("id", paymentId).maybeSingle();
  return (data?.status as MyPayment["status"]) ?? null;
}

// ---------- foto (LGPD) e projeto de visual ----------

export async function setPhotoConsent(b: ShopBundle, viewer: Viewer, consent: boolean): Promise<{ ok: boolean; at: string | null }> {
  if (viewer.kind === "guest") return { ok: false, at: null };
  if (viewer.kind === "demo") {
    const c = demoSeed().clients.find((x) => x.id === viewer.clientId);
    if (!c) return { ok: false, at: null };
    c.photoConsentAt = consent ? c.photoConsentAt ?? new Date() : null;
    if (!consent) demoProjects.filter((p) => p.clientId === viewer.clientId).forEach((p) => { p.photoUrl = null; });
    return { ok: true, at: c.photoConsentAt?.toISOString() ?? null };
  }
  const db = await supabaseServer();
  const { data, error } = await db.rpc("set_my_photo_consent", { p_shop: b.shop.id, p_consent: consent });
  return error ? { ok: false, at: null } : { ok: true, at: (data as string | null) ?? null };
}

export interface NewProject { goal: string; steps: ProjectStep[]; barberId?: string | null; photoDataUrl?: string | null; photoPath?: string | null }

export async function createStyleProject(b: ShopBundle, viewer: Viewer, p: NewProject): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (viewer.kind === "guest") return { ok: false, error: "not_logged_in" };
  if (viewer.kind === "demo") {
    const c = demoSeed().clients.find((x) => x.id === viewer.clientId);
    if (!c) return { ok: false, error: "client_not_found" };
    if (p.photoDataUrl && !c.photoConsentAt) return { ok: false, error: "no_photo_consent" };
    const id = demoId("prj");
    demoProjects.unshift({
      id, clientId: c.id, goal: p.goal, barberId: p.barberId ?? c.preferredBarberId, createdAt: new Date().toISOString(),
      steps: p.steps, photoUrl: p.photoDataUrl ?? null, cutShape: shapeFor(p.goal),
    });
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data, error } = await db.rpc("create_my_style_project", {
    p_shop: b.shop.id, p_goal: p.goal, p_steps: p.steps, p_photo_path: p.photoPath ?? null, p_barber: p.barberId ?? null,
  });
  if (error) return { ok: false, error: ["not_logged_in", "client_not_found", "no_photo_consent", "invalid_photo"].find((k) => error.message.includes(k)) ?? "error" };
  return { ok: true, id: data as string };
}

/** Desenho de prévia (0..2) pelo nome do corte. */
export function shapeFor(goal: string) {
  const g = goal.toLowerCase();
  return /buzz|beard|barba/.test(g) ? 2 : /part|risca|raya/.test(g) ? 1 : 0;
}

// projetos do modo demonstração (some ao reiniciar o servidor)
type DemoProject = StyleProject & { clientId: string };
const demoProjects = demoGlobal("client.projects", (): DemoProject[] => []);
const projectFlags = demoGlobal("client.flags", () => ({ seeded: false }));
function demoProjectsFor(clientId: string, today: string): StyleProject[] {
  if (!projectFlags.seeded) {
    projectFlags.seeded = true;
    const d = (n: number) => addDays(today, n);
    demoProjects.push({
      id: "prj-demo", clientId: DEMO_CLIENTS[0], goal: "Taper fade texturizado", barberId: store.bundle.barbers[0]?.id ?? null,
      createdAt: new Date(Date.now() - 35 * DAY).toISOString(), photoUrl: null, cutShape: 0,
      steps: [
        { wk: "S0", done: true, date: d(-35), title: { pt: "Corte base e mapeamento", en: "Base cut and mapping", es: "Corte base y mapeo" }, desc: { pt: "Fotos de referência, redução do volume lateral", en: "Reference photos, less volume on the sides", es: "Fotos de referencia, menos volumen lateral" } },
        { wk: "S3", done: true, date: d(-14), title: { pt: "Deixar o topo crescer", en: "Let the top grow", es: "Dejar crecer la parte superior" }, desc: { pt: "Só acabamento na nuca e laterais", en: "Only neck and side clean-ups", es: "Solo terminaciones en nuca y laterales" } },
        { wk: "S5", done: false, date: d(2), title: { pt: "Primeiro taper + textura", en: "First taper + texture", es: "Primer taper + textura" }, desc: { pt: "Degradê baixo e texturização com tesoura", en: "Low fade and scissor texturing", es: "Degradado bajo y texturizado con tijera" } },
        { wk: "S8", done: false, date: d(23), title: { pt: "Ajuste fino da barba", en: "Beard fine tuning", es: "Ajuste fino de la barba" }, desc: { pt: "Desenho da barba para afinar o rosto", en: "Beard design to slim the face", es: "Diseño de barba para afinar el rostro" } },
        { wk: "S10", done: false, date: d(37), title: { pt: "Resultado final", en: "Final result", es: "Resultado final" }, desc: { pt: "Fotos de antes e depois, manutenção a cada 15 dias", en: "Before and after photos, touch-up every 15 days", es: "Fotos de antes y después, mantenimiento cada 15 días" } },
      ],
    });
  }
  return demoProjects.filter((p) => p.clientId === clientId).map((p): StyleProject => ({ id: p.id, goal: p.goal, barberId: p.barberId, createdAt: p.createdAt, steps: p.steps, photoUrl: p.photoUrl, cutShape: p.cutShape }));
}
