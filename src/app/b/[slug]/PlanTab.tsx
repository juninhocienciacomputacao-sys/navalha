"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ShopBundle } from "@/data/types";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { fill, tx, type Dict } from "@/i18n";
import type { ClientHome, MyPlan } from "@/modules/client-app/types";
import { checkPayment, payPlan } from "./actions";
import { Bar, BigButton, Icon, Label, LoginCard, PlanCard, shortDate, statusText } from "./ui";
import { rulesOf } from "@/core/plan-rules";
import { ruleLines } from "@/modules/plans/describe";

interface Common { bundle: ShopBundle; lang: Lang; L: Dict; today: string; demoAs?: string }

export default function PlanTab({ bundle, lang, L, home, loginHref, onPay, onBook }: Common & {
  home: ClientHome | null; loginHref: string; onPay: () => void; onBook: () => void;
}) {
  const money = (v: number) => formatMoney(v, bundle.shop.currency, lang);
  const barberName = (id: string) => bundle.barbers.find((b) => b.id === id)?.name;
  if (!home) {
    return (<div><h1 className="mb-4 text-2xl font-bold tracking-tight">{L.tab_plan}</h1><LoginCard L={L} href={loginHref} /></div>);
  }
  const plan = home.plan;
  if (!plan) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{L.tab_plan}</h1>
        <p className="mt-4 font-semibold">{L.no_plan}</p>
        <p className="text-sm text-neutral-500">{L.no_plan_sub}</p>
        <div className="mt-3 space-y-2">
          {/* plano exclusivo não aparece aqui: só a equipe oferece */}
          {bundle.plans.filter((p) => !rulesOf(p).exclusive).map((p) => {
            const r = rulesOf(p);
            const lines = ruleLines(r, lang, barberName);
            return (
              <div key={p.id} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <b className="block">{p.name}</b>
                    {r.description && <small className="block text-neutral-600 dark:text-neutral-300">{r.description}</small>}
                    <small className="text-neutral-500">
                      {p.quotaUses === null ? L.unlimited : `${p.quotaUses}×`} · {fill(L.per_cycle, { n: String(p.periodDays) })}
                    </small>
                  </span>
                  <b className="shrink-0 tabular-nums">{money(p.price)}</b>
                </div>
                {lines.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {lines.map((l) => <li key={l} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{l}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <BigButton className="mt-4" onClick={onBook}>{L.book_now}</BigButton>
      </div>
    );
  }
  const exp = plan.status === "expired";
  const covered = bundle.services.filter((s) => plan.serviceIds.includes(s.id));
  const stCls = exp ? "bg-red-500/15 text-red-700 dark:text-red-400" : plan.status === "expiring" ? "bg-amber-500/20 text-amber-800 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{L.tab_plan}</h1>
      <PlanCard plan={plan} bundle={bundle} lang={lang} L={L} />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">{L.your_plan}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${stCls}`}>{statusText(plan, L)}</span>
          <p className="mt-1 text-xs text-neutral-500">{exp ? fill(L.expired_ago, { n: String(-plan.daysLeft) }) : fill(L.plan_valid, { d: shortDate(plan.periodEnd, lang) })}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">{L.plan_uses}</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {plan.usesInPeriod}<span className="text-sm font-normal text-neutral-500"> / {plan.quotaUses ?? "∞"}</span>
          </p>
          <Bar value={plan.quotaUses ? plan.usesInPeriod / plan.quotaUses : 0.15} className="mt-2 h-1.5" />
        </div>
      </div>

      {exp ? (
        <BigButton gold className="mt-4" onClick={onPay}>{L.pay_reactivate} · {money(plan.price)}</BigButton>
      ) : (
        <>
          {plan.status === "expiring" && <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">{L.expiring_note}</p>}
          <button onClick={onPay} className={`mt-3 w-full rounded-2xl border py-3 text-sm font-semibold ${plan.status === "expiring" ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-300 dark:border-neutral-700"}`}>
            {L.renew_early} · {money(plan.price)}
          </button>
        </>
      )}

      <Label>{L.plan_benefits}</Label>
      <ul className="space-y-1.5 rounded-2xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <li className="flex items-center gap-2"><Icon name="check" className="size-4 text-emerald-600" />
          {plan.quotaUses === null ? L.unlimited : `${plan.quotaUses}×`} · {fill(L.per_cycle, { n: String(plan.periodDays) })}
        </li>
        {covered.map((s) => <li key={s.id} className="flex items-center gap-2"><Icon name="check" className="size-4 text-emerald-600" />{tx(s.name, lang)}</li>)}
      </ul>

      {ruleLines(plan.rules, lang, barberName).length > 0 && (
        <>
          <Label>{L.plan_rules_t}</Label>
          <ul className="space-y-1.5 rounded-2xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            {ruleLines(plan.rules, lang, barberName).map((l) => <li key={l} className="flex items-center gap-2"><Icon name="clock" className="size-4 text-amber-600" />{l}</li>)}
          </ul>
        </>
      )}

      <Label>{L.payments}</Label>
      {home.payments.length === 0 ? <p className="text-sm text-neutral-500">{L.no_payments}</p> : (
        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white px-3 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {home.payments.map((x) => (
            <li key={x.id} className="flex items-center justify-between py-2.5 text-sm">
              <span>{shortDate(x.at, lang)} · {x.method === "pix" ? L.pix : x.method === "card" ? L.card : "💵"}</span>
              <span className="tabular-nums">
                {money(x.amount)}{" "}
                <span className={x.status === "paid" ? "text-emerald-600" : x.status === "pending" ? "text-amber-600" : "text-red-600"}>
                  {x.status === "paid" ? "✓" : (L as Record<string, string>)[`pay_status_${x.status}`]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** QR decorativo (demonstração). No sistema real o provedor devolve o Pix copia e cola. */
function FakeQr({ seed }: { seed: string }) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const n = 25;
  const cells: [number, number][] = [];
  const finder = (i: number, j: number) => (i < 7 && j < 7) || (i >= n - 7 && j < 7) || (i < 7 && j >= n - 7);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    if (!finder(i, j) && (h >>> 0) % 2) cells.push([i, j]);
  }
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="#111" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#111" />
    </g>
  );
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="mx-auto size-48 rounded-xl bg-white" role="img" aria-label="QR Code Pix">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      {cells.map(([i, j]) => <rect key={`${i}.${j}`} x={i} y={j} width="1.02" height="1.02" fill="#111" />)}
      {eye(0, 0)}{eye(n - 7, 0)}{eye(0, n - 7)}
    </svg>
  );
}

type PayState =
  | { k: "form" } | { k: "paying" } | { k: "paid"; periodEnd: string }
  | { k: "pending"; paymentId: string; pixCode: string | null; checkoutUrl: string | null; msg?: string };

export function PayScreen({ bundle, lang, L, demoAs, plan, onBack, onBook, onHome }: Common & {
  plan: MyPlan; onBack: () => void; onBook: () => void; onHome: () => void;
}) {
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [st, setSt] = useState<PayState>({ k: "form" });
  const router = useRouter();
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const demo = demoAs !== undefined;
  const money = (v: number) => formatMoney(v, bundle.shop.currency, lang);
  const demoPix = `00020126580014BR.GOV.BCB.PIX0136navalha-${bundle.shop.slug}-${plan.subscriptionId}5204000053039865406${plan.price.toFixed(2)}5802BR`;

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }, () => {});
  };

  function pay() {
    setErr("");
    if (demo) setSt({ k: "paying" });
    start(async () => {
      const [r] = await Promise.all([payPlan({ slug: bundle.shop.slug, as: demoAs, method }), new Promise((ok) => setTimeout(ok, demo ? 1400 : 0))]);
      if (!r.ok) { setErr((L as Record<string, string>)[r.error] ?? L.error); setSt({ k: "form" }); return; }
      if (r.mode === "demo") { setSt({ k: "paid", periodEnd: r.periodEnd }); router.refresh(); }
      else setSt({ k: "pending", paymentId: r.paymentId, pixCode: r.pixCode, checkoutUrl: r.checkoutUrl });
    });
  }
  function check() {
    if (st.k !== "pending") return;
    start(async () => {
      const s = await checkPayment({ slug: bundle.shop.slug, as: demoAs, paymentId: st.paymentId });
      if (s === "paid") { setSt({ k: "paid", periodEnd: plan.periodEnd }); router.refresh(); }
      else setSt({ ...st, msg: L.pay_still_pending });
    });
  }

  if (st.k === "paying") {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-center">
        <div><div className="mx-auto size-12 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" /><p className="mt-4 text-neutral-500">{L.paying}</p></div>
      </div>
    );
  }
  if (st.k === "paid") {
    return (
      <div className="pt-6">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"><Icon name="check" className="size-8" /></div>
          <h1 className="mt-4 text-2xl font-bold">{L.paid_t}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-neutral-500">{fill(L.paid_sub, { p: plan.planName, d: shortDate(st.periodEnd, lang) })}</p>
        </div>
        <div className="mt-5"><PlanCard plan={plan} bundle={bundle} lang={lang} L={L} /></div>
        <div className="mt-5 space-y-2">
          <BigButton gold onClick={onBook}>{L.book_now}</BigButton>
          <button className="w-full py-2 text-sm font-medium text-neutral-500" onClick={onHome}>{L.back_home}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="-ml-1 mb-3 inline-flex items-center gap-1 px-1 py-1 text-sm text-neutral-500"><Icon name="back" className="size-4" />{L.back}</button>
      <h1 className="text-2xl font-bold tracking-tight">{L.pay_t}</h1>
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <span><b className="block">{plan.planName}</b><small className="text-neutral-500">{fill(L.per_cycle, { n: String(plan.periodDays) })}</small></span>
        <b className="text-xl tabular-nums">{money(plan.price)}</b>
      </div>

      {st.k === "form" && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-200/70 p-1 dark:bg-neutral-800">
            {(["pix", "card"] as const).map((m) => (
              <button key={m} onClick={() => setMethod(m)}
                className={`rounded-xl py-2 text-sm font-semibold ${method === m ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-500"}`}>
                {m === "pix" ? L.pix : L.card}
              </button>
            ))}
          </div>

          {demo && method === "pix" && (
            <div className="mt-4 space-y-3">
              <FakeQr seed={demoPix} />
              <p className="text-center text-[11px] text-neutral-500">{L.qr_demo}</p>
              <p className="break-all rounded-xl bg-neutral-100 p-2.5 font-mono text-[10.5px] text-neutral-500 dark:bg-neutral-900">{demoPix}</p>
              <button onClick={() => copy(demoPix)} className="w-full rounded-2xl border border-neutral-300 py-2.5 text-sm font-semibold dark:border-neutral-700">
                {copied ? L.copied : L.copy_code}
              </button>
            </div>
          )}
          {demo && method === "card" && (
            <div className="mt-4 space-y-2">
              <label className="block text-xs text-neutral-500">{L.card_num}
                <input className="input mt-1 font-mono" readOnly value="4111 1111 1111 1111" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-neutral-500">{L.card_exp}<input className="input mt-1 font-mono" readOnly value="12/29" /></label>
                <label className="block text-xs text-neutral-500">{L.card_cvv}<input className="input mt-1 font-mono" readOnly value="123" /></label>
              </div>
              <p className="text-xs text-neutral-500">{L.card_demo}</p>
            </div>
          )}
          {!demo && method === "card" && (
            <p className="mt-4 flex gap-2 rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              <Icon name="shield" className="size-5 shrink-0" />{L.pay_card_safe}
            </p>
          )}

          <p className="mt-4 text-sm text-neutral-500">{L.pay_sub}</p>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <BigButton gold className="mt-3" disabled={pending} onClick={pay}>
            {demo ? L.demo_paid_btn : method === "pix" ? L.pay_create_pix : L.pay_create_card}
          </BigButton>
        </>
      )}

      {st.k === "pending" && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
            <p className="font-semibold">{L.pay_pending_t}</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {st.pixCode || st.checkoutUrl ? L.pay_pending_sub : L.pay_no_provider}
            </p>
          </div>
          {st.pixCode && (
            <>
              <p className="break-all rounded-xl bg-neutral-100 p-2.5 font-mono text-[10.5px] dark:bg-neutral-900">{st.pixCode}</p>
              <button onClick={() => copy(st.pixCode!)} className="w-full rounded-2xl border border-neutral-300 py-2.5 text-sm font-semibold dark:border-neutral-700">{copied ? L.copied : L.copy_code}</button>
            </>
          )}
          {st.checkoutUrl && <a href={st.checkoutUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-amber-500 py-3 text-center font-semibold text-neutral-950">{L.pay_open}</a>}
          {st.msg && <p className="text-sm text-neutral-500">{st.msg}</p>}
          <BigButton disabled={pending} onClick={check}>{L.pay_check}</BigButton>
        </div>
      )}
    </div>
  );
}
