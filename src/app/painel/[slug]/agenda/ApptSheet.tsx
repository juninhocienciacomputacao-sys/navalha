"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { STATUS_TEXT, errorText, type BarberView, type DayItem, type ViewStatus } from "@/modules/agenda/view";
import { APPT_NOTE_PRESETS } from "@/core/presets";
import { changeStatus, noteOnClient, reschedule } from "./actions";
import { DayPicker, TimePicker } from "./NewAppt";
import Sheet, { Label } from "./Sheet";

const ACTIONS: { status: Exclude<ViewStatus, "pending">; label: string; cls: string }[] = [
  { status: "in_service", label: "Começar atendimento", cls: "bg-sky-600 text-white hover:bg-sky-500" },
  { status: "done", label: "Concluído", cls: "bg-emerald-600 text-white hover:bg-emerald-500" },
  { status: "no_show", label: "Faltou", cls: "bg-amber-500 text-neutral-950 hover:bg-amber-400" },
  { status: "cancelled", label: "Cancelar", cls: "bg-red-600 text-white hover:bg-red-500" },
  { status: "confirmed", label: "Voltar para confirmado", cls: "border border-neutral-300 dark:border-neutral-700" },
];

export default function ApptSheet({ slug, today, day, item, barbers, onClose }: {
  slug: string; today: string; day: string; item: DayItem; barbers: BarberView[]; onClose: () => void;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [newDay, setNewDay] = useState(day < today ? today : day);
  const [barberId, setBarberId] = useState(item.barberId);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const barber = barbers.find((b) => b.id === item.barberId);
  const [noted, setNoted] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState<string | null>(null);
  const [noteMsg, setNoteMsg] = useState("");

  function note(text: string) {
    const t = text.trim();
    if (!t) return;
    setNoteMsg("");
    start(async () => {
      const r = await noteOnClient(slug, item.id, t);
      if (r.ok) { setNoted((n) => [...n, t]); setOtherNote(null); setNoteMsg("Anotado na ficha do cliente."); }
      else setNoteMsg(r.error);
    });
  }

  function setStatus(status: Exclude<ViewStatus, "pending">) {
    if (status === "cancelled" && !confirm(`Cancelar o horário de ${item.clientName}?`)) return;
    setError("");
    start(async () => {
      const r = await changeStatus(slug, item.id, status);
      if (r.ok) { router.refresh(); onClose(); } else setError(errorText(r.error));
    });
  }

  function move() {
    if (minutes === null) return;
    setError("");
    start(async () => {
      const r = await reschedule({ slug, id: item.id, day: newDay, minutes, barberId });
      if (r.ok) { router.refresh(); onClose(); } else setError(errorText(r.error));
    });
  }

  const wa = item.phone.replace(/\D/g, "");
  return (
    <Sheet title={item.clientName} onClose={onClose}>
      <div className="space-y-1 text-sm">
        <p><b>{item.serviceName}</b> · {toHHMM(item.start)}–{toHHMM(item.end)}</p>
        <p className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: barber?.color }} />com {barber?.name}</p>
        <p className="flex flex-wrap gap-1.5 pt-1">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium dark:bg-neutral-800">{STATUS_TEXT[item.status]}</span>
          {item.viaPlan && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">plano</span>}
          {item.walkIn && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">encaixe</span>}
        </p>
        {wa && <a className="inline-block pt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" target="_blank" rel="noreferrer" href={`https://wa.me/${wa}`}>WhatsApp {item.phone}</a>}
      </div>

      <Label>Mudar situação</Label>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.filter((a) => a.status !== item.status).map((a) => (
          <button key={a.status} disabled={pending} onClick={() => setStatus(a.status)}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${a.cls}`}>{a.label}</button>
        ))}
      </div>

      {item.phone && (
        <>
          <Label>Anotar na ficha</Label>
          <div className="flex flex-wrap gap-1.5">
            {APPT_NOTE_PRESETS.map((n) => {
              const on = noted.includes(n);
              return (
                <button key={n} type="button" disabled={pending || on} onClick={() => note(n)}
                  className={`chip px-3 py-1.5 ${on ? "chip-on" : ""}`}>{on ? "✓ " : ""}{n}</button>
              );
            })}
            <button type="button" className={`chip px-3 py-1.5 ${otherNote !== null ? "chip-on" : ""}`}
              onClick={() => setOtherNote((v) => (v === null ? "" : null))}>Outro…</button>
          </div>
          {otherNote !== null && (
            <div className="mt-2 flex gap-2">
              <input className="input min-w-0 flex-1" autoFocus maxLength={200} placeholder="Escreva a anotação" value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && note(otherNote)} />
              <button type="button" className="btn shrink-0" disabled={pending || !otherNote.trim()} onClick={() => note(otherNote)}>Anotar</button>
            </div>
          )}
          {noteMsg && <p className="mt-1.5 text-xs text-neutral-500">{noteMsg}</p>}
        </>
      )}

      {!moving ? (
        <button className="chip mt-4 w-full" onClick={() => setMoving(true)}>Remarcar (outro dia, horário ou barbeiro)</button>
      ) : (
        <div className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
          <p className="text-sm font-semibold">Remarcar</p>
          <Label>Dia</Label>
          <DayPicker today={today} value={newDay} onChange={setNewDay} />
          <Label>Barbeiro</Label>
          <div className="flex flex-wrap gap-1.5">
            {barbers.map((b) => (
              <button key={b.id} className={`chip flex items-center gap-1.5 px-3 py-1.5 ${barberId === b.id ? "chip-on" : ""}`} onClick={() => setBarberId(b.id)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}
              </button>
            ))}
          </div>
          <Label>Novo horário</Label>
          <TimePicker slug={slug} day={newDay} serviceId={item.serviceId} barberId={barberId} exceptId={item.id} value={minutes} onChange={setMinutes} />
          <button className="btn mt-4 w-full" disabled={minutes === null || pending} onClick={move}>
            {minutes === null ? "Escolha o horário" : `Remarcar para ${toHHMM(minutes)}`}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Sheet>
  );
}
