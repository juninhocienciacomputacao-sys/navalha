"use client";

import { useState } from "react";
import type { ShopBundle } from "@/data/types";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { tx, type Dict } from "@/i18n";
import { CATEGORY_LABEL, type ClientCatalog, type ProductCategory } from "@/modules/shopping/types";
import ProductArt from "@/modules/shopping/ProductArt";
import { Icon } from "./ui";

/** Vitrine de lojas parceiras (módulo src/modules/shopping). Sem catálogo: "em breve". */
export default function ShopTab({ bundle, lang, L, catalog }: { bundle: ShopBundle; lang: Lang; L: Dict; catalog: ClientCatalog | null }) {
  const [cat, setCat] = useState<ProductCategory | "all">("all");
  const head = (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{L.shop_t}</h1>
      <p className="text-sm text-neutral-500">{L.shop_sub}</p>
    </div>
  );
  if (!catalog) {
    return (
      <div>
        {head}
        <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600"><Icon name="bag" className="size-7" /></div>
          <p className="mt-3 text-lg font-semibold">{L.shop_soon}</p>
          <p className="mt-1 text-sm text-neutral-500">{L.shop_soon_sub}</p>
        </div>
      </div>
    );
  }
  const list = catalog.products.filter((p) => cat === "all" || p.category === cat);
  return (
    <div>
      {head}
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
        {(["all", ...catalog.categories] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${cat === c ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"}`}>
            {c === "all" ? L.all : tx(CATEGORY_LABEL[c], lang)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {list.map((p) => (
          <a key={p.id} href={p.link} target="_blank" rel="noopener noreferrer sponsored"
            className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-3 transition hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="grid h-24 place-items-center rounded-xl bg-neutral-100 dark:bg-neutral-800"><ProductArt art={p.art} color={p.color} /></div>
            {p.featured && <span className="mt-2 self-start rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">{L.shop_featured}</span>}
            <b className="mt-1.5 line-clamp-2 text-[13px] leading-snug">{tx(p.name, lang)}</b>
            <small className="text-neutral-500">{p.storeName}{p.rating ? ` · ★ ${p.rating}` : ""}</small>
            <span className="mt-auto flex items-center justify-between pt-2">
              <b className="tabular-nums">{formatMoney(p.price, catalog.currency ?? bundle.shop.currency, lang)}</b>
              <span className="text-xs font-semibold text-amber-600">{L.shop_buy} ↗</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
