"use client";

// Gráficos em SVG feitos à mão (sem biblioteca), com dica ao passar o mouse ou tocar.
import { useState } from "react";

export interface Series {
  id: string;
  name: string;
  color: string;
  values: number[];
}

const W = 640;
const PAD = { l: 52, r: 12, t: 12, b: 26 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Linhas de várias séries no mesmo eixo, com destaque de uma delas e dica por semana. */
export function LineChart({ labels, series, format, height = 220, highlight, max }: {
  labels: string[]; series: Series[]; format: (n: number) => string; height?: number; highlight?: string | null; max?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const top = max ?? niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full touch-pan-y select-none" role="img"
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="fill-neutral-500 text-[11px]">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          (n <= 8 || i % 2 === (n - 1) % 2) && (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-neutral-500 text-[11px]">{l}</text>
          )
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-neutral-400 dark:stroke-neutral-600" strokeWidth={1} />}
        {series.map((s) => {
          const dim = highlight && highlight !== s.id;
          const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return (
            <g key={s.id} opacity={dim ? 0.18 : 1}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={highlight === s.id ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (hover === i || i === n - 1) && (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} className="stroke-white dark:stroke-neutral-900" strokeWidth={2} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-neutral-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95"
          style={x(hover) > W / 2 ? { right: `${((W - x(hover)) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }}>
          <p className="mb-1 font-medium text-neutral-500">{labels[hover]}</p>
          {[...series].sort((a, b) => b.values[hover] - a.values[hover]).map((s) => (
            <p key={s.id} className="flex items-center justify-between gap-3 tabular-nums">
              <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
              <b>{format(s.values[hover])}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras de uma série (ex.: atendimentos por semana de um barbeiro). */
export function BarChart({ labels, values, color, format, height = 140, goal }: {
  labels: string[]; values: number[]; color: string; format: (n: number) => string; height?: number; goal?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const Wb = 320;
  const pad = { l: 4, r: 4, t: 18, b: 20 };
  const top = niceMax(Math.max(goal ?? 0, ...values));
  const n = values.length;
  const slot = (Wb - pad.l - pad.r) / n;
  const bw = Math.max(4, slot - 6);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const base = H - pad.b;
  return (
    <svg viewBox={`0 0 ${Wb} ${H}`} className="block w-full select-none" role="img" onPointerLeave={() => setHover(null)}>
      <line x1={pad.l} x2={Wb - pad.r} y1={base} y2={base} className="stroke-neutral-200 dark:stroke-neutral-800" />
      {goal !== undefined && goal > 0 && (
        <g>
          <line x1={pad.l} x2={Wb - pad.r} y1={y(goal)} y2={y(goal)} className="stroke-neutral-500" strokeDasharray="4 3" />
          <text x={Wb - pad.r} y={y(goal) - 3} textAnchor="end" className="fill-neutral-500 text-[10px]">meta {format(goal)}</text>
        </g>
      )}
      {values.map((v, i) => {
        const cx = pad.l + i * slot + slot / 2;
        const h = Math.max(0, base - y(v));
        const r = Math.min(4, bw / 2, h);
        const x0 = cx - bw / 2;
        const yy = base - h;
        const path = h <= 0 ? "" : `M${x0},${base} L${x0},${yy + r} Q${x0},${yy} ${x0 + r},${yy} L${x0 + bw - r},${yy} Q${x0 + bw},${yy} ${x0 + bw},${yy + r} L${x0 + bw},${base} Z`;
        const last = i === n - 1;
        return (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
            <rect x={pad.l + i * slot} y={pad.t - 16} width={slot} height={H - pad.t + 16} fill="transparent" />
            {path && <path d={path} fill={color} opacity={hover === null ? (last ? 1 : 0.7) : hover === i ? 1 : 0.4} />}
            {(hover === i || (hover === null && last)) && (
              <text x={cx} y={Math.max(11, yy - 4)} textAnchor="middle" className="fill-neutral-800 text-[11px] font-semibold dark:fill-neutral-100">{format(v)}</text>
            )}
            {(i === 0 || last || hover === i) && (
              <text x={cx} y={H - 6} textAnchor={i === 0 ? "start" : last ? "end" : "middle"} dx={i === 0 ? -bw / 2 : last ? bw / 2 : 0}
                className="fill-neutral-500 text-[10px]">{labels[i]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
