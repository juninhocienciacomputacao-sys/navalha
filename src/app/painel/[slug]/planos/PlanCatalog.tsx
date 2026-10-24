"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Choice, MultiChoice, PresetNumber, PresetText, SelectList } from "@/components/pick";
import { moneyStep, PERIOD_PRESETS, PLAN_NAME_PRESETS, PLAN_TEMPLATES, priceSteps, QUOTA_PRESETS, suggest, timeSteps } from "@/core/presets";
import type { Lang } from "@/core/types";
import { toHHMM, toMinutes } from "@/core/types";
import { DEFAULT_RULES, type PlanRules } from "@/core/plan-rules";
import { formatMoney } from "@/core/money";
import type { PlanItem } from "@/modules/plans/data";
import { ruleLines } from "@/modules/plans/describe";
import { Badge } from "@/modules/clients/ui";
import { savePlanAction, togglePlanAction } from "./actions";

type Item = PlanItem & { subscribers: number; monthly: number };
type Svc = { id: string; name: string; price: number };
type Barber = { id: string; name: string; color: string | null };

const WEEK = [["1", "Seg"], ["2", "Ter"], ["3", "Qua"], ["4", "Qui"], ["5", "Sex"], ["6", "Sáb"], ["0", "Dom"]] as const;
const periodText = (n: number) => PERIOD_PRESETS.find((x) => x.value === n)?.label.toLowerCase() ?? `a cada ${n} dias`;

