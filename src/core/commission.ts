/**
 * Regras de comissão configuráveis pelo dono.
 * A parte delicada são os atendimentos de plano: o cliente paga um valor fixo por mês
 * e usa quantas vezes quiser (até a cota), então é preciso decidir quanto cada uso vale.
 */

export type PlanCommissionModel =
  /** Valor do plano dividido pelos usos reais do cliente no ciclo. Nunca paga mais que o plano rendeu. */
  | "usage_split"
  /** Valor do plano dividido pela cota de usos (ex.: 4). Usos não aproveitados ficam com a barbearia. */
  | "quota_split"
  /** Como se o serviço fosse avulso: preço de tabela × percentual. */
  | "list_price"
  /** Valor fixo por atendimento de plano. */
  | "fixed";

export interface CommissionRules {
  planModel: PlanCommissionModel;
  /** % do barbeiro em usage_split e quota_split. */
  planPct: number;
  /** % sobre o preço de tabela em list_price. */
  listPricePct: number;
  /** Valor por atendimento em fixed. */
  fixedPerVisit: number;
  /** Exceções por serviço (serviceId → %). Sem exceção, vale o % do profissional. */
  serviceOverrides: Record<string, number>;
  productPct: number;
  /** % da primeira mensalidade para quem vendeu o plano. */
  planSaleBonusPct: number;
  deductCardFee: boolean;
  cardFeePct: number;
  /** Desconto de insumos por atendimento (lâmina, toalha). */
  suppliesPerVisit: number;
  /** Bônus extra sobre serviços avulsos quando o faturamento passa da meta. O maior degrau atingido vale. */
  tiers: { above: number; extraPct: number }[];
  /** Garantia mínima mensal (0 = sem garantia). */
  monthlyFloor: number;
}

export type BarberPay =
  | { kind: "commission"; pct: number }
  | { kind: "chair_rent"; monthlyRent: number };

export interface WalkInSale {
  serviceId: string;
  amount: number;
  /** Parte paga com cartão (para descontar a taxa). */
  cardAmount: number;
}

export interface PlanVisit {
  serviceId: string;
  servicePrice: number;
  planPrice: number;
  /** Cota do plano; `null` = ilimitado (quota_split cai para usage_split). */
  quotaUses: number | null;
  /** Quantas vezes este cliente usou o plano no ciclo (inclui esta visita). */
  usesInCycle: number;
}

export interface BarberPeriod {
  sales: WalkInSale[];
  planVisits: PlanVisit[];
  productSales: number;
  plansSold: { firstPayment: number }[];
}

export interface CommissionLine {
  key: "services" | "plan_visits" | "products" | "plan_sale_bonus" | "tier_bonus" | "card_fee" | "supplies" | "floor" | "chair_rent";
  amount: number;
}

export interface CommissionResult {
  lines: CommissionLine[];
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Quanto um atendimento de plano rende ao barbeiro, pela regra escolhida. */
export function planVisitValue(v: PlanVisit, rules: CommissionRules): number {
  switch (rules.planModel) {
    case "fixed":
      return rules.fixedPerVisit;
    case "list_price":
      return (v.servicePrice * rules.listPricePct) / 100;
    case "quota_split":
      if (v.quotaUses) return (v.planPrice / v.quotaUses) * (rules.planPct / 100);
      return (v.planPrice / Math.max(1, v.usesInCycle)) * (rules.planPct / 100);
    case "usage_split":
      return (v.planPrice / Math.max(1, v.usesInCycle)) * (rules.planPct / 100);
  }
}

export function computeCommission(pay: BarberPay, period: BarberPeriod, rules: CommissionRules): CommissionResult {
  const lines: CommissionLine[] = [];
  const walkInTotal = period.sales.reduce((a, s) => a + s.amount, 0);

  if (pay.kind === "chair_rent") {
    // Cadeira alugada: o barbeiro fica com o que fatura e paga o aluguel à barbearia.
    lines.push({ key: "services", amount: walkInTotal });
    lines.push({ key: "plan_visits", amount: period.planVisits.reduce((a, v) => a + planVisitValue(v, { ...rules, planModel: "usage_split", planPct: 100 }), 0) });
    lines.push({ key: "chair_rent", amount: -pay.monthlyRent });
    return finish(lines, 0);
  }

  const services = period.sales.reduce((a, s) => a + s.amount * ((rules.serviceOverrides[s.serviceId] ?? pay.pct) / 100), 0);
  lines.push({ key: "services", amount: services });
  lines.push({ key: "plan_visits", amount: period.planVisits.reduce((a, v) => a + planVisitValue(v, rules), 0) });
  if (period.productSales) lines.push({ key: "products", amount: (period.productSales * rules.productPct) / 100 });
  if (period.plansSold.length)
    lines.push({ key: "plan_sale_bonus", amount: period.plansSold.reduce((a, p) => a + (p.firstPayment * rules.planSaleBonusPct) / 100, 0) });

  const turnover = walkInTotal + period.planVisits.reduce((a, v) => a + v.servicePrice, 0);
  const tier = [...rules.tiers].sort((a, b) => b.above - a.above).find((t) => turnover > t.above);
  if (tier) lines.push({ key: "tier_bonus", amount: (walkInTotal * tier.extraPct) / 100 });

  if (rules.deductCardFee) {
    // A taxa incide só sobre a parte da comissão que veio de pagamentos com cartão.
    const fee = period.sales.reduce(
      (a, s) => a + s.cardAmount * ((rules.serviceOverrides[s.serviceId] ?? pay.pct) / 100) * (rules.cardFeePct / 100),
      0,
    );
    if (fee) lines.push({ key: "card_fee", amount: -fee });
  }
  const visits = period.sales.length + period.planVisits.length;
  if (rules.suppliesPerVisit) lines.push({ key: "supplies", amount: -visits * rules.suppliesPerVisit });

  return finish(lines, rules.monthlyFloor);
}

function finish(lines: CommissionLine[], floor: number): CommissionResult {
  let total = lines.reduce((a, l) => a + l.amount, 0);
  if (floor > 0 && total < floor) {
    lines.push({ key: "floor", amount: floor - total });
    total = floor;
  }
  return { lines: lines.map((l) => ({ ...l, amount: round2(l.amount) })), total: round2(total) };
}

export const DEFAULT_RULES: CommissionRules = {
  planModel: "usage_split",
  planPct: 45,
  listPricePct: 40,
  fixedPerVisit: 18,
  serviceOverrides: {},
  productPct: 10,
  planSaleBonusPct: 10,
  deductCardFee: true,
  cardFeePct: 3.2,
  suppliesPerVisit: 0,
  tiers: [],
  monthlyFloor: 0,
};
