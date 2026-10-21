import Link from "next/link";
import { requireStaff } from "@/lib/staff";
import { SHOP_SHARE } from "@/core/shopping";
import { clientCount, partnerCatalog, shopPartnerSettings, storeEnabled } from "@/modules/shopping/data";
import ShoppingAdmin from "./ShoppingAdmin";

export const dynamic = "force-dynamic";

export default async function Shopping({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, role } = await requireStaff(slug);
  const { shop } = bundle;
  const [{ stores, products }, settings, clients] = await Promise.all([
    partnerCatalog(shop.currency), shopPartnerSettings(shop.id), clientCount(shop.id),
  ]);
  const enabled = Object.fromEntries(stores.map((s) => [s.id, storeEnabled(settings, s.id)]));
  const featured = settings.flatMap((s) => s.featuredProductIds);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Shopping</p>
          <h1 className="text-2xl font-bold">Lojas parceiras</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Produtos de cuidados masculinos de lojas online parceiras aparecem no app dos seus clientes. A loja entrega e cuida do estoque;
            a cada compra indicada, a barbearia recebe {Math.round(SHOP_SHARE * 100)}% da comissão da loja.
          </p>
        </div>
        <Link href={`/b/${shop.slug}`} className="chip">Ver o app do cliente</Link>
      </header>

      <p className="mb-6 text-xs text-neutral-500">
        Para a aba aparecer no app, o recurso <b>Shopping</b> precisa estar ligado em{" "}
        <Link href={`/painel/${shop.slug}/recursos`} className="underline">Recursos</Link>.
      </p>

      {stores.length === 0 ? (
        <section className="card text-sm text-neutral-500">
          Ainda não há lojas parceiras para a moeda da sua barbearia ({shop.currency}). Assim que entrarem lojas na sua região, elas aparecem aqui.
        </section>
      ) : (
        <ShoppingAdmin
          slug={shop.slug}
          currency={shop.currency}
          lang={shop.defaultLang}
          stores={stores}
          products={products}
          enabled={enabled}
          featured={featured}
          clients={clients}
          canEdit={role === "owner" || role === "manager"}
        />
      )}
    </main>
  );
}
