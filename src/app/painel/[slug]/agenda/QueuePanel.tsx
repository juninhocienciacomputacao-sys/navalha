"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { errorText, type BarberView, type QueueView, type ServiceView } from "@/modules/agenda/view";
import type { ClientLite } from "@/modules/agenda/data";
import { queueAdd, queueCall, queueLeave, recentClients } from "./actions";

function useTick(ms: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const VIA: Record<QueueView["via"], string> = { reception: "recepção", app: "pelo app", qr: "pelo QR" };

export default function QueuePanel({ slug, queue, barbers, services, freeReserves, open, todayClients = [] }: {
  slug: string; queue: QueueView[]; barbers: BarberView[]; services: ServiceView[]; freeReserves: number; open: boolean;
  /** Clientes cadastrados com horário hoje (aparecem primeiro para tocar). */
  todayClients?: ClientLite[];
}) {
  const router = useRouter();
  const now = useTick(30_000);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [recent, setRecent] = useState<ClientLite[] | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const barber = (id: string) => barbers.find((b) => b.id === id);

  function add() {
    if (!name.trim()) return;
    start(async () => {
      const r = await queueAdd({ slug, name: name.trim(), serviceId: serviceId || null, clientId });
      if (r.ok) { setName(""); setClientId(null); setTyping(false); setAdding(false); setMsg(null); router.refresh(); } else setMsg({ ok: false, text: errorText(r.error) });
    });
  }
  function openAdd() {
    setAdding((v) => !v);
    if (recent === null) recentClients(slug).then(setRecent).catch(() => setRecent([]));
  }
  const waiting = new Set(queue.map((x) => x.name));
  const seen = new Set<string>();
  const picks = [...todayClients, ...(recent ?? [])].filter((c) => !waiting.has(c.name) && !seen.has(c.id) && seen.add(c.id)).slice(0, 16);

  function call(id: string) {
    start(async () => {
      const r = await queueCall(slug, id);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: errorText(r.error) });
      if (r.ok) router.refresh();
    });
  }
  function leave(id: string, who: string) {
    if (!confirm(`${who} desistiu de esperar?`)) return;
    start(async () => {
      const r = await queueLeave(slug, id);
      if (r.ok) router.refresh(); else setMsg({ ok: false, text: errorText(r.error) });
    });
  }

  return (
    <section className="card mb-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Fila de quem chegou sem horário</h2>
          <p className="text-xs text-neutral-500">
            {open ? `${freeReserves} horário(s) guardado(s) para encaixe ainda livre(s) hoje.` : "Fechado hoje."} &quot;Chamar&quot; coloca a pessoa no primeiro horário livre de qualquer barbeiro.
          </p>
        </div>
        <button className="chip" onClick={openAdd}>+ Chegou cliente</button>
      </header>

      {adding && (
        <div className="mt-3 space-y-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-500">Quem chegou? {todayClients.length ? "(primeiro, quem tem horário hoje)" : ""}</p>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
              {recent === null && !todayClients.length && <span className="text-sm text-neutral-500">Carregando…</span>}
              {picks.map((c) => (
                <button key={c.id} type="button" className={`chip max-w-full truncate px-3 py-1.5 ${clientId === c.id ? "chip-on" : ""}`}
                  onClick={() => { setClientId(c.id); setName(c.name); setTyping(false); }}>{c.name}</button>
              ))}
              <button type="button" className={`chip px-3 py-1.5 ${typing ? "chip-on" : ""}`}
                onClick={() => { setTyping(true); setClientId(null); setName(""); }}>Outro nome…</button>
            </div>
            {typing && (
              <input className="input mt-2" autoFocus placeholder="Nome" aria-label="Nome" maxLength={80} value={name}
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-500">Serviço</p>
            <div className="flex flex-wrap gap-1.5">
              {services.map((s) => (
                <button key={s.id} type="button" className={`chip px-3 py-1.5 ${serviceId === s.id ? "chip-on" : ""}`} onClick={() => setServiceId(s.id)}>
                  {s.name} <span className="text-xs text-neutral-500">{s.durationMin} min</span>
                </button>
              ))}
            </div>
          </div>
          <button className="btn w-full sm:w-auto" disabled={!name.trim() || pending} onClick={add}>
            {name.trim() ? `Pôr ${name.trim().split(" ")[0]} na fila` : "Pôr na fila"}
          </button>
        </div>
      )}

      {msg && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>{msg.text}</p>}

      {queue.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Ninguém esperando.</p>
      ) : (
        <ol className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
          {queue.map((q, i) => {
            const waited = now ? Math.max(0, Math.floor((now - q.joinedAt) / 60_000)) : null;
            const f = q.forecast;
            return (
              <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">{i + 1}º</span>
                <span className="min-w-0 flex-1">
                  <b>{q.name}</b> · {q.serviceName}
                  <span className="block text-xs text-neutral-500">
                    {waited === null ? "" : waited < 1 ? "acabou de chegar" : `esperando há ${waited} min`} · {VIA[q.via]}
                    {f ? ` · previsão ${toHHMM(f.time)} com ${barber(f.barberId)?.name ?? ""}` : " · sem horário livre hoje"}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button className="btn px-3 py-1.5" disabled={pending || !f} onClick={() => call(q.id)}>Chamar</button>
                  <button className="chip px-3 py-1.5" disabled={pending} onClick={() => leave(q.id, q.name)}>Desistiu</button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
