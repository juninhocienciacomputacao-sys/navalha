"use client";

import { useEffect } from "react";

/** Janela por cima da tela (no celular sobe de baixo). Fecha com Esc ou tocando fora. */
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-neutral-900 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg px-2 text-xl leading-none text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">{children}</p>;
}
