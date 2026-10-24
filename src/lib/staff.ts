import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { repo } from "@/data";
import { accessFor, canSee, homeHref, workableBarbers, type LevelAccess, type SectionKey, type StaffRole } from "@/core/access";
import { getAccessConfig, myMembership } from "@/modules/team/data";
import { currentUser } from "./supabase";

export type { StaffRole } from "@/core/access";

/** Cookie do "ver como": o dono testa o painel como outro nível, sem precisar de outro celular. */
export const PREVIEW_COOKIE = "navalha_ver_como";

export interface Preview {
  role: Exclude<StaffRole, "owner">;
  barberId: string | null;
}

export function parsePreview(raw: string | undefined, barberIds: string[]): Preview | null {
  const [role, barberId] = (raw ?? "").split(":");
  if (role !== "manager" && role !== "reception" && role !== "barber") return null;
  return { role, barberId: barberId && barberIds.includes(barberId) ? barberId : null };
}

/**
 * Carrega a barbearia de uma tela do painel e confere se quem abriu é da equipe.
 * Devolve o nível (role), o que esse nível pode ver (access) e os barbeiros ligados à pessoa.
 * No modo demonstração todo mundo entra como dono.
 * Fica em cache durante a requisição: layout e página podem chamar à vontade.
 */
export const requireStaff = cache(async (slug: string) => {
  const r = repo();
  const bundle = await r.shopBySlug(slug);
  // Barbearia que não existe (ex.: o link antigo da demonstração): volta para a lista de barbearias de quem entrou.
  if (!bundle) redirect("/painel");

  let realRole: StaffRole = "owner";
  let myBarberIds: string[] = [];
  let userId: string | null = null;
  let allowed = true;
  if (r.mode !== "demo") {
    const user = await currentUser();
    if (!user) redirect(`/entrar?next=/painel/${slug}`);
    userId = user.id;
    const m = await myMembership(bundle.shop.id, user.id);
    allowed = Boolean(m);
    realRole = m?.role ?? "barber";
    myBarberIds = m?.barberIds ?? [];
  }

  const config = await getAccessConfig(bundle.shop.id);
  const preview = realRole === "owner" ? parsePreview((await cookies()).get(PREVIEW_COOKIE)?.value, bundle.barbers.map((b) => b.id)) : null;
  const role: StaffRole = preview?.role ?? realRole;
  if (preview) myBarberIds = preview.barberId ? [preview.barberId] : [];
  const access: LevelAccess = accessFor(role, config);
  const allIds = bundle.barbers.map((b) => b.id);

  return {
    r, bundle, allowed, userId,
    /** Nível em uso (o do "ver como", se o dono estiver testando). */
    role,
    /** Nível de verdade de quem entrou. */
    realRole,
    access,
    preview,
    myBarberIds,
    /** Barbeiros cuja agenda a pessoa pode mexer. */
    workable: workableBarbers(access, allIds, myBarberIds),
  };
});

export type Staff = Awaited<ReturnType<typeof requireStaff>>;

/** Para telas: quem não pode ver a tela vai para a primeira tela que pode. */
export async function requireSection(slug: string, section: SectionKey) {
  const s = await requireStaff(slug);
  if (s.allowed && !canSee(s.access, section)) redirect(`/painel/${slug}${homeHref(s.access)}`);
  return s;
}

/** Para server actions: lança erro se não for da equipe (ou se o nível não tiver a tela liberada). */
export async function assertStaff(slug: string, section?: SectionKey) {
  const s = await requireStaff(slug);
  if (!s.allowed || (section && !canSee(s.access, section))) throw new Error("forbidden");
  return s;
}

/** Para a agenda: lança erro se a pessoa não puder mexer na agenda desse barbeiro. */
export function assertBarber(s: Staff, barberId: string) {
  if (!s.workable.includes(barberId)) throw new Error("forbidden");
}

/** Só o dono de verdade (não vale o "ver como"). */
export async function assertOwner(slug: string) {
  const s = await requireStaff(slug);
  if (!s.allowed || s.realRole !== "owner") throw new Error("forbidden");
  return s;
}
