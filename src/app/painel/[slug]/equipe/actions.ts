"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/staff";
import { saveBarber, setBarberActive } from "@/modules/settings/data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const barberSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Informe o nome").max(60),
  roleTitle: z.string().trim().max(80).transform((s) => s || null).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").nullable(),
  photo: z.string().max(300_000, "Foto grande demais").regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Foto inválida").nullable().default(null),
  pay: z.enum(["commission", "chair_rent"]),
  commissionPct: z.number().min(0, "Comissão entre 0 e 100%").max(100, "Comissão entre 0 e 100%"),
  chairRent: z.number().min(0, "Aluguel não pode ser negativo").max(1_000_000),
  monthlyGoal: z.number().min(0).max(100_000_000).nullable(),
  sort: z.number().int().min(0).max(999),
});

const fail = (e: unknown): ActionResult => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof Error && e.message === "forbidden") return { ok: false, error: "Só o dono ou o gerente podem mudar a equipe." };
  return { ok: false, error: "Não deu para salvar. Tente de novo." };
};

export async function saveBarberAction(slug: string, input: z.input<typeof barberSchema>): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, ["owner", "manager"]);
    await saveBarber(bundle.shop.id, barberSchema.parse(input));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  return { ok: true };
}

export async function setBarberActiveAction(slug: string, id: string, active: boolean): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, ["owner", "manager"]);
    const p = z.object({ id: z.string().min(1), active: z.boolean() }).parse({ id, active });
    await setBarberActive(bundle.shop.id, p.id, p.active);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  return { ok: true };
}
