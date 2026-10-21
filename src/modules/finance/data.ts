// Comissões e financeiro: regras de comissão, atendimentos e pagamentos do período, contas e fechamentos.
// Com o Supabase ligado usa o banco (as regras de segurança valem); sem ele, usa o `store` de demonstração.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed, store } from "@/data/demo";
import type { ShopBundle } from "@/data/types";
import { DEFAULT_RULES, type BarberPay, type CommissionRules, type PlanCommissionModel } from "@/core/commission";
import { addMonths, monthOf, type DoneVisit, type Expense, type ExpenseKind, type PaidPayment, type PayoutPeriod, type SubscriptionCycle } from "@/core/finance";
import { addDays, atMinutes, dayInZone } from "@/core/time";
import { listBarbers, listServices } from "@/modules/settings/data";
import { fetchAll, listPlans } from "@/modules/plans/data";
import { demoGlobal } from "@/data/demo-global";

const sb = () => supabaseConfigured();

// ---------------------------------------------------------------- regras de comissão

export interface StoredRules {
  rules: CommissionRules;
  payout: PayoutPeriod;
  pixSplit: boolean;
}

const demoRules = demoGlobal("finance.rules", (): StoredRules => ({ rules: { ...DEFAULT_RULES, tiers: [] }, payout: "weekly", pixSplit: false }));

/** % por serviço vem do cadastro de serviços (tela Serviços). */
async function serviceOverrides(shopId: string): Promise<Record<string, number>> {
  const list = await listServices(shopId);
  return Object.fromEntries(list.filter((s) => s.commissionOverridePct !== null).map((s) => [s.id, s.commissionOverridePct!]));
}

