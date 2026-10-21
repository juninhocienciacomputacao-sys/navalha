import { requireStaff } from "@/lib/staff";
import { listServices, planNames } from "@/modules/settings/data";
import Services from "./Services";

export const dynamic = "force-dynamic";

export default async function ServicosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, role } = await requireStaff(slug);
  const [services, plans] = await Promise.all([listServices(bundle.shop.id), planNames(bundle.shop.id)]);
  return (
    <Services slug={slug} currency={bundle.shop.currency} lang={bundle.shop.defaultLang}
      canEdit={role === "owner" || role === "manager"} services={services} plans={plans} />
  );
}
