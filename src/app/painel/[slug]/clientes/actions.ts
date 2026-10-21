"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { toE164 } from "@/core/phone";
import { createClient, updateClient } from "@/modules/clients/data";

const name = z.string().trim().min(2, "Escreva o nome do cliente.").max(80);
const phone = z.string().trim().max(25).transform((v, ctx) => {
  const e = toE164(v);
  if (!e) { ctx.addIssue({ code: "custom", message: "WhatsApp inválido. Ex.: (11) 98888-7777" }); return z.NEVER; }
  return e;
});

const fail = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Dados inválidos." });

export async function addClient(slug: string, input: { name: string; phone: string }) {
  const { bundle } = await assertStaff(slug);
  const p = z.object({ name, phone }).safeParse(input);
  if (!p.success) return fail(p.error);
  const r = await createClient(bundle, p.data);
  if (r.ok) revalidatePath(`/painel/${slug}/clientes`);
  return r;
}

const patch = z.object({
  name, phone,
  preferredBarberId: z.string().max(64).nullable(),
  preferences: z.string().max(2000),
  notes: z.string().max(2000),
  photoConsent: z.boolean(),
});

export async function saveClient(slug: string, id: string, input: z.input<typeof patch>) {
  const { bundle } = await assertStaff(slug);
  const p = patch.safeParse(input);
  if (!p.success) return fail(p.error);
  const r = await updateClient(bundle, z.string().max(64).parse(id), p.data);
  if (r.ok) {
    revalidatePath(`/painel/${slug}/clientes`);
    revalidatePath(`/painel/${slug}/clientes/${id}`);
  }
  return r;
}
