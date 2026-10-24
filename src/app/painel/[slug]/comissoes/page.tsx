import Link from "next/link";
import { requireSection } from "@/lib/staff";
import { formatMoney } from "@/core/money";
import { dayInZone } from "@/core/time";
import { planVisitValue, type CommissionLine } from "@/core/commission";
import { periodFraction, periodRange, rulesForPeriod, shiftPeriod, type DayRange, type PayoutPeriod } from "@/core/finance";
import { getRules } from "@/modules/finance/data";
import { commissionStatements, type BarberStatement } from "@/modules/finance/compute";
import { listServices } from "@/modules/settings/data";
import { listPlans } from "@/modules/plans/data";
import RulesEditor from "./RulesEditor";
import PayoutButton from "./PayoutButton";

export const dynamic = "force-dynamic";

const PERIODS: { k: PayoutPeriod; label: string }[] = [
  { k: "weekly", label: "Semana" },
  { k: "biweekly", label: "Quinzena" },
  { k: "monthly", label: "Mês" },
];
const MODEL_SHORT = { usage_split: "rateio pelo uso", quota_split: "cota do plano", list_price: "preço de tabela", fixed: "valor fixo" } as const;

const fmtDay = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

export default async function Comissoes({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; d?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { bundle: b } = await requireSection(slug, "comissoes");
  const { shop } = b;
  const today = dayInZone(new Date(), shop.timezone);

  // período: o escolhido na tela, ou o período de pagamento configurado
  const saved = await getRules(shop.id);
  const kind = PERIODS.find((x) => x.k === sp.p)?.k ?? saved.payout;
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const range = periodRange(kind, day);
  const { stored, barbers, list } = await commissionStatements(b, range);
  const [services, plans] = await Promise.all([listServices(shop.id), listPlans(b)]);
  const money = (n: number) => formatMoney(n, shop.currency, shop.defaultLang);
  const total = list.reduce((a, x) => a + Math.max(0, x.statement.result.total), 0);
  const isCurrent = range.start <= today && today <= range.end;
  const href = (k: PayoutPeriod, d: string) => `/painel/${slug}/comissoes?p=${k}&d=${d}`;
  const prev = shiftPeriod(kind, range, -1);
  const next = shiftPeriod(kind, range, 1);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name.pt ?? "Serviço";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Comissões</p>
        <h1 className="text-2xl font-bold">Quanto cada profissional recebe</h1>
        <p className="mt-1 text-sm text-neutral-500">Escolha as regras à esquerda. O extrato ao lado é calculado com os atendimentos concluídos de verdade.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="order-2 min-w-0 lg:order-1">
          <RulesEditor
            slug={slug}
            initial={{ rules: stored.rules, payout: stored.payout, pixSplit: stored.pixSplit }}
            currency={shop.currency}
            lang={shop.defaultLang}
            barbers={barbers.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, color: x.color, pay: x.pay }))}
            services={services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name.pt, price: s.price, overridePct: s.commissionOverridePct }))}
            plans={plans.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, price: p.price, quotaUses: p.quotaUses }))}
          />
        </section>

        <aside className="order-1 min-w-0 lg:order-2">
          <div className="card lg:sticky lg:top-4">
            <h2 className="font-semibold">Extrato do período</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <Link key={p.k} href={href(p.k, isCurrent ? today : range.start)} className={`chip ${p.k === kind ? "chip-on" : ""}`}>{p.label}</Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <Link href={href(kind, prev.start)} className="chip" aria-label="Período anterior">←</Link>
              <span className="text-center font-medium tabular-nums">
                {fmtDay(range.start)} a {fmtDay(range.end)}{isCurrent ? " · atual" : ""}
              </span>
              <Link href={href(kind, next.start)} className="chip" aria-label="Próximo período">→</Link>
            </div>
            {!isCurrent && <p className="mt-2 text-center text-xs"><Link className="underline" href={href(kind, today)}>voltar para o período atual</Link></p>}

            <div className="mt-4 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
              <p className="text-xs text-neutral-500">Total a pagar à equipe</p>
              <p className="text-2xl font-bold tabular-nums">{money(total)}</p>
              <p className="text-xs text-neutral-500">
                {stored.pixSplit ? "Pix dividido ligado: cada pagamento já sai separado para o profissional." : `Pagamento ${({ weekly: "semanal", biweekly: "quinzenal", monthly: "mensal" })[stored.payout]}, configurado nas regras.`}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {list.length === 0 && <p className="text-sm text-neutral-500">Nenhum profissional cadastrado.</p>}
              {list.map((x) => (
                <BarberCard key={x.barber.id} x={x} tz={shop.timezone} slug={slug} kind={kind} range={range} money={money} svcName={svcName}
                  rules={rulesForPeriod(stored.rules, periodFraction(range))} planModel={stored.rules.planModel} canPay={!isCurrent || today === range.end} />
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Metas, garantia mínima e aluguel de cadeira são mensais; em semana ou quinzena entram proporcionais ao número de dias.
              Vendas de produtos ainda não são registradas no sistema.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function BarberCard({ x, tz, slug, kind, range, money, svcName, rules, planModel, canPay }: {
  x: BarberStatement; tz: string; slug: string; kind: PayoutPeriod; range: DayRange; money: (n: number) => string; svcName: (id: string) => string;
  rules: ReturnType<typeof rulesForPeriod>; planModel: keyof typeof MODEL_SHORT; canPay: boolean;
}) {
  const { barber, statement: s, turnover } = x;
  const p = s.period;
  const walkIn = p.sales.reduce((a, v) => a + v.amount, 0);
  const card = p.sales.reduce((a, v) => a + v.cardAmount, 0);
  const visits = p.sales.length + p.planVisits.length;
  const rent = barber.pay.kind === "chair_rent";
  const pctOf = barber.pay.kind === "commission" ? barber.pay.pct : 0;
  const overridden = p.sales.some((v) => rules.serviceOverrides[v.serviceId] !== undefined);
  const tier = [...rules.tiers].sort((a, b) => b.above - a.above).find((t) => turnover > t.above);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

  const explain = (l: CommissionLine): [string, string] => {
    switch (l.key) {
      case "services":
        return rent
          ? ["Atendimentos avulsos", `${n(p.sales.length, "atendimento", "atendimentos")} · fica com tudo (${money(walkIn)})`]
          : ["Atendimentos avulsos", `${n(p.sales.length, "atendimento", "atendimentos")} · ${money(walkIn)} × ${pctOf}%${overridden ? " (alguns serviços têm % próprio)" : ""}`];
      case "plan_visits":
        return ["Atendimentos de plano", `${n(p.planVisits.length, "atendimento", "atendimentos")} · ${rent ? "valor do plano dividido pelos usos" : `regra: ${MODEL_SHORT[planModel]}`}`];
      case "products":
        return ["Produtos vendidos", `${money(p.productSales)} × ${rules.productPct}%`];
      case "plan_sale_bonus":
        return ["Bônus por vender plano", `${n(p.plansSold.length, "plano vendido", "planos vendidos")} · ${rules.planSaleBonusPct}% da 1ª mensalidade`];
      case "tier_bonus":
        return ["Bônus de meta", `faturou ${money(turnover)}, passou de ${money(tier?.above ?? 0)} · +${tier?.extraPct ?? 0}% sobre ${money(walkIn)}`];
      case "card_fee":
        return ["Taxa do cartão", `${money(card)} recebidos no cartão · ${rules.cardFeePct}% sobre a comissão dessa parte`];
      case "supplies":
        return ["Insumos", `${n(visits, "atendimento", "atendimentos")} × ${money(rules.suppliesPerVisit)}`];
      case "floor":
        return ["Complemento da garantia mínima", `garantia de ${money(rules.monthlyFloor)} no período`];
      case "chair_rent":
        return ["Aluguel da cadeira", "pago à barbearia (proporcional ao período)"];
    }
  };

  return (
    <details className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: barber.color ?? "#555" }}>
          {barber.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate">{barber.name}{!barber.active ? " (inativo)" : ""}</b>
          <small className="text-neutral-500">
            {rent ? `cadeira alugada · ${money(barber.pay.kind === "chair_rent" ? barber.pay.monthlyRent : 0)}/mês` : `comissão de ${pctOf}%`} · {n(visits, "atend.", "atend.")}
          </small>
        </span>
        <span className="text-right">
          <b className={`block tabular-nums ${s.result.total < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(s.result.total)}</b>
          {x.paidOn && <small className="text-emerald-700 dark:text-emerald-400">pago {fmtDay(x.paidOn)}</small>}
        </span>
      </summary>

      <dl className="mt-3 space-y-2 text-sm">
        {s.result.lines.map((l) => {
          const [label, how] = explain(l);
          return (
            <div key={l.key} className="flex items-start justify-between gap-3">
              <dt className="min-w-0"><span className="font-medium">{label}</span><br /><span className="text-xs text-neutral-500">{how}</span></dt>
              <dd className={`shrink-0 tabular-nums ${l.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(l.amount)}</dd>
            </div>
          );
        })}
        <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold dark:border-neutral-800">
          <dt>{s.result.total < 0 ? "Profissional deve à barbearia" : "Total a receber"}</dt>
          <dd className="tabular-nums">{money(s.result.total)}</dd>
        </div>
      </dl>

      {s.planVisits.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-neutral-500">Ver cada atendimento de plano</summary>
          <ul className="mt-2 space-y-1">
            {s.planVisits.map((v) => {
              const value = rent ? v.planPrice / Math.max(1, v.usesInCycle) : planVisitValue(v, rules);
              return (
                <li key={v.visitId} className="flex justify-between gap-2">
                  <span>{fmtDay(dayInZone(v.startsAt, tz))} · {svcName(v.serviceId)} · plano {money(v.planPrice)}, {n(v.usesInCycle, "uso", "usos")} no ciclo{v.quotaUses ? ` (cota ${v.quotaUses})` : ""}</span>
                  <span className="tabular-nums">{money(Math.round(value * 100) / 100)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="mt-3">
        <PayoutButton slug={slug} barberId={barber.id} kind={kind} start={range.start} paid={Boolean(x.paidOn)} disabled={!canPay && !x.paidOn} />
      </div>
    </details>
  );
}

