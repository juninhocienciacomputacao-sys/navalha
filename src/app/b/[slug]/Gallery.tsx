"use client";

import { useState } from "react";
import type { ShopBundle } from "@/data/types";
import type { Lang } from "@/core/types";
import { tx, type Dict } from "@/i18n";
import { KIND_LABEL, type LookKind } from "@/modules/gallery/defaults";
import { lookImage, type Look } from "@/modules/gallery/types";
import type { BookPreset } from "./Booking";
import { Back, BigButton, Icon } from "./ui";

/** Galeria de cortes e barbas: o cliente olha, escolhe e já agenda com o modelo. */
export default function GalleryScreen({ bundle, lang, L, looks, initialKind = "cut", initialId, onBack, onBook }: {
  bundle: ShopBundle; lang: Lang; L: Dict; looks: Look[]; initialKind?: LookKind; initialId?: string;
  onBack: () => void; onBook: (pr: BookPreset) => void;
}) {
  const kinds = (["cut", "beard"] as LookKind[]).filter((k) => looks.some((l) => l.kind === k));
  const [kind, setKind] = useState<LookKind>(kinds.includes(initialKind) ? initialKind : kinds[0] ?? "cut");
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const slug = bundle.shop.slug;
  const list = looks.filter((l) => l.kind === kind);
  const open = looks.find((l) => l.id === openId);

  if (open) {
    const same = looks.filter((l) => l.kind === open.kind);
    const i = same.indexOf(open);
    const svc = bundle.services.find((s) => s.id === open.serviceId);
    const step = (d: number) => setOpenId(same[(i + d + same.length) % same.length].id);
    const src = lookImage(slug, open);
    return (
      <div>
        <Back onClick={() => setOpenId(null)} L={L} />
        <div className="relative overflow-hidden rounded-3xl bg-neutral-200 shadow-sm dark:bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element -- foto do dono ou desenho padrão */}
          {src && <img src={src} alt={tx(open.name, lang)} className="aspect-[4/5] w-full object-cover" />}
          {same.length > 1 && (
            <>
              <button onClick={() => step(-1)} aria-label={L.gal_prev}
                className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-neutral-900 shadow backdrop-blur">
                <Icon name="back" className="size-5" />
              </button>
              <button onClick={() => step(1)} aria-label={L.gal_next}
                className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-neutral-900 shadow backdrop-blur">
                <Icon name="chevron" className="size-5" />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">{i + 1}/{same.length}</span>
            </>
          )}
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">{tx(KIND_LABEL[open.kind], lang)}</p>
        <h1 className="text-2xl font-bold tracking-tight">{tx(open.name, lang)}</h1>
        {open.desc && <p className="mt-1 text-[15px] text-neutral-600 dark:text-neutral-300">{tx(open.desc, lang)}</p>}
        {svc && <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-neutral-200/70 px-2.5 py-1 text-xs font-medium dark:bg-neutral-800"><Icon name="clock" className="size-3.5" />{tx(svc.name, lang)} · {svc.durationMin} {L.min}</p>}
        <BigButton gold className="mt-5" onClick={() => onBook({ serviceId: svc?.id, look: { name: tx(open.name, lang), img: src } })}>{L.gal_want}</BigButton>
        <p className="mt-2 text-center text-xs text-neutral-500">{L.gal_want_sub}</p>
      </div>
    );
  }

  return (
    <div>
      <Back onClick={onBack} L={L} />
      <h1 className="text-2xl font-bold tracking-tight">{L.gal_t}</h1>
      <p className="mt-1 text-sm text-neutral-500">{L.gal_sub}</p>
      {kinds.length > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-200/70 p-1 dark:bg-neutral-800">
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`rounded-xl py-2 text-sm font-semibold transition ${kind === k ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-950 dark:text-white" : "text-neutral-500"}`}>
              {tx(KIND_LABEL[k], lang)}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? <p className="py-10 text-center text-sm text-neutral-500">{L.gal_empty}</p> : (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {list.map((l) => <li key={l.id}><LookCard slug={slug} look={l} lang={lang} onClick={() => { setOpenId(l.id); window.scrollTo({ top: 0 }); }} /></li>)}
        </ul>
      )}
    </div>
  );
}

export function LookCard({ slug, look, lang, onClick, className = "" }: { slug: string; look: Look; lang: Lang; onClick: () => void; className?: string }) {
  const src = lookImage(slug, look);
  return (
    <button onClick={onClick} className={`group block w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left transition active:scale-[.98] dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
      <span className="block aspect-[4/5] overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-105" />}
      </span>
      <span className="block truncate px-2.5 py-2 text-sm font-semibold">{tx(look.name, lang)}</span>
    </button>
  );
}

/** Faixa na tela inicial: alguns modelos e o atalho para a galeria. */
export function GalleryStrip({ bundle, lang, L, looks, onOpen }: {
  bundle: ShopBundle; lang: Lang; L: Dict; looks: Look[]; onOpen: (kind: LookKind, id?: string) => void;
}) {
  if (!looks.length) return null;
  const first = [...looks.filter((l) => l.kind === "cut").slice(0, 4), ...looks.filter((l) => l.kind === "beard").slice(0, 2)];
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{L.gal_t}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{L.gal_home_sub}</p>
        </div>
        <button onClick={() => onOpen("cut")} className="shrink-0 text-sm font-semibold text-amber-600 dark:text-amber-400">{L.gal_all}</button>
      </div>
      <ul className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {first.map((l) => (
          <li key={l.id} className="w-28 shrink-0 snap-start">
            <LookCard slug={bundle.shop.slug} look={l} lang={lang} onClick={() => onOpen(l.kind, l.id)} className="[&>span:last-child]:text-xs" />
          </li>
        ))}
      </ul>
    </section>
  );
}
