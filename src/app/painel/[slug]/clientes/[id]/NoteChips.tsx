"use client";

import { useState } from "react";
import { MultiChoice } from "@/components/pick";

/** Separa um texto salvo em itens ("Degradê, Sem risco; ..."). */
const split = (v: string) => v.split(/\s*(?:[;\n]|,\s)\s*/).map((s) => s.trim()).filter(Boolean);

/**
 * Anotação feita tocando em opções prontas (várias ao mesmo tempo).
 * O que não estiver na lista vai para "Outro…", o único campo de digitar.
 * Salva como texto simples ("Degradê, Sem risco, …"), igual ao que já existia.
 */
export default function NoteChips({ presets, value, onChange, name, otherPlaceholder }: {
  presets: readonly string[]; value: string; onChange: (v: string) => void; name: string; otherPlaceholder?: string;
}) {
  const [init] = useState(() => {
    const picked: string[] = [];
    const rest: string[] = [];
    for (const t of split(value)) {
      const p = presets.find((x) => x.toLowerCase() === t.toLowerCase());
      if (p) { if (!picked.includes(p)) picked.push(p); } else rest.push(t);
    }
    return { picked, rest: rest.join(", ") };
  });
  const [picked, setPicked] = useState(init.picked);
  const [extra, setExtra] = useState(init.rest);
  const [other, setOther] = useState(init.rest !== "");
  const emit = (p: string[], e: string) => onChange([...presets.filter((x) => p.includes(x)), e.trim()].filter(Boolean).join(", "));

  return (
    <div className="space-y-2">
      <MultiChoice name={name} options={[...presets].map((p) => ({ value: p, label: p }))} value={picked}
        onChange={(p) => { setPicked(p); emit(p, extra); }} />
      <button type="button" aria-pressed={other} className={`chip ${other ? "chip-on" : ""}`}
        onClick={() => { const on = !other; setOther(on); if (!on) { setExtra(""); emit(picked, ""); } }}>
        {other ? "✓ " : ""}Outro…
      </button>
      {other && (
        <input className="input" autoFocus={init.rest === ""} value={extra} maxLength={500} placeholder={otherPlaceholder ?? "Escreva"}
          onChange={(e) => { setExtra(e.target.value); emit(picked, e.target.value); }} />
      )}
    </div>
  );
}