export default function PlanCatalog({ slug, canManage, currency, lang, services, barbers, plans }: {
  slug: string; canManage: boolean; currency: string; lang: Lang; services: Svc[]; barbers: Barber[]; plans: Item[];
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, currency, lang);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name;
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name;
  const form = (plan?: Item) => (
    <PlanForm slug={slug} services={services} barbers={barbers} currency={currency} lang={lang} plan={plan} onClose={() => setEditing(null)} />
  );

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Catálogo de planos</h2>
          <p className="text-xs text-neutral-500">Monte planos do seu jeito: intervalo entre usos, dias, horários, barbeiros e planos exclusivos.</p>
        </div>
        {canManage && editing !== "new" && <button className="btn shrink-0" onClick={() => setEditing("new")}>+ Novo plano</button>}
      </div>
      {editing === "new" && form()}
      {plans.length === 0 && editing !== "new" && (
        <p className="card text-sm text-neutral-500">Nenhum plano ainda. Toque em “Novo plano” e comece por um modelo pronto, como “Toda semana” ou “VIP exclusivo”.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => editing === p.id ? (
          <div key={p.id} className="md:col-span-2 lg:col-span-3">{form(p)}</div>
        ) : (
          <article key={p.id} className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-neutral-900 ${p.rules.exclusive
            ? "border-amber-400/70 shadow-[0_0_0_1px_rgba(245,158,11,.15)] dark:border-amber-500/50" : "border-neutral-200 dark:border-neutral-800"} ${p.active ? "" : "opacity-60"}`}>
            {p.rules.exclusive && <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-amber-400/20 blur-2xl" />}
            <div className="relative flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-tight">{p.name}</h3>
                {p.rules.description && <p className="mt-0.5 text-xs text-neutral-500">{p.rules.description}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {p.rules.exclusive && <span className="rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-2 py-0.5 text-[11px] font-bold text-neutral-950">✦ Exclusivo</span>}
                {!p.active && <Badge tone="neutral">Desativado</Badge>}
              </div>
            </div>
            <p className="relative mt-2 text-2xl font-bold tabular-nums">{money(p.price)}<span className="text-sm font-normal text-neutral-500"> · {periodText(p.periodDays)}</span></p>
            <p className="relative mt-1 text-sm text-neutral-600 dark:text-neutral-300">{p.quotaUses ? `${p.quotaUses} uso${p.quotaUses > 1 ? "s" : ""} por ciclo` : "Usos ilimitados"}</p>
            {ruleLines(p.rules, "pt", barberName, { owner: true }).length > 0 && (
              <ul className="relative mt-2 flex flex-wrap gap-1.5">
                {ruleLines(p.rules, "pt", barberName, { owner: true }).map((r) => (
                  <li key={r} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{r}</li>
                ))}
              </ul>
            )}
            <p className="relative mt-2 text-xs text-neutral-500">
              Cobre: {p.serviceIds.length ? p.serviceIds.map(svcName).filter(Boolean).join(", ") : <span className="text-red-600 dark:text-red-400">nenhum serviço (escolha ao editar)</span>}
            </p>
            <div className="relative mt-3 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
              <b>{p.subscribers}</b>{p.rules.maxSubscribers ? ` de ${p.rules.maxSubscribers}` : ""} assinante{p.subscribers === 1 ? "" : "s"} em dia · <span className="tabular-nums">{money(p.monthly)}</span>/mês
              {p.rules.maxSubscribers && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, (p.subscribers / p.rules.maxSubscribers) * 100)}%` }} />
                </div>
              )}
            </div>
            {canManage && (
              <div className="relative mt-3 flex gap-2">
                <button className="chip" onClick={() => setEditing(p.id)}>Editar</button>
                <button className="chip" disabled={pending}
                  onClick={() => start(async () => { await togglePlanAction(slug, p.id, !p.active); })}>
                  {p.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">Plano desativado some do app do cliente e não pode mais ser vendido. Quem já assina continua até cancelar. Plano exclusivo também não aparece no app: só a equipe oferece.</p>
    </section>
  );
}

function PlanForm({ slug, services, barbers, currency, lang, plan, onClose }: {
  slug: string; services: Svc[]; barbers: Barber[]; currency: string; lang: Lang; plan?: Item; onClose: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState<number | null>(plan ? plan.price : null);
  const [period, setPeriod] = useState<number | null>(plan?.periodDays ?? 30);
  const [quota, setQuota] = useState<number | null>(plan?.quotaUses ?? null);
  const [covered, setCovered] = useState<string[]>(plan?.serviceIds ?? []);
  const [rules, setRules] = useState<PlanRules>(plan?.rules ?? DEFAULT_RULES);
  const [template, setTemplate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, currency, lang);
  const steps = priceSteps(currency, "plan");
  const periodLabel = (n: number) => PERIOD_PRESETS.find((p) => p.value === n)?.label ?? `${n} dias`;
  const set = <K extends keyof PlanRules>(k: K, v: PlanRules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const times = timeSteps(0, 24 * 60, 30).map((t) => ({ value: t, label: t === "24:00" ? "24:00 (fim do dia)" : t }));
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name;

  function applyTemplate(id: string) {
    const t = PLAN_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTemplate(id);
    setName(t.name);
    setPrice(suggest(t.price, currency));
    setPeriod(t.periodDays);
    setQuota(t.quotaUses);
    setRules({ ...DEFAULT_RULES, ...t.rules, weekdays: "weekdays" in t.rules ? [...t.rules.weekdays] : null } as PlanRules);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Escolha um nome para o plano.");
    if (price == null) return setError("Escolha o preço do plano.");
    if (rules.weekdays && !rules.weekdays.length) return setError("Escolha pelo menos um dia da semana (ou “Todos os dias”).");
    if (rules.barberIds && !rules.barberIds.length) return setError("Escolha pelo menos um barbeiro (ou “Todos”).");
    if (rules.hours && rules.hours.end <= rules.hours.start) return setError("O horário final precisa ser depois do inicial.");
    start(async () => {
      const r = await savePlanAction(slug, {
        id: plan?.id, name, price, periodDays: period ?? 30, quotaUses: quota, serviceIds: covered,
        rules: { ...rules, description: rules.description?.trim() || null },
      });
      if (r.ok) onClose(); else setError(r.error);
    });
  }
  const label = "mb-2 block text-xs font-medium text-neutral-500";
  const cheapest = covered.length ? Math.min(...covered.map((id) => services.find((s) => s.id === id)?.price ?? 0)) : 0;
  const lines = ruleLines(rules, "pt", barberName, { owner: true });

  return (
    <form onSubmit={submit} className="card mb-3 min-w-0 ring-1 ring-amber-500">
      <h3 className="font-semibold">{plan ? `Editar ${plan.name}` : "Novo plano"}</h3>

      {!plan && (
        <fieldset className="mt-4 min-w-0">
          <legend className={label}>Comece por um modelo (opcional)</legend>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {PLAN_TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => applyTemplate(t.id)} aria-pressed={template === t.id}
                className={`w-52 shrink-0 snap-start rounded-2xl border p-3 text-left transition hover:border-amber-400 ${template === t.id
                  ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500 dark:bg-amber-950/40" : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950"}`}>
                <b className="block text-sm">{"exclusive" in t.rules ? "✦ " : ""}{t.title}</b>
                <span className="mt-1 block text-xs text-neutral-500">{t.pitch}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          <fieldset className="min-w-0"><legend className={label}>Nome</legend>
            <PresetText name="Nome do plano" presets={PLAN_NAME_PRESETS} value={name} onChange={setName} otherPlaceholder="Nome do plano" />
          </fieldset>
          <fieldset className="min-w-0"><legend className={label}>Preço</legend>
            <PresetNumber name="Preço do plano" presets={steps} value={price} onChange={setPrice} format={money} min={0} max={100000} step={moneyStep(steps)} />
          </fieldset>
          <fieldset className="min-w-0"><legend className={label}>Cobrança a cada</legend>
            <PresetNumber name="Ciclo" presets={PERIOD_PRESETS.map((p) => p.value)} value={period} onChange={setPeriod} format={periodLabel} min={1} max={366} />
          </fieldset>
          <fieldset className="min-w-0"><legend className={label}>Usos por ciclo</legend>
            <PresetNumber name="Usos por ciclo" presets={QUOTA_PRESETS} value={quota} onChange={setQuota} min={1} max={999}
              format={(n) => `${n} uso${n > 1 ? "s" : ""}`} allowNone noneLabel="Ilimitado" />
          </fieldset>
          <fieldset className="min-w-0">
            <legend className={label}>Serviços que o plano cobre</legend>
            {services.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Você ainda não tem serviços. <Link className="font-medium text-amber-700 underline dark:text-amber-400" href={`/painel/${slug}/servicos`}>Cadastre na aba Serviços</Link> e volte aqui para escolher o que o plano cobre.
              </p>
            ) : (
              <MultiChoice name="Serviços cobertos" value={covered} onChange={setCovered}
                options={services.map((s) => ({ value: s.id, label: s.name, hint: money(s.price) }))} />
            )}
            {covered.length > 0 && quota != null && price != null && price > 0 && (
              <p className="mt-2 text-xs text-neutral-500">Para comparar: {quota} uso(s) avulsos custariam a partir de {money(quota * cheapest)}.</p>
            )}
          </fieldset>

          <div className="rounded-2xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            <p className="text-sm font-semibold">Regras de uso</p>
            <p className="mb-3 text-xs text-neutral-500">Opcional. Valem no app do cliente, na recepção e no banco de dados.</p>
            <div className="space-y-4">
              <fieldset className="min-w-0"><legend className={label}>Intervalo mínimo entre usos</legend>
                <PresetNumber name="Intervalo entre usos" presets={[3, 5, 7, 10, 14, 15, 21, 30]} value={rules.minDaysBetween} onChange={(v) => set("minDaysBetween", v)}
                  min={1} max={365} format={(n) => `${n} dia${n > 1 ? "s" : ""}`} allowNone noneLabel="Sem intervalo" />
                {rules.minDaysBetween && <p className="mt-1 text-xs text-neutral-500">O cliente usa o plano de novo só {rules.minDaysBetween} dia{rules.minDaysBetween > 1 ? "s" : ""} depois do último uso.</p>}
              </fieldset>
              <fieldset className="min-w-0"><legend className={label}>Dias em que vale</legend>
                <Choice name="Dias" value={rules.weekdays ? "some" : "all"} onChange={(v) => set("weekdays", v === "all" ? null : rules.weekdays ?? [1, 2, 3, 4, 5])}
                  options={[{ value: "all", label: "Todos os dias" }, { value: "some", label: "Só alguns dias" }]} />
                {rules.weekdays && (
                  <div className="mt-2">
                    <MultiChoice name="Dias da semana" value={rules.weekdays.map(String)} onChange={(v) => set("weekdays", v.map(Number))}
                      options={WEEK.map(([v, l]) => ({ value: v, label: l }))} />
                  </div>
                )}
              </fieldset>
              <fieldset className="min-w-0"><legend className={label}>Horário em que vale</legend>
                <Choice name="Horário" value={rules.hours ? "some" : "all"} onChange={(v) => set("hours", v === "all" ? null : rules.hours ?? { start: 9 * 60, end: 17 * 60 })}
                  options={[{ value: "all", label: "Qualquer horário" }, { value: "some", label: "Só uma faixa" }]} />
                {rules.hours && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-neutral-500">Começando das</span>
                    <SelectList name="Início" className="!w-28" options={times.slice(0, -1)} value={toHHMM(rules.hours.start)}
                      onChange={(v) => set("hours", { start: toMinutes(v), end: rules.hours!.end })} />
                    <span className="text-neutral-500">até antes das</span>
                    <SelectList name="Fim" className="!w-40" options={times.slice(1)} value={rules.hours.end === 1440 ? "24:00" : toHHMM(rules.hours.end)}
                      onChange={(v) => set("hours", { start: rules.hours!.start, end: toMinutes(v) })} />
                  </div>
                )}
              </fieldset>
              {barbers.length > 1 && (
                <fieldset className="min-w-0"><legend className={label}>Quem atende pelo plano</legend>
                  <Choice name="Barbeiros" value={rules.barberIds ? "some" : "all"} onChange={(v) => set("barberIds", v === "all" ? null : rules.barberIds ?? [barbers[0].id])}
                    options={[{ value: "all", label: "Todos os barbeiros" }, { value: "some", label: "Só alguns" }]} />
                  {rules.barberIds && (
                    <div className="mt-2">
                      <MultiChoice name="Barbeiros do plano" value={rules.barberIds} onChange={(v) => set("barberIds", v)}
                        options={barbers.map((b) => ({ value: b.id, label: b.name }))} />
                    </div>
                  )}
                </fieldset>
              )}
              <fieldset className="min-w-0"><legend className={label}>Quando o cliente tentar fora da regra (ou sem usos sobrando)</legend>
                <Choice name="Fora da regra" value={rules.onLimit} onChange={(v) => set("onLimit", v)}
                  options={[{ value: "charge", label: "Deixa marcar e cobra o valor avulso" }, { value: "block", label: "Não deixa marcar" }]} />
              </fieldset>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
            <p className="mb-3 text-sm font-semibold">Quem pode assinar</p>
            <div className="space-y-4">
              <fieldset className="min-w-0"><legend className={label}>Onde aparece</legend>
                <Choice name="Visibilidade" value={rules.exclusive} onChange={(v) => set("exclusive", v)}
                  options={[{ value: false, label: "No app, para todos os clientes" }, { value: true, label: "✦ Exclusivo: só a equipe oferece" }]} />
              </fieldset>
              <fieldset className="min-w-0"><legend className={label}>Vagas</legend>
                <PresetNumber name="Vagas" presets={[5, 10, 20, 30, 50, 100]} value={rules.maxSubscribers} onChange={(v) => set("maxSubscribers", v)}
                  min={1} max={100000} format={(n) => `${n} vagas`} allowNone noneLabel="Sem limite" />
              </fieldset>
              <label className="block min-w-0"><span className={label}>Frase para o cliente (opcional)</span>
                <input className="input" maxLength={120} value={rules.description ?? ""} placeholder="Ex.: Para quem não abre mão do visual em dia"
                  onChange={(e) => set("description", e.target.value)} />
              </label>
            </div>
          </div>
        </div>

        {/* prévia: como o cliente vê o cartão do plano */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <p className={label}>Prévia no app do cliente</p>
          <div className={`relative overflow-hidden rounded-3xl p-5 text-white shadow-xl ${rules.exclusive
            ? "bg-[conic-gradient(from_210deg_at_70%_20%,#1c1917,#44403c,#a16207,#1c1917)]" : "bg-gradient-to-br from-neutral-800 to-neutral-950"}`}>
            <div aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-amber-500/30 blur-2xl" />
            <div aria-hidden className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,.12)_50%,transparent_60%)]" />
            <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-80">
              <span>{rules.exclusive ? "✦ Membro exclusivo" : "Seu plano"}</span><span>{period ? periodLabel(period) : ""}</span>
            </div>
            <p className="relative mt-2 text-2xl font-extrabold tracking-tight">{name || "Nome do plano"}</p>
            {rules.description && <p className="relative text-sm opacity-80">{rules.description}</p>}
            <p className="relative mt-3 text-3xl font-black tabular-nums">{price != null ? money(price) : "—"}</p>
            <p className="relative text-sm opacity-85">{quota ? `${quota} uso${quota > 1 ? "s" : ""} por ciclo` : "Usos ilimitados"}</p>
            {lines.length > 0 && (
              <ul className="relative mt-3 flex flex-wrap gap-1.5">
                {ruleLines(rules, "pt", barberName).map((l) => <li key={l} className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] backdrop-blur">{l}</li>)}
              </ul>
            )}
          </div>
          {lines.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-neutral-500">{lines.map((l) => <li key={l}>• {l}</li>)}</ul>
          )}
        </aside>
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar plano"}</button>
        <button type="button" className="chip" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  );
}
