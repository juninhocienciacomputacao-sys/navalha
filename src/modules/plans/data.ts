// Planos (catálogo) e assinaturas: demonstração em memória ou Supabase (as regras de segurança do banco valem).
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed } from "@/data/demo";
import type { ShopBundle } from "@/data/types";
import type { Plan } from "@/core/types";
import { dayInZone } from "@/core/time";
import { firstCycle, renewOnPayment } from "@/core/planboard";
import { demoGlobal } from "@/data/demo-global";
import { rulesOf, type PlanRules } from "@/core/plan-rules";
import { PLAN_RULE_COLUMNS, rulesFromRow, rulesToRow, type PlanRuleRow } from "@/data/plan-row";

export type PayMethod = "pix" | "card" | "cash";

export interface PlanItem extends Plan {
  /** Regras completas (sem campos faltando). */
  rules: PlanRules;
  active: boolean;
  /** Serviços que o plano cobre. */
  serviceIds: string[];
}

export interface SubRow {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  planId: string;
  periodStart: string;
  periodEnd: string;
  usesInPeriod: number;
  soldByBarberId: string | null;
  cancelledAt: string | null;
}

export interface PlanInput {
  id?: string;
  name: string;
  price: number;
  periodDays: number;
  quotaUses: number | null;
  serviceIds: string[];
  rules: PlanRules;
}

export type Result = { ok: true; id?: string } | { ok: false; error: string };

/** Planos desativados no modo demonstração (os ativos ficam em `store.bundle.plans`, que o app do cliente lê). */
const demoInactive = demoGlobal("plans.inactive", (): Plan[] => []);

const today = (b: ShopBundle) => dayInZone(new Date(), b.shop.timezone);

/** Lê todas as linhas, de mil em mil (o Supabase devolve no máximo mil por vez). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function listPlans(b: ShopBundle): Promise<PlanItem[]> {
  if (!supabaseConfigured()) {
    const { bundle } = demoSeed();
    const cover = (id: string) => bundle.services.filter((s) => s.planIds.includes(id)).map((s) => s.id);
    return [
      ...bundle.plans.map((p) => ({ ...p, rules: rulesOf(p), active: true, serviceIds: cover(p.id) })),
      ...demoInactive.map((p) => ({ ...p, rules: rulesOf(p), active: false, serviceIds: cover(p.id) })),
    ];
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("plans")
    .select(`id, name, price, quota_uses, period_days, active, ${PLAN_RULE_COLUMNS}, plan_services(service_id)`)
    .eq("shop_id", b.shop.id).order("price");
  if (error) throw new Error(error.message);
  type Row = PlanRuleRow & { id: string; name: string; price: number; quota_uses: number | null; period_days: number; active: boolean; plan_services: { service_id: string }[] };
  return ((data ?? []) as Row[]).map((p) => ({
    id: p.id, name: p.name, price: Number(p.price), quotaUses: p.quota_uses, periodDays: p.period_days, active: p.active, rules: rulesFromRow(p),
    serviceIds: (p.plan_services ?? []).map((x) => x.service_id),
  }));
}

export async function savePlan(b: ShopBundle, input: PlanInput): Promise<Result> {
  const fields = { name: input.name, price: input.price, quotaUses: input.quotaUses, periodDays: input.periodDays, rules: input.rules };
  if (!supabaseConfigured()) {
    const { bundle } = demoSeed();
    let id = input.id;
    if (id) {
      const p = bundle.plans.find((x) => x.id === id) ?? demoInactive.find((x) => x.id === id);
      if (!p) return { ok: false, error: "Plano não encontrado." };
      Object.assign(p, fields);
    } else {
      id = demoId("p");
      bundle.plans.push({ id, ...fields });
    }
    for (const s of bundle.services) {
      const has = s.planIds.includes(id);
      const want = input.serviceIds.includes(s.id);
      if (want && !has) s.planIds.push(id);
      if (!want && has) s.planIds.splice(s.planIds.indexOf(id), 1);
    }
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const row = { name: input.name, price: input.price, quota_uses: input.quotaUses, period_days: input.periodDays, ...rulesToRow(input.rules) };
  let id = input.id;
  if (id) {
    const { error } = await db.from("plans").update(row).eq("id", id).eq("shop_id", b.shop.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await db.from("plans").insert({ ...row, shop_id: b.shop.id }).select("id").single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }
  const del = await db.from("plan_services").delete().eq("plan_id", id);
  if (del.error) return { ok: false, error: del.error.message };
  if (input.serviceIds.length) {
    const ins = await db.from("plan_services").insert(input.serviceIds.map((service_id) => ({ plan_id: id, service_id })));
    if (ins.error) return { ok: false, error: ins.error.message };
  }
  return { ok: true, id };
}

export async function setPlanActive(b: ShopBundle, id: string, active: boolean): Promise<Result> {
  if (!supabaseConfigured()) {
    const { bundle } = demoSeed();
    const [from, to] = active ? [demoInactive, bundle.plans] : [bundle.plans, demoInactive];
    const i = from.findIndex((p) => p.id === id);
    if (i >= 0) to.push(...from.splice(i, 1));
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.from("plans").update({ active }).eq("id", id).eq("shop_id", b.shop.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Assinaturas da barbearia (sem as canceladas, a não ser que peça). `clientId` filtra um cliente. */
export async function listSubscriptions(b: ShopBundle, opts: { clientId?: string; withCancelled?: boolean } = {}): Promise<SubRow[]> {
  const tz = b.shop.timezone;
  if (!supabaseConfigured()) {
    const s = demoSeed();
    return s.subscriptions
      .filter((x) => (opts.withCancelled || !x.cancelledAt) && (!opts.clientId || x.clientId === opts.clientId))
      .map((x) => {
        const c = s.clients.find((c) => c.id === x.clientId);
        return {
          id: x.id, clientId: x.clientId, clientName: c?.name ?? "Cliente", phone: c?.phone ?? "", planId: x.planId,
          periodStart: dayInZone(x.periodStart, tz), periodEnd: dayInZone(x.periodEnd, tz), usesInPeriod: x.usesInPeriod,
          soldByBarberId: x.soldByBarberId, cancelledAt: x.cancelledAt?.toISOString() ?? null,
        };
      });
  }
  const db = await supabaseServer();
  type Row = {
    id: string; client_id: string; plan_id: string; period_start: string; period_end: string; uses_in_period: number;
    sold_by_barber_id: string | null; cancelled_at: string | null; clients: { name: string; phone_e164: string } | null;
  };
  const rows = await fetchAll<Row>((from, to) => {
    let q = db.from("subscriptions")
      .select("id, client_id, plan_id, period_start, period_end, uses_in_period, sold_by_barber_id, cancelled_at, clients(name, phone_e164)")
      .eq("shop_id", b.shop.id);
    if (!opts.withCancelled) q = q.is("cancelled_at", null);
    if (opts.clientId) q = q.eq("client_id", opts.clientId);
    return q.order("period_end").range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
  });
  return rows.map((x) => ({
    id: x.id, clientId: x.client_id, clientName: x.clients?.name ?? "Cliente", phone: x.clients?.phone_e164 ?? "", planId: x.plan_id,
    periodStart: x.period_start, periodEnd: x.period_end, usesInPeriod: x.uses_in_period,
    soldByBarberId: x.sold_by_barber_id, cancelledAt: x.cancelled_at,
  }));
}

