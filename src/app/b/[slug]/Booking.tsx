"use client";

import { useState, useTransition } from "react";
import type { ShopBundle } from "@/data/types";
import type { DaySlots } from "@/data/booking";
import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import { addDays, weekday } from "@/core/time";
import { formatMoney } from "@/core/money";
import { fill, locale, LANGS, t, tx } from "@/i18n";
import { confirmBooking, loadSlots } from "./actions";

type Pick = { minutes: number; barberId: string } | null;

export default function Booking({ bundle, lang, today, initial, demo, loggedIn }: {
  bundle: ShopBundle; lang: Lang; today: string; initial: DaySlots; demo: boolean; loggedIn: boolean;
}) {
  const { shop, barbers, services } = bundle;
  const L = t(lang);
  const [serviceId, setServiceId] = useState(services[0].id);
  const [barberId, setBarberId] = useState<string | undefined>();
  const [day, setDay] = useState(today);
  const [slots, setSlots] = useState(initial);
  const [pick, setPick] = useState<Pick>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | { minutes: number; barberId: string }>(null);
  const [pending, start] = useTransition();

  const barber = (id: string) => barbers.find((b) => b.id === id)!;
  const service = services.find((s) => s.id === serviceId)!;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const dayLabel = (d: string) =>
    d === today ? L.today : d === addDays(today, 1) ? L.tomorrow
      : new Date(d + "T12:00:00Z").toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", timeZone: "UTC" });

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

  function confirm() {
    if (!pick) return;
    setError("");
    start(async () => {
      const r = await confirmBooking({ slug: shop.slug, day, minutes: pick.minutes, serviceId, barberId: pick.barberId, name, phone: phone || undefined });
      if (r.ok) setDone(pick);
      else {
        setError(r.error === "not_logged_in" ? L.loginNeeded : (L as Record<string, string>)[r.error] ?? L.error);
        if (r.error === "slot_taken") refresh({});
      }
    });
  }

  if (done) {
    return (
      <Shell shop={bundle} lang={lang} demo={demo}>
        <div className="rounded-2xl bg-emerald-50 p-6 text-center dark:bg-emerald-950/40">
          <p className="text-3xl">✂️</p>
          <h2 className="mt-2 text-xl font-semibold">{L.booked}</h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            {fill(L.bookedMsg, { service: tx(service.name, lang), barber: barber(done.barberId).name, day: dayLabel(day), time: toHHMM(done.minutes) })}
          </p>
          <button className="btn mt-5" onClick={() => { setDone(null); refresh({}); }}>{L.another}</button>
        </div>
      </Shell>
    );
  }

  const chosen = (m: number, b: string) => pick?.minutes === m && pick.barberId === b;
  const SlotBtn = ({ m, b, showName }: { m: number; b: string; showName: boolean }) => (
    <button
      onClick={() => setPick({ minutes: m, barberId: b })}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${chosen(m, b)
        ? "border-amber-500 bg-amber-500 text-white" : "border-neutral-200 bg-white hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-900"}`}
    >
      <span className="font-semibold tabular-nums">{toHHMM(m)}</span>
      {showName && <span className="block text-xs opacity-80">{barber(b).name}</span>}
    </button>
  );

  return (
    <Shell shop={bundle} lang={lang} demo={demo}>
      <Section title={L.service}>
        <div className="grid grid-cols-2 gap-2">
          {services.map((s) => (
            <button key={s.id} onClick={() => refresh({ serviceId: s.id })}
              className={`chip text-left ${s.id === serviceId ? "chip-on" : ""}`}>
              <span className="font-medium">{tx(s.name, lang)}</span>
              <span className="block text-xs opacity-75">{s.durationMin} {L.min} · {formatMoney(s.price, shop.currency, lang)}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title={L.professional}>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => refresh({ barberId: null })} className={`chip ${!barberId ? "chip-on" : ""}`}>{L.anyone}</button>
          {barbers.map((b) => (
            <button key={b.id} onClick={() => refresh({ barberId: b.id })} className={`chip ${b.id === barberId ? "chip-on" : ""}`}>
              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: b.color ?? "#999" }} />{b.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title={L.day}>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const closed = !shop.openingHours[String(weekday(d))];
            return (
              <button key={d} disabled={closed} onClick={() => refresh({ day: d })}
                className={`chip shrink-0 capitalize ${d === day ? "chip-on" : ""} ${closed ? "opacity-40" : ""}`}>{dayLabel(d)}</button>
            );
          })}
        </div>
      </Section>

      <Section title={L.time}>
        <div className={pending ? "opacity-50 transition" : "transition"}>
          {slots.closed ? <p className="text-sm text-neutral-500">{L.closed}</p>
            : barberId && slots.preferred ? (
              <>
                {slots.preferred.own.length === 0 && slots.preferred.alternatives.length === 0 && <p className="text-sm text-neutral-500">{L.noSlots}</p>}
                <div className="grid grid-cols-4 gap-2">
                  {slots.preferred.own.map((m) => <SlotBtn key={m} m={m} b={barberId} showName={false} />)}
                </div>
                {slots.preferred.alternatives.length > 0 && (
                  <div className="mt-4 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
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
                          className={`rounded-full border px-3 py-1 text-xs ${chosen(o.time, b) ? "border-amber-500 bg-amber-500 text-white" : "border-neutral-200 dark:border-neutral-700"}`}>
                          {barber(b).name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </Section>

      {pick && (
        <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <p className="mb-3 text-sm">
            <b>{tx(service.name, lang)}</b> {L.with} <b>{barber(pick.barberId).name}</b> · <span className="capitalize">{dayLabel(day)}</span> {toHHMM(pick.minutes)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder={L.yourName} value={name} onChange={(e) => setName(e.target.value)} />
            {demo && <input className="input" placeholder={L.whatsapp} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {loggedIn
            ? <button className="btn mt-3 w-full" disabled={pending || !name.trim()} onClick={confirm}>{L.confirm}</button>
            : <a className="btn mt-3 block w-full text-center" href={`/entrar?next=${encodeURIComponent(`/b/${shop.slug}?lang=${lang}`)}`}>{L.loginNeeded}</a>}
        </div>
      )}
    </Shell>
  );
}

function Shell({ shop: b, lang, demo, children }: { shop: ShopBundle; lang: Lang; demo: boolean; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-8">
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-lg font-semibold">{b.shop.name}</h1>
          {b.shop.address && <p className="text-xs text-neutral-500">{b.shop.address}</p>}
        </div>
        <nav className="flex gap-1 text-xs">
          {LANGS.map((l) => (
            <a key={l} href={`?lang=${l}`} className={`rounded px-1.5 py-0.5 uppercase ${l === lang ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "text-neutral-500"}`}>{l}</a>
          ))}
        </nav>
      </header>
      {demo && <p className="mb-4 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">{t(lang).demo}</p>}
      {children}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}
