// Pedaços de tela usados por Clientes e Planos (servem no servidor e no navegador).
import type { Lang } from "@/core/types";
import { locale } from "@/i18n";

/** "2026-10-20" → "20/10/2026" (ou o formato do idioma). */
export const fmtDay = (day: string, lang: Lang, short = false) =>
  new Date(day + "T12:00:00Z").toLocaleDateString(locale(lang), short ? { day: "2-digit", month: "2-digit", timeZone: "UTC" } : { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Telefone +5511988887777 → (11) 98888-7777; outros países ficam como estão. */
export function fmtPhone(e164: string) {
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");

export function Avatar({ name, color, size = "md" }: { name: string; color?: string | null; size?: "md" | "lg" }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs"}`}
      style={{ background: color ?? "#737373" }} aria-hidden>
      {initials(name)}
    </span>
  );
}

const TONES = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

/** Situação do plano para mostrar ao lado do nome. */
export function planBadge(left: number, alertDays: number): { tone: Tone; label: string } {
  if (left < 0) return { tone: "bad", label: `Vencido há ${-left} d` };
  if (left === 0) return { tone: "warn", label: "Vence hoje" };
  if (left <= alertDays) return { tone: "warn", label: `Vence em ${left} d` };
  return { tone: "ok", label: `Em dia · ${left} d` };
}

export function WhatsAppLink({ href, label = "WhatsApp", compact }: { href: string; label?: string; compact?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Abrir conversa no WhatsApp"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950 ${compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      {label}
    </a>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "warn" }) {
  return (
    <div className="card">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
