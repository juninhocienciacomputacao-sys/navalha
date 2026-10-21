"use client";

import { useEffect, useState, useTransition } from "react";
import type { ShopBundle } from "@/data/types";
import type { DaySlots } from "@/data/booking";
import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import { addDays, weekday } from "@/core/time";
import { formatMoney } from "@/core/money";
import { fill, locale, t, tx } from "@/i18n";
import type { MyPlan } from "@/modules/client-app/types";
import { confirmBooking, loadSlots } from "./actions";
import { Avatar, BigButton, Icon, Label, dayLabel } from "./ui";

type Pick = { minutes: number; barberId: string } | null;
export type BookPreset = { serviceId?: string; barberId?: string; day?: string };

/** Agendar: serviço → profissional → dia → horário (com nome do barbeiro) → sugestões de outro barbeiro → confirmar. */
export default function Booking({ bundle, lang, today, initial, demoAs, loggedIn, defaultName, plan, preset, onHome }: {
  bundle: ShopBundle; lang: Lang; today: string; initial: DaySlots; demoAs?: string; loggedIn: boolean;
  defaultName?: string; plan: MyPlan | null; preset?: BookPreset | null; onHome: () => void;
}) {
  const { shop, barbers, services } = bundle;
  const L = t(lang);
  const [serviceId, setServiceId] = useState(preset?.serviceId && services.some((s) => s.id === preset.serviceId) ? preset.serviceId : services[0].id);
  const [barberId, setBarberId] = useState<string | undefined>(preset?.barberId);
  const [day, setDay] = useState(preset?.day ?? today);
  const [slots, setSlots] = useState(initial);
  const [pick, setPick] = useState<Pick>(null);
  const [name, setName] = useState(defaultName ?? "");
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { minutes: number; barberId: string; day: string }>(null);
  const [pending, start] = useTransition();

  const barber = (id: string) => barbers.find((b) => b.id === id)!;
  const service = services.find((s) => s.id === serviceId)!;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const inPlan = (sid: string) => Boolean(plan && plan.status !== "expired" && plan.serviceIds.includes(sid));
  const priceOf = (sid: string) => inPlan(sid) ? L.in_plan : formatMoney(services.find((s) => s.id === sid)!.price, shop.currency, lang);
  const dl = (d: string) => dayLabel(d, today, lang, L);

  function refresh(next: { serviceId?: string; barberId?: string | null; day?: string }) {
    const s = next.serviceId ?? serviceId;
    const b = next.barberId === null ? undefined : next.barberId ?? barberId;
    const d = next.day ?? day;
    setServiceId(s); setBarberId(b); setDay(d); setPick(null); setError("");
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

  function confirm() {
    if (!pick) return;
    setError("");
    start(async () => {
      const r = await confirmBooking({ slug: shop.slug, as: demoAs, day, minutes: pick.minutes, serviceId, barberId: pick.barberId, name: name || defaultName || "" });
      if (r.ok) setDone({ ...pick, day });
      else {
        setError(r.error === "not_logged_in" ? L.loginNeeded : (L as Record<string, string>)[r.error] ?? L.error);
        if (r.error === "slot_taken") refresh({});
      }
    });
  }

  if (done) {
    const b = barber(done.barberId);
    return (
      <div className="pt-6 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          <Icon name="check" className="size-8" />
        </div>
        <h2 className="mt-4 text-2xl font-bold">{L.booked}</h2>
        <div className="mx-auto mt-4 flex max-w-xs items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left dark:border-neutral-800 dark:bg-neutral-900">
          <Avatar b={b} />
          <div className="min-w-0">
            <p className="font-semibold">{tx(service.name, lang)}</p>
            <p className="text-sm capitalize text-neutral-500">{dl(done.day)} · {toHHMM(done.minutes)} · {b.name}</p>
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-xs text-sm text-neutral-500">
          {fill(L.bookedMsg, { service: tx(service.name, lang), barber: b.name, day: dl(done.day), time: toHHMM(done.minutes) })}
        </p>
        <div className="mt-6 space-y-2">
          <BigButton onClick={onHome}>{L.back_home}</BigButton>
          <button className="w-full py-2 text-sm font-medium text-neutral-500" onClick={() => { setDone(null); refresh({}); }}>{L.another}</button>
        </div>
      </div>
    );
  }

  const chosen = (m: number, b: string) => pick?.minutes === m && pick.barberId === b;
  const SlotBtn = ({ m, b, showName }: { m: number; b: string; showName: boolean }) => (
    <button
      onClick={() => setPick({ minutes: m, barberId: b })}
      className={`rounded-xl border px-2 py-2 text-left text-sm transition ${chosen(m, b)
        ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"}`}
    >
      <span className="font-semibold tabular-nums">{toHHMM(m)}</span>
      {showName && <span className="block truncate text-xs opacity-80">{barber(b).name}</span>}
    </button>
  );

  return (
    <div className="pb-4">
      <h1 className="text-2xl font-bold tracking-tight">{L.tab_book}</h1>

      <Label>{L.service}</Label>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {services.map((s) => (
          <button key={s.id} onClick={() => refresh({ serviceId: s.id })}
            className={`chip w-36 shrink-0 snap-start text-left ${s.id === serviceId ? "chip-on" : ""}`}>
            <span className="block truncate font-medium">{tx(s.name, lang)}</span>
            <span className={`block text-xs ${inPlan(s.id) ? "font-semibold text-emerald-600 dark:text-emerald-400" : "opacity-75"}`}>{s.durationMin} {L.min} · {priceOf(s.id)}</span>
          </button>
        ))}
      </div>

      <Label>{L.professional}</Label>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        <button onClick={() => refresh({ barberId: null })} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
          <span className={`grid size-12 place-items-center rounded-full bg-neutral-900 text-white ring-offset-2 ring-offset-neutral-50 dark:bg-white dark:text-neutral-900 dark:ring-offset-neutral-950 ${!barberId ? "ring-2 ring-amber-500" : ""}`}>
            <Icon name="clock" />
          </span>
          <span className={!barberId ? "font-semibold" : "text-neutral-500"}>{L.anyone}</span>
        </button>
        {barbers.map((b) => (
          <button key={b.id} onClick={() => refresh({ barberId: b.id })} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
            <span className={`rounded-full ring-offset-2 ring-offset-neutral-50 dark:ring-offset-neutral-950 ${b.id === barberId ? "ring-2 ring-amber-500" : ""}`}>
              <Avatar b={b} size="size-12" />
            </span>
            <span className={`w-full truncate text-center ${b.id === barberId ? "font-semibold" : "text-neutral-500"}`}>{b.name}</span>
          </button>
        ))}
      </div>

      <Label>{L.day}</Label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const closed = !shop.openingHours[String(weekday(d))];
          const dt = new Date(d + "T12:00:00Z");
          return (
            <button key={d} disabled={closed} onClick={() => refresh({ day: d })}
              className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 text-xs transition ${d === day
                ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"} ${closed ? "opacity-35" : ""}`}>
              <span className="capitalize">{d === today ? L.today : dt.toLocaleDateString(locale(lang), { weekday: "short", timeZone: "UTC" }).replace(".", "")}</span>
              <b className="text-lg leading-tight">{dt.getUTCDate()}</b>
              <span className="capitalize opacity-70">{dt.toLocaleDateString(locale(lang), { month: "short", timeZone: "UTC" }).replace(".", "")}</span>
            </button>
          );
        })}
      </div>

      <Label>{L.time} · <span className="normal-case">{dl(day)}</span></Label>
      <div className={pending ? "opacity-50 transition" : "transition"}>
        {slots.closed ? <p className="text-sm text-neutral-500">{L.closed}</p>
          : barberId && slots.preferred ? (
            <>
              {slots.preferred.own.length === 0 && slots.preferred.alternatives.length === 0 && <p className="text-sm text-neutral-500">{L.noSlots}</p>}
              <div className="grid grid-cols-4 gap-2">
                {slots.preferred.own.map((m) => <SlotBtn key={m} m={m} b={barberId} showName={false} />)}
              </div>
              {slots.preferred.alternatives.length > 0 && (
                <div className="mt-4 rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/30">
                  <p className="mb-2 text-sm">{fill(L.fewSlots, { name: barber(barberId).name })}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {slots.preferred.alternatives.map((a) => <SlotBtn key={a.barberId + a.time} m={a.time} b={a.barberId} showName />)}
                  </div>
                </div>
              )}
            </>
          ) : slots.options.length === 0 ? <p className="text-sm text-neutral-500">{L.noSlots}</p> : (
            <div className="space-y-2">
              {slots.options.map((o) => (
                <div key={o.time} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{toHHMM(o.time)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {o.barberIds.map((b) => (
                      <button key={b} onClick={() => setPick({ minutes: o.time, barberId: b })}
                        className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs ${chosen(o.time, b) ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"}`}>
                        <Avatar b={barber(b)} size="size-5 text-[8px]" />{barber(b).name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {pick && (
        <div className="sticky bottom-20 z-10 -mx-4 mt-6 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <p className="mb-3 text-sm">
            <b>{tx(service.name, lang)}</b> {L.with} <b>{barber(pick.barberId).name}</b> · <span className="capitalize">{dl(day)}</span> {toHHMM(pick.minutes)}
            <span className="ml-1 text-neutral-500">· {priceOf(serviceId)}</span>
          </p>
          {!defaultName && (
            <input className="input" placeholder={L.yourName} value={name} onChange={(e) => setName(e.target.value)} />
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {loggedIn
            ? <BigButton gold className="mt-3" disabled={pending || !(name.trim() || defaultName)} onClick={confirm}>{L.confirm}</BigButton>
            : <a className="mt-3 block w-full rounded-2xl bg-neutral-900 px-4 py-3.5 text-center text-[15px] font-semibold text-white dark:bg-white dark:text-neutral-950" href={`/entrar?next=${encodeURIComponent(`/b/${shop.slug}?lang=${lang}&tab=book`)}`}>{L.loginNeeded}</a>}
        </div>
      )}
    </div>
  );
}
