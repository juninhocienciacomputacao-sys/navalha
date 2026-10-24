"use client";

import { useRef, useState } from "react";
import { BarberFace } from "@/components/BarberFace";

const SIZE = 256;

/** Recorta o centro da imagem em quadrado e reduz para 256 px (JPEG), para ficar leve. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("bad_image"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("bad_image");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({ name, color, value, onChange, onError }: {
  name: string; color: string; value: string | null; onChange: (v: string | null) => void; onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <BarberFace name={name} color={color} photo={value} className="h-16 w-16 text-lg" />
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Escolher foto"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (!file.type.startsWith("image/")) return onError("Escolha um arquivo de imagem.");
          setBusy(true);
          onError("");
          try {
            onChange(await shrink(file));
          } catch {
            onError("Não deu para abrir essa foto. Tente outra.");
          } finally {
            setBusy(false);
          }
        }} />
      <button type="button" className="chip" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Preparando…" : value ? "Trocar foto" : "Enviar foto"}
      </button>
      {value && <button type="button" className="chip" onClick={() => onChange(null)}>Remover foto</button>}
    </div>
  );
}
