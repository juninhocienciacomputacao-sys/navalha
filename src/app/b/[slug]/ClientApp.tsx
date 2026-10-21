"use client";

import { useEffect, useState, useTransition } from "react";
import type { ShopBundle } from "@/data/types";
import type { DaySlots } from "@/data/booking";
import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import { formatMoney } from "@/core/money";
import { fill, LANGS, t, tx, type Dict } from "@/i18n";
import type { ClientHome, MyAppointment, Viewer } from "@/modules/client-app/types";
import type { ClientCatalog } from "@/modules/shopping/types";
import { nextStepIndex } from "@/modules/client-app/style";
import { cancelAppointment, confirmBooking } from "./actions";
import Booking, { type BookPreset } from "./Booking";
import PlanTab, { PayScreen } from "./PlanTab";
import StyleFlow, { ProjectScreen } from "./StyleFlow";
import ShopTab from "./ShopTab";
import { Avatar, Bar, BigButton, Icon, Label, LoginCard, PlanCard, Row, dayLabel, initials, shortDate, when } from "./ui";

export type Tab = "home" | "book" | "shop" | "plan";
type Screen = null | { k: "pay" } | { k: "style" } | { k: "project"; id: string };

export interface AppProps {
  bundle: ShopBundle; lang: Lang; today: string; initial: DaySlots; viewer: Viewer;
  home: ClientHome | null; catalog: ClientCatalog | null; initialTab: Tab; hour: number;
}

