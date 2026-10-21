"use client";

// Peças de escolha: o dono toca em opções prontas em vez de digitar.
// Digitar fica só como último recurso, atrás do botão "Outro".

import { useState } from "react";

type Opt<T> = { value: T; label: React.ReactNode; hint?: React.ReactNode };

/** Uma opção entre várias (botões). */
export function Choice<T extends string | number | boolean | null>({ options, value, onChange, name, size = "md" }: {
  options: Opt<T>[]; value: T; onChange: (v: T) => void; name?: string; size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button type="button" role="radio" aria-checked={on} key={String(o.value)} onClick={() => onChange(o.value)}
            className={`chip ${on ? "chip-on" : ""} ${size === "sm" ? "px-2.5 py-1.5 text-xs" : ""}`}>
            {o.label}{o.hint != null && <span className="ml-1 text-xs text-neutral-500">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Várias opções ao mesmo tempo (marcar/desmarcar). */
export function MultiChoice<T extends string | number>({ options, value, onChange, name }: {
  options: Opt<T>[]; value: T[]; onChange: (v: T[]) => void; name?: string;
}) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button type="button" aria-pressed={on} key={String(o.value)} className={`chip ${on ? "chip-on" : ""}`}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}>
            {on ? "✓ " : ""}{o.label}{o.hint != null && <span className="ml-1 text-xs text-neutral-500">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Botões − e + para números. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, format = String, name }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (n: number) => React.ReactNode; name?: string;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
  return (
    <div className="inline-flex items-center gap-1" aria-label={name}>
      <button type="button" className="chip h-10 w-10 p-0 text-lg" aria-label="Diminuir" disabled={value <= min} onClick={() => set(value - step)}>−</button>
      <span className="min-w-16 text-center font-semibold tabular-nums">{format(value)}</span>
      <button type="button" className="chip h-10 w-10 p-0 text-lg" aria-label="Aumentar" disabled={value >= max} onClick={() => set(value + step)}>+</button>
    </div>
  );
}

/** Texto escolhido de uma lista pronta; "Outro" abre um campo só se nada servir. */
export function PresetText({ presets, value, onChange, otherPlaceholder = "Escreva", name }: {
  presets: readonly string[]; value: string; onChange: (v: string) => void; otherPlaceholder?: string; name?: string;
}) {
  const custom = value !== "" && !presets.includes(value);
  const [other, setOther] = useState(custom);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button type="button" role="radio" aria-checked={!other && value === p} key={p}
            className={`chip ${!other && value === p ? "chip-on" : ""}`} onClick={() => { setOther(false); onChange(p); }}>{p}</button>
        ))}
        <button type="button" className={`chip ${other ? "chip-on" : ""}`} onClick={() => { setOther(true); if (!custom) onChange(""); }}>Outro…</button>
      </div>
      {other && <input className="input" autoFocus value={value} placeholder={otherPlaceholder} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** Número escolhido de degraus prontos; "Outro" troca para botões − e +. */
export function PresetNumber({ presets, value, onChange, format = String, min = 0, max = 99999, step = 1, name, allowNone, noneLabel = "Nenhum" }: {
  presets: number[]; value: number | null; onChange: (v: number | null) => void; format?: (n: number) => React.ReactNode;
  min?: number; max?: number; step?: number; name?: string; allowNone?: boolean; noneLabel?: string;
}) {
  const custom = value != null && !presets.includes(value);
  const [other, setOther] = useState(custom);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
        {allowNone && (
          <button type="button" role="radio" aria-checked={!other && value == null} className={`chip ${!other && value == null ? "chip-on" : ""}`}
            onClick={() => { setOther(false); onChange(null); }}>{noneLabel}</button>
        )}
        {presets.map((p) => (
          <button type="button" role="radio" aria-checked={!other && value === p} key={p} className={`chip tabular-nums ${!other && value === p ? "chip-on" : ""}`}
            onClick={() => { setOther(false); onChange(p); }}>{format(p)}</button>
        ))}
        <button type="button" className={`chip ${other ? "chip-on" : ""}`}
          onClick={() => { setOther(true); if (value == null) onChange(presets[0] ?? min); }}>Outro…</button>
      </div>
      {other && value != null && <Stepper value={value} onChange={onChange} min={min} max={max} step={step} format={format} />}
    </div>
  );
}

/** Lista suspensa (para listas longas, como horários). */
export function SelectList<T extends string>({ options, value, onChange, name, className = "" }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; name?: string; className?: string;
}) {
  return (
    <select aria-label={name} className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Cores prontas para escolher. */
export function ColorChoice({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button type="button" role="radio" aria-checked={value === c} aria-label={c} key={c} onClick={() => onChange(c)}
          className={`h-9 w-9 rounded-full border-2 ${value === c ? "border-neutral-900 ring-2 ring-amber-500 dark:border-white" : "border-transparent"}`}
          style={{ background: c }} />
      ))}
    </div>
  );
}

/** Liga/desliga. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center gap-3 text-left text-sm">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-amber-500" : "bg-neutral-300 dark:bg-neutral-700"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
