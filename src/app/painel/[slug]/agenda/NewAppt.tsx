"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { addDays } from "@/core/time";
import { SelectList } from "@/components/pick";
import type { BarberView, ServiceView } from "@/modules/agenda/view";
import { errorText } from "@/modules/agenda/view";
import type { ClientLite } from "@/modules/agenda/data";
import type { FreeTime } from "@/modules/agenda/plan";
import { createAppt, findClients, loadFreeTimes, recentClients } from "./actions";
import { addClient } from "../clientes/actions";
import Sheet, { Label } from "./Sheet";

export interface NewPreset {
  day: string;
  barberId?: string;
  minutes?: number;
}

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { ...opts, timeZone: "UTC" }).replace(".", "");

/** Dia em botões: Hoje, Amanhã e os próximos dias; "Outro dia…" abre uma lista dos próximos 3 meses. */
export function DayPicker({ today, value, onChange }: { today: string; value: string; onChange: (d: string) => void }) {
  const quick = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [more, setMore] = useState(!quick.includes(value));
  const next = Array.from({ length: 90 }, (_, i) => addDays(today, i));
  const all = next.includes(value) ? next : [value, ...next];
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Dia" className="flex flex-wrap gap-1.5">
        {quick.map((d, i) => (
          <button key={d} type="button" role="radio" aria-checked={!more && value === d} onClick={() => { setMore(false); onChange(d); }}
            className={`chip px-3 py-1.5 capitalize ${!more && value === d ? "chip-on" : ""}`}>
            {i === 0 ? "Hoje" : i === 1 ? "Amanhã" : dayLabel(d, { weekday: "short", day: "numeric" })}
          </button>
        ))}
        <button type="button" className={`chip px-3 py-1.5 ${more ? "chip-on" : ""}`} onClick={() => setMore(true)}>Outro dia…</button>
      </div>
      {more && (
        <SelectList name="Escolha o dia" value={value} onChange={onChange}
          options={all.map((d) => ({ value: d, label: dayLabel(d, { weekday: "long", day: "numeric", month: "long" }) }))} />
      )}
    </div>
  );
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
  const parts = [
    { k: "Manhã", list: times.filter((t) => t.time < 12 * 60) },
    { k: "Tarde", list: times.filter((t) => t.time >= 12 * 60 && t.time < 18 * 60) },
    { k: "Noite", list: times.filter((t) => t.time >= 18 * 60) },
  ].filter((p) => p.list.length);
  return (
    <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
      {parts.map((p) => (
        <div key={p.k}>
          <p className="mb-1 text-[11px] font-medium text-neutral-500">{p.k} · {p.list.length}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {p.list.map((t) => (
              <button key={t.time} type="button" onClick={() => onChange(t.time)}
                className={`rounded-lg border px-1 py-1.5 text-sm font-medium tabular-nums transition ${value === t.time
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-neutral-950"
                  : t.reserved ? "border-dashed border-amber-400 bg-amber-50/60 hover:border-amber-500 dark:bg-amber-950/20" : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"}`}
                title={t.reserved ? "Horário guardado para encaixe" : undefined}>
                {toHHMM(t.time)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {times.some((t) => t.reserved) && <p className="text-[11px] text-neutral-500">Tracejado: horário guardado para encaixe.</p>}
    </div>
  );
}

export default function NewAppt({ slug, today, barbers, services, preset, onClose }: {
  slug: string; today: string; barbers: BarberView[]; services: ServiceView[]; preset: NewPreset; onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"client" | "new">("client");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ClientLite[]>([]);
  const [recent, setRecent] = useState<ClientLite[] | null>(null);
  const [client, setClient] = useState<ClientLite | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [barberId, setBarberId] = useState(preset.barberId ?? barbers[0]?.id ?? "");
  const [day, setDay] = useState(preset.day < today ? today : preset.day);
  const [minutes, setMinutes] = useState<number | null>(preset.minutes ?? null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    recentClients(slug).then((r) => alive && setRecent(r)).catch(() => alive && setRecent([]));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (mode !== "client" || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => setFound(await findClients(slug, q)), 250);
    return () => clearTimeout(t);
  }, [q, mode, slug]);

  const ready = Boolean(serviceId && barberId && minutes !== null && (mode === "client" ? client : name.trim()));
  const searching = q.trim().length >= 2;
  const list = searching ? found : recent ?? [];

  function save() {
    if (minutes === null) return;
    setError("");
    start(async () => {
      let clientId = mode === "client" ? client?.id ?? null : null;
      if (mode === "new" && phone.trim()) {
        const c = await addClient(slug, { name: name.trim(), phone });
        if (!c.ok) { setError(c.error); return; }
        clientId = c.id ?? null;
      }
      const r = await createAppt({
        slug, day, minutes, serviceId, barberId, clientId,
        walkInName: clientId ? null : name.trim(),
      });
      if (r.ok) { router.refresh(); onClose(); } else setError(errorText(r.error));
    });
  }

  return (
    <Sheet title="Novo agendamento" onClose={onClose}>
      <Label>Cliente</Label>
      {mode === "client" ? (
        client ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
            <span className="min-w-0 truncate"><b>{client.name}</b> <span className="text-neutral-500">{client.phone}</span></span>
            <button className="shrink-0 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400" onClick={() => setClient(null)}>trocar</button>
          </div>
        ) : (
          <div>
            <input type="search" className="input" placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} />
            <p className="mt-2 text-xs text-neutral-500">{searching ? "Toque no cliente:" : "Vieram por último (toque para escolher):"}</p>
            <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {!searching && recent === null && <span className="text-sm text-neutral-500">Carregando…</span>}
              {list.map((c) => (
                <button key={c.id} type="button" className="chip max-w-full truncate px-3 py-1.5" onClick={() => setClient(c)}>{c.name}</button>
              ))}
              <button type="button" className="chip px-3 py-1.5 font-medium" onClick={() => { setMode("new"); setName(searching && !/\d/.test(q) ? q.trim() : ""); }}>+ Novo cliente</button>
            </div>
            {searching && found.length === 0 && <p className="mt-1 text-xs text-neutral-500">Ninguém encontrado com “{q.trim()}”.</p>}
          </div>
        )
      ) : (
        <div className="space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Novo cliente</p>
            <button type="button" className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400" onClick={() => setMode("client")}>voltar para a lista</button>
          </div>
          <input className="input" autoFocus placeholder="Nome do cliente" aria-label="Nome do cliente" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="WhatsApp (opcional)" aria-label="WhatsApp" inputMode="tel" maxLength={25} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <p className="text-xs text-neutral-500">Com WhatsApp, o cliente já fica cadastrado. Sem, marca só com o nome.</p>
        </div>
      )}

      <Label>Serviço</Label>
      {services.length === 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Nenhum serviço cadastrado ainda. Cadastre em <a className="font-semibold underline" href={`/painel/${slug}/servicos`}>Serviços</a> (o “Começar rápido” adiciona os mais comuns de uma vez) e volte aqui.
        </p>
      )}
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
      <DayPicker today={today} value={day} onChange={setDay} />

      <Label>Horário</Label>
      {!serviceId && <p className="text-sm text-neutral-500">Escolha um serviço para ver os horários livres.</p>}
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
