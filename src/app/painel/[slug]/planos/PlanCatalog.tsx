"use client";

import { useState, useTransition } from "react";
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
            <p className="mt-1 text-2xl font-bold tabular-nums">{money(p.price)}<span className="text-sm font-normal text-neutral-500"> a cada {p.periodDays} dias</span></p>
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
  const [price, setPrice] = useState(plan ? String(plan.price) : "");
  const [period, setPeriod] = useState(String(plan?.periodDays ?? 30));
  const [quota, setQuota] = useState(plan?.quotaUses ? String(plan.quotaUses) : "");
  const [covered, setCovered] = useState<string[]>(plan?.serviceIds ?? []);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const num = (s: string) => Number(s.replace(",", "."));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await savePlanAction(slug, {
        id: plan?.id, name, price: num(price), periodDays: num(period), quotaUses: quota.trim() ? num(quota) : null, serviceIds: covered,
      });
      if (r.ok) onClose(); else setError(r.error);
    });
  }
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <form onSubmit={submit} className="card mb-3 space-y-3 ring-1 ring-amber-500">
      <h3 className="font-semibold">{plan ? `Editar ${plan.name}` : "Novo plano"}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm sm:col-span-2 lg:col-span-1"><span className={label}>Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Clube do Corte" required />
        </label>
        <label className="text-sm"><span className={label}>Preço ({currency})</span>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="89,90" required />
        </label>
        <label className="text-sm"><span className={label}>Ciclo (dias)</span>
          <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" required />
        </label>
        <label className="text-sm"><span className={label}>Usos por ciclo</span>
          <input className="input" value={quota} onChange={(e) => setQuota(e.target.value)} inputMode="numeric" placeholder="vazio = ilimitado" />
        </label>
      </div>
      <fieldset>
        <legend className={label}>Serviços que o plano cobre</legend>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => {
            const on = covered.includes(s.id);
            return (
              <button type="button" key={s.id} aria-pressed={on} className={`chip ${on ? "chip-on" : ""}`}
                onClick={() => setCovered((c) => (on ? c.filter((x) => x !== s.id) : [...c, s.id]))}>
                {on ? "✓ " : ""}{s.name} <span className="text-xs text-neutral-500">{formatMoney(s.price, currency, lang)}</span>
              </button>
            );
          })}
        </div>
        {covered.length > 0 && quota.trim() && num(quota) > 0 && num(price) > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            Para comparar: {num(quota)} uso(s) avulsos custariam a partir de {formatMoney(num(quota) * Math.min(...covered.map((id) => services.find((s) => s.id === id)?.price ?? 0)), currency, lang)}.
          </p>
        )}
      </fieldset>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar plano"}</button>
        <button type="button" className="chip" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  );
}
