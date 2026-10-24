"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { saveRules, setPayout } from "@/modules/finance/data";
import { commissionStatements } from "@/modules/finance/compute";
import { periodRange } from "@/core/finance";

type Result = { ok: true } | { ok: false; error: string };

const pct = (label: string) => z.number({ message: `${label}: número inválido.` }).min(0, `${label}: não pode ser negativo.`).max(100, `${label}: no máximo 100%.`);
const money = (label: string) => z.number({ message: `${label}: valor inválido.` }).min(0, `${label}: não pode ser negativo.`).max(10_000_000);

const rulesSchema = z.object({
  rules: z.object({
    planModel: z.enum(["usage_split", "quota_split", "list_price", "fixed"]),
    planPct: pct("% do plano"),
    listPricePct: pct("% do preço de tabela"),
    fixedPerVisit: money("Valor fixo"),
    productPct: pct("% de produtos"),
    planSaleBonusPct: pct("Bônus por plano vendido"),
    deductCardFee: z.boolean(),
    cardFeePct: pct("Taxa do cartão"),
    suppliesPerVisit: money("Insumos"),
    tiers: z.array(z.object({ above: money("Meta"), extraPct: pct("Bônus da meta") })).max(10, "No máximo 10 metas."),
    monthlyFloor: money("Garantia mínima"),
  }),
  payout: z.enum(["weekly", "biweekly", "monthly"]),
  pixSplit: z.boolean(),
});

export async function saveRulesAction(slug: string, input: z.input<typeof rulesSchema>): Promise<Result> {
  const { bundle } = await assertStaff(slug, "comissoes");
  const p = rulesSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    await saveRules(bundle.shop.id, { ...p.data, rules: { ...p.data.rules, serviceOverrides: {} } });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não deu certo." };
  }
  revalidatePath(`/painel/${slug}/comissoes`);
  revalidatePath(`/painel/${slug}/financeiro`);
  return { ok: true };
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const payoutSchema = z.object({
  barberId: z.string().min(1).max(64),
  kind: z.enum(["weekly", "biweekly", "monthly"]),
  start: day,
  paid: z.boolean(),
});

/** Marca a comissão do período como paga. O valor é recalculado aqui, nunca vem da tela. */
export async function setPayoutAction(slug: string, input: z.input<typeof payoutSchema>): Promise<Result> {
  const { bundle } = await assertStaff(slug, "comissoes");
  const p = payoutSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Dados inválidos." };
  const range = periodRange(p.data.kind, p.data.start);
  if (range.start !== p.data.start) return { ok: false, error: "Período inválido." };
  const { list } = await commissionStatements(bundle, range);
  const row = list.find((x) => x.barber.id === p.data.barberId);
  if (!row) return { ok: false, error: "Profissional não encontrado." };
  try {
    await setPayout(bundle, { barberId: row.barber.id, periodStart: range.start, periodEnd: range.end, amount: row.statement.result.total }, p.data.paid);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não deu certo." };
  }
  revalidatePath(`/painel/${slug}/comissoes`);
  return { ok: true };
}
