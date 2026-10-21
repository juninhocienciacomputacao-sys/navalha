"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import type { CatalogService } from "@/modules/settings/data";
import { saveServiceAction, setServiceActiveAction } from "./actions";

type Plan = { id: string; name: string; active: boolean };

export default function Services({ slug, currency, lang, canEdit, services, plans }: {
  slug: string; currency: string; lang: Lang; canEdit: boolean; services: CatalogService[]; plans: Plan[];
}) {
  const money = (n: number) => formatMoney(n, currency, lang);
  const [order, setOrder] = useState<"sort" | "hour">("sort");
  const [editing, setEditing] = useState<CatalogService | "new" | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const active = services.filter((s) => s.active);
  const inactive = services.filter((s) => !s.active);
  const perHour = (s: CatalogService) => (s.durationMin ? (s.price / s.durationMin) * 60 : 0);
  const rows = order === "hour" ? [...active].sort((a, b) => perHour(b) - perHour(a)) : active;
  const maxHour = Math.max(1, ...active.map(perHour));
  const planName = (id: string) => plans.find((p) => p.id === id);

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
          <p className="text-xs uppercase tracking-wide text-neutral-500">Serviços</p>
          <h1 className="text-2xl font-bold">Catálogo de serviços</h1>
          <p className="mt-1 text-sm text-neutral-500">O que aparece no app do cliente, com duração, preço e nome em cada idioma.</p>
        </div>
        {canEdit && <button className="btn" onClick={() => { setEditing("new"); setError(""); }}>Novo serviço</button>}
      </header>

      {error && !editing && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {editing && (
        <ServiceForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing}
          nextSort={services.length} pending={pending} error={error} currency={currency}
          onCancel={() => { setEditing(null); setError(""); }}
          onSave={(input) => run(() => saveServiceAction(slug, input), () => setEditing(null))} />
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{active.length} serviços ativos</h2>
          <div className="flex gap-2 text-sm">
            <button className={`chip ${order === "sort" ? "chip-on" : ""}`} onClick={() => setOrder("sort")}>Ordem do app</button>
            <button className={`chip ${order === "hour" ? "chip-on" : ""}`} onClick={() => setOrder("hour")}>Mais rende por hora</button>
          </div>
        </div>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((s) => (
            <li key={s.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1.6fr_70px_90px_1.3fr_1fr_1.3fr_auto] md:items-center md:gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{s.name.pt}</p>
                <p className="truncate text-xs text-neutral-500">
                  {s.name.en ? `EN ${s.name.en}` : "EN —"} · {s.name.es ? `ES ${s.name.es}` : "ES —"}
                </p>
              </div>
              <div className="flex gap-4 md:contents">
                <span className="tabular-nums md:text-right">{s.durationMin} min</span>
                <span className="font-semibold tabular-nums md:text-right">{money(s.price)}</span>
              </div>
              <div className="flex items-center gap-2" title="Preço ÷ duração: quanto o serviço rende por hora de cadeira">
                <div className="h-2 w-24 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(perHour(s) / maxHour) * 100}%` }} />
                </div>
                <span className="tabular-nums text-neutral-600 dark:text-neutral-300">{money(Math.round(perHour(s)))}/h</span>
              </div>
              <span className="text-xs text-neutral-600 dark:text-neutral-300">
                {s.commissionOverridePct === null ? "Comissão padrão do barbeiro" : <>Comissão própria: <b>{s.commissionOverridePct}%</b></>}
              </span>
              <div className="flex flex-wrap gap-1">
                {s.planIds.length === 0 ? <span className="text-xs text-neutral-500">Só avulso</span> : s.planIds.map((id) => {
                  const p = planName(id);
                  return p && (
                    <span key={id} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {p.name}{p.active ? "" : " (inativo)"}
                    </span>
                  );
                })}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button className="chip" onClick={() => { setEditing(s); setError(""); }}>Editar</button>
                  <button className="chip" disabled={pending} onClick={() => {
                    if (confirm(`Desativar "${s.name.pt}"? Ele sai do app do cliente, mas os atendimentos antigos continuam.`)) run(() => setServiceActiveAction(slug, s.id, false));
                  }}>Desativar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          “Rende por hora” é o preço dividido pelo tempo de cadeira. Serviços curtos e caros, oferecidos como adicional no fim do corte, aumentam o ticket sem ocupar outro horário.
          Os planos que cobrem cada serviço são escolhidos na tela Planos.
        </p>
      </section>

      {inactive.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-3 font-semibold">Desativados</h2>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {inactive.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-neutral-500">{s.name.pt} · {s.durationMin} min · {money(s.price)}</span>
                {canEdit && <button className="chip" disabled={pending} onClick={() => run(() => setServiceActiveAction(slug, s.id, true))}>Reativar</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

type ServiceInput = Parameters<typeof saveServiceAction>[1];

function ServiceForm({ initial, nextSort, pending, error, currency, onSave, onCancel }: {
  initial: CatalogService | null; nextSort: number; pending: boolean; error: string; currency: string;
  onSave: (input: ServiceInput) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    pt: initial?.name.pt ?? "", en: initial?.name.en ?? "", es: initial?.name.es ?? "",
    durationMin: String(initial?.durationMin ?? 30), price: String(initial?.price ?? ""),
    override: initial?.commissionOverridePct !== null && initial?.commissionOverridePct !== undefined,
    commissionOverridePct: String(initial?.commissionOverridePct ?? 40), sort: String(initial?.sort ?? nextSort),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => Number(s.replace(",", ".")) || 0;

  return (
    <form className="card mb-6 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSave({
        id: initial?.id, name: { pt: f.pt, en: f.en || undefined, es: f.es || undefined },
        durationMin: Math.round(num(f.durationMin)), price: num(f.price),
        commissionOverridePct: f.override ? num(f.commissionOverridePct) : null, sort: Math.round(num(f.sort)),
      });
    }}>
      <h2 className="font-semibold">{initial ? `Editar ${initial.name.pt}` : "Novo serviço"}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Nome em português
          <input className="input mt-1" required maxLength={80} value={f.pt} onChange={set("pt")} placeholder="Ex.: Corte social" />
        </label>
        <label className="text-sm">Nome em inglês
          <input className="input mt-1" maxLength={80} value={f.en} onChange={set("en")} placeholder="Ex.: Haircut (opcional)" />
        </label>
        <label className="text-sm">Nome em espanhol
          <input className="input mt-1" maxLength={80} value={f.es} onChange={set("es")} placeholder="Ex.: Corte (opcional)" />
        </label>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">Sem tradução, o cliente estrangeiro vê o nome em português.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Duração (minutos)
          <input className="input mt-1" inputMode="numeric" required value={f.durationMin} onChange={set("durationMin")} />
        </label>
        <label className="text-sm">Preço ({currency})
          <input className="input mt-1" inputMode="decimal" required value={f.price} onChange={set("price")} placeholder="0" />
        </label>
        <label className="text-sm">Ordem no app
          <input className="input mt-1" inputMode="numeric" value={f.sort} onChange={set("sort")} />
          <span className="text-xs text-neutral-500">Menor aparece primeiro.</span>
        </label>
      </div>
      <div className="text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={f.override} onChange={(e) => setF({ ...f, override: e.target.checked })} />
          Este serviço tem comissão própria (vale para todos os barbeiros)
        </label>
        {f.override && (
          <label className="mt-2 block max-w-xs">Comissão (%)
            <input className="input mt-1" inputMode="decimal" value={f.commissionOverridePct} onChange={set("commissionOverridePct")} />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="chip" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
