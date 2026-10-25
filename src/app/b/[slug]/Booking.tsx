"use client";

import { useEffect, useState, useTransition } from "react";
import type { ShopBundle } from "@/data/types";
import type { DaySlots } from "@/data/booking";
import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import { addDays, weekday } from "@/core/time";
import { formatMoney } from "@/core/money";
import { fill, locale, t, tx } from "@/i18n";
import type { MyAppointment, MyPlan } from "@/modules/client-app/types";
import { checkBookingLimit, checkPlanUse, hasUseRules, nextUseDay, type BookingLimit, type PlanCheck } from "@/core/plan-rules";
import { blockReason, ruleLines } from "@/modules/plans/describe";
import { confirmBooking, loadSlots, nextFree } from "./actions";
import { Avatar, BigButton, Icon, Label, dayLabel } from "./ui";

type Pick = { minutes: number; barberId: string } | null;
type Step = "service" | "when" | "confirm";
type Next = { day: string; minutes: number; barberId: string } | null | "none";
export type BookPreset = { serviceId?: string; barberId?: string; day?: string };

const STEPS: Step[] = ["service", "when", "confirm"];

/** Arquivo de calendário (.ics) do horário marcado, no fuso da barbearia. */
function icsHref(o: { title: string; place: string; day: string; start: number; len: number; tz: string }) {
  const stamp = (m: number) => `${o.day.replaceAll("-", "")}T${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Navalha//PT", "BEGIN:VEVENT",
    `UID:${o.day}-${o.start}-${Math.random().toString(36).slice(2)}@navalha`, `DTSTAMP:${now}`,
    `DTSTART;TZID=${o.tz}:${stamp(o.start)}`, `DTEND;TZID=${o.tz}:${stamp(Math.min(o.start + o.len, 24 * 60 - 1))}`,
    `SUMMARY:${o.title.replace(/[,;\n]/g, " ")}`, `LOCATION:${o.place.replace(/[,;\n]/g, " ")}`,
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Lembrete", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

/** Agendar em 3 etapas: serviço → profissional, dia e horário → confirmar. */
export default function Booking({ bundle, lang, today, initial, demoAs, loggedIn, defaultName, plan, preset, onHome, limit, upcoming }: {
  bundle: ShopBundle; lang: Lang; today: string; initial: DaySlots; demoAs?: string; loggedIn: boolean;
  defaultName?: string; plan: MyPlan | null; preset?: BookPreset | null; onHome: () => void;
  limit: BookingLimit; upcoming: MyAppointment[];
}) {
  const { shop, barbers, services } = bundle;
  const L = t(lang);
  const [step, setStep] = useState<Step>(preset ? "when" : "service");
  const [serviceId, setServiceId] = useState(preset?.serviceId && services.some((s) => s.id === preset.serviceId) ? preset.serviceId : services[0].id);
  const [barberId, setBarberId] = useState<string | undefined>(preset?.barberId);
  const [day, setDay] = useState(preset?.day ?? today);
  const [slots, setSlots] = useState(initial);
  const [pick, setPick] = useState<Pick>(null);
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { minutes: number; barberId: string; day: string }>(null);
  const [next, setNext] = useState<Next>(null);
  const [pending, start] = useTransition();

  const barber = (id: string) => barbers.find((b) => b.id === id)!;
  const service = services.find((s) => s.id === serviceId)!;
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i));
  const inPlan = (sid: string) => Boolean(plan && plan.status !== "expired" && plan.serviceIds.includes(sid));
  const priceOf = (sid: string) => inPlan(sid) ? L.in_plan : formatMoney(services.find((s) => s.id === sid)!.price, shop.currency, lang);
  const dl = (d: string) => dayLabel(d, today, lang, L);
  const longDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(locale(lang), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name;

  // ---- regras do plano: este horário sai pelo plano, é cobrado avulso ou não pode? ----
  const planObj = plan && bundle.plans.find((p) => p.id === plan.planId);
  const planCheck = (m: number, b: string, d = day): PlanCheck | null => plan && planObj && plan.status !== "expired" && plan.serviceIds.includes(serviceId)
    ? checkPlanUse({ plan: planObj, covers: true, periodEnd: plan.periodEnd, usesInPeriod: plan.usesInPeriod, useDays: plan.useDays }, { day: d, start: m, barberId: b })
    : null;
  const showCover = Boolean(plan && planObj && plan.status !== "expired" && plan.serviceIds.includes(serviceId) && (hasUseRules(plan.rules) || plan.quotaUses !== null));
  const covers = (m: number, b: string) => showCover && planCheck(m, b)?.ok === true;

  // ---- limite de horários em aberto do cliente ----
  const openAppts = upcoming.map((a) => {
    const svc = services.find((x) => x.id === a.serviceId);
    return { day: a.day, start: a.minutes, end: a.minutes + (svc?.durationMin ?? 30), appt: a };
  });
  const full = limit.on && openAppts.length >= limit.maxUpcoming;
  const limitFor = (m: number) => checkBookingLimit(limit, openAppts, { day, start: m, end: m + service.durationMin });

  function refresh(nx: { serviceId?: string; barberId?: string | null; day?: string }) {
    const s = nx.serviceId ?? serviceId;
    const b = nx.barberId === null ? undefined : nx.barberId ?? barberId;
    const d = nx.day ?? day;
    setServiceId(s); setBarberId(b); setDay(d); setPick(null); setError(""); setNext(null);
    start(async () => {
      const r = await loadSlots(shop.slug, d, s, b);
      if (r) setSlots(r);
    });
  }

  // veio de "Outro horário" ou de uma etapa do projeto: carrega a grade já filtrada
  useEffect(() => {
    if (preset) refresh({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dia sem horário: procura sozinho o próximo livre e oferece com um toque
  const empty = !pending && slots.day === day && (slots.closed || (barberId && slots.preferred
    ? slots.preferred.own.length === 0 && slots.preferred.alternatives.length === 0
    : slots.options.length === 0));
  useEffect(() => {
    if (step !== "when" || !empty || next !== null) return;
    let alive = true;
    nextFree(shop.slug, addDays(day, 1), serviceId, barberId).then((r) => alive && setNext(r ?? "none")).catch(() => alive && setNext("none"));
    return () => { alive = false; };
  }, [step, empty, next, day, serviceId, barberId, shop.slug]);

  const go = (s: Step) => { setStep(s); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const choose = (m: number, b: string) => { setPick({ minutes: m, barberId: b }); go("confirm"); };
  const jump = (n: { day: string; minutes: number; barberId: string }) => {
    setDay(n.day); setNext(null); setPick({ minutes: n.minutes, barberId: n.barberId });
    start(async () => {
      const r = await loadSlots(shop.slug, n.day, serviceId, barberId);
      if (r) setSlots(r);
    });
    go("confirm");
  };

  function confirm() {
    if (!pick) return;
    setError("");
    start(async () => {
      const r = await confirmBooking({ slug: shop.slug, as: demoAs, day, minutes: pick.minutes, serviceId, barberId: pick.barberId, name: name || defaultName || "" });
      if (r.ok) setDone({ ...pick, day });
      else {
        setError(r.error === "not_logged_in" ? L.loginNeeded : (L as Record<string, string>)[r.error] ?? L.error);
        if (r.error === "slot_taken") { refresh({}); go("when"); }
      }
    });
  }

  // ---------- pronto ----------
  if (done) {
    const b = barber(done.barberId);
    return (
      <div className="agenda-pop pt-6 text-center">
        <div className="relative mx-auto grid size-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 [animation-iteration-count:2]" />
          <span className="relative grid size-20 place-items-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
            <Icon name="check" className="size-10" />
          </span>
        </div>
        <h2 className="mt-5 text-3xl font-bold tracking-tight">{L.booked}</h2>
        <Ticket className="mx-auto mt-5 max-w-sm text-left" b={b} title={tx(service.name, lang)} when={longDay(done.day)} time={`${toHHMM(done.minutes)} – ${toHHMM(done.minutes + service.durationMin)}`}
          extra={inPlan(serviceId) && planCheck(done.minutes, done.barberId, done.day)?.ok !== false ? L.in_plan : formatMoney(service.price, shop.currency, lang)} L={L} />
        <p className="mx-auto mt-4 max-w-xs text-sm text-neutral-500">
          {(() => {
            const msg = fill(L.bookedMsg, { service: tx(service.name, lang), barber: b.name, day: dl(done.day), time: toHHMM(done.minutes) });
            // sem o módulo de lembretes, não promete mensagem no WhatsApp (tira a última frase)
            return shop.modules.mensagens ? msg : msg.slice(0, msg.lastIndexOf(". ") + 1) || msg;
          })()}
        </p>
        <div className="mx-auto mt-6 max-w-sm space-y-2">
          <a download="horario.ics" href={icsHref({ title: `${tx(service.name, lang)} · ${shop.name}`, place: shop.address ?? shop.name, day: done.day, start: done.minutes, len: service.durationMin, tz: shop.timezone })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] font-semibold transition hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900">
            <Icon name="calendar" className="size-4" />{L.add_cal}
          </a>
          <BigButton onClick={onHome}>{L.back_home}</BigButton>
          <button className="w-full py-2 text-sm font-medium text-neutral-500" onClick={() => { setDone(null); setPick(null); go("service"); refresh({}); }}>{L.another}</button>
        </div>
      </div>
    );
  }

  const idx = STEPS.indexOf(step);
  const pickCheck = pick ? planCheck(pick.minutes, pick.barberId) : null;
  const pickLimit = pick && loggedIn ? limitFor(pick.minutes) : null;
  const blocked = Boolean((pickCheck && !pickCheck.ok && pickCheck.block) || (pickLimit && !pickLimit.ok));

  // horários do dia, cada um com os barbeiros livres
  const times: { time: number; barberIds: string[] }[] = slots.closed ? [] : barberId && slots.preferred
    ? slots.preferred.own.map((m) => ({ time: m, barberIds: [barberId] }))
    : slots.options.map((o) => ({ time: o.time, barberIds: o.barberIds }));
  const parts = [
    { k: "morning", label: L.part_morning, icon: "sun" as const, list: times.filter((x) => x.time < 12 * 60) },
    { k: "afternoon", label: L.part_afternoon, icon: "sunset" as const, list: times.filter((x) => x.time >= 12 * 60 && x.time < 18 * 60) },
    { k: "night", label: L.part_night, icon: "moon" as const, list: times.filter((x) => x.time >= 18 * 60) },
  ].filter((p) => p.list.length);
  /** No "qualquer um", prefere o barbeiro em que o plano cobre. */
  const bestBarber = (o: { time: number; barberIds: string[] }) => o.barberIds.find((b) => covers(o.time, b)) ?? o.barberIds[0];
  const freeAtPick = pick ? (slots.options.find((o) => o.time === pick.minutes)?.barberIds ?? [pick.barberId]) : [];

  return (
    <div className="pb-4">
      {/* topo: voltar, título da etapa e progresso */}
      <div className="flex items-center gap-2">
        {idx > 0 && (
          <button onClick={() => go(STEPS[idx - 1])} aria-label={L.back}
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
            <Icon name="back" className="size-4" />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">{fill(L.step_n, { a: String(idx + 1), b: "3" })}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{step === "service" ? L.step_service : step === "when" ? L.step_when : L.step_confirm}</h1>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= idx ? "bg-amber-500" : "bg-neutral-200 dark:bg-neutral-800"}`} />)}
      </div>

      {full && openAppts[0] && (
        <div className="mt-4 rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-800 dark:from-amber-950/40 dark:to-neutral-950">
          <p className="flex items-center gap-2 font-semibold"><Icon name="lock" className="size-4 text-amber-600" />{L.limit_t}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {fill(L.limit_sub, { w: `${dl(openAppts[0].day)} ${L.at} ${toHHMM(openAppts[0].start)}`, b: barberName(openAppts[0].appt.barberId) ?? "", n: String(limit.maxUpcoming) })}
          </p>
          <button onClick={onHome} className="mt-3 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-950">{L.see_mine}</button>
        </div>
      )}

      {/* ---------- 1. serviço ---------- */}
      {step === "service" && (
        <div className="agenda-pop">
          {plan && planObj && plan.status !== "expired" && hasUseRules(plan.rules) && (
            <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-50/70 p-3 text-sm dark:bg-emerald-950/20">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"><Icon name="shield" className="size-3.5" />{L.plan_rules_t} · {plan.planName}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {ruleLines(plan.rules, lang, barberName).map((l) => <li key={l} className="rounded-full bg-white px-2 py-0.5 text-xs dark:bg-neutral-900">{l}</li>)}
              </ul>
              {plan.rules.minDaysBetween && nextUseDay(planObj, plan.useDays, today) > today && (
                <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400">{fill(L.plan_next_use, { d: dl(nextUseDay(planObj, plan.useDays, today)) })}</p>
              )}
            </div>
          )}
          <div className="mt-5 space-y-2.5">
            {services.map((s) => {
              const on = s.id === serviceId;
              return (
                <button key={s.id} onClick={() => { refresh({ serviceId: s.id }); go("when"); }}
                  className={`group flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition active:scale-[.99] dark:bg-neutral-900 ${on ? "border-amber-500 ring-1 ring-amber-500" : "border-neutral-200 hover:border-amber-400 dark:border-neutral-800"}`}>
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${inPlan(s.id) ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                    <Icon name={inPlan(s.id) ? "shield" : "spark"} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{tx(s.name, lang)}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500"><Icon name="clock" className="size-3.5" />{s.durationMin} {L.min}</span>
                  </span>
                  <span className={`shrink-0 text-right text-sm font-bold ${inPlan(s.id) ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{priceOf(s.id)}</span>
                  <Icon name="chevron" className="size-4 shrink-0 text-neutral-400 transition group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- 2. profissional, dia e horário ---------- */}
      {step === "when" && (
        <div className="agenda-pop">
          <button onClick={() => go("service")} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-left text-white dark:bg-neutral-800">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{tx(service.name, lang)}</span>
              <span className="text-xs opacity-70">{service.durationMin} {L.min} · {priceOf(serviceId)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{L.change}</span>
          </button>

          <Label>{L.professional}</Label>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            <button onClick={() => refresh({ barberId: null })} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-xs">
              <span className={`grid size-14 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-neutral-950 ring-offset-2 ring-offset-neutral-50 transition dark:ring-offset-neutral-950 ${!barberId ? "ring-2 ring-amber-500" : "opacity-80"}`}>
                <Icon name="bolt" className="size-6" />
              </span>
              <span className={`w-full truncate text-center ${!barberId ? "font-semibold" : "text-neutral-500"}`}>{L.fastest}</span>
            </button>
            {barbers.map((b) => (
              <button key={b.id} onClick={() => refresh({ barberId: b.id })} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-xs">
                <span className={`rounded-full ring-offset-2 ring-offset-neutral-50 transition dark:ring-offset-neutral-950 ${b.id === barberId ? "ring-2 ring-amber-500" : ""}`}>
                  <Avatar b={b} size="size-14" />
                </span>
                <span className={`w-full truncate text-center ${b.id === barberId ? "font-semibold" : "text-neutral-500"}`}>{b.name}</span>
              </button>
            ))}
          </div>

          <Label>{L.day}</Label>
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {days.map((d) => {
              const closed = !shop.openingHours[String(weekday(d))];
              const dt = new Date(d + "T12:00:00Z");
              const on = d === day;
              return (
                <button key={d} disabled={closed} onClick={() => refresh({ day: d })}
                  className={`flex w-[58px] shrink-0 snap-start flex-col items-center rounded-2xl border py-2.5 text-xs transition ${on
                    ? "border-neutral-900 bg-neutral-900 text-white shadow-lg shadow-neutral-900/20 dark:border-amber-500 dark:bg-amber-500 dark:text-neutral-950"
                    : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900"} ${closed ? "opacity-30" : ""}`}>
                  <span className={`text-[10px] font-semibold uppercase ${on ? "opacity-80" : "text-neutral-500"}`}>{d === today ? L.today : dt.toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" }).replace(".", "")}</span>
                  <b className="text-xl leading-tight tabular-nums">{dt.getUTCDate()}</b>
                  <span className={`text-[10px] capitalize ${on ? "opacity-70" : "text-neutral-400"}`}>{dt.toLocaleDateString(locale(lang), { month: "short", timeZone: "UTC" }).replace(".", "")}</span>
                </button>
              );
            })}
          </div>

          <Label>{L.time} · <span className="normal-case">{dl(day)}</span></Label>
          {showCover && !slots.closed && times.length > 0 && <p className="-mt-1 mb-2 flex items-center gap-1.5 text-xs text-neutral-500"><span className="size-2 rounded-full bg-emerald-500" />{L.plan_dot}</p>}
          <div className={pending ? "opacity-50 transition" : "transition"}>
            {empty ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-4 text-center dark:border-neutral-700">
                <p className="text-sm text-neutral-500">{slots.closed ? L.closed : L.noSlots}</p>
                {next === null && <p className="mt-2 animate-pulse text-xs text-neutral-400">{L.searching_next}</p>}
                {next === "none" && <p className="mt-2 text-xs text-neutral-500">{L.none_soon}</p>}
                {next && next !== "none" && (
                  <button onClick={() => jump(next)} className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 p-3 text-left text-neutral-950 shadow-lg shadow-amber-500/20 transition active:scale-[.99]">
                    <Avatar b={barber(next.barberId)} size="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold uppercase tracking-wider opacity-70">{L.next_free}</span>
                      <span className="block font-semibold first-letter:uppercase">{fill(L.next_free_sub, { d: dl(next.day), t: toHHMM(next.minutes) })}</span>
                      <span className="block text-xs opacity-75">{L.with} {barber(next.barberId).name}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-neutral-950/10 px-3 py-1 text-xs font-bold">{L.see_it}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {parts.map((p) => (
                  <div key={p.k}>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-500"><Icon name={p.icon} className="size-3.5" />{p.label}<span className="text-neutral-400">· {p.list.length}</span></p>
                    <div className="grid grid-cols-4 gap-2">
                      {p.list.map((o) => {
                        const b = bestBarber(o);
                        const green = covers(o.time, b);
                        return (
                          <button key={o.time} onClick={() => choose(o.time, b)}
                            className={`relative flex flex-col items-center rounded-xl border py-2.5 text-sm transition active:scale-95 ${green
                              ? "border-emerald-500/60 bg-emerald-50 hover:border-emerald-500 dark:bg-emerald-950/30"
                              : "border-neutral-200 bg-white hover:border-amber-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"}`}>
                            {green && <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-500" />}
                            <span className="font-semibold tabular-nums">{toHHMM(o.time)}</span>
                            {!barberId && (
                              <span className="mt-1 flex -space-x-1.5">
                                {o.barberIds.slice(0, 3).map((id) => <span key={id} className="rounded-full ring-2 ring-white dark:ring-neutral-900"><Avatar b={barber(id)} size="size-4 text-[6px]" /></span>)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {barberId && slots.preferred && slots.preferred.alternatives.length > 0 && (
                  <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/30">
                    <p className="mb-2 text-sm">{fill(L.fewSlots, { name: barber(barberId).name })}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {slots.preferred.alternatives.map((a) => (
                        <button key={a.barberId + a.time} onClick={() => choose(a.time, a.barberId)}
                          className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 text-left text-sm transition hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900">
                          <Avatar b={barber(a.barberId)} size="size-7 text-[9px]" />
                          <span className="min-w-0"><b className="block tabular-nums">{toHHMM(a.time)}</b><span className="block truncate text-xs text-neutral-500">{barber(a.barberId).name}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- 3. confirmar ---------- */}
      {step === "confirm" && pick && (
        <div className="agenda-pop">
          <Ticket className="mt-5" b={barber(pick.barberId)} title={tx(service.name, lang)} when={longDay(day)}
            time={`${toHHMM(pick.minutes)} – ${toHHMM(pick.minutes + service.durationMin)}`}
            extra={pickCheck && !pickCheck.ok ? formatMoney(service.price, shop.currency, lang) : priceOf(serviceId)} L={L}
            onChange={() => go("when")} />

          {!barberId && freeAtPick.length > 1 && (
            <>
              <Label>{L.who}</Label>
              <div className="flex flex-wrap gap-2">
                {freeAtPick.map((id) => (
                  <button key={id} onClick={() => setPick({ minutes: pick.minutes, barberId: id })}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${pick.barberId === id ? "border-amber-500 bg-amber-50 font-semibold ring-1 ring-amber-500 dark:bg-amber-950/40" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
                    <Avatar b={barber(id)} size="size-7 text-[9px]" />{barber(id).name}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 space-y-2">
            {pickCheck?.ok && showCover && <p className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Icon name="check" className="size-3.5" />{L.plan_here}</p>}
            {pickCheck && !pickCheck.ok && plan && (
              <p className={`rounded-xl p-3 text-sm ${pickCheck.block ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                {pickCheck.block
                  ? fill(L.plan_out_block, { r: blockReason(pickCheck.reason, plan.rules, lang, barberName, pickCheck.nextDay) })
                  : `${fill(L.plan_out_charge, { r: blockReason(pickCheck.reason, plan.rules, lang, barberName, pickCheck.nextDay) })}: ${formatMoney(service.price, shop.currency, lang)}.`}
              </p>
            )}
            {pickLimit && !pickLimit.ok && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{L[`booking_limit_${pickLimit.reason}`]}</p>
            )}
          </div>

          {loggedIn && !defaultName && (
            <>
              <Label>{L.yourName}</Label>
              <input className="input py-3 text-base" placeholder={L.yourName} value={name} onChange={(e) => setName(e.target.value)} />
            </>
          )}
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
          <div className="sticky bottom-20 z-10 -mx-4 mt-6 bg-gradient-to-t from-neutral-50 via-neutral-50 to-transparent px-4 pb-2 pt-6 dark:from-neutral-950 dark:via-neutral-950">
            {loggedIn
              ? <BigButton gold disabled={pending || !(name.trim() || defaultName) || blocked} onClick={confirm}>{pending ? "…" : `${L.confirm} · ${toHHMM(pick.minutes)}`}</BigButton>
              : <a className="block w-full rounded-2xl bg-neutral-900 px-4 py-3.5 text-center text-[15px] font-semibold text-white dark:bg-white dark:text-neutral-950" href={`/entrar?next=${encodeURIComponent(`/b/${shop.slug}?lang=${lang}&tab=book`)}`}>{L.loginNeeded}</a>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cartão do horário, como um ingresso. */
function Ticket({ b, title, when, time, extra, L, onChange, className = "" }: {
  b: ShopBundle["barbers"][number]; title: string; when: string; time: string; extra: string; L: ReturnType<typeof t>; onChange?: () => void; className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
      <div className="flex items-center gap-3 p-4" style={{ background: `linear-gradient(135deg, ${b.color ?? "#737373"}22, transparent 70%)` }}>
        <Avatar b={b} size="size-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{title}</p>
          <p className="text-sm text-neutral-500">{L.with} <b className="text-neutral-800 dark:text-neutral-200">{b.name}</b></p>
        </div>
        {onChange && <button onClick={onChange} className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 hover:border-amber-400 dark:border-neutral-700 dark:text-neutral-300">{L.change}</button>}
      </div>
      <div className="relative border-t border-dashed border-neutral-200 dark:border-neutral-700">
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-neutral-50 dark:bg-neutral-950" />
        <span className="absolute -right-3 -top-3 size-6 rounded-full bg-neutral-50 dark:bg-neutral-950" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
        <div className="col-span-2"><dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{L.day}</dt><dd className="font-semibold first-letter:uppercase">{when}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{L.time}</dt><dd className="text-lg font-bold tabular-nums">{time}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{L.value}</dt><dd className="text-lg font-bold">{extra}</dd></div>
      </dl>
    </div>
  );
}
