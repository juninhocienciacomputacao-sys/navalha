import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { repo } from "@/data";
import { currentUser } from "@/lib/supabase";
import { requireStaff } from "@/lib/staff";
import { addDays, atMinutes, dayInZone, minutesInZone } from "@/core/time";
import { qrEncode, qrSvgPath } from "@/core/qr";
import { toHHMM } from "@/core/types";
import { freeGaps } from "@/core/walkin";
import { isLive, listAppointments, listQueue } from "@/modules/agenda/data";
import { busyByBarber, dayHours, dayRange, openReserveBlocks, queueForecast, reservesFor, shortName } from "@/modules/agenda/plan";
import AutoRefresh from "@/modules/agenda/AutoRefresh";
import Clock from "./Clock";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TV da recepção · Navalha" };

async function bookingUrl(slug: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (base) return `${base}/b/${slug}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/b/${slug}`;
}

export default async function Tv({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // TV fica logada com a conta da recepção; sem login, volta para cá depois de entrar
  if (repo().mode === "supabase" && !(await currentUser())) redirect(`/entrar?next=/tv/${slug}`);
  const { bundle: b, allowed } = await requireStaff(slug);
  if (!allowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-950 p-10 text-center text-white">
        <div>
          <h1 className="text-4xl font-bold">Sem acesso</h1>
          <p className="mt-4 text-xl text-neutral-400">Esta conta não faz parte da equipe de {b.shop.name}. Entre com a conta da recepção.</p>
        </div>
      </main>
    );
  }

  const { shop } = b;
  const tz = shop.timezone;
  const now = new Date();
  const today = dayInZone(now, tz);
  const nowMin = minutesInZone(now, tz);

  // Depois do expediente (ou em dia fechado) a TV já mostra a próxima agenda.
  let day = today;
  let ref = nowMin;
  const todayHours = dayHours(b, today);
  if (!todayHours || nowMin >= todayHours.close) {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, i);
      if (dayHours(b, d)) { day = d; ref = -1; break; }
    }
  }
  const isToday = day === today;
  const hours = dayHours(b, day);
  const [appts, queue] = await Promise.all([listAppointments(b, ...dayRange(b, day)), listQueue(b)]);
  const todayAppts = isToday ? appts : await listAppointments(b, ...dayRange(b, today));
  const forecast = queueForecast(b, today, todayAppts, queue, now);
  const busy = busyByBarber(b, appts);
  const reserves = reservesFor(b, day);
  const openRes = openReserveBlocks(b, day, appts).filter((r) => r.end > ref);

  const url = await bookingUrl(slug);
  const shortUrl = url.replace(/^https?:\/\//, "");
  let qr: ReturnType<typeof qrSvgPath> | null = null;
  try { qr = qrSvgPath(qrEncode(url)); } catch { qr = null; }

  const noon = atMinutes(day, 12 * 60, tz);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })
    .format(noon).replace(/\./g, "").toLowerCase();
  const title = isToday ? "Agenda de hoje" : day === addDays(today, 1) ? "Agenda de amanhã" : "Próxima agenda";
  const svc = (id: string | null) => b.services.find((s) => s.id === id)?.name.pt ?? "Atendimento";
  const m = (d: Date) => minutesInZone(d, tz);

  type Row = { key: string; start: number; kind: "now" | "appt" | "free" | "walk"; name: string; sub: string };
  const timeline = (barberId: string): Row[] => {
    if (!hours) return [];
    const rows: Row[] = [];
    for (const a of appts) {
      if (a.barberId !== barberId || !isLive(a.status) || a.status === "done" || m(a.endsAt) <= ref) continue;
      const isNow = isToday && (a.status === "in_service" || m(a.startsAt) <= ref);
      rows.push({ key: a.id, start: m(a.startsAt), kind: isNow ? "now" : "appt", name: shortName(a.clientName),
        sub: `${a.serviceName}${a.source === "walk_in" ? " · encaixe" : ""}` });
    }
    for (const r of openRes) if (r.barberId === barberId) rows.push({ key: `w${r.start}`, start: r.start, kind: "walk", name: "ENCAIXE", sub: "sem horário marcado" });
    const from = ref < 0 ? hours.open : ref;
    for (const g of freeGaps(hours, [...(busy.get(barberId) ?? []), ...(reserves.get(barberId) ?? [])], from, 25)) {
      rows.push({ key: `f${g.start}`, start: g.start, kind: "free", name: "LIVRE", sub: `${g.end - g.start} min disponíveis` });
    }
    return rows.sort((x, y) => x.start - y.start).slice(0, 9);
  };
  const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

  const rowCls = {
    now: "bg-[#dcaa52] text-[#1a1206]",
    appt: "bg-[#18252e]",
    free: "border-2 border-dashed border-[#2f7a57]",
    walk: "border-2 border-dashed border-[#dcaa52]",
  };
  const nameCls = { now: "text-[#1a1206]", appt: "text-white", free: "text-[#4cc08a]", walk: "text-[#dcaa52]" };
  const subCls = { now: "text-[#1a1206]/80", appt: "text-[#9fb0ba]", free: "text-[#9fb0ba]", walk: "text-[#9fb0ba]" };

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#0b1217] p-[1.4vw] text-[#e8eef1] [font-size:clamp(13px,1.05vw,26px)]">
      <AutoRefresh seconds={30} />
      <header className="mb-[1.2vw] flex items-center gap-[1.4vw]">
        <div className="h-[3.2vw] w-[0.9vw] shrink-0 rounded-full bg-[repeating-linear-gradient(135deg,#c0392b_0_6px,#fff_6px_12px,#1f5fa8_12px_18px,#fff_18px_24px)]" aria-hidden />
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[1.9em] font-black uppercase leading-none tracking-tight text-white">{shop.name}</p>
          <p className="mt-[0.3em] whitespace-nowrap text-[#9fb0ba]">{title} · {dateLabel}</p>
        </div>
        <div className="ml-auto flex items-center gap-[0.8vw]">
          {qr && (
            <svg viewBox={qr.viewBox} className="h-[5.2vw] w-[5.2vw] shrink-0 rounded-md bg-white p-[3px]" shapeRendering="crispEdges" role="img" aria-label="QR code para agendar">
              <path d={qr.d} fill="#000" />
            </svg>
          )}
          <div className="max-w-[22vw]">
            <p className="text-[0.85em] text-[#9fb0ba]">Aponte a câmera para agendar ou entrar na fila</p>
            <p className="truncate font-bold text-[#dcaa52]">{shortUrl}</p>
          </div>
        </div>
        <Clock tz={tz} initial={toHHMM(nowMin)} />
      </header>

      <div className="grid min-h-0 flex-1 gap-[0.7vw]" style={{ gridTemplateColumns: `repeat(${b.barbers.length + 1}, minmax(0, 1fr))` }}>
        {b.barbers.map((br) => {
          const rows = timeline(br.id);
          return (
            <section key={br.id} className="flex min-h-0 flex-col gap-[0.45vw] overflow-hidden rounded-[0.9vw] bg-[#131e26] p-[0.8vw]">
              <h2 className="mb-[0.2vw] flex items-center gap-[0.55vw] text-[1.45em] font-bold text-white">
                {br.photo
                  // eslint-disable-next-line @next/next/no-img-element -- foto pequena guardada no banco (data URL)
                  ? <img src={br.photo} alt="" className="h-[2.6vw] w-[2.6vw] shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${br.color ?? "#9fb0ba"}` }} />
                  : <span className="grid h-[2.1vw] w-[2.1vw] shrink-0 place-items-center rounded-full text-[0.6em] font-black text-[#0b1217]" style={{ background: br.color ?? "#9fb0ba" }}>{initials(br.name)}</span>}
                <span className="truncate">{br.name}</span>
              </h2>
              {rows.map((x) => (
                <div key={x.key} className={`grid grid-cols-[3.6em_minmax(0,1fr)] gap-x-[0.5vw] rounded-[0.55vw] px-[0.6vw] py-[0.45vw] ${rowCls[x.kind]}`}>
                  <span className={`row-span-2 self-center font-mono text-[0.92em] ${x.kind === "now" ? "font-bold text-[#1a1206]" : "text-[#9fb0ba]"}`}>{x.kind === "now" ? "AGORA" : toHHMM(x.start)}</span>
                  <span className={`truncate font-bold ${nameCls[x.kind]}`}>{x.name}</span>
                  <span className={`truncate text-[0.8em] ${subCls[x.kind]}`}>{x.sub}</span>
                </div>
              ))}
              {rows.length === 0 && <p className="text-[#9fb0ba]">{hours ? "Agenda cheia" : "Fechado"}</p>}
            </section>
          );
        })}

        <section className="flex min-h-0 flex-col gap-[0.45vw] overflow-hidden rounded-[0.9vw] bg-[#1d1a12] p-[0.8vw]">
          <h2 className="text-[1.45em] font-bold text-[#dcaa52]">Sem horário</h2>
          <p className="text-[0.9em] text-[#9fb0ba]">Fila de chegada</p>
          {queue.slice(0, 6).map((q, i) => {
            const f = forecast[i];
            const wait = f ? Math.max(0, f.time - nowMin) : null;
            return (
              <div key={q.id} className="grid grid-cols-[3.6em_minmax(0,1fr)] gap-x-[0.5vw] rounded-[0.55vw] bg-[#18252e] px-[0.6vw] py-[0.45vw]">
                <span className="row-span-2 self-center font-mono text-[0.92em] text-[#9fb0ba]">{i + 1}º</span>
                <span className="truncate font-bold text-white">{shortName(q.name)}</span>
                <span className="truncate text-[0.8em] text-[#9fb0ba]">
                  {svc(q.serviceId)} · {f ? (wait! <= 5 ? "já já" : `espera ~${wait} min`) : "aguardando vaga"}
                </span>
              </div>
            );
          })}
          {queue.length === 0 && <p className="text-[#9fb0ba]">Ninguém na fila</p>}
          {queue.length > 6 && <p className="text-[0.9em] text-[#9fb0ba]">+ {queue.length - 6} esperando</p>}
          {openRes.length > 0 && (
            <>
              <p className="mt-[0.5vw] text-[0.9em] text-[#9fb0ba]">Próximos encaixes</p>
              {openRes.slice(0, 4).map((r) => (
                <div key={r.barberId + r.start} className="grid grid-cols-[3.6em_minmax(0,1fr)] gap-x-[0.5vw] rounded-[0.55vw] border-2 border-dashed border-[#dcaa52] px-[0.6vw] py-[0.45vw]">
                  <span className="row-span-2 self-center font-mono text-[0.92em] text-[#9fb0ba]">{toHHMM(r.start)}</span>
                  <span className="truncate font-bold text-[#dcaa52]">{b.barbers.find((x) => x.id === r.barberId)?.name}</span>
                  <span className="truncate text-[0.8em] text-[#9fb0ba]">reservado</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