export default function ClientApp(p: AppProps) {
  const { bundle, lang, viewer, home } = p;
  const L = t(lang);
  const [tab, setTab] = useState<Tab>(p.initialTab);
  const [screen, setScreen] = useState<Screen>(null);
  const [preset, setPreset] = useState<BookPreset | null>(null);
  const [bookKey, setBookKey] = useState(0);
  const [toast, setToast] = useState("");
  const demoAs = viewer.kind === "demo" ? viewer.clientId : undefined;
  const loggedIn = viewer.kind !== "guest";

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const go = (next: Tab) => { setScreen(null); setTab(next); window.scrollTo({ top: 0 }); };
  const book = (pr: BookPreset | null) => { setPreset(pr); setBookKey((k) => k + 1); go("book"); };
  const open = (s: Screen) => { setScreen(s); window.scrollTo({ top: 0 }); };
  const href = (q: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { lang, tab, as: demoAs, ...q };
    Object.entries(all).forEach(([k, v]) => { if (v) u.set(k, v); });
    return `?${u}`;
  };
  const loginHref = `/entrar?next=${encodeURIComponent(`/b/${bundle.shop.slug}?lang=${lang}&tab=${tab}`)}`;
  const common = { bundle, lang, L, today: p.today, demoAs };

  let body: React.ReactNode;
  if (screen?.k === "pay" && home?.plan) body = <PayScreen {...common} plan={home.plan} onBack={() => setScreen(null)} onBook={() => book(null)} onHome={() => go("home")} />;
  else if (screen?.k === "style") {
    body = <StyleFlow {...common} home={home} loginHref={loginHref} onBack={() => setScreen(null)}
      onCreated={(id) => { setToast(L.project_created); open({ k: "project", id }); }} />;
  } else if (screen?.k === "project") {
    const prj = home?.projects.find((x) => x.id === screen.id);
    body = prj
      ? <ProjectScreen {...common} project={prj} onBack={() => setScreen(null)} onBookStep={(pr) => book(pr)} />
      : <p className="py-10 text-center text-sm text-neutral-500">…</p>;
  } else if (tab === "book") {
    body = <Booking key={bookKey} bundle={bundle} lang={lang} today={p.today} initial={p.initial} demoAs={demoAs} loggedIn={loggedIn}
      defaultName={home?.me.name} plan={home?.plan ?? null} preset={preset} onHome={() => go("home")} />;
  } else if (tab === "plan") {
    body = <PlanTab {...common} home={home} loginHref={loginHref} onPay={() => open({ k: "pay" })} onBook={() => book(null)} />;
  } else if (tab === "shop") {
    body = <ShopTab bundle={bundle} lang={lang} L={L} catalog={p.catalog} />;
  } else {
    body = <Home {...p} L={L} demoAs={demoAs} loginHref={loginHref} onBook={book} onOpen={open} onToast={setToast} />;
  }

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <main className="mx-auto min-h-dvh max-w-md px-4 pb-28">
        <header className="flex items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="h-8 w-3 shrink-0 rounded-full bg-[repeating-linear-gradient(135deg,#dc2626_0_6px,#fff_6px_12px,#1d4ed8_12px_18px,#fff_18px_24px)] ring-1 ring-neutral-300 dark:ring-neutral-700" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold leading-tight">{bundle.shop.name}</p>
              {bundle.shop.address && <p className="truncate text-[11px] text-neutral-500">{bundle.shop.address}</p>}
            </div>
          </div>
          <nav className="flex shrink-0 gap-0.5 rounded-full bg-neutral-200/70 p-0.5 text-[11px] dark:bg-neutral-800">
            {LANGS.map((l) => (
              <a key={l} href={href({ lang: l })} className={`rounded-full px-2 py-0.5 font-semibold uppercase ${l === lang ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white" : "text-neutral-500"}`}>{l}</a>
            ))}
          </nav>
        </header>

        {viewer.kind === "demo" && (
          <div className="mb-4 flex items-center gap-2 overflow-x-auto rounded-2xl bg-neutral-900 px-3 py-2 text-xs text-white dark:bg-neutral-800">
            <span className="shrink-0 font-semibold text-amber-400">{L.demo}</span>
            <span className="shrink-0 opacity-60">· {L.demo_as}</span>
            {viewer.choices.map((c, i) => (
              <a key={c.id} href={href({ as: c.id })}
                className={`shrink-0 rounded-full px-2.5 py-1 ${c.id === viewer.clientId ? "bg-white font-semibold text-neutral-900" : "bg-white/10"}`}>
                {c.label.split(" ")[0]} · {i === 0 ? L.demo_expiring : L.demo_expired}
              </a>
            ))}
          </div>
        )}

        {body}
      </main>

      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-white dark:text-neutral-900">{toast}</div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto grid max-w-md grid-cols-4 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5">
          {([["home", "home", L.tab_home], ["book", "calendar", L.tab_book], ["shop", "bag", L.tab_shop], ["plan", "card", L.tab_plan]] as const).map(([k, icon, label]) => {
            const on = tab === k && !screen;
            return (
              <button key={k} onClick={() => (k === "book" ? book(null) : go(k))} aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${on ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>
                <Icon name={icon} className="size-6" />
                {label}
                {k === "plan" && home?.plan && home.plan.status !== "active" && (
                  <span className={`absolute right-[30%] top-1 size-2 rounded-full ${home.plan.status === "expired" ? "bg-red-500" : "bg-amber-500"}`} />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Home(p: AppProps & {
  L: Dict; demoAs?: string; loginHref: string; onBook: (pr: BookPreset | null) => void;
  onOpen: (s: Screen) => void; onToast: (m: string) => void;
}) {
  const { bundle, lang, L, home, today } = p;
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [rbDone, setRbDone] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const barber = (id: string) => bundle.barbers.find((b) => b.id === id);
  const svcName = (a: { serviceId: string | null; serviceName: MyAppointment["serviceName"] }) =>
    tx(bundle.services.find((s) => s.id === a.serviceId)?.name ?? a.serviceName, lang);
  const greet = p.hour < 12 ? L.morning : p.hour < 18 ? L.afternoon : L.evening;

  if (!home) {
    return (
      <div className="space-y-4">
        <div><p className="text-sm text-neutral-500">{greet}</p><h1 className="text-3xl font-bold tracking-tight">{L.hiGuest}</h1></div>
        {p.viewer.kind === "guest" ? <LoginCard L={L} href={p.loginHref} /> : <p className="rounded-2xl bg-amber-50 p-4 text-sm dark:bg-amber-950/30">{L.new_client}</p>}
        <BigButton onClick={() => p.onBook(null)}>{L.book_now}</BigButton>
      </div>
    );
  }

  const rb = rbDone ? null : home.rebook;
  function rebookNow() {
    if (!rb) return;
    setErr("");
    start(async () => {
      const r = await confirmBooking({ slug: bundle.shop.slug, as: p.demoAs, day: rb.day, minutes: rb.minutes, serviceId: rb.serviceId, barberId: rb.barberId, name: home!.me.name });
      if (r.ok) setRbDone(true);
      if (r.ok) p.onToast(`${L.booked} ${when(rb.day, rb.minutes, today, lang, L)}`);
      else setErr((L as Record<string, string>)[r.error] ?? L.error);
    });
  }
  function cancel(id: string) {
    setErr("");
    start(async () => {
      const r = await cancelAppointment({ slug: bundle.shop.slug, as: p.demoAs, id });
      setCancelId(null);
      if (!r.ok) setErr(L.cannot_cancel);
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">{greet}</p>
          <h1 className="text-3xl font-bold tracking-tight">{home.me.name.split(" ")[0]}</h1>
        </div>
        <span className="grid size-12 place-items-center rounded-full bg-amber-500 text-sm font-bold text-neutral-950">{initials(home.me.name)}</span>
      </div>

      {home.plan && <PlanCard plan={home.plan} bundle={bundle} lang={lang} L={L} onPay={() => p.onOpen({ k: "pay" })} />}

      {rb && (
        <div className="mt-4 rounded-3xl border-2 border-emerald-500/60 bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Icon name="spark" className="size-3.5" />{L.rebook_t}
          </span>
          <div className="mt-2 flex items-center gap-3">
            <Avatar b={barber(rb.barberId)} />
            <div className="min-w-0">
              <p className="text-lg font-bold capitalize leading-tight">{when(rb.day, rb.minutes, today, lang, L)}</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                {tx(bundle.services.find((s) => s.id === rb.serviceId)!.name, lang)} · {barber(rb.barberId)?.name}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            {rb.baseUpcoming
              ? fill(L.rebook_after, { d: shortDate(rb.baseDay, lang), c: String(rb.cycle), b: barber(rb.barberId)?.name ?? "" })
              : fill(L.rebook_sub, { c: String(rb.cycle), b: barber(rb.barberId)?.name ?? "" })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={pending} onClick={rebookNow} className="rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{L.rebook_ok}</button>
            <button onClick={() => p.onBook({ serviceId: rb.serviceId, barberId: rb.barberId, day: rb.day })}
              className="rounded-xl border border-emerald-600/40 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{L.rebook_other}</button>
          </div>
        </div>
      )}

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {home.upcoming.length > 0 && <Label>{L.upcoming}</Label>}
      <div className="space-y-2">
        {home.upcoming.slice(0, 4).map((a) => (
          <div key={a.id} className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <Avatar b={barber(a.barberId)} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{svcName(a)}</p>
                <p className="text-sm capitalize text-neutral-500">{dayLabel(a.day, today, lang, L)} · {toHHMM(a.minutes)} · {barber(a.barberId)?.name}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {a.viaPlan ? L.in_plan : L.confirmed}
              </span>
            </div>
            {cancelId === a.id ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 p-2 pl-3 text-sm dark:bg-red-950/30">
                <span>{L.cancel_q}</span>
                <span className="flex gap-1.5">
                  <button onClick={() => setCancelId(null)} className="rounded-lg px-2.5 py-1.5 font-medium">{L.keep}</button>
                  <button disabled={pending} onClick={() => cancel(a.id)} className="rounded-lg bg-red-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">{L.cancel_yes}</button>
                </span>
              </div>
            ) : (
              <button onClick={() => setCancelId(a.id)} className="mt-2 text-xs font-medium text-neutral-500 hover:text-red-600">{L.cancel}</button>
            )}
          </div>
        ))}
      </div>

      <BigButton className="mt-4" onClick={() => p.onBook(null)}>{L.book_now}</BigButton>

      <div className="mt-4 space-y-2">
        {home.projects.map((prj) => {
          const n = nextStepIndex(prj.steps);
          const doneN = prj.steps.filter((s) => s.done).length;
          return (
            <Row key={prj.id} onClick={() => p.onOpen({ k: "project", id: prj.id })} className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-neutral-950"><Icon name="star" /></span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{fill(L.my_project, { g: prj.goal })}</b>
                <small className="block truncate text-neutral-500">
                  {fill(L.step_of, { a: String(Math.min(doneN + 1, prj.steps.length)), b: String(prj.steps.length), n: n >= 0 ? tx(prj.steps[n].title, lang) : L.done_word })}
                </small>
                <Bar value={doneN / prj.steps.length} className="mt-1.5 h-1" />
              </span>
            </Row>
          );
        })}
        <Row onClick={() => p.onOpen({ k: "style" })}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100 dark:bg-neutral-800"><Icon name="camera" /></span>
          <span className="min-w-0 flex-1"><b className="block">{L.ideal_cut}</b><small className="text-neutral-500">{L.ideal_sub}</small></span>
          <Icon name="chevron" className="size-4 text-neutral-400" />
        </Row>
      </div>

      <Label>{L.history}</Label>
      {home.history.length === 0 ? <p className="text-sm text-neutral-500">{L.no_history}</p> : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white px-3 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {home.history.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0 truncate">
                {svcName(a)} <span className="text-neutral-500">· {barber(a.barberId)?.name}</span>
                {a.status === "no_show" && <span className="ml-1 text-xs text-red-600">({L.no_show})</span>}
              </span>
              <span className="shrink-0 text-right text-neutral-500">
                {shortDate(a.day, lang)}
                <span className="ml-2 text-xs">{a.viaPlan ? L.in_plan : formatMoney(a.price, bundle.shop.currency, lang)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
