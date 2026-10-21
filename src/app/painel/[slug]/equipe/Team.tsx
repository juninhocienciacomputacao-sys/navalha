"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { goalPace, totalOf, trend, type WeekStat } from "@/core/barberStats";
import type { TeamBarber } from "@/modules/settings/data";
import { COLORS } from "@/modules/settings/features";
import { BarChart, LineChart } from "@/modules/settings/charts";
import { saveBarberAction, setBarberActiveAction } from "./actions";

type MetricKey = "appointments" | "revenue" | "hours" | "avgTicket" | "occupancy" | "noShowRate";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const FALLBACK = "#737373";

export default function Team({ slug, currency, lang, canEdit, barbers, stats, monthRevenue, dayOfMonth, daysInMonth }: {
  slug: string; currency: string; lang: Lang; canEdit: boolean; barbers: TeamBarber[];
  stats: Record<string, WeekStat[]>; monthRevenue: Record<string, number>; dayOfMonth: number; daysInMonth: number;
}) {
  const money = (n: number) => formatMoney(n, currency, lang);
  const moneyShort = (n: number) => (n >= 10_000 ? `${formatMoney(Math.round(n / 1000), currency, lang)} mil` : formatMoney(Math.round(n), currency, lang));
  const active = barbers.filter((b) => b.active);
  const inactive = barbers.filter((b) => !b.active);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | undefined>(active[0]?.id);
  const [editing, setEditing] = useState<TeamBarber | "new" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const METRICS: { key: MetricKey; label: string; hint: string; get: (w: WeekStat) => number; fmt: (n: number) => string; axis?: (n: number) => string }[] = [
    { key: "appointments", label: "Demanda", hint: "atendimentos concluídos por semana", get: (w) => w.appointments, fmt: (n) => `${Math.round(n)}` },
    { key: "revenue", label: "Faturamento", hint: "valor avulso recebido por semana (plano entra como R$ 0)", get: (w) => w.revenue, fmt: money, axis: moneyShort },
    { key: "hours", label: "Horas trabalhadas", hint: "tempo de cadeira em atendimento por semana", get: (w) => w.minutes / 60, fmt: (n) => `${n.toFixed(n < 10 && n % 1 ? 1 : 0)} h` },
    { key: "avgTicket", label: "Ticket médio", hint: "faturamento ÷ atendimentos pagos", get: (w) => w.avgTicket, fmt: money, axis: moneyShort },
    { key: "occupancy", label: "Ocupação", hint: "horas trabalhadas ÷ horas com a porta aberta", get: (w) => w.occupancy, fmt: pct },
    { key: "noShowRate", label: "Faltas", hint: "faltas ÷ (atendimentos + faltas)", get: (w) => w.noShowRate, fmt: pct },
  ];
  const M = METRICS.find((m) => m.key === metric)!;
  const anyStats = stats[active[0]?.id ?? ""] ?? [];
  const labels = anyStats.map((w, i) => (i === anyStats.length - 1 ? "esta semana" : shortDate(w.start)));
  const fb = active.find((b) => b.id === focus) ?? active[0];

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro");
      else { after?.(); router.refresh(); }
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Equipe</p>
          <h1 className="text-2xl font-bold">Barbeiros</h1>
          <p className="mt-1 text-sm text-neutral-500">Cadastre a equipe, a forma de pagamento de cada um e acompanhe a evolução semana a semana.</p>
        </div>
        {canEdit && <button className="btn" onClick={() => { setEditing("new"); setError(""); }}>Adicionar barbeiro</button>}
      </header>

      {error && !editing && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {editing && (
        <BarberForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing}
          nextSort={barbers.length} pending={pending} error={error} currency={currency}
          onCancel={() => { setEditing(null); setError(""); }}
          onSave={(input) => run(() => saveBarberAction(slug, input), () => setEditing(null))} />
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {active.length === 0 && <p className="text-sm text-neutral-500">Nenhum barbeiro ativo. Adicione o primeiro.</p>}
        {active.map((b) => {
          const rev = monthRevenue[b.id] ?? 0;
          const pace = b.monthlyGoal ? goalPace(rev, b.monthlyGoal, dayOfMonth, daysInMonth) : null;
          return (
            <div key={b.id} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: b.color ?? FALLBACK }}>{initials(b.name)}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{b.name}</p>
                  <p className="truncate text-xs text-neutral-500">{b.roleTitle || "Sem especialidade"}</p>
                </div>
              </div>
              <p className="text-sm">
                {b.pay === "commission" ? <>Comissão de <b>{b.commissionPct}%</b></> : <>Aluga a cadeira por <b>{money(b.chairRent)}</b>/mês</>}
              </p>
              <div className="text-sm">
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>No mês: <b className="text-neutral-800 dark:text-neutral-100">{money(rev)}</b></span>
                  <span>{b.monthlyGoal ? `meta ${money(b.monthlyGoal)}` : "sem meta"}</span>
                </div>
                {pace && (
                  <>
                    <div className="relative mt-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pace.done * 100)}%`, background: b.color ?? FALLBACK }} />
                      <span className="absolute -top-0.5 h-3 w-0.5 bg-neutral-800 dark:bg-neutral-200" style={{ left: `${pace.expected * 100}%` }} title="onde deveria estar hoje" />
                    </div>
                    <p className={`mt-1 text-xs ${pace.onTrack ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                      {pct(pace.done)} da meta · {pace.onTrack ? "no ritmo" : "abaixo do ritmo"}
                    </p>
                  </>
                )}
              </div>
              {canEdit && (
                <div className="mt-auto flex gap-2">
                  <button className="chip flex-1" onClick={() => { setEditing(b); setError(""); }}>Editar</button>
                  <button className="chip flex-1" disabled={pending}
                    onClick={() => {
                      if (confirm(`Desativar ${b.name}? Ele some da agenda e do app do cliente, mas o histórico continua.`)) run(() => setBarberActiveAction(slug, b.id, false));
                    }}>
                    Desativar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {active.length > 0 && (
        <>
          <section className="card mt-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-semibold">Evolução da equipe · {M.label}</h2>
                <p className="text-xs text-neutral-500">Últimas 8 semanas, {M.hint}. Toque no nome para destacar.</p>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {METRICS.map((m) => (
                <button key={m.key} className={`chip ${metric === m.key ? "chip-on" : ""}`} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
              ))}
            </div>
            <LineChart labels={labels} format={M.axis ?? M.fmt} highlight={highlight}
              series={active.map((b) => ({ id: b.id, name: b.name, color: b.color ?? FALLBACK, values: (stats[b.id] ?? []).map(M.get) }))} />
            <div className="mt-3 flex flex-wrap gap-2">
              {active.map((b) => {
                const vals = (stats[b.id] ?? []).map(M.get);
                return (
                  <button key={b.id} className={`chip flex items-center gap-2 ${highlight === b.id ? "chip-on" : ""}`} aria-pressed={highlight === b.id}
                    onClick={() => setHighlight(highlight === b.id ? null : b.id)}>
                    <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? FALLBACK }} />
                    {b.name} <b className="tabular-nums">{M.fmt(vals[vals.length - 1] ?? 0)}</b>
                  </button>
                );
              })}
            </div>
          </section>

          {fb && (
            <section className="card mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Evolução de {fb.name}</h2>
                <div className="flex flex-wrap gap-2">
                  {active.map((b) => (
                    <button key={b.id} className={`chip ${fb.id === b.id ? "chip-on" : ""}`} aria-pressed={fb.id === b.id} onClick={() => setFocus(b.id)}>{b.name}</button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {METRICS.map((m) => {
                  const vals = (stats[fb.id] ?? []).map(m.get);
                  const tr = trend(vals.slice(0, -1));
                  const lowerIsBetter = m.key === "noShowRate";
                  const good = tr !== null && (lowerIsBetter ? tr < 0 : tr > 0);
                  return (
                    <div key={m.key} className="rounded-xl border border-neutral-100 p-3 dark:border-neutral-800">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{m.label}</p>
                        {tr !== null && Math.abs(tr) >= 0.01 && (
                          <span className={`text-xs tabular-nums ${good ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
                            title="semana passada contra a anterior">
                            {tr > 0 ? "▲" : "▼"} {pct(Math.abs(tr))}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">{m.hint}</p>
                      <BarChart labels={labels} values={vals} color={fb.color ?? FALLBACK} format={m.fmt} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-neutral-500">A seta compara a última semana completa com a anterior. A semana atual ainda está em andamento.</p>
            </section>
          )}

          <section className="card mt-6">
            <h2 className="mb-1 font-semibold">Comparativo da equipe</h2>
            <p className="mb-3 text-xs text-neutral-500">Total das últimas 8 semanas. Toque numa linha para ver a evolução.</p>
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-2 font-medium">Barbeiro</th>
                    <th className="py-2 text-right font-medium">Atend.</th>
                    <th className="py-2 text-right font-medium">Faturamento</th>
                    <th className="py-2 text-right font-medium">Horas</th>
                    <th className="py-2 text-right font-medium">Ticket médio</th>
                    <th className="py-2 text-right font-medium">Por hora</th>
                    <th className="py-2 text-right font-medium">Ocupação</th>
                    <th className="py-2 text-right font-medium">Faltas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 tabular-nums dark:divide-neutral-800">
                  {active.map((b) => {
                    const t = totalOf(stats[b.id] ?? []);
                    const h = t.minutes / 60;
                    return (
                      <tr key={b.id} className={`cursor-pointer ${fb?.id === b.id ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`} onClick={() => setFocus(b.id)}>
                        <td className="py-2">
                          <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? FALLBACK }} /><b>{b.name}</b></span>
                        </td>
                        <td className="py-2 text-right">{t.appointments}</td>
                        <td className="py-2 text-right">{money(t.revenue)}</td>
                        <td className="py-2 text-right">{Math.round(h)} h</td>
                        <td className="py-2 text-right">{money(t.avgTicket)}</td>
                        <td className="py-2 text-right">{money(h ? Math.round(t.revenue / h) : 0)}</td>
                        <td className="py-2 text-right">{pct(t.occupancy)}</td>
                        <td className={`py-2 text-right ${t.noShowRate > 0.08 ? "text-red-700 dark:text-red-400" : ""}`}>{pct(t.noShowRate)} ({t.noShows})</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {inactive.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-3 font-semibold">Desativados</h2>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {inactive.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-neutral-500"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? FALLBACK }} />{b.name}</span>
                {canEdit && <button className="chip" disabled={pending} onClick={() => run(() => setBarberActiveAction(slug, b.id, true))}>Reativar</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

type BarberInput = Parameters<typeof saveBarberAction>[1];

function BarberForm({ initial, nextSort, pending, error, currency, onSave, onCancel }: {
  initial: TeamBarber | null; nextSort: number; pending: boolean; error: string; currency: string;
  onSave: (input: BarberInput) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: initial?.name ?? "", roleTitle: initial?.roleTitle ?? "", color: initial?.color ?? COLORS[nextSort % COLORS.length],
    pay: initial?.pay ?? "commission", commissionPct: String(initial?.commissionPct ?? 40), chairRent: String(initial?.chairRent ?? 0),
    monthlyGoal: initial?.monthlyGoal === null || initial?.monthlyGoal === undefined ? "" : String(initial.monthlyGoal),
    sort: String(initial?.sort ?? nextSort),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  return (
    <form className="card mb-6 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSave({
        id: initial?.id, name: f.name, roleTitle: f.roleTitle, color: f.color, pay: f.pay as "commission" | "chair_rent",
        commissionPct: num(f.commissionPct), chairRent: num(f.chairRent),
        monthlyGoal: f.monthlyGoal.trim() ? num(f.monthlyGoal) : null, sort: Math.round(num(f.sort)),
      });
    }}>
      <h2 className="font-semibold">{initial ? `Editar ${initial.name}` : "Novo barbeiro"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nome
          <input className="input mt-1" required maxLength={60} value={f.name} onChange={set("name")} placeholder="Ex.: Rafa" />
        </label>
        <label className="text-sm">Especialidade
          <input className="input mt-1" maxLength={80} value={f.roleTitle} onChange={set("roleTitle")} placeholder="Ex.: Degradê e navalhado" />
        </label>
      </div>
      <div className="text-sm">
        <p>Cor na agenda e nos gráficos</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {COLORS.map((c) => (
            <button type="button" key={c} aria-label={`Cor ${c}`} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })}
              className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-neutral-900 ${f.color === c ? "ring-2 ring-amber-500" : ""}`} style={{ background: c }} />
          ))}
          <input type="color" aria-label="Outra cor" className="h-8 w-10 cursor-pointer rounded border border-neutral-300 bg-transparent dark:border-neutral-700" value={f.color} onChange={set("color")} />
        </div>
      </div>
      <div className="text-sm">
        <p>Como ele recebe</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={`chip ${f.pay === "commission" ? "chip-on" : ""}`} onClick={() => setF({ ...f, pay: "commission" })}>Comissão (%)</button>
          <button type="button" className={`chip ${f.pay === "chair_rent" ? "chip-on" : ""}`} onClick={() => setF({ ...f, pay: "chair_rent" })}>Aluguel de cadeira (por mês)</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {f.pay === "commission" ? (
          <label className="text-sm">Comissão sobre o serviço (%)
            <input className="input mt-1" inputMode="decimal" value={f.commissionPct} onChange={set("commissionPct")} />
          </label>
        ) : (
          <label className="text-sm">Aluguel por mês ({currency})
            <input className="input mt-1" inputMode="decimal" value={f.chairRent} onChange={set("chairRent")} />
          </label>
        )}
        <label className="text-sm">Meta de faturamento no mês ({currency})
          <input className="input mt-1" inputMode="decimal" value={f.monthlyGoal} onChange={set("monthlyGoal")} placeholder="Opcional" />
        </label>
        <label className="text-sm">Ordem na agenda
          <input className="input mt-1" inputMode="numeric" value={f.sort} onChange={set("sort")} />
          <span className="text-xs text-neutral-500">Menor aparece primeiro.</span>
        </label>
      </div>
      {f.pay === "commission" && <p className="text-xs text-neutral-500">Regras de plano, produtos, bônus e metas por degrau ficam em Comissões. Serviços podem ter % própria em Serviços.</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="chip" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
