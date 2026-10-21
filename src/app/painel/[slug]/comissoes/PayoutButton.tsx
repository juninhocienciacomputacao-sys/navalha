"use client";

import { useState, useTransition } from "react";
import type { PayoutPeriod } from "@/core/finance";
import { setPayoutAction } from "./actions";

export default function PayoutButton({ slug, barberId, kind, start, paid, disabled }: {
  slug: string; barberId: string; kind: PayoutPeriod; start: string; paid: boolean; disabled: boolean;
}) {
  const [pending, go] = useTransition();
  const [error, setError] = useState("");
  const click = () => go(async () => {
    const r = await setPayoutAction(slug, { barberId, kind, start, paid: !paid });
    setError(r.ok ? "" : r.error);
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={click} disabled={pending || disabled}
        className={paid ? "chip text-xs" : "btn px-3 py-1.5 text-xs"}>
        {pending ? "Salvando…" : paid ? "Desfazer pagamento" : "Marcar como pago"}
      </button>
      {disabled && <span className="text-xs text-neutral-500">Disponível no último dia do período.</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
