import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoSeed } from "@/data/demo";
import type { I18nText } from "@/core/types";
import type { ClientCatalog, ClientProduct, PartnerProduct, PartnerStore, ProductArt, ProductCategory, ShopPartnerSetting } from "./types";
import { affiliateLink } from "@/core/shopping";
import { DEMO_PRODUCTS, DEMO_STORES } from "./demo-catalog";
import { demoGlobal } from "@/data/demo-global";

export * from "./types";

// ---------- demonstração: escolhas de cada barbearia ----------
const demoSettings = demoGlobal("shopping.settings", () => new Map<string, ShopPartnerSetting[]>());
function demoSettingsFor(shopId: string) {
  if (!demoSettings.has(shopId)) {
    demoSettings.set(shopId, [
      { storeId: DEMO_STORES[0].id, enabled: true, featuredProductIds: [DEMO_PRODUCTS[0].id] },
      { storeId: DEMO_STORES[2].id, enabled: true, featuredProductIds: [DEMO_PRODUCTS[2].id] },
    ]);
  }
  return demoSettings.get(shopId)!;
}

type StoreRow = { id: string; slug: string; name: string; category: I18nText; commission_pct: number | string; rating: number | string | null; currency: string };
type ProductRow = {
  id: string; store_id: string; name: I18nText; category: ProductCategory; price: number | string; rating: number | string | null;
  art: ProductArt; color: string; affiliate_url: string;
};
const num = (v: number | string | null) => (v === null ? null : Number(v));

/** Catálogo global de lojas parceiras ativas numa moeda. */
export async function partnerCatalog(currency: string): Promise<{ stores: PartnerStore[]; products: PartnerProduct[] }> {
  if (!supabaseConfigured()) {
    const stores = DEMO_STORES.filter((s) => s.currency === currency);
    const ids = new Set(stores.map((s) => s.id));
    return { stores, products: DEMO_PRODUCTS.filter((p) => ids.has(p.storeId)) };
  }
  const db = await supabaseServer();
  const { data: st, error } = await db.from("partner_stores")
    .select("id, slug, name, category, commission_pct, rating, currency").eq("active", true).eq("currency", currency).order("sort");
  if (error) throw error;
  const stores = ((st ?? []) as StoreRow[]).map((s) => ({
    id: s.id, slug: s.slug, name: s.name, category: s.category, commissionPct: Number(s.commission_pct), rating: num(s.rating), currency: s.currency,
  }));
  if (!stores.length) return { stores, products: [] };
  const { data: pr, error: e2 } = await db.from("partner_products")
    .select("id, store_id, name, category, price, rating, art, color, affiliate_url").eq("active", true)
    .in("store_id", stores.map((s) => s.id)).order("sort");
  if (e2) throw e2;
  const products = ((pr ?? []) as ProductRow[]).map((p) => ({
    id: p.id, storeId: p.store_id, name: p.name, category: p.category, price: Number(p.price), rating: num(p.rating),
    art: p.art, color: p.color, affiliateUrl: p.affiliate_url,
  }));
  return { stores, products };
}

/** O que a barbearia escolheu. Loja sem linha aqui fica ligada (padrão). */
export async function shopPartnerSettings(shopId: string): Promise<ShopPartnerSetting[]> {
  if (!supabaseConfigured()) return demoSettingsFor(shopId).map((s) => ({ ...s, featuredProductIds: [...s.featuredProductIds] }));
  const db = await supabaseServer();
  const { data, error } = await db.from("shop_partner_settings").select("store_id, enabled, featured_product_ids").eq("shop_id", shopId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ storeId: r.store_id, enabled: r.enabled, featuredProductIds: r.featured_product_ids ?? [] }));
}

export const storeEnabled = (settings: ShopPartnerSetting[], storeId: string) =>
  settings.find((s) => s.storeId === storeId)?.enabled ?? true;