export async function getRules(shopId: string): Promise<StoredRules> {
  const overrides = await serviceOverrides(shopId);
  if (!sb()) return { ...demoRules, rules: { ...demoRules.rules, serviceOverrides: overrides } };
  const db = await supabaseServer();
  const { data, error } = await db.from("commission_rules").select("*").eq("shop_id", shopId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { rules: { ...DEFAULT_RULES, serviceOverrides: overrides }, payout: "weekly", pixSplit: false };
  return {
    rules: {
      planModel: data.plan_model as PlanCommissionModel,
      planPct: Number(data.plan_pct),
      listPricePct: Number(data.list_price_pct),
      fixedPerVisit: Number(data.fixed_per_visit),
      serviceOverrides: overrides,
      productPct: Number(data.product_pct),
      planSaleBonusPct: Number(data.plan_sale_bonus_pct),
      deductCardFee: data.deduct_card_fee,
      cardFeePct: Number(data.card_fee_pct),
      suppliesPerVisit: Number(data.supplies_per_visit),
      tiers: ((data.tiers ?? []) as { above: number; extra_pct: number }[]).map((t) => ({ above: Number(t.above), extraPct: Number(t.extra_pct) })),
      monthlyFloor: Number(data.monthly_floor),
    },
    payout: data.payout as PayoutPeriod,
    pixSplit: data.pix_split,
  };
}

export async function saveRules(shopId: string, s: StoredRules) {
  const tiers = [...s.rules.tiers].sort((a, b) => a.above - b.above);
  if (!sb()) {
    demoRules.rules = { ...s.rules, tiers, serviceOverrides: {} };
    demoRules.payout = s.payout;
    demoRules.pixSplit = s.pixSplit;
    return;
  }
  const r = s.rules;
  const db = await supabaseServer();
  const { error } = await db.from("commission_rules").upsert({
    shop_id: shopId, plan_model: r.planModel, plan_pct: r.planPct, list_price_pct: r.listPricePct, fixed_per_visit: r.fixedPerVisit,
    product_pct: r.productPct, plan_sale_bonus_pct: r.planSaleBonusPct, deduct_card_fee: r.deductCardFee, card_fee_pct: r.cardFeePct,
    supplies_per_visit: r.suppliesPerVisit, tiers: tiers.map((t) => ({ above: t.above, extra_pct: t.extraPct })),
    monthly_floor: r.monthlyFloor, payout: s.payout, pix_split: s.pixSplit,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- equipe (só leitura: edita-se na tela Equipe)

export interface PayBarber {
  id: string;
  name: string;
  color: string | null;
  active: boolean;
  pay: BarberPay;
}

export async function payBarbers(shopId: string): Promise<PayBarber[]> {
  return (await listBarbers(shopId)).map((b) => ({
    id: b.id, name: b.name, color: b.color, active: b.active,
    pay: b.pay === "chair_rent" ? { kind: "chair_rent", monthlyRent: b.chairRent } : { kind: "commission", pct: b.commissionPct },
  }));
}

// ---------------------------------------------------------------- atendimentos e pagamentos

export interface Activity {
  /** Atendimentos concluídos de `from - lookback` até `to`. */
  visits: (DoneVisit & { clientKey: string })[];
  /** Pagamentos recebidos entre `from` e `to`. */
  payments: PaidPayment[];
  subscriptions: Map<string, SubscriptionCycle>;
  /** Planos vendidos (primeira mensalidade paga) entre `from` e `to`. */
  plansSold: { barberId: string; firstPayment: number; at: Date }[];
  cardByVisit: Map<string, number>;
}

/** Dias antes do período que também são lidos para contar os usos do plano no ciclo. */
const LOOKBACK_DAYS = 62;

/** Forma de pagamento fixa para cada atendimento de demonstração (o banco de demonstração não guarda o pagamento do avulso). */
function demoMethod(id: string): PaidPayment["method"] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const x = Math.abs(h) % 10;
  return x < 5 ? "pix" : x < 8 ? "card" : "cash";
}

export async function loadActivity(b: ShopBundle, from: Date, to: Date): Promise<Activity> {
  const since = new Date(from.getTime() - LOOKBACK_DAYS * 86_400_000);
  const plans = new Map((await listPlans(b)).map((p) => [p.id, p]));
  const prices = new Map((await listServices(b.shop.id)).map((s) => [s.id, s.price]));

  if (!sb()) {
    const s = demoSeed();
    const visits = s.appointments
      .filter((a) => a.status === "done" && a.startsAt >= since && a.startsAt < to)
      .map((a) => ({
        id: a.id, barberId: a.barberId, serviceId: a.serviceId, servicePrice: prices.get(a.serviceId) ?? a.price, price: a.price,
        startsAt: a.startsAt, subscriptionId: a.subscriptionId, clientKey: a.clientId ?? a.clientName,
      }));
    const real = s.payments.filter((p) => p.status === "paid" && p.paidAt);
    const linked = new Set(real.map((p) => p.appointmentId));
    const walkIns: PaidPayment[] = visits
      .filter((v) => !v.subscriptionId && v.price > 0 && !linked.has(v.id))
      .map((v) => ({ id: "demo-" + v.id, amount: v.price, method: demoMethod(v.id), subscriptionId: null, appointmentId: v.id, paidAt: v.startsAt }));
    const all: PaidPayment[] = [
      ...real.map((p) => ({ id: p.id, amount: p.amount, method: p.method, subscriptionId: p.subscriptionId, appointmentId: p.appointmentId, paidAt: p.paidAt! })),
      ...walkIns,
    ];
    const subscriptions = new Map(s.subscriptions.map((x) => {
      const plan = plans.get(x.planId);
      return [x.id, { id: x.id, planPrice: plan?.price ?? 0, quotaUses: plan?.quotaUses ?? null, periodDays: plan?.periodDays ?? 30, periodStart: x.periodStart }];
    }));
    const firstPaid = new Map<string, PaidPayment>();
    for (const p of [...all].sort((a, b) => +a.paidAt - +b.paidAt)) if (p.subscriptionId && !firstPaid.has(p.subscriptionId)) firstPaid.set(p.subscriptionId, p);
    const plansSold = s.subscriptions.flatMap((x) => {
      const p = firstPaid.get(x.id);
      return x.soldByBarberId && p && p.paidAt >= from && p.paidAt < to ? [{ barberId: x.soldByBarberId, firstPayment: p.amount, at: p.paidAt }] : [];
    });
    const payments = all.filter((p) => p.paidAt >= from && p.paidAt < to);
    return { visits, payments, subscriptions, plansSold, cardByVisit: cardMap(all) };
  }

  const db = await supabaseServer();
  const tz = b.shop.timezone;
  type ApptRow = { id: string; barber_id: string; service_id: string; starts_at: string; price: number; subscription_id: string | null;
    client_id: string | null; walk_in_name: string | null };
  type PayRow = { id: string; amount: number; method: PaidPayment["method"]; subscription_id: string | null; appointment_id: string | null;
    paid_at: string | null; created_at: string };
  type SubRow = { id: string; plan_id: string; period_start: string; sold_by_barber_id: string | null };
  const iso = (d: Date) => d.toISOString();
  const [appts, pays, subs] = await Promise.all([
    fetchAll<ApptRow>((f, t) => db.from("appointments")
      .select("id, barber_id, service_id, starts_at, price, subscription_id, client_id, walk_in_name")
      .eq("shop_id", b.shop.id).eq("status", "done").gte("starts_at", iso(since)).lt("starts_at", iso(to)).order("starts_at").range(f, t)),
    fetchAll<PayRow>((f, t) => db.from("payments")
      .select("id, amount, method, subscription_id, appointment_id, paid_at, created_at")
      .eq("shop_id", b.shop.id).eq("status", "paid")
      .or(`and(paid_at.gte.${iso(since)},paid_at.lt.${iso(to)}),and(paid_at.is.null,created_at.gte.${iso(since)},created_at.lt.${iso(to)})`)
      .order("created_at").range(f, t)),
    fetchAll<SubRow>((f, t) => db.from("subscriptions").select("id, plan_id, period_start, sold_by_barber_id").eq("shop_id", b.shop.id).range(f, t)),
  ]);
  const visits = appts.map((a) => ({
    id: a.id, barberId: a.barber_id, serviceId: a.service_id, servicePrice: prices.get(a.service_id) ?? Number(a.price), price: Number(a.price),
    startsAt: new Date(a.starts_at), subscriptionId: a.subscription_id, clientKey: a.client_id ?? a.walk_in_name ?? a.id,
  }));
  const all: PaidPayment[] = pays.map((p) => ({
    id: p.id, amount: Number(p.amount), method: p.method, subscriptionId: p.subscription_id, appointmentId: p.appointment_id,
    paidAt: new Date(p.paid_at ?? p.created_at),
  }));
  const subscriptions = new Map(subs.map((x) => {
    const plan = plans.get(x.plan_id);
    return [x.id, { id: x.id, planPrice: plan?.price ?? 0, quotaUses: plan?.quotaUses ?? null, periodDays: plan?.periodDays ?? 30,
      periodStart: atMinutes(x.period_start, 0, tz) }];
  }));

  // plano vendido = assinatura cuja primeira mensalidade paga caiu no período
  const inRange = all.filter((p) => p.subscriptionId && p.paidAt >= from && p.paidAt < to);
  const subIds = [...new Set(inRange.map((p) => p.subscriptionId!))];
  const before = new Set<string>();
  for (let i = 0; i < subIds.length; i += 200) {
    const { data, error } = await db.from("payments").select("subscription_id").eq("status", "paid")
      .in("subscription_id", subIds.slice(i, i + 200)).lt("paid_at", iso(from));
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => before.add(r.subscription_id as string));
  }
  const soldBy = new Map(subs.map((x) => [x.id, x.sold_by_barber_id]));
  const seen = new Set<string>();
  const plansSold = [...inRange].sort((a, b) => +a.paidAt - +b.paidAt).flatMap((p) => {
    const id = p.subscriptionId!;
    const barberId = soldBy.get(id);
    if (before.has(id) || seen.has(id) || !barberId) return [];
    seen.add(id);
    return [{ barberId, firstPayment: p.amount, at: p.paidAt }];
  });
  return { visits, payments: all.filter((p) => p.paidAt >= from && p.paidAt < to), subscriptions, plansSold, cardByVisit: cardMap(all) };
}

function cardMap(payments: PaidPayment[]) {
  const m = new Map<string, number>();
  for (const p of payments) if (p.method === "card" && p.appointmentId) m.set(p.appointmentId, (m.get(p.appointmentId) ?? 0) + p.amount);
  return m;
}

// ---------------------------------------------------------------- contas

export type ExpenseInput = Omit<Expense, "id" | "paidOn" | "paidThrough">;

const expHolder = demoGlobal("finance.expenses", () => ({ list: null as Expense[] | null }));

/** Contas de exemplo da Dom Bigode, a partir do mês passado (onde começam os atendimentos de demonstração). */
function seedDemoExpenses(tz: string): Expense[] {
  const today = dayInZone(new Date(), tz);
  const month = monthOf(today);
  const prev = addMonths(month, -1);
  const d = Number(today.slice(8));
  const rec = (name: string, category: string, kind: ExpenseKind, amount: number, dueDay: number, paidThisMonth: boolean): Expense => ({
    id: demoId("exp"), name, category, kind, amount, recurring: true, dueDay, dueDate: null, startsOn: `${prev}-01`,
    paidOn: paidThisMonth ? `${month}-${String(Math.min(dueDay, d)).padStart(2, "0")}` : `${prev}-${String(dueDay).padStart(2, "0")}`,
    paidThrough: paidThisMonth ? month : prev,
  });
  return [
    rec("Aluguel do ponto", "Estrutura", "fixed", 4800, 5, d > 5),
    rec("Contabilidade", "Serviços", "fixed", 450, 10, d > 10),
    rec("Internet e telefone", "Estrutura", "fixed", 159.9, 15, false), // fica atrasada para mostrar o alerta, se já passou do dia 15
    rec("Sistema e maquininha", "Serviços", "fixed", 89.9, 20, d > 20),
    rec("Conta de luz", "Estrutura", "variable", 612.4, Math.min(28, d + 2), false),
    rec("Conta de água", "Estrutura", "variable", 186.3, Math.min(28, d + 4), false),
    rec("Produtos e insumos (lâminas, pomadas, toalhas)", "Insumos", "variable", 1350, 25, d > 25),
    rec("Marketing (Instagram e panfletos)", "Marketing", "variable", 400, 28, false),
    { id: demoId("exp"), name: "Conserto da cadeira 2", category: "Manutenção", kind: "variable", amount: 380, recurring: false, dueDay: null,
      dueDate: addDays(today, 9), startsOn: today, paidOn: null, paidThrough: null },
  ];
}

function demoList(b: ShopBundle) {
  if (b.shop.id !== store.bundle.shop.id) throw new Error("not_found");
  expHolder.list ??= seedDemoExpenses(b.shop.timezone);
  return expHolder.list;
}

type ExpenseRow = { id: string; name: string; category: string; kind: ExpenseKind; amount: number; recurring: boolean; due_day: number | null;
  due_date: string | null; starts_on: string; paid_at: string | null; paid_through: string | null; notes: string | null };

export async function listExpenses(b: ShopBundle): Promise<Expense[]> {
  if (!sb()) return demoList(b).map((e) => ({ ...e }));
  const db = await supabaseServer();
  const rows = await fetchAll<ExpenseRow>((f, t) => db.from("expenses")
    .select("id, name, category, kind, amount, recurring, due_day, due_date, starts_on, paid_at, paid_through, notes")
    .eq("shop_id", b.shop.id).order("created_at").range(f, t));
  return rows.map((e) => ({
    id: e.id, name: e.name, category: e.category, kind: e.kind, amount: Number(e.amount), recurring: e.recurring, dueDay: e.due_day,
    dueDate: e.due_date, startsOn: e.starts_on, paidOn: e.paid_at ? dayInZone(new Date(e.paid_at), b.shop.timezone) : null,
    paidThrough: e.paid_through ? e.paid_through.slice(0, 7) : null, notes: e.notes,
  }));
}

const toRow = (e: ExpenseInput) => ({
  name: e.name, category: e.category, kind: e.kind, amount: e.amount, recurring: e.recurring,
  due_day: e.recurring ? e.dueDay : null, due_date: e.recurring ? null : e.dueDate, starts_on: e.startsOn, notes: e.notes ?? null,
});

export async function saveExpense(b: ShopBundle, input: ExpenseInput & { id?: string }) {
  const clean: ExpenseInput = { ...input, dueDay: input.recurring ? input.dueDay : null, dueDate: input.recurring ? null : input.dueDate };
  if (!sb()) {
    const list = demoList(b);
    const cur = input.id ? list.find((e) => e.id === input.id) : undefined;
    if (input.id && !cur) throw new Error("not_found");
    if (cur) Object.assign(cur, clean);
    else list.push({ ...clean, id: demoId("exp"), paidOn: null, paidThrough: null });
    return;
  }
  const db = await supabaseServer();
  const q = input.id
    ? db.from("expenses").update(toRow(clean)).eq("id", input.id).eq("shop_id", b.shop.id)
    : db.from("expenses").insert({ ...toRow(clean), shop_id: b.shop.id });
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function deleteExpense(b: ShopBundle, id: string) {
  if (!sb()) {
    const list = demoList(b);
    const i = list.findIndex((e) => e.id === id);
    if (i >= 0) list.splice(i, 1);
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("expenses").delete().eq("id", id).eq("shop_id", b.shop.id);
  if (error) throw new Error(error.message);
}

export async function setExpensePaid(b: ShopBundle, id: string, patch: Pick<Expense, "paidOn" | "paidThrough">) {
  if (!sb()) {
    const e = demoList(b).find((x) => x.id === id);
    if (!e) throw new Error("not_found");
    Object.assign(e, patch);
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("expenses").update({
    paid_at: patch.paidOn ? atMinutes(patch.paidOn, 12 * 60, b.shop.timezone).toISOString() : null,
    paid_through: patch.paidThrough ? patch.paidThrough + "-01" : null,
  }).eq("id", id).eq("shop_id", b.shop.id);
  if (error) throw new Error(error.message);
}

export async function getExpense(b: ShopBundle, id: string): Promise<Expense | null> {
  return (await listExpenses(b)).find((e) => e.id === id) ?? null;
}

// ---------------------------------------------------------------- fechamento de comissão

export interface Payout {
  barberId: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  paidOn: string;
}

const demoPayouts = demoGlobal("finance.payouts", (): Payout[] => []);

export async function listPayouts(b: ShopBundle, start: string, end: string): Promise<Payout[]> {
  if (!sb()) return demoPayouts.filter((p) => p.periodStart === start && p.periodEnd === end);
  const db = await supabaseServer();
  const { data, error } = await db.from("commission_payouts").select("barber_id, period_start, period_end, amount, paid_at")
    .eq("shop_id", b.shop.id).eq("period_start", start).eq("period_end", end);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ barberId: p.barber_id, periodStart: p.period_start, periodEnd: p.period_end, amount: Number(p.amount),
    paidOn: dayInZone(new Date(p.paid_at), b.shop.timezone) }));
}

export async function setPayout(b: ShopBundle, p: Omit<Payout, "paidOn">, paid: boolean) {
  if (!sb()) {
    const i = demoPayouts.findIndex((x) => x.barberId === p.barberId && x.periodStart === p.periodStart && x.periodEnd === p.periodEnd);
    if (i >= 0) demoPayouts.splice(i, 1);
    if (paid) demoPayouts.push({ ...p, paidOn: dayInZone(new Date(), b.shop.timezone) });
    return;
  }
  const db = await supabaseServer();
  const { error } = paid
    ? await db.from("commission_payouts").upsert(
      { shop_id: b.shop.id, barber_id: p.barberId, period_start: p.periodStart, period_end: p.periodEnd, amount: p.amount, paid_at: new Date().toISOString() },
      { onConflict: "barber_id,period_start,period_end" })
    : await db.from("commission_payouts").delete().eq("shop_id", b.shop.id).eq("barber_id", p.barberId)
      .eq("period_start", p.periodStart).eq("period_end", p.periodEnd);
  if (error) throw new Error(error.message);
}

