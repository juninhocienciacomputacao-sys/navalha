// Catálogo de demonstração. Lojas e produtos fictícios (nenhuma marca real); links em domínio .example.
// No sistema real o catálogo vem das tabelas partner_stores e partner_products, cadastradas pela plataforma.
import type { PartnerProduct, PartnerStore } from "./types";

export const DEMO_STORES: PartnerStore[] = [
  { id: "ps-lamina", slug: "lamina-club", name: "Lâmina Club", category: { pt: "Navalhas e pós-barba", en: "Razors and aftershave", es: "Navajas y aftershave" }, commissionPct: 12, rating: 4.8, currency: "BRL" },
  { id: "ps-bigode", slug: "emporio-bigode-fino", name: "Empório Bigode Fino", category: { pt: "Barba e cabelo", en: "Beard and hair", es: "Barba y cabello" }, commissionPct: 10, rating: 4.7, currency: "BRL" },
  { id: "ps-pomadeiro", slug: "casa-do-pomadeiro", name: "Casa do Pomadeiro", category: { pt: "Pomadas e finalizadores", en: "Pomades and styling", es: "Pomadas y fijadores" }, commissionPct: 12, rating: 4.9, currency: "BRL" },
  { id: "ps-dermo", slug: "pele-de-aco-lab", name: "Pele de Aço Lab", category: { pt: "Cuidados com a pele e queda", en: "Skin and hair loss care", es: "Piel y caída del cabello" }, commissionPct: 15, rating: 4.6, currency: "BRL" },
];

const url = (store: string, p: string) => `https://${store}.example/produto/${p}`;

export const DEMO_PRODUCTS: PartnerProduct[] = [
  { id: "pp-oleo", storeId: "ps-lamina", name: { pt: "Óleo para barba Cedro", en: "Cedar beard oil", es: "Aceite para barba Cedro" }, category: "beard", price: 49.9, rating: 4.8, art: "bottle", color: "#b8862f", affiliateUrl: url("lamina-club", "oleo-cedro") },
  { id: "pp-balm", storeId: "ps-bigode", name: { pt: "Balm hidratante de barba", en: "Moisturizing beard balm", es: "Bálsamo hidratante de barba" }, category: "beard", price: 39.9, rating: 4.7, art: "jar", color: "#2f6b4f", affiliateUrl: url("emporio-bigode-fino", "balm") },
  { id: "pp-pomada", storeId: "ps-pomadeiro", name: { pt: "Pomada efeito matte", en: "Matte styling paste", es: "Pomada efecto mate" }, category: "hair", price: 44.9, rating: 4.9, art: "jar", color: "#24323b", affiliateUrl: url("casa-do-pomadeiro", "pomada-matte") },
  { id: "pp-pomada-brilho", storeId: "ps-pomadeiro", name: { pt: "Pomada modeladora com brilho", en: "Shine pomade", es: "Pomada con brillo" }, category: "hair", price: 39.9, rating: 4.7, art: "jar", color: "#7a4b1e", affiliateUrl: url("casa-do-pomadeiro", "pomada-brilho") },
  { id: "pp-shampoo", storeId: "ps-bigode", name: { pt: "Shampoo mentolado anticaspa", en: "Mint anti-dandruff shampoo", es: "Champú mentolado anticaspa" }, category: "hair", price: 34.9, rating: 4.6, art: "bottle", color: "#3d7fb0", affiliateUrl: url("emporio-bigode-fino", "shampoo-menta") },
  { id: "pp-shampoo-barba", storeId: "ps-bigode", name: { pt: "Shampoo para barba", en: "Beard wash", es: "Champú para barba" }, category: "beard", price: 29.9, rating: 4.5, art: "bottle", color: "#5b6b2f", affiliateUrl: url("emporio-bigode-fino", "shampoo-barba") },
  { id: "pp-minox", storeId: "ps-dermo", name: { pt: "Tônico capilar com minoxidil 5%", en: "Hair tonic with 5% minoxidil", es: "Tónico capilar con minoxidil 5%" }, category: "hair", price: 69.9, rating: 4.5, art: "bottle", color: "#4b5563", affiliateUrl: url("pele-de-aco-lab", "tonico-minoxidil") },
  { id: "pp-posbarba", storeId: "ps-lamina", name: { pt: "Pós-barba calmante", en: "Soothing aftershave", es: "Aftershave calmante" }, category: "skin", price: 42, rating: 4.7, art: "bottle", color: "#8a3f86", affiliateUrl: url("lamina-club", "pos-barba") },
  { id: "pp-fps", storeId: "ps-dermo", name: { pt: "Protetor solar facial FPS 50", en: "Face sunscreen SPF 50", es: "Protector solar facial FPS 50" }, category: "skin", price: 59.9, rating: 4.6, art: "tube", color: "#c0532b", affiliateUrl: url("pele-de-aco-lab", "fps-50") },
  { id: "pp-gel", storeId: "ps-dermo", name: { pt: "Gel de limpeza facial", en: "Face cleansing gel", es: "Gel limpiador facial" }, category: "skin", price: 36.9, rating: 4.4, art: "tube", color: "#0f766e", affiliateUrl: url("pele-de-aco-lab", "gel-limpeza") },
  { id: "pp-kit-navalha", storeId: "ps-lamina", name: { pt: "Kit navalha + 10 lâminas", en: "Razor kit + 10 blades", es: "Kit navaja + 10 cuchillas" }, category: "kits", price: 89.9, rating: 4.9, art: "kit", color: "#14212a", affiliateUrl: url("lamina-club", "kit-navalha") },
  { id: "pp-kit-barba", storeId: "ps-bigode", name: { pt: "Kit barba completa: óleo + balm + pente", en: "Full beard kit: oil + balm + comb", es: "Kit barba completa: aceite + bálsamo + peine" }, category: "kits", price: 119.9, rating: 4.8, art: "kit", color: "#9a6a1c", affiliateUrl: url("emporio-bigode-fino", "kit-barba") },
];
