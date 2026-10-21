import { requireStaff } from "@/lib/staff";
import { dayInZone } from "@/core/time";
import { formatMoney } from "@/core/money";
import { daysLeft, monthlyValue } from "@/core/planboard";
import { listPlans, listSubscriptions } from "@/modules/plans/data";
import { clientOptions } from "@/modules/clients/data";
import { Kpi } from "@/modules/clients/ui";
import PlanCatalog from "./PlanCatalog";
import Subscriptions from "./Subscriptions";

export const dynamic = "force-dynamic";

export default async function Planos({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; vender?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { bundle, role } = await requireStaff(slug);
  const { shop, barbers, services } = bundle;
  const canManage = role === "owner" || role === "manager";
  const today = dayInZone(new Date(), shop.timezone);
  const [plans, subs, clients] = await Promise.all([listPlans(bundle), listSubscriptions(bundle), clientOptions(bundle)]);
  const money = (n: number) => formatMoney(n, shop.currency, shop.defaultLang);
  const alert = shop.planAlertDays;
  const rows = subs.map((s) => ({ ...s, left: daysLeft(s.periodEnd, today) }));
  const plan = (id: string) => plans.find((p) => p.id === id);
  const live = rows.filter((s) => s.left >= 0);
  const expiring = live.filter((s) => s.left <= alert);
  const expired = rows.filter((s) => s.left < 0);
  const sum = (list: typeof rows) => list.reduce((t, s) => t + (plan(s.planId)?.price ?? 0), 0);
  const mrr = live.reduce((t, s) => { const p = plan(s.planId); return t + (p ? monthlyValue(p.price, p.periodDays) : 0); }, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Planos</p>
        <h1 className="text-2xl font-bold">Planos e assinaturas</h1>
        <p className="mt-1 text-sm text-neutral-500">Crie os planos da casa, venda para os clientes e acompanhe quem precisa renovar.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Assinantes ativos" value={String(live.length)} hint={`${subs.length} no total`} />
        <Kpi label="Receita recorrente por mês" value={money(mrr)} hint="planos em dia" />
        <Kpi label={`Vencem em até ${alert} dias`} value={String(expiring.length)} hint={`${money(sum(expiring))} a renovar`} tone={expiring.length ? "warn" : undefined} />
        <Kpi label="Vencidos" value={String(expired.length)} hint={`${money(sum(expired))} parados`} tone={expired.length ? "bad" : undefined} />
      </section>

      <PlanCatalog slug={slug} canManage={canManage} currency={shop.currency} lang={shop.defaultLang}
        services={services.map((s) => ({ id: s.id, name: s.name.pt, price: s.price }))}
        plans={plans.map((p) => {
          const mine = live.filter((s) => s.planId === p.id);
          return { ...p, subscribers: mine.length, monthly: mine.length * monthlyValue(p.price, p.periodDays) };
        })} />

      <Subscriptions slug={slug} canManage={canManage} shopName={shop.name} currency={shop.currency} lang={shop.defaultLang}
        alertDays={alert} barbers={barbers} plans={plans} subs={rows} clients={clients}
        initialQuery={sp.q ?? ""} sellTo={sp.vender ?? null} />
    </main>
  );
}
