"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertStaff } from "@/lib/staff";
import { setProductFeatured, setStoreEnabled } from "@/modules/shopping/data";

export type ActionResult = { ok: true } | { ok: false; error: string };
const id = z.string().min(1).max(64);

const fail = (e: unknown): ActionResult => ({
  ok: false,
  error: e instanceof Error && e.message === "forbidden" ? "Só o dono ou o gerente pode mudar o Shopping." : "Não deu para salvar. Tente de novo.",
});

export async function toggleStoreAction(slug: string, storeId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, ["owner", "manager"]);
    const p = z.object({ storeId: id, enabled: z.boolean() }).parse({ storeId, enabled });
    await setStoreEnabled(bundle.shop.id, p.storeId, p.enabled);
    revalidatePath(`/painel/${slug}/shopping`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function featureProductAction(slug: string, productId: string, featured: boolean): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, ["owner", "manager"]);
    const p = z.object({ productId: id, featured: z.boolean() }).parse({ productId, featured });
    const ok = await setProductFeatured(bundle.shop.id, bundle.shop.currency, p.productId, p.featured);
    if (!ok) return { ok: false, error: "Produto não encontrado." };
    revalidatePath(`/painel/${slug}/shopping`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
