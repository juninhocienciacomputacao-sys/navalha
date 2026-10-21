import type { I18nText } from "@/core/types";

export type ProductCategory = "beard" | "hair" | "skin" | "kits";
export type ProductArt = "bottle" | "jar" | "tube" | "kit";

export interface PartnerStore {
  id: string;
  slug: string;
  name: string;
  category: I18nText;
  commissionPct: number;
  rating: number | null;
  currency: string;
}

export interface PartnerProduct {
  id: string;
  storeId: string;
  name: I18nText;
  category: ProductCategory;
  price: number;
  rating: number | null;
  art: ProductArt;
  color: string;
  affiliateUrl: string;
}

export interface ShopPartnerSetting {
  storeId: string;
  enabled: boolean;
  featuredProductIds: string[];
}

/** Produto pronto para a vitrine do app do cliente. */
export interface ClientProduct extends PartnerProduct {
  storeName: string;
  featured: boolean;
  /** Link de afiliado já marcado com a barbearia. */
  link: string;
}

export interface ClientCatalog {
  shopId: string;
  currency: string;
  stores: PartnerStore[];
  /** Destaques da barbearia primeiro. */
  products: ClientProduct[];
  categories: ProductCategory[];
}

export const CATEGORY_LABEL: Record<ProductCategory, I18nText> = {
  beard: { pt: "Barba", en: "Beard", es: "Barba" },
  hair: { pt: "Cabelo", en: "Hair", es: "Cabello" },
  skin: { pt: "Pele", en: "Skin", es: "Piel" },
  kits: { pt: "Kits", en: "Kits", es: "Kits" },
};
