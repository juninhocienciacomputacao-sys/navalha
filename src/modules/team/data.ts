// Equipe com acesso ao painel: quem é, o nível de cada um, convites pelo WhatsApp e o que cada nível vê.
// Com o Supabase ligado usa o banco (as regras de segurança valem); sem ele, guarda na memória da demonstração.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoGlobal } from "@/data/demo-global";
import { sanitizeAccess, type AccessConfig, type StaffRole } from "@/core/access";

export interface Member {
  userId: string;
  name: string | null;
  phone: string | null;
  role: StaffRole;
  barberId: string | null;
  isMe: boolean;
}

export interface Invite {
  phone: string;
  name: string | null;
  role: StaffRole;
  barberId: string | null;
  createdAt: string;
}

export type TeamResult = { ok: true } | { ok: false; error: string };

const DEMO_ME = "demo-owner";
const demo = demoGlobal("team", () => ({
  access: {} as AccessConfig,
  members: [{ userId: DEMO_ME, name: null, phone: null, role: "owner", barberId: null }] as Omit<Member, "isMe">[],
  invites: [] as Invite[],
}));

const errorOf = (e: { code?: string; message?: string } | null): string => {
  const m = e?.message ?? "";
  if (/last_owner/.test(m)) return "last_owner";
  if (/forbidden/.test(m) || e?.code === "42501") return "forbidden";
  if (e?.code === "23505") return "duplicate";
  return "unknown";
};

// ---------- o que cada nível vê ----------

export async function getAccessConfig(shopId: string): Promise<AccessConfig> {
  if (!supabaseConfigured()) return demo.access;
  const db = await supabaseServer();
  const { data } = await db.from("shops").select("role_access").eq("id", shopId).maybeSingle();
  return sanitizeAccess(data?.role_access);
}

export async function saveAccessConfig(shopId: string, config: AccessConfig): Promise<TeamResult> {
  const clean = sanitizeAccess(config);
  if (!supabaseConfigured()) {
    demo.access = clean;
    return { ok: true };
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("shops").update({ role_access: clean }).eq("id", shopId).select("id");
  if (error) return { ok: false, error: errorOf(error) };
  return data?.length ? { ok: true } : { ok: false, error: "forbidden" };
}

// ---------- quem é da equipe ----------

/** Papel de quem está logado e os barbeiros ligados a essa pessoa. Aceita convites pendentes do WhatsApp dela. */
export async function myMembership(shopId: string, userId: string): Promise<{ role: StaffRole; barberIds: string[] } | null> {
  const db = await supabaseServer();
  const load = () => db.from("shop_members").select("role").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  let { data } = await load();
  if (!data) {
    const claimed = await db.rpc("claim_staff_invites");
    if (claimed.data) ({ data } = await load());
  }
  if (!data) return null;
  const { data: bs } = await db.from("barbers").select("id").eq("shop_id", shopId).eq("user_id", userId);
  return { role: data.role as StaffRole, barberIds: (bs ?? []).map((b) => b.id as string) };
}

export async function listMembers(shopId: string, meId: string | null): Promise<Member[]> {
  if (!supabaseConfigured()) return demo.members.map((m) => ({ ...m, isMe: m.userId === DEMO_ME }));
  const db = await supabaseServer();
  const [{ data, error }, { data: bs }] = await Promise.all([
    db.from("shop_members").select("user_id, role, phone_e164, display_name, added_at").eq("shop_id", shopId).order("added_at"),
    db.from("barbers").select("id, user_id").eq("shop_id", shopId).not("user_id", "is", null),
  ]);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    userId: m.user_id as string,
    name: (m.display_name as string | null) ?? null,
    phone: (m.phone_e164 as string | null) ?? null,
    role: m.role as StaffRole,
    barberId: (bs ?? []).find((b) => b.user_id === m.user_id)?.id ?? null,
    isMe: m.user_id === meId,
  }));
}

export async function listInvites(shopId: string): Promise<Invite[]> {
  if (!supabaseConfigured()) return [...demo.invites];
  const db = await supabaseServer();
  const { data, error } = await db.from("staff_invites").select("phone_e164, display_name, role, barber_id, created_at")
    .eq("shop_id", shopId).order("created_at");
  if (error) throw error;
  return (data ?? []).map((i) => ({
    phone: i.phone_e164 as string, name: (i.display_name as string | null) ?? null, role: i.role as StaffRole,
    barberId: (i.barber_id as string | null) ?? null, createdAt: i.created_at as string,
  }));
}

export async function saveInvite(shopId: string, inv: Omit<Invite, "createdAt">): Promise<TeamResult> {
  if (!supabaseConfigured()) {
    if (demo.members.some((m) => m.phone === inv.phone)) return { ok: false, error: "already_member" };
    demo.invites = [...demo.invites.filter((i) => i.phone !== inv.phone), { ...inv, createdAt: new Date().toISOString() }];
    return { ok: true };
  }
  const db = await supabaseServer();
  const { data: existing } = await db.from("shop_members").select("user_id").eq("shop_id", shopId).eq("phone_e164", inv.phone).maybeSingle();
  if (existing) return { ok: false, error: "already_member" };
  const { error } = await db.from("staff_invites").upsert({
    shop_id: shopId, phone_e164: inv.phone, role: inv.role, barber_id: inv.barberId, display_name: inv.name,
  });
  return error ? { ok: false, error: errorOf(error) } : { ok: true };
}

export async function deleteInvite(shopId: string, phone: string): Promise<TeamResult> {
  if (!supabaseConfigured()) {
    demo.invites = demo.invites.filter((i) => i.phone !== phone);
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.from("staff_invites").delete().eq("shop_id", shopId).eq("phone_e164", phone);
  return error ? { ok: false, error: errorOf(error) } : { ok: true };
}

export async function setMemberAccess(shopId: string, userId: string, role: StaffRole, barberId: string | null): Promise<TeamResult> {
  if (!supabaseConfigured()) {
    const m = demo.members.find((x) => x.userId === userId);
    if (!m) return { ok: false, error: "unknown" };
    if (role !== "owner" && !demo.members.some((x) => x.role === "owner" && x.userId !== userId)) return { ok: false, error: "last_owner" };
    for (const x of demo.members) if (x.barberId === barberId && barberId) x.barberId = null;
    Object.assign(m, { role, barberId });
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.rpc("set_member_access", { p_shop: shopId, p_user: userId, p_role: role, p_barber: barberId });
  return error ? { ok: false, error: errorOf(error) } : { ok: true };
}

export async function removeMember(shopId: string, userId: string): Promise<TeamResult> {
  if (!supabaseConfigured()) {
    if (!demo.members.some((x) => x.role === "owner" && x.userId !== userId)) return { ok: false, error: "last_owner" };
    demo.members = demo.members.filter((x) => x.userId !== userId);
    return { ok: true };
  }
  const db = await supabaseServer();
  const { error } = await db.rpc("remove_member", { p_shop: shopId, p_user: userId });
  return error ? { ok: false, error: errorOf(error) } : { ok: true };
}
