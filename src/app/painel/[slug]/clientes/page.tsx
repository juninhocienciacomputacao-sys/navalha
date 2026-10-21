import { requireStaff } from "@/lib/staff";
import { dayInZone } from "@/core/time";
import { clientMatches } from "@/core/planboard";
import { listClients } from "@/modules/clients/data";
import { listPlans } from "@/modules/plans/data";
import { Kpi } from "@/modules/clients/ui";
import ClientList from "./ClientList";

export const dynamic = "force-dynamic";

export default async function Clientes({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle } = await requireStaff(slug);
  const { shop, barbers } = bundle;
  const today = dayInZone(new Date(), shop.timezone);
  const [clients, plans] = await Promise.all([listClients(bundle), listPlans(bundle)]);
  const count = (f: Parameters<typeof clientMatches>[2]) => clients.filter((c) => clientMatches({ ...c, subscriber: Boolean(c.sub) }, today, f)).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Clientes</p>
        <h1 className="text-2xl font-bold">Base de clientes</h1>
        <p className="mt-1 text-sm text-neutral-500">Cada cliente é o número do WhatsApp. Toque em um nome para abrir a ficha.</p>
      </header>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Clientes cadastrados" value={String(clients.length)} />
        <Kpi label="Assinantes de plano" value={String(count("subscribers"))} />
        <Kpi label="Sumidos" value={String(count("away"))} hint="mais de 30 dias sem vir" tone={count("away") ? "warn" : undefined} />
        <Kpi label="Novos" value={String(count("new"))} hint="cadastrados nos últimos 30 dias" />
      </section>
      <ClientList
        slug={slug} today={today} currency={shop.currency} lang={shop.defaultLang} alertDays={shop.planAlertDays}
        barbers={barbers} plans={plans.map((p) => ({ id: p.id, name: p.name }))} clients={clients}
      />
    </main>
  );
}

