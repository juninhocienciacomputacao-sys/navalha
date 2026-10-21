// Vitrine do Shopping no app do cliente. Ponto único de troca com o módulo src/modules/shopping.
// `null` = vitrine indisponível (a tela mostra "em breve").
import type { ShopBundle } from "@/data";
import { shopCatalogForClient, type ClientCatalog } from "@/modules/shopping/data";

export type { ClientCatalog };

export async function clientCatalog(b: ShopBundle): Promise<ClientCatalog | null> {
  try {
    const c = await shopCatalogForClient(b.shop.id);
    return c.products.length ? c : null;
  } catch {
    return null;
  }
}
