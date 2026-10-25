"use client";

// O celular é a identidade do cliente na barbearia: enquanto a recepção digita o WhatsApp,
// o sistema procura se o número já é de alguém e mostra quem é, para não cadastrar duas vezes.
import Link from "next/link";
import { useEffect, useState } from "react";
import { toE164 } from "@/core/phone";
import type { SameClient } from "@/modules/clients/data";
import { fmtPhone } from "@/modules/clients/ui";
import { checkPhone } from "./actions";

export function usePhoneOwner(slug: string, phone: string, exceptId?: string) {
  const [owner, setOwner] = useState<SameClient | null>(null);
  const e164 = toE164(phone);
  useEffect(() => {
    if (!e164) { setOwner(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      checkPhone(slug, e164, exceptId).then((c) => alive && setOwner(c)).catch(() => alive && setOwner(null));
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [slug, e164, exceptId]);
  // o número mudou e a resposta ainda não chegou: não mostra o dono do número anterior
  return owner && owner.phone === e164 ? owner : null;
}

/** Aviso "Este WhatsApp já é de Fulano" com o que fazer: abrir a ficha ou usar esse cliente. */
export function SamePhoneNotice({ slug, owner, onUse, className = "" }: {
  slug: string; owner: SameClient; onUse?: (c: SameClient) => void; className?: string;
}) {
  return (
    <div role="alert" className={`rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40 ${className}`}>
      <p className="font-medium text-amber-900 dark:text-amber-200">Este WhatsApp já está cadastrado</p>
      <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/80">
        O número {fmtPhone(owner.phone)} é do cliente <b>{owner.name}</b>. Cada número é de um cliente só, então não dá para cadastrar de novo.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onUse && (
          <button type="button" className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400" onClick={() => onUse(owner)}>
            Usar {owner.name.split(" ")[0]}
          </button>
        )}
        <Link href={`/painel/${slug}/clientes/${owner.id}`} className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40">
          Abrir ficha
        </Link>
      </div>
    </div>
  );
}
