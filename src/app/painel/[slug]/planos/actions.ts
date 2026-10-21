"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { cancelSubscription, registerPayment, savePlan, sellPlan, setAlertDays, setPlanActive } from "@/modules/plans/data";

/** Dinheiro e configuração: só dono e gerente. */
const MONEY = ["owner", "manager"] as const;
const id = z.string().min(1).max(64);
const method = z.enum(["pix", "card", "cash"]);

const fail = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });
const done = (slug: string) => {
  revalidatePath(`/painel/${slug}/planos`);
  revalidatePath(`/painel/${slug}/clientes`, "layout");
  revalidatePath(`/painel/${slug}`);
};

const planSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(2, "Dê um nome ao plano.").max(60),
  price: z.number({ message: "Preço inválido." }).min(0, "Preço inválido.").max(100000),
  periodDays: z.number({ message: "Ciclo inválido." }).int("O ciclo é em dias inteiros.").min(1, "O ciclo precisa ter pelo menos 1 dia.").max(366),
  quotaUses: z.number().int("A cota é um número inteiro.").min(1, "A cota precisa ser 1 ou mais (vazio = ilimitado).").max(999).nullable(),
  serviceIds: z.array(id).max(100),
});

export async function savePlanAction(slug: string, input: z.input<typeof planSchema>) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const p = planSchema.safeParse(input);
  if (!p.success) return fail(p.error);
  const valid = new Set(bundle.services.map((s) => s.id));
  const r = await savePlan(bundle, { ...p.data, serviceIds: p.data.serviceIds.filter((s) => valid.has(s)) });
  if (r.ok) done(slug);
  return r;
}

export async function togglePlanAction(slug: string, planId: string, active: boolean) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const r = await setPlanActive(bundle, id.parse(planId), z.boolean().parse(active));
  if (r.ok) done(slug);
  return r;
}

export async function payAction(slug: string, subId: string, how: string) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const p = z.object({ subId: id, how: method }).safeParse({ subId, how });
  if (!p.success) return fail(p.error);
  const r = await registerPayment(bundle, p.data.subId, p.data.how);
  if (r.ok) done(slug);
  return r;
}

const sellSchema = z.object({ clientId: id, planId: id, barberId: id.nullable(), method });

export async function sellAction(slug: string, input: z.input<typeof sellSchema>) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const p = sellSchema.safeParse(input);
  if (!p.success) return { ok: false as const, error: "Escolha o cliente, o plano e a forma de pagamento." };
  const r = await sellPlan(bundle, p.data);
  if (r.ok) done(slug);
  return r;
}

export async function cancelAction(slug: string, subId: string) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const r = await cancelSubscription(bundle, id.parse(subId));
  if (r.ok) done(slug);
  return r;
}

export async function alertDaysAction(slug: string, days: number) {
  const { bundle } = await assertStaff(slug, [...MONEY]);
  const p = z.number().int().min(0).max(30).safeParse(days);
  if (!p.success) return { ok: false as const, error: "Use de 0 a 30 dias." };
  const r = await setAlertDays(bundle, p.data);
  if (r.ok) done(slug);
  return r;
}
