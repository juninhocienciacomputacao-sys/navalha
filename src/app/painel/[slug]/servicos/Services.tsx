"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import type { CatalogService } from "@/modules/settings/data";
import { MultiChoice, PresetNumber, PresetText, Stepper, Toggle } from "@/components/pick";
import { DURATION_STEPS, moneyStep, PERCENT_STEPS, priceSteps, SERVICE_PRESETS, suggest } from "@/core/presets";
import { saveServiceAction, setServiceActiveAction } from "./actions";
import { SERVICE_I18N } from "./i18n";

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
          nextSort={services.length} pending={pending} error={error} currency={currency} lang={lang}
          onCancel={() => { setEditing(null); setError(""); }}
          onSave={(input) => run(() => saveServiceAction(slug, input), () => setEditing(null))} />
      )}

      {canEdit && (
        <QuickStart key={services.map((s) => s.id).join()} slug={slug} currency={currency} lang={lang} services={services}
          onDone={() => router.refresh()} />
      )}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{active.length} serviços ativos</h2>
          <div className="flex gap-2 text-sm">
            <button className={`chip ${order === "sort" ? "chip-on" : ""}`} onClick={() => setOrder("sort")}>Ordem do app</button>
            <button className={`chip ${order === "hour" ? "chip-on" : ""}`} onClick={() => setOrder("hour")}>Mais rende por hora</button>
          </div>
        </div>
        {active.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">Nenhum serviço ainda. {canEdit ? "Toque nos serviços prontos acima para começar." : ""}</p>
        )}
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

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

/** Serviços prontos que a barbearia ainda não tem: o dono marca e adiciona todos de uma vez. */
function QuickStart({ slug, currency, lang, services, onDone }: {
  slug: string; currency: string; lang: Lang; services: CatalogService[]; onDone: () => void;
}) {
  const left = SERVICE_PRESETS.filter((p) => !services.some((s) => sameName(s.name.pt, p.name)));
  const empty = services.length === 0;
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState(empty);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [pending, start] = useTransition();
  if (left.length === 0) return null;
  const money = (n: number) => formatMoney(n, currency, lang);

  function addAll() {
    setError("");
    setDone(0);
    start(async () => {
      let sort = services.length;
      for (const name of picked) {
        const p = SERVICE_PRESETS.find((x) => x.name === name)!;
        const r = await saveServiceAction(slug, {
          name: { pt: p.name, ...SERVICE_I18N[p.name] }, durationMin: p.minutes, price: suggest(p.price, currency),
          commissionOverridePct: null, sort: sort++,
        });
        if (!r.ok) { setError(`${p.name}: ${r.error}`); break; }
        setDone((d) => d + 1);
      }
      setPicked([]);
      onDone();
    });
  }

  if (!open) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button className="chip" onClick={() => setOpen(true)}>+ Adicionar serviços prontos</button>
        <span className="text-xs text-neutral-500">{left.length} sugestões que você ainda não tem</span>
      </div>
    );
  }
  return (
    <section className="card mb-6 min-w-0 ring-1 ring-amber-500">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{empty ? "Começar rápido" : "Serviços prontos"}</h2>
          <p className="text-sm text-neutral-500">Toque nos serviços que a barbearia faz. Eles entram com duração e preço sugeridos, e você ajusta depois em Editar.</p>
        </div>
        {!empty && <button className="chip" onClick={() => setOpen(false)}>Fechar</button>}
      </div>
      <div className="mt-3">
        <MultiChoice name="Serviços prontos" value={picked} onChange={setPicked}
          options={left.map((p) => ({ value: p.name, label: p.name, hint: `${p.minutes} min · ${money(suggest(p.price, currency))}` }))} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending || picked.length === 0} onClick={addAll}>
          {pending ? `Adicionando… ${done}/${picked.length}` : picked.length ? `Adicionar ${picked.length} serviço${picked.length > 1 ? "s" : ""}` : "Escolha os serviços"}
        </button>
        {picked.length < left.length && <button className="chip" disabled={pending} onClick={() => setPicked(left.map((p) => p.name))}>Marcar todos</button>}
        {picked.length > 0 && <button className="chip" disabled={pending} onClick={() => setPicked([])}>Limpar</button>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}

