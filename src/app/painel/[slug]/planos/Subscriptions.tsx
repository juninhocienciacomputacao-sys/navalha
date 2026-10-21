"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { BarberInfo } from "@/data/types";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { expiryMessage, matchesQuery, subMatches, waLink, type SubFilter } from "@/core/planboard";
import type { PayMethod, PlanItem, SubRow } from "@/modules/plans/data";
import { Avatar, Badge, fmtDay, fmtPhone, planBadge, WhatsAppLink } from "@/modules/clients/ui";
import { alertDaysAction, cancelAction, payAction, sellAction } from "./actions";

type Row = SubRow & { left: number };
type ClientOpt = { id: string; name: string; phone: string };

const FILTERS: [SubFilter, string][] = [["attention", "Precisam de atenção"], ["expired", "Vencidos"], ["ok", "Em dia"], ["all", "Todos"]];
const METHODS: [PayMethod, string][] = [["pix", "Pix"], ["card", "Cartão"], ["cash", "Dinheiro"]];

export default function Subscriptions({ slug, canManage, shopName, currency, lang, alertDays, barbers, plans, subs, clients, initialQuery, sellTo }: {
  slug: string; canManage: boolean; shopName: string; currency: string; lang: Lang; alertDays: number;
  barbers: BarberInfo[]; plans: PlanItem[]; subs: Row[]; clients: ClientOpt[]; initialQuery: string; sellTo: string | null;
}) {
  const [f, setF] = useState<SubFilter>(initialQuery ? "all" : "attention");
  const [q, setQ] = useState(initialQuery);
  const [selling, setSelling] = useState(Boolean(sellTo));
  const money = (n: number) => formatMoney(n, currency, lang);
  const plan = (id: string) => plans.find((p) => p.id === id);
  const barber = (id: string | null) => barbers.find((b) => b.id === id);

  const list = useMemo(() => subs.filter((s) => subMatches(s.left, alertDays, f) && matchesQuery(s.clientName, s.phone, q)).sort((a, z) => a.left - z.left),
    [subs, alertDays, f, q]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, subs.filter((s) => subMatches(s.left, alertDays, k)).length])), [subs, alertDays]);

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Assinaturas</h2>
          <p className="text-xs text-neutral-500">Ordenadas pelo vencimento mais próximo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AlertDays slug={slug} value={alertDays} canManage={canManage} />
          {canManage && <button className="btn" onClick={() => setSelling((v) => !v)}>{selling ? "Fechar" : "+ Vender plano"}</button>}
        </div>
      </div>

      {selling && canManage && (
        <SellPlan slug={slug} plans={plans.filter((p) => p.active)} barbers={barbers} clients={clients} currency={currency} lang={lang}
          busy={new Set(subs.map((s) => s.clientId))} initialClient={sellTo} onDone={() => setSelling(false)} />
      )}

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={`chip shrink-0 ${f === k ? "chip-on" : ""}`}>
              {label} <span className="text-xs text-neutral-500">{counts[k]}</span>
            </button>
          ))}
        </div>
        <input type="search" className="input md:ml-auto md:max-w-xs" placeholder="Buscar assinante" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar assinante" />
      </div>

      <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
        {list.map((s) => {
          const p = plan(s.planId);
          return <SubLine key={s.id} slug={slug} s={s} plan={p} canManage={canManage} alertDays={alertDays} lang={lang} money={money}
            color={barber(s.soldByBarberId)?.color} soldBy={barber(s.soldByBarberId)?.name}
            message={p ? expiryMessage({ clientName: s.clientName, planName: p.name, shopName, left: s.left, endLabel: fmtDay(s.periodEnd, lang, true), price: money(p.price) }) : ""} />;
        })}
      </ul>
      {list.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500">{f === "attention" ? "Ninguém precisando de atenção agora. 👍" : "Nenhuma assinatura aqui."}</p>
      )}
    </section>
  );
}

