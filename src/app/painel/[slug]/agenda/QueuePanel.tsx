"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { errorText, type BarberView, type QueueView, type ServiceView } from "@/modules/agenda/view";
import { queueAdd, queueCall, queueLeave } from "./actions";

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

export default function QueuePanel({ slug, queue, barbers, services, freeReserves, open }: {
  slug: string; queue: QueueView[]; barbers: BarberView[]; services: ServiceView[]; freeReserves: number; open: boolean;
}) {
  const router = useRouter();
  const now = useTick(30_000);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const barber = (id: string) => barbers.find((b) => b.id === id);

  function add() {
    if (!name.trim()) return;
    start(async () => {
      const r = await queueAdd({ slug, name: name.trim(), serviceId: serviceId || null, clientId: null });
      if (r.ok) { setName(""); setAdding(false); setMsg(null); router.refresh(); } else setMsg({ ok: false, text: errorText(r.error) });
    });
  }
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
        <button className="chip" onClick={() => setAdding((v) => !v)}>+ Chegou cliente</button>
      </header>

      {adding && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input className="input" autoFocus placeholder="Nome" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <select className="input sm:w-48" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Serviço">
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMin} min)</option>)}
          </select>
          <button className="btn" disabled={!name.trim() || pending} onClick={add}>Pôr na fila</button>
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
