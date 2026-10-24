"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { deleteExpense, getExpense, saveExpense, setExpensePaid } from "@/modules/finance/data";
import { togglePaid } from "@/core/finance";
import { dayInZone } from "@/core/time";

type Result = { ok: true } | { ok: false; error: string };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const id = z.string().min(1).max(64);

const expenseSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(2, "Dê um nome à conta.").max(80),
  category: z.string().trim().min(1, "Escolha uma categoria.").max(40),
  kind: z.enum(["fixed", "variable"]),
  amount: z.number({ message: "Valor inválido." }).min(0, "Valor inválido.").max(10_000_000),
  recurring: z.boolean(),
  dueDay: z.number().int().min(1, "Dia de vencimento entre 1 e 31.").max(31, "Dia de vencimento entre 1 e 31.").nullable(),
  dueDate: day.nullable(),
  startsOn: day,
  notes: z.string().max(300).nullable().optional(),
}).refine((e) => (e.recurring ? e.dueDay !== null : e.dueDate !== null), { message: "Informe o vencimento." });

const done = (slug: string) => {
  revalidatePath(`/painel/${slug}/financeiro`);
};
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error && e.message !== "not_found" ? e.message : "Conta não encontrada." });

export async function saveExpenseAction(slug: string, input: z.input<typeof expenseSchema>): Promise<Result> {
  const { bundle } = await assertStaff(slug, "financeiro");
  const p = expenseSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Dados inválidos." };
  try { await saveExpense(bundle, p.data); } catch (e) { return fail(e); }
  done(slug);
  return { ok: true };
}

export async function deleteExpenseAction(slug: string, expenseId: string): Promise<Result> {
  const { bundle } = await assertStaff(slug, "financeiro");
  if (!id.safeParse(expenseId).success) return { ok: false, error: "Conta inválida." };
  try { await deleteExpense(bundle, expenseId); } catch (e) { return fail(e); }
  done(slug);
  return { ok: true };
}

export async function setExpensePaidAction(slug: string, expenseId: string, month: string, paid: boolean): Promise<Result> {
  const { bundle } = await assertStaff(slug, "financeiro");
  if (!id.safeParse(expenseId).success || !/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Dados inválidos." };
  const e = await getExpense(bundle, expenseId);
  if (!e) return { ok: false, error: "Conta não encontrada." };
  try {
    await setExpensePaid(bundle, expenseId, togglePaid(e, month, dayInZone(new Date(), bundle.shop.timezone), paid));
  } catch (err) { return fail(err); }
  done(slug);
  return { ok: true };
}
