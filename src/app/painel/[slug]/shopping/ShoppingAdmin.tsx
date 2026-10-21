"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Lang } from "@/core/types";
import { formatMoney } from "@/core/money";
import { estimateReferralCommission, SHOP_SHARE } from "@/core/shopping";
import { tx } from "@/i18n";
import { CATEGORY_LABEL, type PartnerProduct, type PartnerStore, type ProductCategory } from "@/modules/shopping/types";
import ProductArt from "@/modules/shopping/ProductArt";
import { featureProductAction, toggleStoreAction } from "./actions";
import { PresetNumber } from "@/components/pick";

const BUYER_STEPS = [2, 5, 8, 10, 15, 20, 30];

export default function ShoppingAdmin({ slug, currency, lang, stores, products, enabled, featured, clients, canEdit }: {
  slug: string; currency: string; lang: Lang; stores: PartnerStore[]; products: PartnerProduct[];
  enabled: Record<string, boolean>; featured: string[]; clients: number; canEdit: boolean;
}) {
  const money = (n: number) => formatMoney(n, currency, lang);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [on, setOn] = useOptimistic(enabled, (s, p: { id: string; v: boolean }) => ({ ...s, [p.id]: p.v }));
  const [stars, setStars] = useOptimistic(featured, (s, p: { id: string; v: boolean }) => (p.v ? [...s, p.id] : s.filter((x) => x !== p.id)));
  const [cat, setCat] = useState<ProductCategory | "all">("all");
  const [buyers, setBuyers] = useState(8);
  const [base, setBase] = useState(Math.max(clients, 1));
  const baseSteps = [...new Set([...(clients > 0 ? [clients] : []), 50, 100, 200, 300, 500, 1000])].sort((a, b) => a - b);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "";
  const visibleStores = stores.filter((s) => on[s.id]);
  const visibleProducts = products.filter((p) => on[p.storeId]);
  const avgTicket = visibleProducts.length ? visibleProducts.reduce((t, p) => t + p.price, 0) / visibleProducts.length : 0;
  const avgPct = visibleProducts.length
    ? visibleProducts.reduce((t, p) => t + (stores.find((s) => s.id === p.storeId)?.commissionPct ?? 0), 0) / visibleProducts.length : 0;
  const est = estimateReferralCommission({ activeClients: base, buyerRate: buyers / 100, avgTicket, avgCommissionPct: avgPct });
  const list = products.filter((p) => cat === "all" || p.category === cat);
  const cats = (["beard", "hair", "skin", "kits"] as ProductCategory[]).filter((c) => products.some((p) => p.category === c));

  function toggleStore(id: string) {
    const v = !on[id];
    setError("");
    start(async () => {
      setOn({ id, v });
      const r = await toggleStoreAction(slug, id, v);
      if (!r.ok) setError(r.error);
    });
  }
  function toggleStar(id: string) {
    const v = !stars.includes(id);
    setError("");
    start(async () => {
      setStars({ id, v });
      const r = await featureProductAction(slug, id, v);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Lojas no app" value={`${visibleStores.length} de ${stores.length}`} />
        <Kpi label="Produtos na vitrine" value={String(visibleProducts.length)} />
        <Kpi label="Destaques" value={String(stars.filter((id) => visibleProducts.some((p) => p.id === id)).length)} />
        <Kpi label="Comissão média das lojas" value={`${avgPct.toFixed(1).replace(".", ",")}%`} />
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card">
          <h2 className="font-semibold">Lojas parceiras</h2>
          <p className="mb-3 text-xs text-neutral-500">Escolha quais aparecem no app dos seus clientes.</p>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {stores.map((s) => {
              const count = products.filter((p) => p.storeId === s.id).length;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{s.name}</b>
                    <span className="text-xs text-neutral-500">
                      {tx(s.category, lang)} · {count} produto(s){s.rating ? ` · ★ ${s.rating.toFixed(1).replace(".", ",")}` : ""}
                    </span>
                  </div>
                  <span className="text-right text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                    <b className="block text-sm">{s.commissionPct}%</b>comissão
                  </span>
                  <Switch on={Boolean(on[s.id])} disabled={!canEdit || pending} onChange={() => toggleStore(s.id)} label={`Mostrar ${s.name} no app`} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card h-fit">
          <h2 className="font-semibold">Quanto dá para ganhar</h2>
          <p className="mb-3 text-xs text-neutral-500">Estimativa por mês, com as lojas ligadas agora.</p>
          <div className="text-sm">
            <p className="mb-1.5">Clientes que usam o app{clients > 0 ? <span className="text-xs text-neutral-500"> (hoje você tem {clients})</span> : null}</p>
            <PresetNumber name="Clientes que usam o app" presets={baseSteps} value={base} min={1} max={100_000} step={10} onChange={(v) => setBase(v ?? 1)} />
          </div>
          <div className="mt-3 text-sm">
            <p className="mb-1.5">Compram pelo menos 1 produto no mês</p>
            <PresetNumber name="Compram no mês" presets={BUYER_STEPS} value={buyers} format={(n) => `${n}%`} min={1} max={100} onChange={(v) => setBuyers(v ?? 1)} />
          </div>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-neutral-500">Pedidos</dt><dd className="text-right tabular-nums">{est.orders}</dd>
            <dt className="text-neutral-500">Ticket médio</dt><dd className="text-right tabular-nums">{money(Math.round(avgTicket * 100) / 100)}</dd>
            <dt className="text-neutral-500">Vendas indicadas</dt><dd className="text-right tabular-nums">{money(est.sales)}</dd>
            <dt className="text-neutral-500">Comissão das lojas</dt><dd className="text-right tabular-nums">{money(est.storeCommission)}</dd>
            <dt className="font-semibold">Fica para a barbearia</dt>
            <dd className="text-right text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{money(est.shopCommission)}</dd>
          </dl>
          <p className="mt-3 text-xs text-neutral-500">
            É uma conta aproximada: {Math.round(SHOP_SHARE * 100)}% da comissão de cada loja. Sem estoque e sem entrega por sua conta.
            As vendas de verdade aparecem aqui quando as lojas enviarem o relatório de indicações.
          </p>
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Produtos</h2>
            <p className="text-xs text-neutral-500">Toque na estrela para destacar: o produto aparece primeiro no app, com o selo &quot;Indicado pela barbearia&quot;.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button className={`chip px-2.5 py-1 text-xs ${cat === "all" ? "chip-on" : ""}`} onClick={() => setCat("all")}>Todos</button>
            {cats.map((c) => (
              <button key={c} className={`chip px-2.5 py-1 text-xs ${cat === c ? "chip-on" : ""}`} onClick={() => setCat(c)}>{tx(CATEGORY_LABEL[c], "pt")}</button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => {
            const star = stars.includes(p.id);
            const hidden = !on[p.storeId];
            return (
              <li key={p.id} className={`relative flex flex-col rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 ${hidden ? "opacity-45" : ""}`}>
                <button type="button" aria-pressed={star} aria-label={star ? `Tirar destaque de ${tx(p.name, "pt")}` : `Destacar ${tx(p.name, "pt")}`}
                  disabled={!canEdit || pending || hidden} onClick={() => toggleStar(p.id)}
                  className={`absolute right-2 top-2 rounded-full p-1 text-lg leading-none disabled:cursor-not-allowed ${star ? "text-amber-500" : "text-neutral-300 hover:text-amber-400 dark:text-neutral-600"}`}>
                  {star ? "★" : "☆"}
                </button>
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                  <ProductArt art={p.art} color={p.color} />
                </div>
                {star && !hidden && <span className="mb-1 self-start rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Indicado pela barbearia</span>}
                <b className="text-sm leading-tight">{tx(p.name, "pt")}</b>
                <span className="mt-0.5 text-xs text-neutral-500">{storeName(p.storeId)}{p.rating ? ` · ★ ${p.rating.toFixed(1).replace(".", ",")}` : ""}</span>
                <span className="mt-auto pt-2 text-sm font-semibold tabular-nums">{money(p.price)}</span>
                {hidden && <span className="text-[11px] text-neutral-500">loja desligada</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
