import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { repo } from "@/data";
import { currentUser, supabaseServer } from "./supabase";

export type StaffRole = "owner" | "manager" | "reception" | "barber";

/**
 * Carrega a barbearia de uma tela do painel e confere se quem abriu é da equipe.
 * No modo demonstração todo mundo entra como dono.
 * Fica em cache durante a requisição: layout e página podem chamar à vontade.
 */
export const requireStaff = cache(async (slug: string) => {
  const r = repo();
  const bundle = await r.shopBySlug(slug);
  if (!bundle) notFound();
  if (r.mode === "demo") return { r, bundle, role: "owner" as StaffRole, allowed: true };
  const user = await currentUser();
  if (!user) redirect(`/entrar?next=/painel/${slug}`);
  const db = await supabaseServer();
  const { data } = await db.from("shop_members").select("role").eq("shop_id", bundle.shop.id).eq("user_id", user.id).maybeSingle();
  return { r, bundle, role: (data?.role ?? "barber") as StaffRole, allowed: Boolean(data) };
});

/** Para server actions: lança erro se não for da equipe (ou não tiver o papel exigido). */
export async function assertStaff(slug: string, roles?: StaffRole[]) {
  const s = await requireStaff(slug);
  if (!s.allowed || (roles && !roles.includes(s.role))) throw new Error("forbidden");
  return s;
}
