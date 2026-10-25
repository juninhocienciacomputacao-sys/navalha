import Link from "next/link";
import { requireStaff, type Staff } from "@/lib/staff";
import { addDays, dayInZone, minutesInZone, weekday } from "@/core/time";
import { toHHMM } from "@/core/types";
import { formatMoney } from "@/core/money";
import { canSee } from "@/core/access";
import { BarberFace } from "@/components/BarberFace";
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

  // faixa da semana: quantos atendimentos em cada dia
  const stripDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekAppts = await listMine(staff, dayRange(b, stripDays[0])[0], dayRange(b, stripDays[6])[1]);
  const perDay = new Map<string, number>();
  for (const a of weekAppts) {
    if (a.status === "cancelled" || (barberFilter && a.barberId !== barberFilter)) continue;
    const d = dayInZone(a.startsAt, tz);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const showMoney = canSee(access, "financeiro") && shop.modules.financeiro !== false;
  const longDay = label(day, { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6">
      <AutoRefresh seconds={60} />
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Agenda · {shop.name}</p>
          <h1 className="text-2xl font-bold tracking-tight first-letter:uppercase md:text-[28px]">
            {week ? title : <>{day === today ? "Hoje" : day === addDays(today, 1) ? "Amanhã" : day === addDays(today, -1) ? "Ontem" : longDay.split(",")[0]}<span className="font-normal text-neutral-400">, {day === today || day === addDays(today, 1) || day === addDays(today, -1) ? longDay : longDay.split(", ").slice(1).join(", ")}</span></>}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/tv/${slug}`} target="_blank" className="chip hidden sm:inline-flex">📺 TV da recepção</a>
          {bookable.length > 0 && <NewApptButton slug={slug} today={today} day={week ? today : day} barbers={bookable} services={services}
            barberId={barberFilter && bookable.some((x) => x.id === barberFilter) ? barberFilter : undefined} />}
        </div>
      </header>

      {scope !== "all" && bookable.length === 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Seu acesso ainda não está ligado a um barbeiro, então não há agenda própria para mostrar. Peça ao dono para escolher qual barbeiro você é em Acessos.
        </p>
      )}

      {/* barra de controle: dia/semana, navegação, faixa da semana, barbeiros */}
      <div className="card mb-4 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-neutral-100 p-1 text-sm font-medium dark:bg-neutral-800">
            <Link href={href({ ver: "dia" })} className={`rounded-lg px-3 py-1.5 transition ${!week ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"}`}>Dia</Link>
            <Link href={href({ ver: "semana" })} className={`rounded-lg px-3 py-1.5 transition ${week ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"}`}>Semana</Link>
          </div>
          <div className="flex items-center gap-1">
            <Link href={href({ dia: addDays(day, -step) })} className="grid size-9 place-items-center rounded-xl border border-neutral-200 text-lg hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" aria-label="Anterior">‹</Link>
            <Link href={href({ dia: today })} className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${day === today ? "border-neutral-200 text-neutral-400 dark:border-neutral-700" : "border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"}`}>Hoje</Link>
            <Link href={href({ dia: addDays(day, step) })} className="grid size-9 place-items-center rounded-xl border border-neutral-200 text-lg hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800" aria-label="Próximo">›</Link>
          </div>
          <nav aria-label="Dias da semana" className="flex w-full gap-1 overflow-x-auto md:w-auto md:flex-1">
            {stripDays.map((d) => {
              const on = !week && d === day;
              const closedDay = !dayHours(b, d);
              const n = perDay.get(d) ?? 0;
              return (
                <Link key={d} href={href({ dia: d, ver: "dia" })}
                  className={`flex min-w-[52px] flex-1 flex-col items-center rounded-xl px-2 py-1.5 text-center transition ${on ? "bg-neutral-900 text-white dark:bg-amber-500 dark:text-neutral-950" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"} ${closedDay && !on ? "opacity-40" : ""}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${on ? "opacity-80" : d === today ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>{label(d, { weekday: "short" }).replace(".", "")}</span>
                  <span className="text-base font-bold leading-tight tabular-nums">{Number(d.slice(8))}</span>
                  <span className={`text-[10px] tabular-nums ${on ? "opacity-80" : "text-neutral-500"}`}>{closedDay ? "fechado" : n ? `${n} atend.` : "livre"}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {allBarbers.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <span className="mr-1 text-xs font-medium text-neutral-500">Barbeiros</span>
            <Link href={href({ barbeiro: null })} className={`rounded-full border px-3 py-1 text-sm transition ${!barberFilter ? "border-neutral-900 bg-neutral-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-neutral-950" : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700"}`}>Todos</Link>
            {allBarbers.map((x) => (
              <Link key={x.id} href={href({ barbeiro: x.id })}
                className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-sm transition ${barberFilter === x.id ? "border-neutral-900 bg-neutral-900 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-neutral-950" : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700"}`}>
                <BarberFace name={x.name} color={x.color} photo={x.photo} className="h-6 w-6 text-[9px]" />{x.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {scope === "all" && <QueuePanel slug={slug} queue={queueViews} barbers={allBarbers} services={services} freeReserves={freeReservesToday} open={Boolean(todayHours)} todayClients={todayClients} />}

      {week
        ? <WeekView staff={staff} weekStart={weekStart} today={today} barberIds={barbers.map((x) => x.id).filter((id) => workable.includes(id))} colors={allBarbers} href={href} />
        : <DayView staff={staff} day={day} today={today} slug={slug} barbers={barbers} allBarbers={allBarbers} bookable={bookable} services={services}
            todayAppts={todayAppts} queue={queueViews} barberFilter={barberFilter} money={showMoney ? (n: number) => formatMoney(n, shop.currency, "pt") : null} />}
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

async function DayView({ staff, day, today, slug, barbers, allBarbers, bookable, services, todayAppts, queue, barberFilter, money }: {
  staff: Staff; day: string; today: string; slug: string;
  barbers: ReturnType<typeof toBarberViews>; allBarbers: ReturnType<typeof toBarberViews>; bookable: ReturnType<typeof toBarberViews>;
  services: ReturnType<typeof toServiceViews>;
  todayAppts: Awaited<ReturnType<typeof listAppointments>>; queue: ReturnType<typeof toQueueViews>; barberFilter?: string;
  money: ((n: number) => string) | null;
}) {
  const b = staff.bundle;
  const hours = dayHours(b, day);
  if (!hours) return (
    <div className="card grid place-items-center py-16 text-center">
      <p className="text-4xl">🌙</p>
      <p className="mt-2 font-semibold">Fechado neste dia</p>
      <p className="text-sm text-neutral-500">O horário de funcionamento fica em Recursos.</p>
    </div>
  );
  const [appts, others] = await Promise.all([
    day === today ? todayAppts : listMine(staff, ...dayRange(b, day)),
    colleaguesBusy(staff, ...dayRange(b, day)),
  ]);
  const items = [...toDayItems(b, appts), ...others].filter((x) => !barberFilter || x.barberId === barberFilter);
  const reserves = openReserveBlocks(b, day, appts)
    .filter((r) => staff.workable.includes(r.barberId) && (!barberFilter || r.barberId === barberFilter));
  const live = items.filter((x) => x.status !== "cancelled" && !x.masked);
  const count = (s: string) => live.filter((x) => x.status === s).length;
  const attended = live.filter((x) => x.status !== "no_show");
  const cols = barbers.filter((x) => staff.workable.includes(x.id)).length || 1;
  const usedMin = attended.reduce((s, x) => s + (x.end - x.start), 0);
  const occ = Math.min(100, Math.round((usedMin / ((hours.close - hours.open) * cols)) * 100));
  const forecast = attended.reduce((s, x) => s + (x.viaPlan ? 0 : x.price ?? 0), 0);
  const stats: { k: string; v: string; sub: string; tone: string }[] = [
    { k: "Atendimentos", v: String(attended.length), sub: `${count("done")} concluídos · ${count("confirmed") + count("pending")} a fazer`, tone: "" },
    { k: "Ocupação", v: `${occ}%`, sub: `${Math.round(usedMin / 60)} h de cadeira ocupadas`, tone: "" },
    ...(money ? [{ k: "Previsto avulso", v: money(forecast), sub: `${attended.filter((x) => x.viaPlan).length} pelo plano`, tone: "" }] : []),
    { k: "Na cadeira", v: String(count("in_service")), sub: count("pending") ? `${count("pending")} sem resposta` : "todos responderam", tone: count("in_service") ? "text-sky-600 dark:text-sky-400" : "" },
    { k: "Faltas", v: String(count("no_show")), sub: `${reserves.length} livres p/ encaixe`, tone: count("no_show") ? "text-red-600 dark:text-red-400" : "" },
  ];
  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:px-0">
        {stats.map((x) => (
          <div key={x.k} className="min-w-[150px] shrink-0 rounded-2xl border border-neutral-200 bg-white px-4 py-3 md:min-w-0 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">{x.k}</p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight ${x.tone}`}>{x.v}</p>
            <p className="truncate text-xs text-neutral-500">{x.sub}</p>
          </div>
        ))}
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
  const color = (id: string) => colors.find((c) => c.id === id)?.color ?? "#737373";
  const cols = barberIds.length || 1;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((d) => {
        const open = dayHours(b, d);
        const mine = items.filter((x, i) => dayInZone(appts[i].startsAt, tz) === d && barberIds.includes(x.barberId) && x.status !== "cancelled")
          .sort((x, y) => x.start - y.start);
        const used = mine.filter((x) => x.status !== "no_show").reduce((s, x) => s + (x.end - x.start), 0);
        const occ = open ? Math.min(100, Math.round((used / ((open.close - open.open) * cols)) * 100)) : 0;
        return (
          <section key={d} className={`card flex min-w-0 flex-col p-0 ${d === today ? "ring-2 ring-amber-500" : ""} ${!open ? "opacity-60" : ""}`}>
            <Link href={href({ dia: d, ver: "dia" })} className="block rounded-t-2xl border-b border-neutral-100 px-3 pb-2.5 pt-3 transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  <span className={`text-[11px] font-semibold uppercase tracking-wide ${d === today ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>{label(d, { weekday: "short" }).replace(".", "")}</span>
                  <b className="ml-1.5 text-lg tabular-nums">{Number(d.slice(8))}</b>
                </span>
                <span className="text-xs text-neutral-500">{open ? `${mine.filter((x) => x.status !== "no_show").length} atend.` : "fechado"}</span>
              </div>
              {open && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className={`h-full rounded-full ${occ > 85 ? "bg-red-500" : occ > 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(occ, 2)}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums text-neutral-500">{occ}%</span>
                </div>
              )}
            </Link>
            <ul className="max-h-[60vh] flex-1 space-y-1 overflow-y-auto p-2 text-xs md:max-h-[560px]">
              {mine.map((x) => (
                <li key={x.id} className={`agenda-appt flex items-center gap-1.5 rounded-md px-2 py-1 ${x.status === "no_show" ? "line-through opacity-40" : x.status === "done" ? "opacity-55" : ""}`}
                  style={{ "--c": color(x.barberId) } as React.CSSProperties}>
                  <span className="font-semibold tabular-nums">{toHHMM(x.start)}</span>
                  <span className="truncate">{x.clientName}</span>
                </li>
              ))}
              {open && mine.length === 0 && <li className="px-1 py-2 text-neutral-500">Livre o dia todo</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
