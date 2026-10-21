import { formatMoney } from "@/core/money";
import type { Lang } from "@/core/types";

interface Point { label: string; month: string; revenue: number; expenses: number }

const W = 600, H = 240, PAD_L = 56, PAD_R = 8, PAD_T = 22, PAD_B = 28;

/** Barras agrupadas de receita e despesa por mês, em SVG feito à mão. Cada mês é um link. */
export default function RevenueChart({ points, currency, lang, selected, hrefBase }: {
  points: Point[]; currency: string; lang: Lang; selected: string; hrefBase: string;
}) {
  const money = (n: number) => formatMoney(Math.round(n), currency, lang);
  const max = niceMax(Math.max(1, ...points.flatMap((p) => [p.revenue, p.expenses])));
  const plotH = H - PAD_T - PAD_B;
  const slot = (W - PAD_L - PAD_R) / points.length;
  const barW = Math.min(28, slot / 3);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-neutral-600 dark:text-neutral-300">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2a78d6] dark:bg-[#3987e5]" />Receita</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#eb6834] dark:bg-[#d95926]" />Despesa</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Receita e despesa dos últimos 6 meses">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
            <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">{short(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD_L + slot * i + slot / 2;
          const on = p.month === selected;
          const bar = (v: number, x: number, cls: string) => {
            const h = Math.max(0, PAD_T + plotH - y(v));
            const r = Math.min(4, h / 2, barW / 2);
            // topo arredondado, base reta no eixo
            const top = y(v);
            const d = h <= 0 ? "" : `M${x},${PAD_T + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD_T + plotH} Z`;
            return <path d={d} className={cls} />;
          };
          return (
            <a key={p.month} href={hrefBase + p.month} className="group">
              <title>{`${p.label}: receita ${money(p.revenue)}, despesa ${money(p.expenses)}, lucro ${money(p.revenue - p.expenses)}`}</title>
              <rect x={cx - slot / 2} y={PAD_T} width={slot} height={plotH + PAD_B} className={on ? "fill-amber-500/10" : "fill-transparent group-hover:fill-neutral-500/10"} />
              {bar(p.revenue, cx - barW - 1, "fill-[#2a78d6] dark:fill-[#3987e5]")}
              {bar(p.expenses, cx + 1, "fill-[#eb6834] dark:fill-[#d95926]")}
              {on && (
                <>
                  <text x={cx - barW / 2 - 1} y={y(p.revenue) - 5} textAnchor="middle" className="fill-neutral-700 text-[10px] font-semibold dark:fill-neutral-200">{short(p.revenue)}</text>
                  <text x={cx + barW / 2 + 1} y={y(p.expenses) - 5} textAnchor="middle" className="fill-neutral-700 text-[10px] font-semibold dark:fill-neutral-200">{short(p.expenses)}</text>
                </>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className={`text-[11px] ${on ? "fill-neutral-900 font-semibold dark:fill-neutral-100" : "fill-neutral-500"}`}>{p.label}</text>
            </a>
          );
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} className="stroke-neutral-300 dark:stroke-neutral-700" strokeWidth={1} />
      </svg>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-neutral-500">Ver os números</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className="text-neutral-500"><tr><th className="py-1 font-medium">Mês</th><th className="text-right font-medium">Receita</th><th className="text-right font-medium">Despesa</th><th className="text-right font-medium">Lucro</th></tr></thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1">{p.label}</td><td className="text-right">{money(p.revenue)}</td><td className="text-right">{money(p.expenses)}</td>
                  <td className={`text-right ${p.revenue - p.expenses < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{money(p.revenue - p.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
