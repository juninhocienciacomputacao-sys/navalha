"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/staff";
import { deleteLook, moveLook, restoreDefaultLooks, saveLook } from "@/modules/gallery/data";

export type ActionResult = { ok: true; n?: number } | { ok: false; error: string };

const opt = (max: number) => z.string().trim().max(max).optional();
const i18n = (max: number, msg: string) => z.object({ pt: z.string().trim().min(1, msg).max(max), en: opt(max), es: opt(max) })
  .transform((v) => ({ pt: v.pt, ...(v.en ? { en: v.en } : {}), ...(v.es ? { es: v.es } : {}) }));

const lookSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  kind: z.enum(["cut", "beard"]),
  name: i18n(60, "Escreva o nome do modelo"),
  desc: i18n(280, "Escreva a descrição").nullable(),
  serviceId: z.string().min(1).max(64).nullable(),
  photo: z.string().max(400_000, "Foto grande demais. Tente outra.")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Foto inválida").nullable().optional(),
});

const fail = (e: unknown): ActionResult => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof Error && e.message === "forbidden") return { ok: false, error: "Seu nível de acesso não permite mudar a galeria. Peça ao dono." };
  return { ok: false, error: "Não deu para salvar. Tente de novo." };
};

async function run(slug: string, fn: (shopId: string) => Promise<number | void>): Promise<ActionResult> {
  let n: number | void;
  try {
    const { bundle } = await assertStaff(slug, "servicos");
    if (!bundle.shop.modules.galeria) throw new Error("forbidden");
    n = await fn(bundle.shop.id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}/galeria`);
  revalidatePath(`/b/${slug}`);
  return { ok: true, ...(typeof n === "number" ? { n } : {}) };
}

export async function saveLookAction(slug: string, input: z.input<typeof lookSchema>) {
  return run(slug, async (shopId) => { await saveLook(shopId, lookSchema.parse(input)); });
}

export async function deleteLookAction(slug: string, id: string) {
  return run(slug, (shopId) => deleteLook(shopId, z.string().min(1).max(64).parse(id)));
}

export async function moveLookAction(slug: string, id: string, dir: -1 | 1) {
  return run(slug, (shopId) => moveLook(shopId, z.string().min(1).max(64).parse(id), z.union([z.literal(-1), z.literal(1)]).parse(dir)));
}

export async function restoreLooksAction(slug: string) {
  return run(slug, (shopId) => restoreDefaultLooks(shopId));
}
