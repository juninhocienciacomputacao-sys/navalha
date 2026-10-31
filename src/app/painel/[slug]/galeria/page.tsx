import { redirect } from "next/navigation";
import { requireSection } from "@/lib/staff";
import { listLooks } from "@/modules/gallery/data";
import Gallery from "./Gallery";

export const dynamic = "force-dynamic";

export default async function GaleriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle } = await requireSection(slug, "servicos");
  if (!bundle.shop.modules.galeria) redirect(`/painel/${slug}/recursos`);
  const looks = await listLooks(bundle.shop.id);
  const services = bundle.services.map((s) => ({ id: s.id, name: s.name.pt }));
  return <Gallery slug={slug} looks={looks} services={services} />;
}