function ServiceForm({ initial, nextSort, pending, error, currency, lang, onSave, onCancel }: {
  initial: CatalogService | null; nextSort: number; pending: boolean; error: string; currency: string; lang: Lang;
  onSave: (input: ServiceInput) => void; onCancel: () => void;
}) {
  const [pt, setPt] = useState(initial?.name.pt ?? "");
  const [en, setEn] = useState(initial?.name.en ?? "");
  const [es, setEs] = useState(initial?.name.es ?? "");
  const [editLangs, setEditLangs] = useState(false);
  const [durationMin, setDuration] = useState<number | null>(initial?.durationMin ?? 30);
  const [price, setPrice] = useState<number | null>(initial?.price ?? null);
  const [override, setOverride] = useState(initial?.commissionOverridePct != null);
  const [pct, setPct] = useState<number | null>(initial?.commissionOverridePct ?? 40);
  const [sort, setSort] = useState(initial?.sort ?? nextSort);
  const [localError, setLocalError] = useState("");
  const steps = priceSteps(currency, "service");
  const money = (n: number) => formatMoney(n, currency, lang);

  function pickName(name: string) {
    // Tradução pronta acompanha o nome, se o dono não tiver escrito outra.
    const prev = SERVICE_I18N[pt];
    const next = SERVICE_I18N[name];
    if (!en || en === prev?.en) setEn(next?.en ?? "");
    if (!es || es === prev?.es) setEs(next?.es ?? "");
    // Num serviço novo, o nome pronto já sugere duração e preço.
    const preset = SERVICE_PRESETS.find((p) => p.name === name);
    if (!initial && preset) { setDuration(preset.minutes); setPrice(suggest(preset.price, currency)); }
    setPt(name);
  }

  const label = "mb-2 block text-sm font-medium";
  return (
    <form className="card mb-6 min-w-0 space-y-5" onSubmit={(e) => {
      e.preventDefault();
      setLocalError("");
      if (!pt.trim()) return setLocalError("Escolha o nome do serviço.");
      if (price == null) return setLocalError("Escolha o preço.");
      onSave({
        id: initial?.id, name: { pt, en: en || undefined, es: es || undefined },
        durationMin: durationMin ?? 30, price,
        commissionOverridePct: override ? (pct ?? 0) : null, sort,
      });
    }}>
      <h2 className="font-semibold">{initial ? `Editar ${initial.name.pt}` : "Novo serviço"}</h2>
      <fieldset className="min-w-0"><legend className={label}>Nome</legend>
        <PresetText name="Nome do serviço" presets={SERVICE_PRESETS.map((p) => p.name)} value={pt} onChange={pickName} otherPlaceholder="Nome do serviço" />
        <div className="mt-2 text-xs text-neutral-500">
          {en || es ? <>Inglês: <b>{en || "—"}</b> · Espanhol: <b>{es || "—"}</b></> : "Sem tradução: o cliente estrangeiro vê o nome em português."}
          {" "}<button type="button" className="underline" onClick={() => setEditLangs((v) => !v)}>{editLangs ? "fechar" : "mudar traduções"}</button>
        </div>
        {editLangs && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Nome em inglês<input className="input mt-1" maxLength={80} value={en} onChange={(e) => setEn(e.target.value)} placeholder="Opcional" /></label>
            <label className="text-sm">Nome em espanhol<input className="input mt-1" maxLength={80} value={es} onChange={(e) => setEs(e.target.value)} placeholder="Opcional" /></label>
          </div>
        )}
      </fieldset>
      <fieldset className="min-w-0"><legend className={label}>Duração</legend>
        <PresetNumber name="Duração" presets={DURATION_STEPS} value={durationMin} onChange={setDuration} min={5} max={600} step={5} format={(n) => `${n} min`} />
      </fieldset>
      <fieldset className="min-w-0"><legend className={label}>Preço</legend>
        <PresetNumber name="Preço" presets={steps} value={price} onChange={setPrice} min={0} max={1_000_000} step={moneyStep(steps)} format={money} />
      </fieldset>
      <fieldset className="min-w-0"><legend className={label}>Posição no app</legend>
        <div className="flex flex-wrap items-center gap-3">
          <Stepper name="Ordem no app" value={sort} onChange={setSort} min={0} max={999} format={(n) => `${n + 1}º`} />
          <span className="text-xs text-neutral-500">O 1º aparece primeiro no app do cliente.</span>
        </div>
      </fieldset>
      <div className="min-w-0 space-y-3">
        <Toggle on={override} onChange={setOverride} label="Este serviço tem comissão própria (vale para todos os barbeiros)" />
        {override && (
          <PresetNumber name="Comissão do serviço" presets={PERCENT_STEPS} value={pct} onChange={setPct} min={0} max={100} format={(n) => `${n}%`} />
        )}
      </div>
      {(localError || error) && <p className="text-sm text-red-600 dark:text-red-400">{localError || error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="chip" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
