"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { assertOwner, PREVIEW_COOKIE } from "@/lib/staff";
import { isE164, LEVELS, SECTION_KEYS } from "@/core/access";
import { deleteInvite, removeMember, saveAccessConfig, saveInvite, setMemberAccess } from "@/modules/team/data";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
  forbidden: "Só o dono mexe nos acessos.",
  last_owner: "A barbearia precisa de pelo menos um dono. Coloque outra pessoa como dono antes.",
  already_member: "Esse WhatsApp já faz parte da equipe. Mude o nível dele na lista.",
  duplicate: "Esse WhatsApp já foi convidado.",
};

const fail = (e: unknown): ActionResult => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof Error && ERRORS[e.message]) return { ok: false, error: ERRORS[e.message]! };
  return { ok: false, error: "Não deu para salvar. Tente de novo." };
};
const done = (slug: string, r: { ok: boolean; error?: string }): ActionResult => {
  if (!r.ok) return { ok: false, error: ERRORS[r.error ?? ""] ?? "Não deu para salvar. Tente de novo." };
  revalidatePath(`/painel/${slug}`, "layout");
  return { ok: true };
};

const roleS = z.enum(["owner", "manager", "reception", "barber"]);
const levelAccessS = z.object({ sections: z.array(z.enum(SECTION_KEYS as [string, ...string[]])), agenda: z.enum(["all", "own_free", "own"]) });
const configS = z.object(Object.fromEntries(LEVELS.map((l) => [l, levelAccessS])) as Record<(typeof LEVELS)[number], typeof levelAccessS>);

export async function saveLevelsAction(slug: string, config: z.input<typeof configS>): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    return done(slug, await saveAccessConfig(bundle.shop.id, configS.parse(config) as Parameters<typeof saveAccessConfig>[1]));
  } catch (e) {
    return fail(e);
  }
}

const inviteS = z.object({
  phone: z.string().refine(isE164, "WhatsApp inválido. Confira o DDD e o número."),
  name: z.string().trim().max(60).transform((s) => s || null).nullable(),
  role: roleS,
  barberId: z.string().min(1).nullable(),
});

export async function inviteAction(slug: string, input: z.input<typeof inviteS>): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    const p = inviteS.parse(input);
    if (p.barberId && !bundle.barbers.some((b) => b.id === p.barberId)) throw new z.ZodError([]);
    return done(slug, await saveInvite(bundle.shop.id, p));
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInviteAction(slug: string, phone: string): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    return done(slug, await deleteInvite(bundle.shop.id, z.string().max(20).parse(phone)));
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberAction(slug: string, userId: string, role: string, barberId: string | null): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    const p = z.object({ userId: z.string().min(1), role: roleS, barberId: z.string().min(1).nullable() }).parse({ userId, role, barberId });
    return done(slug, await setMemberAccess(bundle.shop.id, p.userId, p.role, p.barberId));
  } catch (e) {
    return fail(e);
  }
}

export async function removeMemberAction(slug: string, userId: string): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    return done(slug, await removeMember(bundle.shop.id, z.string().min(1).parse(userId)));
  } catch (e) {
    return fail(e);
  }
}

/** O dono passa a ver o painel como outro nível (só na tela dele; a equipe não é afetada). */
export async function startPreviewAction(slug: string, role: string, barberId: string | null): Promise<ActionResult> {
  try {
    const { bundle } = await assertOwner(slug);
    const p = z.object({ role: z.enum(["manager", "reception", "barber"]), barberId: z.string().min(1).nullable() }).parse({ role, barberId });
    const b = p.barberId && bundle.barbers.some((x) => x.id === p.barberId) ? p.barberId : "";
    (await cookies()).set(PREVIEW_COOKIE, `${p.role}:${b}`, { path: `/`, httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 4 });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  return { ok: true };
}

export async function stopPreviewAction(slug: string): Promise<ActionResult> {
  (await cookies()).delete(PREVIEW_COOKIE);
  revalidatePath(`/painel/${slug}`, "layout");
  return { ok: true };
}
