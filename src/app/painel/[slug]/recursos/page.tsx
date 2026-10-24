import { requireSection } from "@/lib/staff";
import { getSettings } from "@/modules/settings/data";
import Settings from "./Settings";

export const dynamic = "force-dynamic";

export default async function RecursosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle } = await requireSection(slug, "recursos");
  const s = await getSettings(bundle.shop.id, bundle.shop, bundle.walkIn);
  let zones: string[] = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch { zones = [bundle.shop.timezone]; }
  return <Settings slug={slug} settings={s} canEdit={true} zones={zones} />;
}
