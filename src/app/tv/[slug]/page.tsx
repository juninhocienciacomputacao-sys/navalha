import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { repo } from "@/data";
import { currentUser } from "@/lib/supabase";
import { requireStaff } from "@/lib/staff";
import { dayInZone, minutesInZone } from "@/core/time";
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
  const hours = dayHours(b, today);
  const [appts, queue] = await Promise.all([listAppointments(b, ...dayRange(b, today)), listQueue(b)]);
  const forecast = queueForecast(b, today, appts, queue, now);
  const busy = busyByBarber(b, appts);
  const reserves = reservesFor(b, today);
  const openRes = openReserveBlocks(b, today, appts).filter((r) => r.end > nowMin);
  const minLen = Math.min(...b.services.map((s) => s.durationMin), 30);

  const url = await bookingUrl(slug);
  const shortUrl = url.replace(/^https?:\/\//, "");
  let qr: ReturnType<typeof qrSvgPath> | null = null;
  try { qr = qrSvgPath(qrEncode(url)); } catch { qr = null; }

  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(now);
  const svc = (id: string | null) => b.services.find((s) => s.id === id)?.name.pt ?? "Atendimento";

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-950 p-8 text-white">
      <AutoRefresh seconds={30} />
      <header className="mb-6 flex items-center gap-8">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-5xl font-black uppercase tracking-tight">{shop.name}</h1>
          <p className="mt-1 text-2xl capitalize text-neutral-400">{hours ? `Agenda de ${dateLabel}` : `${dateLabel} · fechado hoje`}</p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-amber-500 px-5 py-3 text-neutral-950">
          {qr && (
            <svg viewBox={qr.viewBox} className="h-28 w-28 shrink-0 rounded-lg bg-white" shapeRendering="crispEdges" role="img" aria-label="QR code para agendar">
              <path d={qr.d} fill="#000" />
            </svg>
          )}
          <div>
            <p className="text-lg font-semibold">Agende pelo celular</p>
            <p className="text-3xl font-black">{shortUrl}</p>
            {qr && <p className="text-base font-medium">Aponte a câmera para o código</p>}
          </div>
        </div>
        <Clock tz={tz} initial={toHHMM(nowMin)} />
      </header>

      <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: `repeat(${b.barbers.length}, minmax(0, 1fr)) minmax(0, 1.1fr)` }}>
        {b.barbers.map((br) => {
          const mine = appts.filter((a) => a.barberId === br.id && isLive(a.status));
          const m = (d: Date) => minutesInZone(d, tz);
          const chair = mine.find((a) => a.status === "in_service")
            ?? mine.find((a) => a.status !== "done" && m(a.startsAt) <= nowMin && m(a.endsAt) > nowMin);
          const next = mine.filter((a) => a.id !== chair?.id && a.status !== "done" && a.status !== "in_service" && m(a.startsAt) > nowMin).slice(0, 4);
          const gaps = hours && nowMin < hours.close
            ? freeGaps(hours, [...(busy.get(br.id) ?? []), ...(reserves.get(br.id) ?? [])], nowMin, minLen).slice(0, 3) : [];
          const walk = openRes.filter((r) => r.barberId === br.id).slice(0, 2);
          return (
            <section key={br.id} className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-neutral-900 p-5">
              <h2 className="mb-4 flex items-center gap-3 text-4xl font-black">
                <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: br.color ?? "#777" }} />
                <span className="truncate">{br.name}</span>
              </h2>
              <div className="rounded-2xl p-4" style={{ background: chair ? (br.color ?? "#444") : "#262626" }}>
                <p className="text-lg font-semibold uppercase tracking-wide opacity-80">Na cadeira agora</p>
                <p className="truncate text-4xl font-black">{chair ? shortName(chair.clientName) : "Livre"}</p>
                {chair && <p className="truncate text-xl opacity-90">{chair.serviceName} · até {toHHMM(m(chair.endsAt))}</p>}
              </div>
              <p className="mb-2 mt-5 text-lg font-semibold uppercase tracking-wide text-neutral-400">Próximos</p>
              <ul className="space-y-2">
                {next.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-3 text-3xl">
                    <span className="w-24 shrink-0 font-bold tabular-nums text-neutral-400">{toHHMM(m(a.startsAt))}</span>
                    <span className="truncate font-semibold">{shortName(a.clientName)}</span>
                  </li>
                ))}
                {next.length === 0 && <li className="text-2xl text-neutral-500">Ninguém marcado</li>}
              </ul>
              <p className="mb-2 mt-5 text-lg font-semibold uppercase tracking-wide text-emerald-400">Horários livres</p>
              <ul className="space-y-2">
                {gaps.map((g) => (
                  <li key={g.start} className="flex items-baseline gap-3 text-3xl text-emerald-300">
                    <span className="w-24 shrink-0 font-bold tabular-nums">{toHHMM(g.start)}</span>
                    <span className="truncate text-2xl">{g.end - g.start >= 120 ? "livre" : `${g.end - g.start} min`}</span>
                  </li>
                ))}
                {walk.map((r) => (
                  <li key={`w${r.start}`} className="flex items-baseline gap-3 text-3xl text-amber-300">
                    <span className="w-24 shrink-0 font-bold tabular-nums">{toHHMM(r.start)}</span>
                    <span className="truncate text-2xl">encaixe</span>
                  </li>
                ))}
                {gaps.length === 0 && walk.length === 0 && <li className="text-2xl text-neutral-500">{!hours || nowMin >= hours.close ? "Encerrado por hoje" : "Lotado hoje"}</li>}
              </ul>
            </section>
          );
        })}

        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-amber-950/60 p-5 ring-1 ring-amber-700/50">
          <h2 className="text-4xl font-black text-amber-400">Sem horário</h2>
          <p className="mb-4 text-xl text-amber-200/70">Fila de chegada</p>
          <ol className="space-y-3">
            {queue.slice(0, 7).map((q, i) => {
              const f = forecast[i];
              const wait = f ? Math.max(0, f.time - nowMin) : null;
              return (
                <li key={q.id} className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-amber-500 text-2xl font-black text-neutral-950">{i + 1}º</span>
                  <span className="min-w-0">
                    <span className="block truncate text-3xl font-bold">{shortName(q.name)}</span>
                    <span className="block truncate text-xl text-amber-200/80">
                      {svc(q.serviceId)} · {f ? (wait! <= 5 ? "já já" : `espera ~${wait} min`) : "sem vaga hoje"}
                    </span>
                  </span>
                </li>
              );
            })}
            {queue.length === 0 && <li className="text-2xl text-amber-200/70">Ninguém na fila</li>}
            {queue.length > 7 && <li className="text-xl text-amber-200/70">+ {queue.length - 7} esperando</li>}
          </ol>
          {openRes.length > 0 && (
            <>
              <p className="mb-2 mt-6 text-lg font-semibold uppercase tracking-wide text-amber-400">Próximos encaixes</p>
              <ul className="space-y-1">
                {openRes.slice(0, 4).map((r) => (
                  <li key={r.barberId + r.start} className="text-2xl text-amber-100">
                    <b className="tabular-nums">{toHHMM(r.start)}</b> · {b.barbers.find((x) => x.id === r.barberId)?.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-auto pt-4 text-lg text-amber-200/70">Chegou sem horário? Fale com a recepção.</p>
        </section>
      </div>
    </main>
  );
}
