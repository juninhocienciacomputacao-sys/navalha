"use client";

import type { Lang } from "@/core/types";
import { toHHMM } from "@/core/types";
import { addDays } from "@/core/time";
import { formatMoney } from "@/core/money";
import { fill, locale, type Dict } from "@/i18n";
import type { BarberInfo, ShopBundle } from "@/data/types";
import type { MyPlan } from "@/modules/client-app/types";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function dayLabel(d: string, today: string, lang: Lang, L: Dict) {
  if (d === today) return L.today;
  if (d === addDays(today, 1)) return L.tomorrow;
  return new Date(d + "T12:00:00Z").toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export const shortDate = (d: string, lang: Lang) =>
  new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString(locale(lang), { day: "numeric", month: "short", timeZone: d.length === 10 ? "UTC" : undefined });
export const when = (day: string, minutes: number, today: string, lang: Lang, L: Dict) => `${dayLabel(day, today, lang, L)} ${L.at} ${toHHMM(minutes)}`;

export function Avatar({ b, size = "size-10" }: { b?: BarberInfo; size?: string }) {
  if (b?.photo) {
    // eslint-disable-next-line @next/next/no-img-element -- foto pequena guardada no banco (data URL)
    return <img src={b.photo} alt={b.name} className={`${size} shrink-0 rounded-full object-cover`} style={{ boxShadow: `0 0 0 2px ${b.color ?? "#737373"}` }} />;
  }
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full text-xs font-bold text-white`} style={{ background: b?.color ?? "#737373" }}>
      {b ? initials(b.name) : "?"}
    </span>
  );
}

export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 ${className}`}>{children}</h2>;
}

export function Back({ onClick, L }: { onClick: () => void; L: Dict }) {
  return (
    <button onClick={onClick} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
      <Icon name="back" className="size-4" />{L.back}
    </button>
  );
}

