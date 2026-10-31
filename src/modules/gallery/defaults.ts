// Galeria inicial de cortes e barbas: toda barbearia já nasce com estes modelos.
// Os desenhos ficam em public/galeria/<art>.svg (gerados por scripts/galeria-art.mjs).
// O banco repete esta lista em insert_default_style_looks() (migração 0015); um teste confere que os dois batem.
import type { I18nText } from "@/core/types";

export type LookKind = "cut" | "beard";

export interface DefaultLook {
  art: string;
  kind: LookKind;
  name: I18nText;
  desc: I18nText;
}

export const DEFAULT_LOOKS: DefaultLook[] = [
  // ---------- cortes ----------
  { art: "corte-low-fade", kind: "cut",
    name: { pt: "Degradê baixo", en: "Low fade", es: "Degradado bajo" },
    desc: { pt: "Laterais esfumadas só perto da orelha. Discreto e fácil de manter.", en: "Sides fade out just above the ear. Subtle and easy to keep.", es: "Laterales difuminados solo cerca de la oreja. Discreto y fácil de mantener." } },
  { art: "corte-mid-fade", kind: "cut",
    name: { pt: "Degradê médio", en: "Mid fade", es: "Degradado medio" },
    desc: { pt: "O degradê sobe até o meio da lateral. O mais pedido.", en: "The fade goes up to the middle of the sides. The most requested.", es: "El degradado sube hasta la mitad del lateral. El más pedido." } },
  { art: "corte-skin-fade", kind: "cut",
    name: { pt: "Navalhado com risca", en: "Skin fade with hard part", es: "Degradado a navaja con raya" },
    desc: { pt: "Laterais zeradas na navalha e risca desenhada. Visual marcante.", en: "Sides taken down to the skin with a razor-drawn part. A bold look.", es: "Laterales a piel con navaja y raya marcada. Look llamativo." } },
  { art: "corte-crew", kind: "cut",
    name: { pt: "Social", en: "Crew cut", es: "Corte clásico" },
    desc: { pt: "Curto e alinhado, do trabalho ao fim de semana.", en: "Short and neat, from the office to the weekend.", es: "Corto y prolijo, de la oficina al fin de semana." } },
  { art: "corte-side-part", kind: "cut",
    name: { pt: "Social com risca", en: "Side part", es: "Raya al costado" },
    desc: { pt: "Risca lateral marcada e topo penteado. Clássico e elegante.", en: "Sharp side part with a combed top. Classic and elegant.", es: "Raya lateral marcada y parte superior peinada. Clásico y elegante." } },
  { art: "corte-textured-crop", kind: "cut",
    name: { pt: "Crop texturizado", en: "Textured crop", es: "Crop texturizado" },
    desc: { pt: "Franja curta com textura e laterais baixas. Moderno e prático.", en: "Short textured fringe with low sides. Modern and low effort.", es: "Flequillo corto con textura y laterales bajos. Moderno y práctico." } },
  { art: "corte-pompadour", kind: "cut",
    name: { pt: "Topete", en: "Pompadour", es: "Tupé" },
    desc: { pt: "Volume no alto da cabeça penteado para trás. Pede pomada.", en: "Volume on top combed back. Needs a little pomade.", es: "Volumen arriba peinado hacia atrás. Pide pomada." } },
  { art: "corte-undercut", kind: "cut",
    name: { pt: "Undercut", en: "Undercut", es: "Undercut" },
    desc: { pt: "Topo comprido e laterais raspadas, com contraste forte.", en: "Long top with shaved sides for strong contrast.", es: "Parte superior larga y laterales rapados, con mucho contraste." } },
  { art: "corte-buzz", kind: "cut",
    name: { pt: "Máquina (buzz cut)", en: "Buzz cut", es: "Rapado (buzz cut)" },
    desc: { pt: "Máquina por igual. Zero trabalho de manhã.", en: "Same clipper length all over. Zero effort in the morning.", es: "Máquina pareja. Cero trabajo por la mañana." } },
  { art: "corte-curly-top", kind: "cut",
    name: { pt: "Cacheado com degradê", en: "Curly top fade", es: "Rizos con degradado" },
    desc: { pt: "Cachos definidos no topo e laterais baixas.", en: "Defined curls on top with low sides.", es: "Rizos definidos arriba y laterales bajos." } },
  { art: "corte-afro", kind: "cut",
    name: { pt: "Black power", en: "Afro", es: "Afro" },
    desc: { pt: "Volume natural e arredondado, com contorno alinhado.", en: "Natural rounded volume with a clean outline.", es: "Volumen natural y redondeado, con contorno prolijo." } },
  { art: "corte-mullet", kind: "cut",
    name: { pt: "Mullet moderno", en: "Modern mullet", es: "Mullet moderno" },
    desc: { pt: "Curto na frente e nas laterais, comprido atrás.", en: "Short at the front and sides, long at the back.", es: "Corto adelante y a los lados, largo atrás." } },
  // ---------- barbas ----------
  { art: "barba-stubble", kind: "beard",
    name: { pt: "Barba por fazer", en: "Stubble", es: "Barba de pocos días" },
    desc: { pt: "Barba bem curtinha e uniforme, com contorno limpo.", en: "Very short, even beard with a clean outline.", es: "Barba muy corta y pareja, con contorno limpio." } },
  { art: "barba-short", kind: "beard",
    name: { pt: "Barba curta desenhada", en: "Short boxed beard", es: "Barba corta perfilada" },
    desc: { pt: "Curta, com linhas da bochecha e do pescoço bem marcadas.", en: "Short, with sharp cheek and neck lines.", es: "Corta, con líneas de mejilla y cuello bien marcadas." } },
  { art: "barba-full", kind: "beard",
    name: { pt: "Barba cheia", en: "Full beard", es: "Barba completa" },
    desc: { pt: "Barba média e volumosa, aparada por igual.", en: "Medium, full beard trimmed evenly.", es: "Barba media y tupida, recortada pareja." } },
  { art: "barba-fade-beard", kind: "beard",
    name: { pt: "Barba com degradê", en: "Faded beard", es: "Barba con degradado" },
    desc: { pt: "A barba vai sumindo até o cabelo, sem corte seco.", en: "The beard blends smoothly into the haircut.", es: "La barba se difumina hasta el pelo, sin corte seco." } },
  { art: "barba-long", kind: "beard",
    name: { pt: "Barba lenhador", en: "Long beard", es: "Barba leñador" },
    desc: { pt: "Longa e volumosa. Pede óleo e escova toda semana.", en: "Long and full. Needs oil and brushing every week.", es: "Larga y tupida. Pide aceite y cepillo cada semana." } },
  { art: "barba-goatee", kind: "beard",
    name: { pt: "Cavanhaque", en: "Goatee", es: "Perilla" },
    desc: { pt: "Bigode e queixo ligados, bochechas lisas.", en: "Moustache joined to the chin, clean cheeks.", es: "Bigote unido al mentón, mejillas lisas." } },
  { art: "barba-van-dyke", kind: "beard",
    name: { pt: "Van Dyke", en: "Van Dyke", es: "Van Dyke" },
    desc: { pt: "Bigode separado do queixo em ponta.", en: "Moustache separate from a pointed chin beard.", es: "Bigote separado de la barba en punta del mentón." } },
  { art: "barba-mustache", kind: "beard",
    name: { pt: "Bigode", en: "Moustache", es: "Bigote" },
    desc: { pt: "Bigode marcante com o resto do rosto liso.", en: "A bold moustache with the rest of the face clean.", es: "Bigote marcado con el resto de la cara lisa." } },
];

export const KIND_LABEL: Record<LookKind, I18nText> = {
  cut: { pt: "Cortes", en: "Haircuts", es: "Cortes" },
  beard: { pt: "Barbas", en: "Beards", es: "Barbas" },
};
