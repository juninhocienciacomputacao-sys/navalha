"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { MultiChoice, PresetNumber, PresetText } from "@/components/pick";
import { moneyStep, PERIOD_PRESETS, PLAN_NAME_PRESETS, priceSteps, QUOTA_PRESETS } from "@/core/presets";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import type { PlanItem } from "@/modules/plans/data";
import { Badge } from "@/modules/clients/ui";
import { savePlanAction, togglePlanAction } from "./actions";

type Item = PlanItem & { subscribers: number; monthly: number };
type Svc = { id: string; name: string; price: number };

export default function PlanCatalog({ slug, canManage, currency, lang, services, plans }: {
  slug: string; canManage: boolean; currency: string; lang: Lang; services: Svc[]; plans: Item[];
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, currency, lang);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Catálogo de planos</h2>
        {canManage && editing !== "new" && <button className="btn" onClick={() => setEditing("new")}>+ Novo plano</button>}
      </div>
      {editing === "new" && <PlanForm slug={slug} services={services} currency={currency} lang={lang} onClose={() => setEditing(null)} />}
      {plans.length === 0 && editing !== "new" && (
        <p className="card text-sm text-neutral-500">Nenhum plano ainda. Crie o primeiro: por exemplo, “4 cortes por mês” ou “corte e barba ilimitados”.</p>
      )}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => editing === p.id ? (
          <div key={p.id} className="md:col-span-2 lg:col-span-3">
            <PlanForm slug={slug} services={services} currency={currency} lang={lang} plan={p} onClose={() => setEditing(null)} />
          </div>
        ) : (
          <article key={p.id} className={`card flex flex-col ${p.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold leading-tight">{p.name}</h3>
              {!p.active && <Badge tone="neutral">Desativado</Badge>}
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{money(p.price)}<span className="text-sm font-normal text-neutral-500"> · {PERIOD_PRESETS.find((x) => x.value === p.periodDays)?.label.toLowerCase() ?? `a cada ${p.periodDays} dias`}</span></p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{p.quotaUses ? `${p.quotaUses} uso${p.quotaUses > 1 ? "s" : ""} por ciclo` : "Usos ilimitados"}</p>
            <p className="mt-2 text-xs text-neutral-500">
              Cobre: {p.serviceIds.length ? p.serviceIds.map(svcName).filter(Boolean).join(", ") : <span className="text-red-600 dark:text-red-400">nenhum serviço (escolha ao editar)</span>}
            </p>
            <p className="mt-3 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
              <b>{p.subscribers}</b> assinante{p.subscribers === 1 ? "" : "s"} em dia · <span className="tabular-nums">{money(p.monthly)}</span>/mês
            </p>
            {canManage && (
              <div className="mt-3 flex gap-2">
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
      <p className="mt-2 text-xs text-neutral-500">Plano desativado some do app do cliente e não pode mais ser vendido. Quem já assina continua até cancelar.</p>
    </section>
  );
}

function PlanForm({ slug, services, currency, lang, plan, onClose }: {
  slug: string; services: Svc[]; currency: string; lang: Lang; plan?: Item; onClose: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState<number | null>(plan ? plan.price : null);
  const [period, setPeriod] = useState<number | null>(plan?.periodDays ?? 30);
  const [quota, setQuota] = useState<number | null>(plan?.quotaUses ?? null);
  const [covered, setCovered] = useState<string[]>(plan?.serviceIds ?? []);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const money = (n: number) => formatMoney(n, currency, lang);
  const steps = priceSteps(currency, "plan");
  const periodLabel = (n: number) => PERIOD_PRESETS.find((p) => p.value === n)?.label ?? `${n} dias`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Escolha um nome para o plano.");
    if (price == null) return setError("Escolha o preço do plano.");
    start(async () => {
      const r = await savePlanAction(slug, {
        id: plan?.id, name, price, periodDays: period ?? 30, quotaUses: quota, serviceIds: covered,
      });
      if (r.ok) onClose(); else setError(r.error);
    });
  }
  const label = "mb-2 block text-xs font-medium text-neutral-500";
  const cheapest = covered.length ? Math.min(...covered.map((id) => services.find((s) => s.id === id)?.price ?? 0)) : 0;
  return (
    <form onSubmit={submit} className="card mb-3 min-w-0 space-y-4 ring-1 ring-amber-500">
      <h3 className="font-semibold">{plan ? `Editar ${plan.name}` : "Novo plano"}</h3>
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
          <p className="mt-2 text-xs text-neutral-500">
            Para comparar: {quota} uso(s) avulsos custariam a partir de {money(quota * cheapest)}.
          </p>
        )}
      </fieldset>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar plano"}</button>
        <button type="button" className="chip" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  );
}