export function Row({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const cls = `flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left dark:border-neutral-800 dark:bg-neutral-900 ${onClick ? "transition hover:border-amber-400 active:scale-[.99]" : ""} ${className}`;
  return onClick ? <button onClick={onClick} className={cls}>{children}</button> : <div className={cls}>{children}</div>;
}

export function BigButton({ children, onClick, disabled, gold, className = "" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; gold?: boolean; className?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[.99] disabled:opacity-40 ${gold
        ? "bg-amber-500 text-neutral-950 hover:bg-amber-400"
        : "bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"} ${className}`}>
      {children}
    </button>
  );
}

export function Bar({ value, className = "h-1.5" }: { value: number; className?: string }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 ${className}`}>
      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(3, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function statusText(p: MyPlan, L: Dict) {
  return p.status === "expired" ? L.plan_expired : p.status === "expiring" ? L.plan_expiring : L.plan_active;
}

export function PlanCard({ plan, bundle, lang, L, onPay }: { plan: MyPlan; bundle: ShopBundle; lang: Lang; L: Dict; onPay?: () => void }) {
  const exp = plan.status === "expired";
  const soon = plan.status === "expiring";
  const left = plan.daysLeft;
  const dueText = exp ? fill(L.expired_ago, { n: String(-left) })
    : left === 0 ? L.expires_today : left === 1 ? L.expires_tomorrow : fill(L.expires_in, { n: String(left), d: shortDate(plan.periodEnd, lang) });
  return (
    <div className={`member-card relative overflow-hidden rounded-3xl p-5 text-white shadow-lg ${exp
      ? "bg-gradient-to-br from-red-600 to-red-900 shadow-red-900/20"
      : plan.rules.exclusive
        ? "bg-[conic-gradient(from_210deg_at_70%_20%,#1c1917,#44403c,#a16207,#1c1917)] shadow-amber-900/30 ring-1 ring-amber-300/30"
        : "bg-gradient-to-br from-neutral-800 to-neutral-950 shadow-neutral-900/20 ring-1 ring-white/10"}`}>
      <div aria-hidden className={`absolute -right-10 -top-12 size-40 rounded-full blur-2xl ${exp ? "bg-white/10" : "bg-amber-500/25"}`} />
      {!exp && <div aria-hidden className="member-sheen pointer-events-none absolute inset-0" />}
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">{plan.rules.exclusive ? "✦ " : ""}{L.your_plan}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${exp ? "bg-white/20" : soon ? "bg-amber-400 text-neutral-950" : "bg-emerald-400/90 text-neutral-950"}`}>
          {statusText(plan, L)}
        </span>
      </div>
      <p className="relative mt-1 text-2xl font-extrabold tracking-tight">{plan.planName}</p>
      {plan.rules.description && <p className="relative -mt-0.5 text-xs opacity-75">{plan.rules.description}</p>}
      <p className="relative text-sm opacity-85">
        {exp ? L.expired_note : plan.quotaUses === null
          ? fill(L.uses_unlimited, { n: String(plan.usesInPeriod) })
          : fill(L.uses_left, { n: String(Math.max(0, plan.quotaUses - plan.usesInPeriod)), t: String(plan.quotaUses) })}
      </p>
      {!exp && plan.quotaUses !== null && (
        <div className="relative mt-3 flex gap-1">
          {Array.from({ length: plan.quotaUses }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < plan.usesInPeriod ? "bg-white/25" : "bg-amber-400"}`} />
          ))}
        </div>
      )}
      <div className="relative mt-4 flex items-center justify-between gap-2">
        <span className="text-[13px] opacity-90">{dueText}</span>
        {onPay && (
          <button onClick={onPay} className="rounded-xl bg-amber-400 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition hover:bg-amber-300">
            {exp ? L.pay_reactivate : L.renew}
          </button>
        )}
      </div>
      {exp && <p className="relative mt-1 text-xs opacity-75">{formatMoney(plan.price, bundle.shop.currency, lang)}</p>}
    </div>
  );
}

const PATHS: Record<string, string> = {
  home: "M3 11l9-8 9 8v10h-6v-6H9v6H3z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  bag: "M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  back: "M15 18l-6-6 6-6",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z",
  image: "M3 5h18v14H3zM3 15l5-5 5 5 3-3 5 5",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  chevron: "M9 6l6 6-6 6",
  copy: "M8 8h12v12H8zM4 16V4h12",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 16a4 4 0 100-8 4 4 0 000 8z",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  sunset: "M12 4v3M5 11l1.5 1.5M19 11l-1.5 1.5M3 19h18M7 19a5 5 0 0110 0",
  users: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.9M16 4.1a3 3 0 010 5.8",
  plus: "M12 5v14M5 12h14",
};

export function Icon({ name, className = "size-5" }: { name: keyof typeof PATHS | "instagram"; className?: string }) {
  if (name === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Desenho simples do corte sugerido (prévia, sem IA). */
export function CutArt({ shape, className = "w-14" }: { shape: number; className?: string }) {
  const hair = [
    "M14 34 Q14 10 32 9 Q50 10 50 34 L48 26 Q40 18 32 18 Q22 18 16 26Z",
    "M13 32 Q12 6 32 6 Q52 6 51 32 L49 22 Q44 14 30 15 Q20 16 15 24Z",
    "M15 30 Q16 12 32 12 Q48 12 49 30 L47 24 Q32 20 17 24Z",
  ][shape % 3];
  return (
    <svg viewBox="0 0 64 76" className={className} aria-hidden="true">
      <ellipse cx="32" cy="38" rx="17" ry="21" className="fill-neutral-100 stroke-neutral-400 dark:fill-neutral-800" strokeWidth="1.5" />
      <path d={hair} className="fill-neutral-900 dark:fill-neutral-200" />
      <path d="M15 34 L15 44 M49 34 L49 44" className="stroke-neutral-400" strokeWidth="2" strokeDasharray="2 2" />
      <path d="M22 54 Q32 62 42 54" fill="none" className="stroke-neutral-900 dark:stroke-neutral-200" strokeWidth={shape === 2 ? 4 : 1.5} />
      <path d="M24 70 Q32 64 40 70" fill="none" className="stroke-neutral-400" strokeWidth="1.5" />
    </svg>
  );
}

export function LoginCard({ L, href }: { L: Dict; href: string }) {
  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600"><Icon name="lock" /></div>
      <p className="mt-3 font-semibold">{L.login_t}</p>
      <p className="mt-1 text-sm text-neutral-500">{L.login_sub}</p>
      <a href={href} className="mt-4 block rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500">{L.login_btn}</a>
    </div>
  );
}

