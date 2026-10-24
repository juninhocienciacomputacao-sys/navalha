import Link from "next/link";
import { requireStaff, type Staff } from "@/lib/staff";
import { addDays, dayInZone, minutesInZone, weekday } from "@/core/time";
import { toHHMM } from "@/core/types";
import { listAppointments, listQueue } from "@/modules/agenda/data";
import {
  dayHours, dayRange, openReserveBlocks, queueForecast, toBarberViews, toDayItems, toQueueViews, toServiceViews,
} from "@/modules/agenda/plan";
import AutoRefresh from "@/modules/agenda/AutoRefresh";
import type { DayItem } from "@/modules/agenda/view";
import DayBoard from "./DayBoard";
import QueuePanel from "./QueuePanel";
import { NewApptButton } from "./NewAppt";

export const dynamic = "force-dynamic";

type Search = { dia?: string; ver?: string; barbeiro?: string };

const label = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(day + "T12:00:00Z").toLocaleDateString("pt-BR", { ...opts, timeZone: "UTC" });

export default async function AgendaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const staff = await requireStaff(slug);
  const { bundle: b, access, workable } = staff;
  const { shop } = b;
  const scope = access.agenda;
  const tz = shop.timezone;
  const today = dayInZone(new Date(), tz);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia! : today;
  const week = sp.ver === "semana";
  // "só a sua": os colegas nem aparecem; "só a sua + livres": aparecem só com livre e ocupado
  const visible = scope === "own" ? b.barbers.filter((x) => workable.includes(x.id)) : b.barbers;
  const barberFilter = visible.some((x) => x.id === sp.barbeiro) ? sp.barbeiro : undefined;

  const allBarbers = toBarberViews(b).filter((x) => visible.some((v) => v.id === x.id));
  const bookable = allBarbers.filter((x) => workable.includes(x.id));
  const barbers = barberFilter ? allBarbers.filter((x) => x.id === barberFilter) : allBarbers;
  const services = toServiceViews(b);

  const href = (p: Partial<{ dia: string; ver: string; barbeiro: string | null }>) => {
    const q = new URLSearchParams();
    const d = p.dia ?? day;
    if (d !== today) q.set("dia", d);
    if ((p.ver ?? (week ? "semana" : "dia")) === "semana") q.set("ver", "semana");
    const br = p.barbeiro === null ? undefined : p.barbeiro ?? barberFilter;
    if (br) q.set("barbeiro", br);
    const s = q.toString();
    return `/painel/${slug}/agenda${s ? `?${s}` : ""}`;
  };

  // fila e previsões sempre de hoje
  const [todayAppts, queue] = await Promise.all([listMine(staff, ...dayRange(b, today)), scope === "all" ? listQueue(b) : []]);
  const queueViews = toQueueViews(b, queue, queueForecast(b, today, todayAppts, queue));
  const todayHours = dayHours(b, today);
  const freeReservesToday = openReserveBlocks(b, today, todayAppts).length;
  const todayClients = [...new Map(todayAppts.filter((a) => a.clientId && a.status !== "cancelled")
    .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime())
    .map((a) => [a.clientId!, { id: a.clientId!, name: a.clientName, phone: a.phone }])).values()];

  const weekStart = addDays(day, -((weekday(day) + 6) % 7));
  const step = week ? 7 : 1;
  const title = week
    ? `${label(weekStart, { day: "numeric", month: "short" })} a ${label(addDays(weekStart, 6), { day: "numeric", month: "short" })}`
    : `${day === today ? "Hoje, " : day === addDays(today, 1) ? "Amanhã, " : ""}${label(day, { weekday: "short", day: "numeric", month: "short" })}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <AutoRefresh seconds={60} />
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Agenda</p>
          <h1 className="text-2xl font-bold">{shop.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/tv/${slug}`} target="_blank" className="chip">📺 Abrir TV da recepção</a>
          {bookable.length > 0 && <NewApptButton slug={slug} today={today} day={week ? today : day} barbers={bookable} services={services}
            barberId={barberFilter && bookable.some((x) => x.id === barberFilter) ? barberFilter : undefined} />}
        </div>
      </header>

      {scope !== "all" && bookable.length === 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Seu acesso ainda não está ligado a um barbeiro, então não há agenda própria para mostrar. Peça ao dono para escolher qual barbeiro você é em Acessos.
        </p>
      )}

      {scope === "all" && <QueuePanel slug={slug} queue={queueViews} barbers={allBarbers} services={services} freeReserves={freeReservesToday} open={Boolean(todayHours)} todayClients={todayClients} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-xl border border-neutral-200 bg-white text-sm dark:border-neutral-700 dark:bg-neutral-900">
          <Link href={href({ dia: addDays(day, -step) })} className="px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Anterior">‹</Link>
          <span className="border-x border-neutral-200 px-3 py-2 font-medium capitalize dark:border-neutral-700">{title}</span>
          <Link href={href({ dia: addDays(day, step) })} className="px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Próximo">›</Link>
        </div>
        {day !== today && <Link href={href({ dia: today })} className="chip py-1.5">Hoje</Link>}
        <div className="flex gap-1">
          <Link href={href({ ver: "dia" })} className={`chip py-1.5 ${!week ? "chip-on" : ""}`}>Dia</Link>
          <Link href={href({ ver: "semana" })} className={`chip py-1.5 ${week ? "chip-on" : ""}`}>Semana</Link>
        </div>
        {allBarbers.length > 1 && <div className="flex flex-wrap gap-1">
          <Link href={href({ barbeiro: null })} className={`chip py-1.5 ${!barberFilter ? "chip-on" : ""}`}>Todos</Link>
          {allBarbers.map((x) => (
            <Link key={x.id} href={href({ barbeiro: x.id })} className={`chip flex items-center gap-1.5 py-1.5 ${barberFilter === x.id ? "chip-on" : ""}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{x.name}
            </Link>
          ))}
        </div>}
      </div>

      {week
        ? <WeekView staff={staff} weekStart={weekStart} today={today} barberIds={barbers.map((x) => x.id).filter((id) => workable.includes(id))} colors={allBarbers} href={href} />
        : <DayView staff={staff} day={day} today={today} slug={slug} barbers={barbers} allBarbers={allBarbers} bookable={bookable} services={services}
            todayAppts={todayAppts} queue={queueViews} barberFilter={barberFilter} />}
    </main>
  );
}

/** Atendimentos que a pessoa pode ver (o banco já filtra; aqui vale também para o "ver como" e a demonstração). */
async function listMine(staff: Staff, from: Date, to: Date) {
  const appts = await listAppointments(staff.bundle, from, to);
  return staff.access.agenda === "all" ? appts : appts.filter((a) => staff.workable.includes(a.barberId));
}

/** Horários ocupados dos colegas, sem nomes, para quem vê "só a sua + horários livres". */
async function colleaguesBusy(staff: Staff, from: Date, to: Date): Promise<DayItem[]> {
  if (staff.access.agenda !== "own_free") return [];
  const tz = staff.bundle.shop.timezone;
  const busy = await staff.r.busy(staff.bundle.shop.id, from, to);
  return busy.filter((x) => !staff.workable.includes(x.barberId)).map((x, i) => ({
    id: `ocupado-${i}`, barberId: x.barberId, clientName: "Ocupado", phone: "", serviceId: "", serviceName: "",
    start: minutesInZone(x.startsAt, tz), end: minutesInZone(x.endsAt, tz), status: "confirmed", viaPlan: false, walkIn: false, masked: true,
  }));
}

async function DayView({ staff, day, today, slug, barbers, allBarbers, bookable, services, todayAppts, queue, barberFilter }: {
  staff: Staff; day: string; today: string; slug: string;
  barbers: ReturnType<typeof toBarberViews>; allBarbers: ReturnType<typeof toBarberViews>; bookable: ReturnType<typeof toBarberViews>;
  services: ReturnType<typeof toServiceViews>;
  todayAppts: Awaited<ReturnType<typeof listAppointments>>; queue: ReturnType<typeof toQueueViews>; barberFilter?: string;
}) {
  const b = staff.bundle;
  const hours = dayHours(b, day);
  if (!hours) return <div className="card text-sm text-neutral-500">Fechado neste dia.</div>;
  const [appts, others] = await Promise.all([
    day === today ? todayAppts : listMine(staff, ...dayRange(b, day)),
    colleaguesBusy(staff, ...dayRange(b, day)),
  ]);
  const items = [...toDayItems(b, appts), ...others].filter((x) => !barberFilter || x.barberId === barberFilter);
  const reserves = openReserveBlocks(b, day, appts)
    .filter((r) => staff.workable.includes(r.barberId) && (!barberFilter || r.barberId === barberFilter));
  const live = items.filter((x) => x.status !== "cancelled" && !x.masked);
  const count = (s: string) => live.filter((x) => x.status === s).length;
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2 text-xs font-medium">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{count("confirmed")} confirmados</span>
        <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{count("pending")} sem resposta</span>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800 dark:bg-sky-950 dark:text-sky-300">{count("in_service")} na cadeira</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{count("done")} concluídos</span>
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700 dark:bg-red-950 dark:text-red-300">{count("no_show")} faltas</span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{reserves.length} livres p/ encaixe</span>
      </div>
      <DayBoard slug={slug} tz={b.shop.timezone} today={today} day={day} open={hours.open} close={hours.close} step={hours.step}
        barbers={barbers} allBarbers={allBarbers} bookable={bookable} services={services} items={items} reserves={reserves} queue={queue} />
    </>
  );
}

async function WeekView({ staff, weekStart, today, barberIds, colors, href }: {
  staff: Staff; weekStart: string; today: string; barberIds: string[];
  colors: ReturnType<typeof toBarberViews>; href: (p: { dia?: string; ver?: string }) => string;
}) {
  const b = staff.bundle;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const appts = await listMine(staff, dayRange(b, days[0])[0], dayRange(b, days[6])[1]);
  const items = toDayItems(b, appts);
  const tz = b.shop.timezone;
  const color = (id: string) => colors.find((c) => c.id === id)?.color;
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const open = dayHours(b, d);
        const mine = items.filter((x, i) => dayInZone(appts[i].startsAt, tz) === d && barberIds.includes(x.barberId) && x.status !== "cancelled")
          .sort((x, y) => x.start - y.start);
        return (
          <section key={d} className={`card min-w-0 p-3 ${d === today ? "ring-2 ring-amber-500" : ""}`}>
            <Link href={href({ dia: d, ver: "dia" })} className="mb-2 flex items-baseline justify-between gap-2 hover:underline">
              <b className="text-sm capitalize">{label(d, { weekday: "short", day: "numeric" })}</b>
              <span className="text-xs text-neutral-500">{open ? `${mine.filter((x) => x.status !== "no_show").length} atend.` : "fechado"}</span>
            </Link>
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto text-xs md:max-h-[520px]">
              {mine.map((x) => (
                <li key={x.id} className={`flex items-center gap-1.5 ${x.status === "no_show" ? "line-through opacity-50" : x.status === "done" ? "opacity-60" : ""}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(x.barberId) }} />
                  <span className="tabular-nums text-neutral-500">{toHHMM(x.start)}</span>
                  <span className="truncate">{x.clientName}</span>
                </li>
              ))}
              {open && mine.length === 0 && <li className="text-neutral-500">Livre o dia todo</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