function SubLine({ slug, s, plan, canManage, alertDays, lang, money, color, soldBy, message }: {
  slug: string; s: Row; plan?: PlanItem; canManage: boolean; alertDays: number; lang: Lang; money: (n: number) => string;
  color?: string | null; soldBy?: string; message: string;
}) {
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<PayMethod>("pix");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, start] = useTransition();
  const b = planBadge(s.left, alertDays);
  const quota = plan?.quotaUses ?? null;
  const usedPct = quota ? Math.min(100, (s.usesInPeriod / quota) * 100) : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => start(async () => {
    setError(""); setOk("");
    const r = await fn();
    if (r.ok) { setOk(okText); setPaying(false); } else setError(r.error ?? "Não deu certo.");
  });

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={`/painel/${slug}/clientes/${s.clientId}`} className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <Avatar name={s.clientName} color={color} />
          <span className="min-w-0">
            <b className="block truncate text-sm hover:underline">{s.clientName}</b>
            <span className="block truncate text-xs text-neutral-500">{fmtPhone(s.phone)}{soldBy ? ` · vendido por ${soldBy}` : ""}</span>
          </span>
        </Link>
        <div className="min-w-0 basis-40 text-sm">
          <span className="block truncate font-medium">{plan?.name ?? "Plano"}</span>
          <span className="text-xs tabular-nums text-neutral-500">{plan ? money(plan.price) : ""} · vence {fmtDay(s.periodEnd, lang, true)}</span>
        </div>
        <div className="w-28"><Badge tone={b.tone}>{b.label}</Badge></div>
        <div className="flex w-32 items-center gap-2" title="Uso no ciclo">
          {usedPct !== null ? (
            <>
              <svg width="56" height="6" aria-hidden className="shrink-0">
                <rect width="56" height="6" rx="3" className="fill-neutral-200 dark:fill-neutral-800" />
                <rect width={(56 * usedPct) / 100} height="6" rx="3" className={usedPct >= 100 ? "fill-red-500" : "fill-amber-500"} />
              </svg>
              <span className="text-xs tabular-nums text-neutral-500">{s.usesInPeriod}/{quota}</span>
            </>
          ) : <span className="text-xs tabular-nums text-neutral-500">{s.usesInPeriod} uso{s.usesInPeriod === 1 ? "" : "s"} · ilimitado</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          {s.left <= alertDays && s.phone && <WhatsAppLink compact href={waLink(s.phone, message)} label="Avisar no WhatsApp" />}
          {canManage && !paying && <button className="chip !py-1.5 text-xs" onClick={() => { setPaying(true); setOk(""); }}>Registrar pagamento</button>}
          {canManage && (
            <button className="px-1 text-xs text-red-600 hover:underline disabled:opacity-40 dark:text-red-400" disabled={pending}
              onClick={() => { if (confirm(`Cancelar o plano de ${s.clientName}? Ele deixa de valer na agenda.`)) run(() => cancelAction(slug, s.id), "Plano cancelado."); }}>
              Cancelar
            </button>
          )}
        </div>
      </div>
      {paying && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-950">
          <span className="text-neutral-500">Recebeu {plan ? money(plan.price) : ""} por</span>
          {METHODS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={method === k} className={`chip !py-1.5 ${method === k ? "chip-on" : ""}`} onClick={() => setMethod(k)}>{label}</button>
          ))}
          <button className="btn !py-1.5" disabled={pending} onClick={() => run(() => payAction(slug, s.id, method), "Pagamento registrado. Plano renovado.")}>
            {pending ? "Salvando…" : "Confirmar"}
          </button>
          <button className="chip !py-1.5" onClick={() => setPaying(false)}>Voltar</button>
          <span className="w-full text-xs text-neutral-500">
            {s.left < 0 ? "Plano vencido: o novo ciclo começa hoje." : "Plano em dia: o novo ciclo começa quando o atual terminar."} Os usos do ciclo voltam a zero.
          </span>
        </div>
      )}
      {(ok || error) && <p className={`mt-2 text-xs ${error ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{error || ok}</p>}
    </li>
  );
}

function SellPlan({ slug, plans, barbers, clients, currency, lang, busy, initialClient, onDone }: {
  slug: string; plans: PlanItem[]; barbers: BarberInfo[]; clients: ClientOpt[]; currency: string; lang: Lang;
  busy: Set<string>; initialClient: string | null; onDone: () => void;
}) {
  const pre = clients.find((c) => c.id === initialClient);
  const [q, setQ] = useState(pre?.name ?? "");
  const [clientId, setClientId] = useState(pre?.id ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [barberId, setBarberId] = useState("");
  const [method, setMethod] = useState<PayMethod>("pix");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const chosen = clients.find((c) => c.id === clientId);
  const matches = q.trim() && !chosen ? clients.filter((c) => matchesQuery(c.name, c.phone, q)).slice(0, 8) : [];
  const plan = plans.find((p) => p.id === planId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const r = await sellAction(slug, { clientId, planId, barberId: barberId || null, method });
      if (r.ok) onDone(); else setError(r.error);
    });
  }
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  if (!plans.length) return <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500 dark:bg-neutral-950">Crie ou ative um plano no catálogo antes de vender.</p>;
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="relative text-sm">
          <span className={label}>Cliente</span>
          {chosen ? (
            <div className="input flex items-center justify-between">
              <span className="truncate">{chosen.name} <span className="text-neutral-500">· {fmtPhone(chosen.phone)}</span></span>
              <button type="button" className="text-xs text-neutral-500 hover:underline" onClick={() => { setClientId(""); setQ(""); }}>trocar</button>
            </div>
          ) : (
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou WhatsApp" />
          )}
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    onClick={() => setClientId(c.id)}>
                    <span className="truncate">{c.name} <span className="text-xs text-neutral-500">{fmtPhone(c.phone)}</span></span>
                    {busy.has(c.id) && <span className="text-xs text-amber-600">já tem plano</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && !chosen && matches.length === 0 && (
            <p className="mt-1 text-xs text-neutral-500">Ninguém com esse nome. <Link className="underline" href={`/painel/${slug}/clientes`}>Cadastre o cliente</Link> primeiro.</p>
          )}
        </div>
        <label className="text-sm"><span className={label}>Plano</span>
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price, currency, lang)}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className={label}>Quem vendeu</span>
          <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            <option value="">Ninguém da equipe (balcão)</option>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Pagou {plan ? formatMoney(plan.price, currency, lang) : ""} por</span>
        {METHODS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={method === k} className={`chip !py-1.5 ${method === k ? "chip-on" : ""}`} onClick={() => setMethod(k)}>{l}</button>
        ))}
        <button className="btn md:ml-auto" disabled={pending || !clientId || !planId}>{pending ? "Salvando…" : "Vender plano"}</button>
      </div>
      {plan && <p className="text-xs text-neutral-500">O plano começa hoje e vale por {plan.periodDays} dias. Quem vendeu entra no bônus de venda da comissão.</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

function AlertDays({ slug, value, canManage }: { slug: string; value: number; canManage: boolean }) {
  const [v, setV] = useState(String(value));
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!canManage) return <span className="text-xs text-neutral-500">Aviso {value} dias antes do vencimento</span>;
  const save = () => {
    if (Number(v) === value) return;
    start(async () => { const r = await alertDaysAction(slug, Number(v)); setError(r.ok ? "" : r.error); });
  };
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
      Avisar com
      <input className="input !w-16 !px-2 !py-1.5 text-center" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} disabled={pending} aria-label="Dias de antecedência do aviso" />
      dias
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
