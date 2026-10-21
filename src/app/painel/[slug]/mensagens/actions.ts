"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { deleteTemplate, restoreDefaults, saveTemplate, setTemplateEnabled } from "@/modules/messages/data";

const ROLES = ["owner", "manager"] as const;
const text = z.string().max(2000);

const templateSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, "Dê um nome para a mensagem.").max(80),
  trigger: z.enum(["before_appointment", "after_appointment", "plan_expiring", "plan_expired", "client_absent", "birthday", "campaign"]),
  offset: z.number().min(0, "O tempo não pode ser negativo.").max(720, "No máximo 720."),
  enabled: z.boolean(),
  body: z.object({ pt: text.trim().min(1, "Escreva o texto em português."), en: text.optional(), es: text.optional() }),
});

export type ActionResult = { ok: true; id?: string; count?: number } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => ({
  ok: false,
  error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Dados inválidos." : e instanceof Error && e.message === "forbidden"
    ? "Só o dono ou o gerente pode mudar as mensagens." : "Não deu para salvar. Tente de novo.",
});

export async function saveTemplateAction(slug: string, input: z.input<typeof templateSchema>): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, [...ROLES]);
    const t = templateSchema.parse(input);
    const id = await saveTemplate(bundle.shop.id, { ...t, offset: t.trigger === "campaign" ? 0 : t.offset });
    revalidatePath(`/painel/${slug}/mensagens`);
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleTemplateAction(slug: string, id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, [...ROLES]);
    const p = z.object({ id: z.string().min(1).max(64), enabled: z.boolean() }).parse({ id, enabled });
    await setTemplateEnabled(bundle.shop.id, p.id, p.enabled);
    revalidatePath(`/painel/${slug}/mensagens`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplateAction(slug: string, id: string): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, [...ROLES]);
    await deleteTemplate(bundle.shop.id, z.string().min(1).max(64).parse(id));
    revalidatePath(`/painel/${slug}/mensagens`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreDefaultsAction(slug: string): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, [...ROLES]);
    const count = await restoreDefaults(bundle.shop.id);
    revalidatePath(`/painel/${slug}/mensagens`);
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}
