import Link from "next/link";
import { requireStaff } from "@/lib/staff";
import { formatMoney } from "@/core/money";
import { dayInZone } from "@/core/time";
import { addMonths, dueAlerts, monthOf, type RevenueMethod } from "@/core/finance";
import { METHOD_LABEL, monthFinance } from "@/modules/finance/compute";
import RevenueChart from "./RevenueChart";
import Expenses from "./Expenses";

export const dynamic = "force-dynamic";

const LOCALE = { pt: "pt-BR", en: "en-US", es: "es-ES" } as const;

export default async function Financeiro({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { bundle: b, role } = await requireStaff(slug);
  if (role !== "owner" && role !== "manager") {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Só o dono ou o gerente</h1>
        <p className="mt-2 text-sm text-neutral-500">O financeiro da barbearia fica visível só para o dono e o gerente.</p>
      </main>
    );
  }
  const { shop } = b;
  const thisMonth = monthOf(dayInZone(new Date(), shop.timezone));
  const month = sp.m && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : thisMonth;
  const f = await monthFinance(b, month);
  const money = (n: number) => formatMoney(Math.round(n * 100) / 100, shop.currency, shop.defaultLang);
  const monthName = (m: string, style: "long" | "short" = "long") =>
    new Intl.DateTimeFormat(LOCALE[shop.defaultLang], { month: style, year: style === "long" ? "numeric" : undefined, timeZone: "UTC" })
      .format(new Date(m + "-15T12:00:00Z"));

  const revenue = f.revenue.services + f.revenue.plans;
  const commissions = f.statements.reduce((a, s) => a + Math.max(0, s.statement.result.total), 0);
  const costs = f.totals.total + commissions;
  const profit = revenue - costs;
  const ticket = f.visits ? revenue / f.visits : 0;
  const alerts = dueAlerts(f.allExpenses, f.today);
  const methods = (Object.entries(f.revenue.byMethod) as [RevenueMethod, number][]).sort((a, z) => z[1] - a[1]);
  const maxMethod = Math.max(1, ...methods.map((m) => m[1]));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i));
  const href = (m: string) => `/painel/${slug}/financeiro?m=${m}`;
  const current = month === thisMonth;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Financeiro</p>
          <h1 className="text-2xl font-bold first-letter:uppercase">{monthName(month)}</h1>
          {current && <p className="text-sm text-neutral-500">Mês em andamento: valores até hoje.</p>}
        </div>
        <nav className="flex items-center gap-2" aria-label="Escolher mês">
          <Link className="chip" href={href(addMonths(month, -1))} aria-label="Mês anterior">←</Link>
          <form action={`/painel/${slug}/financeiro`} className="flex gap-2">
            <select name="m" defaultValue={month} className="input w-auto" aria-label="Mês">
              {(months.includes(month) ? months : [month, ...months]).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
            <button className="chip" type="submit">Ver</button>
          </form>
          <Link className="chip" href={href(addMonths(month, 1))} aria-label="Próximo mês">→</Link>
        </nav>
      </header>

      {alerts.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="font-semibold">⚠️ Contas para pagar</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.expense.id + a.due} className="flex flex-wrap justify-between gap-2">
                <span><b>{a.expense.name}</b> · {money(a.expense.amount)}</span>
                <span className={a.state === "overdue" ? "font-medium text-red-700 dark:text-red-400" : "text-amber-800 dark:text-amber-300"}>
                  {a.state === "overdue" ? `atrasada há ${-a.daysLeft} dia(s)` : a.daysLeft === 0 ? "vence hoje" : `vence em ${a.daysLeft} dia(s)`}
                  {monthOf(a.due) !== thisMonth && <> · <Link className="underline" href={href(monthOf(a.due))}>{monthName(monthOf(a.due), "short")}</Link></>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Receita" value={money(revenue)} sub={`Avulsos ${money(f.revenue.services)} · planos ${money(f.revenue.plans)}`} />
        <Kpi label="Despesas" value={money(costs)} sub={`Contas ${money(f.totals.total)} · comissões ${money(commissions)}`} />
        <Kpi label="Lucro" value={money(profit)} tone={profit < 0 ? "bad" : "good"} sub={revenue ? `Margem de ${Math.round((profit / revenue) * 100)}%` : "Sem receita no mês"} />
        <Kpi label="Ticket médio" value={money(ticket)} sub={`Receita ÷ ${f.visits} atendimentos`} />
      </section>
      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Clientes atendidos" value={String(f.clients)} sub="Pessoas diferentes no mês" />
        <Kpi label="Atendimentos concluídos" value={String(f.visits)} sub="Avulsos e de plano" />
        <Kpi label="Contas pagas" value={money(f.totals.paid)} sub={`Falta pagar ${money(f.totals.open)}`} />
        <Kpi label="Comissões a pagar" value={money(commissions)} sub={<Link className="underline" href={`/painel/${slug}/comissoes?p=monthly&d=${month}-01`}>ver extrato</Link>} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0">
          <h2 className="font-semibold">Receita x despesa</h2>
          <p className="mb-3 text-xs text-neutral-500">Últimos 6 meses. Despesa = contas do mês + comissões.</p>
          <RevenueChart points={f.series.map((p) => ({ label: monthName(p.month, "short").replace(".", ""), month: p.month, revenue: p.revenue, expenses: p.expenses + p.commissions }))}
            currency={shop.currency} lang={shop.defaultLang} selected={month} hrefBase={href("")} />
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Receita por forma de pagamento</h2>
          {methods.length === 0 ? <p className="text-sm text-neutral-500">Nenhum pagamento no mês.</p> : (
            <ul className="space-y-3 text-sm">
              {methods.map(([k, v]) => (
                <li key={k}>
                  <div className="flex justify-between"><span>{METHOD_LABEL[k]}</span><span className="tabular-nums">{money(v)} · {Math.round((v / revenue) * 100)}%</span></div>
                  <div className="mt-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className="h-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${(v / maxMethod) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {f.revenue.byMethod.unknown ? <p className="mt-3 text-xs text-neutral-500">“Não informado”: atendimento avulso concluído sem pagamento registrado.</p> : null}

          <h2 className="mb-2 mt-6 font-semibold">Comissões do mês</h2>
          <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {f.statements.map(({ barber, statement }) => (
              <li key={barber.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: barber.color ?? "#555" }} />{barber.name}
                  <small className="text-neutral-500">{barber.pay.kind === "chair_rent" ? "cadeira alugada" : `${barber.pay.pct}%`}</small></span>
                <b className={`tabular-nums ${statement.result.total < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(statement.result.total)}</b>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">Valor negativo: o profissional da cadeira alugada deve o aluguel à barbearia (não entra nas despesas).</p>
        </section>
      </div>

      <Expenses slug={slug} month={month} monthLabel={monthName(month)} items={f.expenses.map((x) => ({ ...x, expense: { ...x.expense } }))}
        totals={f.totals} currency={shop.currency} lang={shop.defaultLang} today={f.today} />
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "good" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}
