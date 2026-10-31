"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertOwner, assertStaff } from "@/lib/staff";
import { forgetClient } from "@/modules/client-app/data";
import { cleanName, isFullName, toE164 } from "@/core/phone";
import { createClient, findClientByPhone, updateClient, type ClientResult } from "@/modules/clients/data";

const name = z.string().trim().max(80).transform(cleanName)
  .refine(isFullName, "Escreva o nome completo do cliente (nome e sobrenome).");
const phone = z.string().trim().max(25).transform((v, ctx) => {
  const e = toE164(v);
  if (!e) { ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Ex.: (11) 98888-7777" }); return z.NEVER; }
  return e;
});

const fail = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });

export async function addClient(slug: string, input: { name: string; phone: string }): Promise<ClientResult> {
  const { bundle } = await assertStaff(slug, "clientes");
  const p = z.object({ name, phone }).safeParse(input);
  if (!p.success) return fail(p.error);
  const r = await createClient(bundle, p.data);
  if (r.ok) revalidatePath(`/painel/${slug}/clientes`);
  return r;
}

/**
 * Enquanto a recepção digita o WhatsApp: se o número já é de um cliente, diz quem é
 * (o celular é o que diferencia um cliente do outro). exceptId = a ficha que está sendo editada.
 */
export async function checkPhone(slug: string, raw: string, exceptId?: string) {
  // qualquer pessoa da equipe (a agenda já busca cliente por telefone)
  const { bundle } = await assertStaff(slug);
  const e = toE164(z.string().max(25).parse(raw));
  if (!e) return null;
  return findClientByPhone(bundle, e, exceptId ? z.string().max(64).parse(exceptId) : undefined);
}

const patch = z.object({
  name, phone,
  preferredBarberId: z.string().max(64).nullable(),
  preferences: z.string().max(2000),
  notes: z.string().max(2000),
  photoConsent: z.boolean(),
});

export async function saveClient(slug: string, id: string, input: z.input<typeof patch>): Promise<ClientResult> {
  const { bundle } = await assertStaff(slug, "clientes");
  const p = patch.safeParse(input);
  if (!p.success) return fail(p.error);
  const r = await updateClient(bundle, z.string().max(64).parse(id), p.data);
  if (r.ok) {
    revalidatePath(`/painel/${slug}/clientes`);
    revalidatePath(`/painel/${slug}/clientes/${id}`);
  }
  return r;
}

/**
 * LGPD/GDPR: o cliente pediu para ser esquecido. Só o dono apaga.
 * Ficha, plano, fotos e projetos somem; atendimentos e pagamentos passados ficam sem nome (contabilidade).
 */
export async function forgetClientAction(slug: string, id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { bundle } = await assertOwner(slug);
    const r = await forgetClient(bundle.shop.id, z.string().min(1).max(64).parse(id));
    if (r.ok) revalidatePath(`/painel/${slug}/clientes`);
    return r.ok ? { ok: true } : { ok: false, error: "Não deu certo. Tente de novo." };
  } catch {
    return { ok: false, error: "Só o dono da barbearia pode apagar o cadastro de um cliente." };
  }
}