/** Pagamento recebido: renova o ciclo (regra de `applyPayment`) e lança em `payments`. */
export async function registerPayment(b: ShopBundle, subId: string, method: PayMethod): Promise<Result> {
  const plans = await listPlans(b);
  const day = today(b);
  const now = new Date();
  if (!supabaseConfigured()) {
    const s = demoSeed();
    const sub = s.subscriptions.find((x) => x.id === subId && !x.cancelledAt);
    const plan = sub && plans.find((p) => p.id === sub.planId);
    if (!sub || !plan) return { ok: false, error: "Assinatura não encontrada." };
    const tz = b.shop.timezone;
    const next = renewOnPayment({ periodStart: dayInZone(sub.periodStart, tz), periodEnd: dayInZone(sub.periodEnd, tz), usesInPeriod: sub.usesInPeriod }, plan, day);
    sub.periodStart = noonOf(next.periodStart);
    sub.periodEnd = noonOf(next.periodEnd);
    sub.usesInPeriod = next.usesInPeriod;
    s.payments.push({ id: demoId("pay"), clientId: sub.clientId, subscriptionId: sub.id, appointmentId: null, amount: plan.price, method, status: "paid", paidAt: now });
    return { ok: true };
  }
  const db = await supabaseServer();
  const { data: sub, error } = await db.from("subscriptions")
    .select("id, client_id, plan_id, period_start, period_end, uses_in_period")
    .eq("id", subId).eq("shop_id", b.shop.id).is("cancelled_at", null).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const plan = sub && plans.find((p) => p.id === sub.plan_id);
  if (!sub || !plan) return { ok: false, error: "Assinatura não encontrada." };
  const next = renewOnPayment({ periodStart: sub.period_start, periodEnd: sub.period_end, usesInPeriod: sub.uses_in_period }, plan, day);
  const pay = await db.from("payments").insert({
    shop_id: b.shop.id, client_id: sub.client_id, subscription_id: sub.id, amount: plan.price, method, status: "paid", paid_at: now.toISOString(),
  });
  if (pay.error) return { ok: false, error: pay.error.message };
  const up = await db.from("subscriptions")
    .update({ period_start: next.periodStart, period_end: next.periodEnd, uses_in_period: next.usesInPeriod }).eq("id", sub.id);
  return up.error ? { ok: false, error: up.error.message } : { ok: true };
}

