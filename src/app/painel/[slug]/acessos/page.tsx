import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { accessFor, LEVELS } from "@/core/access";
import { getAccessConfig, listInvites, listMembers } from "@/modules/team/data";
import Access from "./Access";

export const dynamic = "force-dynamic";

export default async function AcessosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, realRole, preview, userId, r } = await requireStaff(slug);
  if (realRole !== "owner" || preview) redirect(`/painel/${slug}/agenda`);
  const [config, members, invites] = await Promise.all([
    getAccessConfig(bundle.shop.id),
    listMembers(bundle.shop.id, userId),
    listInvites(bundle.shop.id),
  ]);
  const levels = Object.fromEntries(LEVELS.map((l) => [l, accessFor(l, config)])) as Record<(typeof LEVELS)[number], ReturnType<typeof accessFor>>;
  return (
    <Access slug={slug} demo={r.mode === "demo"} barbers={bundle.barbers.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
      levels={levels} members={members} invites={invites} />
  );
}
