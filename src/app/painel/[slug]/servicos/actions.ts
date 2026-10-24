"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/staff";
import { saveService, setServiceActive } from "@/modules/settings/data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const opt = z.string().trim().max(80).optional();
const serviceSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.object({ pt: z.string().trim().min(1, "Informe o nome em português").max(80), en: opt, es: opt }),
  durationMin: z.number().int("Duração em minutos inteiros").min(5, "Duração mínima de 5 minutos").max(600, "Duração máxima de 10 horas"),
  price: z.number().min(0, "Preço não pode ser negativo").max(1_000_000),
  commissionOverridePct: z.number().min(0, "Comissão entre 0 e 100%").max(100, "Comissão entre 0 e 100%").nullable(),
  sort: z.number().int().min(0).max(999),
});

const fail = (e: unknown): ActionResult => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof Error && e.message === "forbidden") return { ok: false, error: "Seu nível de acesso não permite mudar os serviços. Peça ao dono." };
  return { ok: false, error: "Não deu para salvar. Tente de novo." };
};

export async function saveServiceAction(slug: string, input: z.input<typeof serviceSchema>): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, "servicos");
    await saveService(bundle.shop.id, serviceSchema.parse(input));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  revalidatePath(`/b/${slug}`);
  return { ok: true };
}

export async function setServiceActiveAction(slug: string, id: string, active: boolean): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, "servicos");
    const p = z.object({ id: z.string().min(1), active: z.boolean() }).parse({ id, active });
    await setServiceActive(bundle.shop.id, p.id, p.active);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  revalidatePath(`/b/${slug}`);
  return { ok: true };
}
