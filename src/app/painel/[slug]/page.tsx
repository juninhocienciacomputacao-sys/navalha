import { requireStaff } from "@/lib/staff";
import Link from "next/link";
import { atMinutes, dayInZone, minutesInZone, weekday } from "@/core/time";
import { daysUntil } from "@/core/plans";
import { formatMoney } from "@/core/money";
import { toHHMM, toMinutes } from "@/core/types";

export const dynamic = "force-dynamic";

const PX_PER_MIN = 1.1;

export default async function Painel({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { r, bundle: b } = await requireStaff(slug);
  const { shop, barbers } = b;
  const tz = shop.timezone;
  const now = new Date();
  const today = dayInZone(now, tz);
  const monthStart = atMinutes(today.slice(0, 8) + "01", 0, tz);
  const [dash, agenda] = await Promise.all([
    r.dashboard(shop.id, monthStart, now),
    r.agenda(shop.id, atMinutes(today, 0, tz), atMinutes(today, 24 * 60, tz)),
  ]);
  const money = (n: number) => formatMoney(n, shop.currency, shop.defaultLang);
  const hours = shop.openingHours[String(weekday(today))];
  const open = hours ? toMinutes(hours.open) : 9 * 60;
  const close = hours ? toMinutes(hours.close) : 20 * 60;
  const nowMin = minutesInZone(now, tz);
  const maxRevenue = Math.max(1, ...dash.perBarber.map((x) => x.revenue));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Painel</p>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
        </div>
        <Link href={`/painel/${shop.slug}/agenda`} className="btn">Agenda completa</Link>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Faturamento do mês" value={money(dash.revenueMonth)} />
        <Kpi label="Atendimentos no mês" value={String(dash.appointmentsMonth)} />
        <Kpi label="Clientes" value={String(dash.clients)} />
        <Kpi label="Planos ativos" value={String(dash.activeSubscriptions)} />
      </section>

      {dash.planAlerts.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-3 font-semibold">Planos vencendo ou vencidos</h2>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {dash.planAlerts.map((a) => {
              const left = daysUntil(a.periodEnd, now);
              return (
                <li key={a.phone + a.planName} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span><b>{a.clientName}</b> · {a.planName}</span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${left < 0 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                      {left < 0 ? `venceu há ${-left} dia(s)` : left === 0 ? "vence hoje" : `vence em ${left} dia(s)`}
                    </span>
                    <a className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" target="_blank"
                      href={`https://wa.me/${a.phone.replace("+", "")}?text=${encodeURIComponent(`Oi ${a.clientName}! Seu plano ${a.planName} na ${shop.name} está para vencer. Renove pelo app para continuar.`)}`}>
                      Avisar
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card mt-6 overflow-x-auto">
        <h2 className="mb-3 font-semibold">Agenda de hoje</h2>
        {!hours ? <p className="text-sm text-neutral-500">Fechado hoje.</p> : (
          <div className="relative flex min-w-[640px]" style={{ height: (close - open) * PX_PER_MIN + 32 }}>
            <div className="w-12 shrink-0 pt-8 text-[11px] text-neutral-400">
              {Array.from({ length: Math.ceil((close - open) / 60) }, (_, i) => (
                <div key={i} style={{ height: 60 * PX_PER_MIN }}>{toHHMM(open + i * 60)}</div>
              ))}
            </div>
            {barbers.map((br) => (
              <div key={br.id} className="relative flex-1 border-l border-neutral-100 dark:border-neutral-800">
                <div className="h-8 px-2 text-sm font-medium">{br.name}</div>
                {agenda.filter((x) => x.barberId === br.id && x.status !== "cancelled").map((x) => {
                  const s = minutesInZone(x.startsAt, tz);
                  const e = minutesInZone(x.endsAt, tz);
                  return (
                    <div key={x.id} className={`absolute inset-x-1 overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] leading-tight text-white ${e - s < 25 ? "py-0 text-[10px]" : "py-1"}`}
                      style={{ top: 32 + (s - open) * PX_PER_MIN, height: (e - s) * PX_PER_MIN - 2, background: br.color ?? "#555", opacity: x.status === "done" ? 0.55 : x.status === "no_show" ? 0.3 : 1 }}>
                      <b>{toHHMM(s)} {x.clientName}</b> · {x.serviceName}{x.viaPlan ? " · plano" : ""}{x.status === "no_show" ? " · faltou" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
            {nowMin > open && nowMin < close && (
              <div className="pointer-events-none absolute left-12 right-0 border-t-2 border-red-500" style={{ top: 32 + (nowMin - open) * PX_PER_MIN }} />
            )}
          </div>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="mb-3 font-semibold">Desempenho por barbeiro no mês</h2>
        <div className="space-y-3">
          {barbers.map((br) => {
            const p = dash.perBarber.find((x) => x.barberId === br.id) ?? { appointments: 0, revenue: 0, minutes: 0 };
            return (
              <div key={br.id} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 text-sm">
                <span className="font-medium">{br.name}</span>
                <div className="h-3 rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-3 rounded-full" style={{ width: `${(p.revenue / maxRevenue) * 100}%`, background: br.color ?? "#555" }} />
                </div>
                <span className="text-right tabular-nums text-neutral-600 dark:text-neutral-300">
                  {money(p.revenue)} · {p.appointments} atend. · {Math.round(p.minutes / 60)} h
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-neutral-500">Faturamento avulso. Atendimentos de plano entram no cálculo de comissão pela regra escolhida pelo dono.</p>
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
