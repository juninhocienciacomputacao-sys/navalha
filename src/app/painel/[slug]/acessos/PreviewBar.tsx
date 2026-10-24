"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopPreviewAction } from "./actions";

/** Faixa no topo enquanto o dono testa o painel como outro nível. */
export function PreviewBar({ slug, label }: { slug: string; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-violet-600 px-4 py-2 text-sm text-white">
      <span>👁️ Você está vendo o painel como <b>{label}</b>. É só um teste: nada muda para a equipe.</span>
      <button className="rounded-lg bg-white/20 px-3 py-1 font-semibold hover:bg-white/30" disabled={pending}
        onClick={() => start(async () => { await stopPreviewAction(slug); router.push(`/painel/${slug}/acessos`); router.refresh(); })}>
        {pending ? "Voltando…" : "Voltar a ver como dono"}
      </button>
    </div>
  );
}
