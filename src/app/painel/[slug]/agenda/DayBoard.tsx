"use client";

import { BarberFace } from "@/components/BarberFace";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { errorText, type BarberView, type DayItem, type QueueView, type ReserveView, type ServiceView } from "@/modules/agenda/view";
import { queueCall } from "./actions";
import ApptSheet from "./ApptSheet";
import NewAppt, { type NewPreset } from "./NewAppt";
import Sheet from "./Sheet";

const PX = 1.5; // pixels por minuto
const HEAD = 44;

/** Minutos de agora no fuso da barbearia, atualizado a cada 30 s. */
function useNowMinutes(tz: string, enabled: boolean) {
  const calc = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return Number(p.hour) * 60 + Number(p.minute);
  };
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setNow(calc());
    const t = setInterval(() => setNow(calc()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz, enabled]);
  return enabled ? now : null;
}

export default function DayBoard({ slug, tz, today, day, open, close, step, barbers, allBarbers, services, items, reserves, queue }: {
  slug: string; tz: string; today: string; day: string; open: number; close: number; step: number;
  barbers: BarberView[]; allBarbers: BarberView[]; services: ServiceView[];
  items: DayItem[]; reserves: ReserveView[]; queue: QueueView[];
}) {
  const router = useRouter();
  const nowMin = useNowMinutes(tz, day === today);
  const [newAt, setNewAt] = useState<NewPreset | null>(null);
  const [selected, setSelected] = useState<DayItem | null>(null);
  const [reserve, setReserve] = useState<ReserveView | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const H = (close - open) * PX;
  const hours = Array.from({ length: Math.ceil((close - open) / 60) }, (_, i) => open + i * 60);
  const past = (m: number) => day < today || (day === today && nowMin !== null && m < nowMin - step);

  function clickColumn(e: React.MouseEvent<HTMLDivElement>, barberId: string) {
    if (e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY;
    const m = open + Math.floor(y / PX / step) * step;
    if (past(m)) return;
    setNewAt({ day, barberId, minutes: m });
  }

  function fitHere(r: ReserveView) {
    const first = queue[0];
    if (!first) return;
    start(async () => {
      const res = await queueCall(slug, first.id, { barberId: r.barberId, minutes: r.start });
      setReserve(null);
      setMsg(res.ok ? res.message : errorText(res.error));
      if (res.ok) router.refresh();
    });
  }

  const barberOf = (id: string) => allBarbers.find((b) => b.id === id);

  return (
    <>
      {msg && <p className="mb-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{msg}</p>}
      <div className="card overflow-x-auto p-0">
        <div className="relative flex" style={{ minWidth: 56 + barbers.length * 150 }}>
          <div className="sticky left-0 z-20 w-14 shrink-0 bg-white text-[11px] text-neutral-400 dark:bg-neutral-900" style={{ paddingTop: HEAD }}>
            {hours.map((h) => <div key={h} className="-translate-y-1.5 pl-2" style={{ height: 60 * PX }}>{toHHMM(h)}</div>)}
          </div>
          {barbers.map((b) => {
            const mine = items.filter((x) => x.barberId === b.id && x.status !== "cancelled");
            const count = mine.filter((x) => x.status !== "no_show").length;
            return (
              <div key={b.id} className="min-w-[150px] flex-1 border-l border-neutral-100 dark:border-neutral-800">
                <div className="sticky top-0 flex items-center gap-2 border-b border-neutral-100 px-2 dark:border-neutral-800" style={{ height: HEAD }}>
                  <BarberFace name={b.name} color={b.color} photo={b.photo} className="h-7 w-7 text-xs" />
                  <span className="leading-tight"><b className="text-sm">{b.name}</b><br /><span className="text-[11px] text-neutral-500">{count} atendimento(s)</span></span>
                </div>
                <div className="relative cursor-cell" style={{
                  height: H,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--grid, rgba(127,127,127,.15)) 0 1px, transparent 1px ${60 * PX}px)`,
                }} onClick={(e) => clickColumn(e, b.id)} title="Toque num espaço vazio para agendar">
                  {reserves.filter((r) => r.barberId === b.id).map((r) => (
                    <button key={r.start} onClick={() => setReserve(r)}
                      className={`absolute inset-x-1 rounded-md border-2 border-dashed border-amber-500/70 bg-amber-50/70 px-2 text-left text-[11px] leading-tight text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 ${past(r.end) ? "opacity-40" : ""}`}
                      style={{ top: (r.start - open) * PX + 1, height: (r.end - r.start) * PX - 3 }}>
                      <b>{toHHMM(r.start)} livre p/ encaixe</b><br />guardado para quem chega sem horário
                    </button>
                  ))}
                  {mine.map((x) => {
                    const h = (x.end - x.start) * PX - 3;
                    const faded = x.status === "done" ? "opacity-60" : x.status === "no_show" ? "opacity-35 line-through" : "";
                    return (
                      <button key={x.id} onClick={() => setSelected(x)}
                        className={`absolute inset-x-1 overflow-hidden rounded-md px-2 text-left text-[11px] leading-tight text-white shadow-sm hover:brightness-110 ${h < 30 ? "py-0" : "py-1"} ${faded} ${x.status === "in_service" ? "ring-2 ring-sky-400 ring-offset-1 dark:ring-offset-neutral-900" : ""}`}
                        style={{ top: (x.start - open) * PX + 1, height: h, background: b.color }}
                        aria-label={`${toHHMM(x.start)} ${x.clientName}`}>
                        <span className="flex justify-between gap-1">
                          <b className="truncate">{toHHMM(x.start)} {x.clientName}</b>
                          <span aria-hidden>{x.status === "in_service" ? "●" : x.status === "done" ? "✓" : x.status === "pending" ? "?" : x.status === "no_show" ? "✕" : ""}</span>
                        </span>
                        {h > 34 && <span className="block truncate opacity-90">{x.serviceName}{x.viaPlan ? " · plano" : ""}{x.walkIn ? " · encaixe" : ""}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {nowMin !== null && nowMin >= open && nowMin <= close && (
            <div className="pointer-events-none absolute left-14 right-0 z-10 border-t-2 border-red-500" style={{ top: HEAD + (nowMin - open) * PX }}>
              <span className="absolute -left-12 -top-2.5 rounded bg-red-500 px-1 text-[10px] font-bold text-white">{toHHMM(nowMin)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">Toque num espaço vazio para agendar. Toque num horário para mudar a situação ou remarcar. ● na cadeira · ✓ concluído · ? sem resposta · ✕ faltou</p>

      {newAt && <NewAppt slug={slug} today={today} barbers={allBarbers} services={services} preset={newAt} onClose={() => setNewAt(null)} />}
      {selected && <ApptSheet slug={slug} today={today} day={day} item={selected} barbers={allBarbers} onClose={() => setSelected(null)} />}
      {reserve && (
        <Sheet title={`Encaixe ${toHHMM(reserve.start)}–${toHHMM(reserve.end)}`} onClose={() => setReserve(null)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Horário guardado com <b>{barberOf(reserve.barberId)?.name}</b> para quem chega sem marcar. O app do cliente não oferece esse horário.
          </p>
          <div className="mt-4 grid gap-2">
            {day === today && queue[0] && (
              <button className="btn" disabled={pending} onClick={() => fitHere(reserve)}>Encaixar {queue[0].name} (1º da fila) aqui</button>
            )}
            <button className="chip" onClick={() => { setNewAt({ day, barberId: reserve.barberId, minutes: reserve.start }); setReserve(null); }}>Agendar outra pessoa aqui</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