async function writeSetting(shopId: string, storeId: string, change: (s: ShopPartnerSetting) => ShopPartnerSetting) {
  if (!supabaseConfigured()) {
    const list = demoSettingsFor(shopId);
    const cur = list.find((s) => s.storeId === storeId) ?? { storeId, enabled: true, featuredProductIds: [] };
    const next = change({ ...cur, featuredProductIds: [...cur.featuredProductIds] });
    const i = list.indexOf(cur);
    if (i >= 0) list[i] = next; else list.push(next);
    return;
  }
  const db = await supabaseServer();
  const { data } = await db.from("shop_partner_settings").select("store_id, enabled, featured_product_ids")
    .eq("shop_id", shopId).eq("store_id", storeId).maybeSingle();
  const cur: ShopPartnerSetting = data
    ? { storeId, enabled: data.enabled, featuredProductIds: data.featured_product_ids ?? [] }
    : { storeId, enabled: true, featuredProductIds: [] };
  const next = change(cur);
  const { error } = await db.from("shop_partner_settings").upsert({
    shop_id: shopId, store_id: storeId, enabled: next.enabled, featured_product_ids: next.featuredProductIds, updated_at: new Date().toISOString(),
  }, { onConflict: "shop_id,store_id" });
  if (error) throw error;
}

export async function setStoreEnabled(shopId: string, storeId: string, enabled: boolean) {
  await writeSetting(shopId, storeId, (s) => ({ ...s, enabled }));
}

/** Liga ou desliga o destaque de um produto. Devolve false se o produto não existe na moeda da barbearia. */
export async function setProductFeatured(shopId: string, currency: string, productId: string, featured: boolean): Promise<boolean> {
  const { products } = await partnerCatalog(currency);
  const p = products.find((x) => x.id === productId);
  if (!p) return false;
  await writeSetting(shopId, p.storeId, (s) => ({
    ...s,
    featuredProductIds: featured ? [...new Set([...s.featuredProductIds, productId])] : s.featuredProductIds.filter((x) => x !== productId),
  }));
  return true;
}

/**
 * Vitrine do app do cliente: lojas que a barbearia deixou ligadas, produtos com destaque primeiro
 * e link de afiliado marcado com a barbearia. Pode ser chamada por visitante sem login.
 * Se o recurso "shopping" estiver desligado em Recursos, quem chama decide não mostrar a aba.
 */
export async function shopCatalogForClient(shopId: string): Promise<ClientCatalog> {
  let shop: { id: string; slug: string; currency: string } | null;
  if (!supabaseConfigured()) {
    const b = demoSeed().bundle.shop;
    shop = b.id === shopId ? { id: b.id, slug: b.slug, currency: b.currency } : null;
  } else {
    const db = await supabaseServer();
    const { data } = await db.from("shops").select("id, slug, currency").eq("id", shopId).maybeSingle();
    shop = data;
  }
  if (!shop) return { shopId, currency: "BRL", stores: [], products: [], categories: [] };
  const [{ stores, products }, settings] = await Promise.all([partnerCatalog(shop.currency), shopPartnerSettings(shopId)]);
  const visible = stores.filter((s) => storeEnabled(settings, s.id));
  const byId = new Map(visible.map((s) => [s.id, s]));
  const featured = new Set(settings.flatMap((s) => s.featuredProductIds));
  const list: ClientProduct[] = products.filter((p) => byId.has(p.storeId)).map((p) => ({
    ...p, storeName: byId.get(p.storeId)!.name, featured: featured.has(p.id), link: affiliateLink(p.affiliateUrl, shop.slug),
  }));
  list.sort((a, b) => Number(b.featured) - Number(a.featured));
  const categories = (["beard", "hair", "skin", "kits"] as ProductCategory[]).filter((c) => list.some((p) => p.category === c));
  return { shopId, currency: shop.currency, stores: visible, products: list, categories };
}

/** Quantos clientes a barbearia tem (base para a estimativa de comissão). */
export async function clientCount(shopId: string): Promise<number> {
  if (!supabaseConfigured()) return demoSeed().clients.length;
  const db = await supabaseServer();
  const { count } = await db.from("clients").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  return count ?? 0;
}
