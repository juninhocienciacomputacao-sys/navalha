"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import type { BarberView, ServiceView } from "@/modules/agenda/view";
import { errorText } from "@/modules/agenda/view";
import type { ClientLite } from "@/modules/agenda/data";
import type { FreeTime } from "@/modules/agenda/plan";
import { createAppt, findClients, loadFreeTimes } from "./actions";
import Sheet, { Label } from "./Sheet";

export interface NewPreset {
  day: string;
  barberId?: string;
  minutes?: number;
}

/** Horários livres de um barbeiro para um serviço. Os que caem em bloco de encaixe aparecem marcados. */
export function TimePicker({ slug, day, serviceId, barberId, exceptId, value, onChange }: {
  slug: string; day: string; serviceId: string; barberId: string; exceptId?: string;
  value: number | null; onChange: (m: number | null) => void;
}) {
  const [times, setTimes] = useState<FreeTime[] | null>(null);
  const [loading, start] = useTransition();
  useEffect(() => {
    let alive = true;
    start(async () => {
      const r = await loadFreeTimes(slug, day, serviceId, barberId, exceptId);
      if (!alive) return;
      setTimes(r);
      if (value !== null && !r.some((t) => t.time === value)) onChange(null);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, day, serviceId, barberId, exceptId]);

  if (!times || loading) return <p className="text-sm text-neutral-500">Carregando horários…</p>;
  if (!times.length) return <p className="text-sm text-neutral-500">Sem horário livre nesse dia com esse barbeiro.</p>;
  return (
    <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
      {times.map((t) => (
        <button key={t.time} type="button" onClick={() => onChange(t.time)}
          className={`chip px-2.5 py-1.5 tabular-nums ${value === t.time ? "chip-on" : ""} ${t.reserved ? "border-dashed" : ""}`}
          title={t.reserved ? "Horário guardado para encaixe" : undefined}>
          {toHHMM(t.time)}{t.reserved && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">encaixe</span>}
        </button>
      ))}
    </div>
  );
}

export default function NewAppt({ slug, today, barbers, services, preset, onClose }: {
  slug: string; today: string; barbers: BarberView[]; services: ServiceView[]; preset: NewPreset; onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"client" | "name">("client");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ClientLite[]>([]);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [barberId, setBarberId] = useState(preset.barberId ?? barbers[0]?.id ?? "");
  const [day, setDay] = useState(preset.day < today ? today : preset.day);
  const [minutes, setMinutes] = useState<number | null>(preset.minutes ?? null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode !== "client" || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => setFound(await findClients(slug, q)), 250);
    return () => clearTimeout(t);
  }, [q, mode, slug]);

  const ready = Boolean(serviceId && barberId && minutes !== null && (mode === "client" ? client : name.trim()));

  function save() {
    if (minutes === null) return;
    setError("");
    start(async () => {
      const r = await createAppt({
        slug, day, minutes, serviceId, barberId,
        clientId: mode === "client" ? client?.id ?? null : null,
        walkInName: mode === "name" ? name.trim() : null,
      });
      if (r.ok) { router.refresh(); onClose(); } else setError(errorText(r.error));
    });
  }

  return (
    <Sheet title="Novo agendamento" onClose={onClose}>
      <div className="flex gap-2">
        <button className={`chip flex-1 ${mode === "client" ? "chip-on" : ""}`} onClick={() => setMode("client")}>Cliente cadastrado</button>
        <button className={`chip flex-1 ${mode === "name" ? "chip-on" : ""}`} onClick={() => setMode("name")}>Só o nome</button>
      </div>
      {mode === "client" ? (
        client ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
            <span><b>{client.name}</b> <span className="text-neutral-500">{client.phone}</span></span>
            <button className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400" onClick={() => setClient(null)}>trocar</button>
          </div>
        ) : (
          <div className="mt-3">
            <input className="input" autoFocus placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
            {found.length > 0 && (
              <ul className="mt-1 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
                {found.map((c) => (
                  <li key={c.id}>
                    <button className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800" onClick={() => setClient(c)}>
                      <span>{c.name}</span><span className="text-neutral-500">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim().length >= 2 && found.length === 0 && (
              <p className="mt-1 text-xs text-neutral-500">Ninguém encontrado. <button className="font-medium underline" onClick={() => { setMode("name"); setName(q); }}>Marcar só com o nome</button></p>
            )}
          </div>
        )
      ) : (
        <input className="input mt-3" autoFocus placeholder="Nome do cliente" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      )}

      <Label>Serviço</Label>
      <div className="flex flex-wrap gap-1.5">
        {services.map((s) => (
          <button key={s.id} className={`chip px-3 py-1.5 ${serviceId === s.id ? "chip-on" : ""}`} onClick={() => setServiceId(s.id)}>
            {s.name} <span className="text-xs text-neutral-500">{s.durationMin} min</span>
          </button>
        ))}
      </div>

      <Label>Barbeiro</Label>
      <div className="flex flex-wrap gap-1.5">
        {barbers.map((b) => (
          <button key={b.id} className={`chip flex items-center gap-1.5 px-3 py-1.5 ${barberId === b.id ? "chip-on" : ""}`} onClick={() => setBarberId(b.id)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}
          </button>
        ))}
      </div>

      <Label>Dia</Label>
      <input type="date" className="input" min={today} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />

      <Label>Horário</Label>
      {serviceId && barberId && <TimePicker slug={slug} day={day} serviceId={serviceId} barberId={barberId} value={minutes} onChange={setMinutes} />}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button className="btn mt-5 w-full" disabled={!ready || pending} onClick={save}>
        {pending ? "Salvando…" : minutes !== null ? `Agendar às ${toHHMM(minutes)}` : "Agendar"}
      </button>
    </Sheet>
  );
}

/** Botão "+ Novo agendamento" com a própria janela. */
export function NewApptButton(props: { slug: string; today: string; day: string; barbers: BarberView[]; services: ServiceView[]; barberId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>+ Novo agendamento</button>
      {open && <NewAppt {...props} preset={{ day: props.day, barberId: props.barberId }} onClose={() => setOpen(false)} />}
    </>
  );
}
