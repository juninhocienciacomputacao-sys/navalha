"use client";

import { BarberFace } from "@/components/BarberFace";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { errorText, type BarberView, type DayItem, type QueueView, type ReserveView, type ServiceView } from "@/modules/agenda/view";
import { queueCall, reschedule } from "./actions";
import ApptSheet from "./ApptSheet";
import NewAppt, { type NewPreset } from "./NewAppt";
import Sheet from "./Sheet";

const PX = 1.6; // pixels por minuto (1 hora = 96 px)
const HEAD = 64;
const LIVE = new Set(["pending", "confirmed", "in_service"]);

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

type Move = { barberId: string; start: number };
type Drag = { id: string; x0: number; y0: number; moved: boolean; to: Move; ok: boolean };

export default function DayBoard({ slug, tz, today, day, open, close, step, barbers, allBarbers, bookable, services, items, reserves, queue }: {
  slug: string; tz: string; today: string; day: string; open: number; close: number; step: number;
  barbers: BarberView[]; allBarbers: BarberView[];
  /** Barbeiros em que a pessoa pode marcar e mexer (pelo nível de acesso). */
  bookable: BarberView[];
  services: ServiceView[];
  items: DayItem[]; reserves: ReserveView[]; queue: QueueView[];
}) {
  const canBook = (id: string) => bookable.some((b) => b.id === id);
  const router = useRouter();
  const nowMin = useNowMinutes(tz, day === today);
  const [newAt, setNewAt] = useState<NewPreset | null>(null);
  const [selected, setSelected] = useState<DayItem | null>(null);
  const [reserve, setReserve] = useState<ReserveView | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hover, setHover] = useState<Move | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [pending, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef(new Map<string, HTMLDivElement>());
  const dragged = useRef(false);

  const H = (close - open) * PX;
  const hours = Array.from({ length: Math.ceil((close - open) / 60) }, (_, i) => open + i * 60);
  const past = (m: number) => day < today || (day === today && nowMin !== null && m < nowMin - step);
  const ghostLen = services[0]?.durationMin ?? 30;
  const snap = (m: number) => Math.round(m / step) * step;

  // dados novos do servidor: as mudanças locais já estão nele
  useEffect(() => setMoves({}), [items]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4500);
    return () => clearTimeout(t);
  }, [msg]);

  // abre a agenda de hoje já perto da hora atual
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || nowMin === null || !scroller.current) return;
    scrolled.current = true;
    scroller.current.scrollTop = Math.max(0, (nowMin - open - 60) * PX);
  }, [nowMin, open]);

  const shown = useMemo(() => items.map((x) => {
    const m = moves[x.id];
    return m ? { ...x, barberId: m.barberId, start: m.start, end: m.start + (x.end - x.start) } : x;
  }), [items, moves]);

  function fits(id: string, to: Move, len: number) {
    if (!canBook(to.barberId) || to.start < open || to.start + len > close || past(to.start)) return false;
    return !shown.some((x) => x.id !== id && x.barberId === to.barberId && (LIVE.has(x.status) || x.masked)
      && x.start < to.start + len && to.start < x.end);
  }

  function barberAt(clientX: number) {
    for (const [id, el] of cols.current) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return id;
    }
    return null;
  }

  // ---- arrastar para remarcar (mouse) ----
  function onDown(e: React.PointerEvent, x: DayItem) {
    if (e.pointerType !== "mouse" || e.button !== 0 || !canBook(x.barberId) || !LIVE.has(x.status) || x.status === "in_service") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: x.id, x0: e.clientX, y0: e.clientY, moved: false, to: { barberId: x.barberId, start: x.start }, ok: true });
  }
  function onMove(e: React.PointerEvent, x: DayItem) {
    if (!drag || drag.id !== x.id) return;
    const far = Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 6;
    if (!drag.moved && !far) return;
    const len = x.end - x.start;
    const barberId = barberAt(e.clientX) ?? drag.to.barberId;
    const raw = x.start + (e.clientY - drag.y0) / PX;
    const startM = Math.min(close - len, Math.max(open, snap(raw)));
    const to = { barberId, start: startM };
    setDrag({ ...drag, moved: true, to, ok: fits(x.id, to, len) });
  }
  function onUp(x: DayItem) {
    if (!drag || drag.id !== x.id) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    dragged.current = true;
    setTimeout(() => (dragged.current = false), 0);
    if (d.to.barberId === x.barberId && d.to.start === x.start) return;
    if (!d.ok) { setMsg({ ok: false, text: "Não cabe aí: o horário bate com outro atendimento ou está fora do expediente." }); return; }
    const who = allBarbers.find((b) => b.id === d.to.barberId)?.name ?? "";
    setMoves((m) => ({ ...m, [x.id]: d.to }));
    start(async () => {
      const r = await reschedule({ slug, id: x.id, day, minutes: d.to.start, barberId: d.to.barberId });
      if (r.ok) {
        setMsg({ ok: true, text: `${x.clientName} foi para ${toHHMM(d.to.start)}${d.to.barberId !== x.barberId ? ` com ${who}` : ""}.` });
        router.refresh();
      } else {
        setMoves((m) => { const n = { ...m }; delete n[x.id]; return n; });
        setMsg({ ok: false, text: errorText(r.error) });
      }
    });
  }

  // ---- espaço vazio: mostra "+ 14:30" e agenda com um clique ----
  function emptyMinute(e: React.MouseEvent<HTMLDivElement>, barberId: string) {
    if (e.target !== e.currentTarget || !canBook(barberId)) return null;
    const m = open + Math.floor((e.nativeEvent.offsetY / PX) / step) * step;
    return past(m) || m >= close ? null : m;
  }
  function clickColumn(e: React.MouseEvent<HTMLDivElement>, barberId: string) {
    const m = emptyMinute(e, barberId);
    if (m !== null) setNewAt({ day, barberId, minutes: m });
  }
  function hoverColumn(e: React.MouseEvent<HTMLDivElement>, barberId: string) {
    if (drag) return;
    const m = emptyMinute(e, barberId);
    setHover(m === null ? null : { barberId, start: m });
  }

  function fitHere(r: ReserveView) {
    const first = queue[0];
    if (!first) return;
    start(async () => {
      const res = await queueCall(slug, first.id, { barberId: r.barberId, minutes: r.start });
      setReserve(null);
      setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: errorText(res.error) });
      if (res.ok) router.refresh();
    });
  }

  const barberOf = (id: string) => allBarbers.find((b) => b.id === id);
  const openMin = close - open;
  const dragItem = drag?.moved ? shown.find((x) => x.id === drag.id) : undefined;

  return (
    <>
      {msg && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl ${msg.ok ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-red-600 text-white"}`}>
          <span aria-hidden>{msg.ok ? "✓" : "!"}</span>{msg.text}
        </div>
      )}
      <div ref={scroller} className="card relative max-h-[calc(100dvh-220px)] min-h-[420px] overflow-auto p-0 shadow-sm">
        <div className="relative flex" style={{ minWidth: 64 + barbers.length * 176 }}>
          {/* coluna das horas */}
          <div className="sticky left-0 z-30 w-16 shrink-0 border-r border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="sticky top-0 z-10 bg-white dark:bg-neutral-900" style={{ height: HEAD }} />
            {hours.map((h, i) => (
              <div key={h} className="relative pr-2 text-right text-[11px] font-medium tabular-nums text-neutral-400" style={{ height: 60 * PX }}>
                <span className={`relative ${i === 0 ? "top-1" : "-top-2"}`}>{toHHMM(h)}</span>
              </div>
            ))}
          </div>

          {barbers.map((b) => {
            const mine = shown.filter((x) => x.barberId === b.id && x.status !== "cancelled");
            const count = mine.filter((x) => x.status !== "no_show" && !x.masked).length;
            const used = mine.filter((x) => x.status !== "no_show").reduce((s, x) => s + (x.end - x.start), 0);
            const occ = Math.min(100, Math.round((used / openMin) * 100));
            const mineCol = canBook(b.id);
            const ghost = hover?.barberId === b.id && !drag ? hover : null;
            return (
              <div key={b.id} className="min-w-[176px] flex-1 border-l border-neutral-100 first:border-l-0 dark:border-neutral-800">
                <div className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-neutral-100 bg-white/95 px-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95" style={{ height: HEAD }}>
                  <BarberFace name={b.name} color={b.color} photo={b.photo} className="h-9 w-9 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-sm">{b.name}</b>
                      <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">{mineCol ? `${count} atend.` : "colega"}</span>
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800" title={`${occ}% do dia ocupado`}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${occ}%`, background: b.color }} />
                    </div>
                  </div>
                </div>
                <div ref={(el) => { if (el) cols.current.set(b.id, el); else cols.current.delete(b.id); }}
                  className={`agenda-col relative ${mineCol ? "cursor-pointer" : "agenda-col-off"}`}
                  style={{ height: H }}
                  onClick={(e) => clickColumn(e, b.id)} onMouseMove={(e) => hoverColumn(e, b.id)} onMouseLeave={() => setHover(null)}
                  title={mineCol ? undefined : "Agenda de um colega: só livre ou ocupado"}>
                  {day === today && nowMin !== null && nowMin > open && (
                    <div className="agenda-past pointer-events-none absolute inset-x-0 top-0" style={{ height: Math.min(H, (nowMin - open) * PX) }} />
                  )}
                  {ghost && (
                    <div className="pointer-events-none absolute inset-x-1.5 z-[1] flex items-start rounded-lg border border-dashed border-amber-500 bg-amber-50/80 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      style={{ top: (ghost.start - open) * PX + 1, height: Math.min(ghostLen, close - ghost.start) * PX - 3 }}>
                      + {toHHMM(ghost.start)}
                    </div>
                  )}
                  {reserves.filter((r) => r.barberId === b.id).map((r) => (
                    <button key={r.start} onClick={() => setReserve(r)}
                      className={`agenda-reserve absolute inset-x-1.5 z-[2] rounded-lg border border-dashed border-amber-400 px-2 py-1 text-left text-[11px] leading-tight text-amber-800 transition hover:border-amber-500 dark:text-amber-300 ${past(r.end) ? "opacity-40" : ""}`}
                      style={{ top: (r.start - open) * PX + 1, height: (r.end - r.start) * PX - 3 }}>
                      <b className="tabular-nums">{toHHMM(r.start)}</b> · livre p/ encaixe
                    </button>
                  ))}
                  {mine.map((x) => {
                    const h = (x.end - x.start) * PX - 3;
                    const top = (x.start - open) * PX + 1;
                    if (x.masked) return (
                      <div key={x.id} className="absolute inset-x-1.5 z-[3] overflow-hidden rounded-lg bg-neutral-200/80 px-2 py-1 text-[11px] leading-tight text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                        style={{ top, height: h }}>
                        <b className="tabular-nums">{toHHMM(x.start)}</b> · ocupado
                      </div>
                    );
                    const faded = x.status === "done" ? "opacity-55" : x.status === "no_show" ? "opacity-40" : "";
                    const moving = drag?.id === x.id && drag.moved;
                    const movable = mineCol && LIVE.has(x.status) && x.status !== "in_service";
                    const compact = h < 34;
                    return (
                      <button key={x.id}
                        onClick={() => { if (!dragged.current) setSelected(x); }}
                        onPointerDown={(e) => onDown(e, x)} onPointerMove={(e) => onMove(e, x)} onPointerUp={() => onUp(x)} onPointerCancel={() => setDrag(null)}
                        className={`agenda-appt group absolute inset-x-1.5 z-[3] overflow-hidden rounded-lg px-2 text-left leading-tight shadow-[0_1px_2px_rgba(0,0,0,.06)] transition hover:z-[4] hover:shadow-md ${compact ? "py-0.5" : "py-1.5"} ${faded} ${moving ? "opacity-30" : ""} ${x.status === "pending" ? "agenda-pending" : ""} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
                        style={{ top, height: h, "--c": b.color } as React.CSSProperties}
                        aria-label={`${toHHMM(x.start)} ${x.clientName}, ${x.serviceName}`}>
                        <span className="flex items-center justify-between gap-1">
                          <span className={`truncate text-[12px] font-semibold ${x.status === "no_show" ? "line-through" : ""}`}>
                            {compact && <span className="mr-1 font-medium tabular-nums opacity-70">{toHHMM(x.start)}</span>}{x.clientName}
                          </span>
                          <StatusDot status={x.status} />
                        </span>
                        {!compact && (
                          <span className="mt-0.5 block truncate text-[11px] opacity-70">
                            <span className="tabular-nums">{toHHMM(x.start)}–{toHHMM(x.end)}</span> · {x.serviceName}
                          </span>
                        )}
                        {h > 64 && (x.viaPlan || x.walkIn) && (
                          <span className="mt-1 flex gap-1">
                            {x.viaPlan && <span className="rounded-full bg-white/70 px-1.5 text-[10px] font-semibold text-amber-700 dark:bg-black/30 dark:text-amber-300">plano</span>}
                            {x.walkIn && <span className="rounded-full bg-white/70 px-1.5 text-[10px] font-semibold text-violet-700 dark:bg-black/30 dark:text-violet-300">encaixe</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {dragItem && drag && drag.to.barberId === b.id && (
                    <div className={`pointer-events-none absolute inset-x-1.5 z-[5] rounded-lg border-2 px-2 py-1 text-[11px] font-semibold shadow-lg ${drag.ok ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}
                      style={{ top: (drag.to.start - open) * PX + 1, height: (dragItem.end - dragItem.start) * PX - 3 }}>
                      {toHHMM(drag.to.start)} · {dragItem.clientName}
                      <span className="block font-normal opacity-80">{drag.ok ? "solte para remarcar" : "não cabe aqui"}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {nowMin !== null && nowMin >= open && nowMin <= close && (
            <div className="pointer-events-none absolute left-16 right-0 z-10" style={{ top: HEAD + (nowMin - open) * PX }}>
              <div className="h-0.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,.6)]" />
              <span className="absolute -left-[52px] -top-2.5 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">{toHHMM(nowMin)}</span>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>Clique num espaço vazio para agendar</span>
        <span className="hidden sm:inline">Arraste um horário para remarcar</span>
        <span className="flex items-center gap-1"><StatusDot status="in_service" /> na cadeira</span>
        <span className="flex items-center gap-1"><StatusDot status="pending" /> sem resposta</span>
        <span className="flex items-center gap-1"><StatusDot status="done" /> concluído</span>
        <span className="flex items-center gap-1"><StatusDot status="no_show" /> faltou</span>
        {barbers.some((b) => !canBook(b.id)) && <span>Colunas cinza são de colegas (sem nomes dos clientes)</span>}
      </p>

      {pending && <span className="sr-only">Salvando…</span>}
      {newAt && <NewAppt slug={slug} today={today} barbers={bookable} services={services} preset={newAt} onClose={() => setNewAt(null)} />}
      {selected && <ApptSheet slug={slug} today={today} day={day} item={selected} barbers={bookable} onClose={() => setSelected(null)} />}
      {reserve && (
        <Sheet title={`Encaixe ${toHHMM(reserve.start)}–${toHHMM(reserve.end)}`} onClose={() => setReserve(null)}>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Horário guardado com <b>{barberOf(reserve.barberId)?.name}</b> para quem chega sem marcar. O app do cliente não oferece esse horário.
          </p>
          <div className="mt-4 grid gap-2">
            {day === today && queue[0] && (
              <button className="btn" disabled={pending} onClick={() => fitHere(reserve)}>Encaixar {queue[0].name} (1º da fila) aqui</button>
            )}
            {canBook(reserve.barberId) && <button className="chip" onClick={() => { setNewAt({ day, barberId: reserve.barberId, minutes: reserve.start }); setReserve(null); }}>Agendar outra pessoa aqui</button>}
          </div>
        </Sheet>
      )}
    </>
  );
}

export function StatusDot({ status }: { status: DayItem["status"] }) {
  if (status === "in_service") return (
    <span className="relative flex size-2.5 shrink-0" aria-label="na cadeira">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-sky-500" />
    </span>
  );
  if (status === "done") return <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[8px] font-bold text-white" aria-label="concluído">✓</span>;
  if (status === "no_show") return <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-red-500 text-[8px] font-bold text-white" aria-label="faltou">✕</span>;
  if (status === "pending") return <span className="size-2.5 shrink-0 rounded-full border-2 border-amber-500" aria-label="sem resposta" />;
  return null;
}
