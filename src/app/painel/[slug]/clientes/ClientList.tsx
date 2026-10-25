"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BarberInfo } from "@/data/types";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { clientMatches, daysLeft, matchesQuery, waLink, type ClientFilter } from "@/core/planboard";
import type { ClientRow } from "@/modules/clients/data";
import { Avatar, Badge, fmtPhone, planBadge, WhatsAppLink } from "@/modules/clients/ui";
import { addClient } from "./actions";
import { isFullName } from "@/core/phone";
import type { SameClient } from "@/modules/clients/data";
import { SamePhoneNotice, usePhoneOwner } from "./SamePhone";

const FILTERS: [ClientFilter, string][] = [
  ["all", "Todos"], ["subscribers", "Assinantes"], ["away", "Sumidos"], ["new", "Novos"], ["noshow", "Com faltas"],
];
const LIMIT = 150;
/** Assinante = tem plano não cancelado (vencido também conta, para a equipe lembrar de renovar). */
const facts = (c: ClientRow) => ({ ...c, subscriber: Boolean(c.sub) });

export default function ClientList({ slug, today, currency, lang, alertDays, barbers, plans, clients }: {
  slug: string; today: string; currency: string; lang: Lang; alertDays: number;
  barbers: BarberInfo[]; plans: { id: string; name: string }[]; clients: ClientRow[];
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<ClientFilter>("all");
  const [adding, setAdding] = useState(false);
  const money = (n: number) => formatMoney(n, currency, lang);
  const barber = (id: string | null) => barbers.find((b) => b.id === id);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "Plano";

  const list = useMemo(() => {
    const out = clients.filter((c) => matchesQuery(c.name, c.phone, q) && clientMatches(facts(c), today, f));
    const since = (c: ClientRow) => c.lastVisit ?? c.createdAt;
    if (f === "away") out.sort((a, z) => since(a).localeCompare(since(z)));
    else if (f === "new") out.sort((a, z) => z.createdAt.localeCompare(a.createdAt));
    else if (f === "noshow") out.sort((a, z) => z.noShows - a.noShows);
    else out.sort((a, z) => z.totalSpent - a.totalSpent || a.name.localeCompare(z.name));
    return out;
  }, [clients, q, f, today]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, clients.filter((c) => clientMatches(facts(c), today, k)).length])),
    [clients, today]);

  return (
    <section className="card">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input type="search" className="input md:max-w-xs" placeholder="Buscar por nome ou WhatsApp" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={`chip shrink-0 ${f === k ? "chip-on" : ""}`}>
              {label} <span className="text-xs text-neutral-500">{counts[k]}</span>
            </button>
          ))}
        </div>
        <button className="btn shrink-0 md:ml-auto" onClick={() => setAdding((v) => !v)}>{adding ? "Fechar" : "+ Novo cliente"}</button>
      </div>

      {adding && <NewClient slug={slug} onDone={() => setAdding(false)} />}

      <p className="mt-4 text-xs text-neutral-500">{list.length} de {clients.length} clientes</p>

      <div className="mt-2 hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_90px_60px_100px_90px_auto] gap-3 border-b border-neutral-100 px-2 pb-2 text-xs font-medium text-neutral-500 md:grid dark:border-neutral-800">
        <span>Cliente</span><span>Plano</span><span className="text-right">Última visita</span><span className="text-right">Visitas</span>
        <span className="text-right">Gasto total</span><span>Barbeiro</span><span />
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {list.slice(0, LIMIT).map((c) => {
          const br = barber(c.barberId);
          const left = c.sub ? daysLeft(c.sub.periodEnd, today) : null;
          const pb = left !== null ? planBadge(left, alertDays) : null;
          const ago = c.lastVisit ? -daysLeft(c.lastVisit, today) : null;
          return (
            <li key={c.id} className="flex items-center gap-3 px-2 py-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_90px_60px_100px_90px_auto] md:items-center">
              <Link href={`/painel/${slug}/clientes/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 md:contents">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.name} color={br?.color} />
                  <span className="min-w-0">
                    <b className="block truncate text-sm hover:underline">{c.name}</b>
                    <span className="block truncate text-xs text-neutral-500">
                      {fmtPhone(c.phone)}
                      {c.noShows > 0 && <span className="ml-2 text-red-600 dark:text-red-400">{c.noShows} falta{c.noShows > 1 ? "s" : ""}</span>}
                    </span>
                    {/* no celular, um resumo embaixo do nome */}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 md:hidden">
                      {c.sub && pb && <Badge tone={pb.tone}>{planName(c.sub.planId)}</Badge>}
                      <span>{ago === null ? "nunca veio" : ago === 0 ? "veio hoje" : `há ${ago} d`}</span>
                      <span>· {c.visits} visita{c.visits === 1 ? "" : "s"}</span>
                      <span>· {money(c.totalSpent)}</span>
                    </span>
                  </span>
                </span>
                <span className="hidden min-w-0 text-sm md:block">
                  {c.sub && pb ? (
                    <span className="flex flex-wrap items-center gap-1.5"><span className="truncate">{planName(c.sub.planId)}</span><Badge tone={pb.tone}>{pb.label}</Badge></span>
                  ) : <span className="text-neutral-400">avulso</span>}
                </span>
                <span className={`hidden text-right text-sm tabular-nums md:block ${ago !== null && ago > 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                  {ago === null ? <span className="text-neutral-400">nunca</span> : ago === 0 ? "hoje" : `há ${ago} d`}
                </span>
                <span className="hidden text-right text-sm tabular-nums md:block">{c.visits}</span>
                <span className="hidden text-right text-sm tabular-nums md:block">{money(c.totalSpent)}</span>
                <span className="hidden truncate text-sm md:block">{br?.name ?? <span className="text-neutral-400">—</span>}</span>
              </Link>
              {c.phone && <WhatsAppLink compact href={waLink(c.phone)} label="Chamar" />}
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="py-8 text-center text-sm text-neutral-500">Nenhum cliente encontrado.</p>}
      {list.length > LIMIT && <p className="mt-3 text-xs text-neutral-500">Mostrando {LIMIT} de {list.length}. Use a busca para achar os outros.</p>}
    </section>
  );
}

function NewClient({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [dup, setDup] = useState<SameClient | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const live = usePhoneOwner(slug, phone);
  const owner = live ?? dup;
  const nameBad = name.trim().length > 0 && !isFullName(name);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setDup(null);
    if (!isFullName(name)) return setError("Escreva o nome completo do cliente (nome e sobrenome).");
    if (owner) return;
    start(async () => {
      const r = await addClient(slug, { name, phone });
      if (!r.ok) {
        if (r.existing) return setDup(r.existing);
        return setError(r.error);
      }
      onDone();
      if (r.id) router.push(`/painel/${slug}/clientes/${r.id}`);
    });
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl bg-neutral-50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end dark:bg-neutral-950">
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-neutral-500">WhatsApp (identifica o cliente)</span>
        <input className="input" value={phone} onChange={(e) => { setPhone(e.target.value); setDup(null); }} placeholder="(11) 98888-7777" inputMode="tel" autoFocus required />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-neutral-500">Nome completo</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: João da Silva" autoComplete="off" required
          aria-invalid={nameBad || undefined} />
      </label>
      <button className="btn" disabled={pending || Boolean(owner)}>{pending ? "Salvando…" : "Cadastrar"}</button>
      {owner && <SamePhoneNotice slug={slug} owner={owner} className="md:col-span-3" />}
      {nameBad && !error && <p className="text-xs text-neutral-500 md:col-span-3">Coloque nome e sobrenome, como no documento.</p>}
      {error && <p className="text-sm text-red-600 md:col-span-3 dark:text-red-400">{error}</p>}
      <p className="text-xs text-neutral-500 md:col-span-3">Cada cliente tem um WhatsApp só: o mesmo número não pode ser de dois clientes. Sem o código do país, consideramos Brasil (+55). Para outro país, comece com + (ex.: +351 912 345 678).</p>
    </form>
  );
}