/** Vende um plano: começa hoje, já pago, e guarda quem vendeu (para o bônus de comissão). */
export async function sellPlan(b: ShopBundle, input: { clientId: string; planId: string; barberId: string | null; method: PayMethod }): Promise<Result> {
  const plan = (await listPlans(b)).find((p) => p.id === input.planId && p.active);
  if (!plan) return { ok: false, error: "Plano não encontrado ou desativado." };
  if (input.barberId && !b.barbers.some((x) => x.id === input.barberId)) return { ok: false, error: "Barbeiro não encontrado." };
  const open = await listSubscriptions(b, { clientId: input.clientId });
  if (open.length) return { ok: false, error: "Este cliente já tem um plano. Para renovar use “Registrar pagamento”, ou cancele o atual antes." };
  if (plan.rules.maxSubscribers) {
    const taken = (await listSubscriptions(b)).filter((s) => s.planId === plan.id && s.periodEnd >= today(b)).length;
    if (taken >= plan.rules.maxSubscribers) return { ok: false, error: `As ${plan.rules.maxSubscribers} vagas deste plano estão ocupadas. Aumente as vagas no plano para vender mais.` };
  }
  const cycle = firstCycle(plan, today(b));
  const now = new Date();
  if (!supabaseConfigured()) {
    const s = demoSeed();
    if (!s.clients.some((c) => c.id === input.clientId)) return { ok: false, error: "Cliente não encontrado." };
    const id = demoId("sub");
    s.subscriptions.push({ id, clientId: input.clientId, planId: plan.id, periodStart: noonOf(cycle.periodStart), periodEnd: noonOf(cycle.periodEnd),
      usesInPeriod: 0, soldByBarberId: input.barberId, cancelledAt: null });
    s.payments.push({ id: demoId("pay"), clientId: input.clientId, subscriptionId: id, appointmentId: null, amount: plan.price, method: input.method, status: "paid", paidAt: now });
    return { ok: true, id };
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("subscriptions").insert({
    shop_id: b.shop.id, client_id: input.clientId, plan_id: plan.id, sold_by_barber_id: input.barberId,
    period_start: cycle.periodStart, period_end: cycle.periodEnd, uses_in_period: 0,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  const pay = await db.from("payments").insert({
    shop_id: b.shop.id, client_id: input.clientId, subscription_id: data.id, amount: plan.price, method: input.method, status: "paid", paid_at: now.toISOString(),
  });
  return pay.error ? { ok: false, error: pay.error.message } : { ok: true, id: data.id };
}

export async function cancelSubscription(b: ShopBundle, subId: string): Promise<Result> {
  if (!supabaseConfigured()) {
    const sub = demoSeed().subscriptions.find((x) => x.id === subId);
    if (!sub) return { ok: false, error: "Assinatura não encontrada." };
    sub.cancelledAt = new Date();
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.from("subscriptions").update({ cancelled_at: new Date().toISOString() }).eq("id", subId).eq("shop_id", b.shop.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Quantos dias antes do vencimento o painel começa a avisar. */
export async function setAlertDays(b: ShopBundle, days: number): Promise<Result> {
  if (!supabaseConfigured()) {
    demoSeed().bundle.shop.planAlertDays = days;
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.from("shops").update({ plan_alert_days: days }).eq("id", b.shop.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Dia "AAAA-MM-DD" → meio-dia UTC (o demo guarda Date; meio-dia cai no mesmo dia em qualquer fuso das Américas/Europa). */
const noonOf = (day: string) => new Date(day + "T12:00:00Z");

/** Pagamentos de plano de uma assinatura (para a ficha do cliente). */
export async function subscriptionPayments(b: ShopBundle, clientId: string): Promise<{ id: string; amount: number; method: PayMethod; paidAt: string | null }[]> {
  if (!supabaseConfigured()) {
    return demoSeed().payments.filter((p) => p.clientId === clientId && p.subscriptionId && p.status === "paid")
      .map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidAt: p.paidAt?.toISOString() ?? null }))
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  }
  const db = await supabaseServer();
  const { data } = await db.from("payments").select("id, amount, method, paid_at")
    .eq("shop_id", b.shop.id).eq("client_id", clientId).not("subscription_id", "is", null).eq("status", "paid")
    .order("paid_at", { ascending: false }).limit(24);
  return (data ?? []).map((p) => ({ id: p.id, amount: Number(p.amount), method: p.method, paidAt: p.paid_at }));
}
