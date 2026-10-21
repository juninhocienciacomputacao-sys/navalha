/** Parte da comissão da loja parceira que fica com a barbearia (o resto cobre a plataforma). */
export const SHOP_SHARE = 0.5;

export interface CommissionEstimateInput {
  /** Clientes que usam o app no mês. */
  activeClients: number;
  /** Fração dos clientes que compra pelo menos uma vez no mês (0 a 1). */
  buyerRate: number;
  /** Valor médio de cada pedido. */
  avgTicket: number;
  /** Comissão média das lojas ligadas, em % (ex.: 12). */
  avgCommissionPct: number;
  /** Fração da comissão que vai para a barbearia. */
  shopShare?: number;
}

export interface CommissionEstimate {
  orders: number;
  sales: number;
  storeCommission: number;
  shopCommission: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Estimativa mensal do que a barbearia ganha indicando produtos de lojas parceiras. */
export function estimateReferralCommission(i: CommissionEstimateInput): CommissionEstimate {
  const rate = Math.min(1, Math.max(0, i.buyerRate));
  const orders = Math.round(Math.max(0, i.activeClients) * rate);
  const sales = round2(orders * Math.max(0, i.avgTicket));
  const storeCommission = round2(sales * Math.max(0, i.avgCommissionPct) / 100);
  const shopCommission = round2(storeCommission * (i.shopShare ?? SHOP_SHARE));
  return { orders, sales, storeCommission, shopCommission };
}

/** Link de afiliado com a marca da barbearia, para a loja saber de quem é a indicação. */
export function affiliateLink(url: string, shopSlug: string, barberId?: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", `navalha-${shopSlug}`);
    u.searchParams.set("utm_source", "navalha");
    u.searchParams.set("utm_medium", "app_barbearia");
    u.searchParams.set("utm_campaign", shopSlug);
    if (barberId) u.searchParams.set("utm_content", barberId);
    return u.toString();
  } catch {
    return url;
  }
}
