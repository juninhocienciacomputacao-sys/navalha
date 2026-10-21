// Corte ideal: análise do rosto e plano de etapas do projeto de visual.
// A análise é SIMULADA (igual ao protótipo). Para ligar uma IA de visão de verdade, troque só `analyzeFace`
// por uma chamada no servidor que receba a foto e devolva o mesmo formato `FaceAnalysis`. O barbeiro revisa depois.
import type { I18nText } from "@/core/types";
import { addDays } from "@/core/time";
import type { ProjectStep } from "./types";

export const HAIR: I18nText[] = [
  { pt: "liso", en: "straight", es: "liso" },
  { pt: "ondulado", en: "wavy", es: "ondulado" },
  { pt: "cacheado", en: "curly", es: "rizado" },
  { pt: "crespo", en: "coily", es: "afro" },
];
export const ROUTINE: I18nText[] = [
  { pt: "prática", en: "quick", es: "práctica" },
  { pt: "média", en: "medium", es: "media" },
  { pt: "caprichada", en: "detailed", es: "cuidada" },
];
export const VIBE: I18nText[] = [
  { pt: "corporativo", en: "corporate", es: "corporativo" },
  { pt: "casual", en: "casual", es: "casual" },
  { pt: "criativo", en: "creative", es: "creativo" },
  { pt: "esportivo", en: "sporty", es: "deportivo" },
];

export interface StylePrefs { hair: number; routine: number; vibe: number }

export interface CutSuggestion {
  name: string;
  desc: I18nText;
  /** Compatibilidade estimada, em %. */
  match: number;
  /** Manutenção a cada N dias. */
  every: number;
  shape: number;
}

export interface FaceAnalysis {
  face: I18nText;
  density: I18nText;
  strong: I18nText;
  suggestions: CutSuggestion[];
  simulated: true;
}

const MAIN: [string, I18nText][] = [
  ["Textured crop", { pt: "Franja texturizada que dá volume ao fio liso.", en: "Textured fringe that adds volume to straight hair.", es: "Flequillo texturizado que da volumen al pelo liso." }],
  ["Taper fade", { pt: "Laterais baixas e topo com o movimento natural das ondas.", en: "Low sides and a top that keeps your natural wave.", es: "Laterales bajos y parte superior con el movimiento natural de las ondas." }],
  ["Burst fade", { pt: "Cachos definidos no topo e degradê em meia-lua atrás da orelha.", en: "Defined curls on top, half-moon fade behind the ear.", es: "Rizos definidos arriba y degradado en media luna detrás de la oreja." }],
  ["High top fade", { pt: "Topo estruturado e laterais limpas para alongar o rosto.", en: "Structured top and clean sides to lengthen the face.", es: "Parte superior estructurada y laterales limpios para alargar el rostro." }],
];

/** Análise simulada: depende só das preferências. A foto não é enviada a lugar nenhum. */
export function analyzeFace(p: StylePrefs): FaceAnalysis {
  const main = MAIN[p.hair] ?? MAIN[0];
  const easy = p.routine === 0;
  const corp = p.vibe === 0;
  const sporty = p.vibe === 3;
  return {
    face: { pt: "oval alongado", en: "long oval", es: "ovalado alargado" },
    density: { pt: "densidade média", en: "medium density", es: "densidad media" },
    strong: { pt: "maxilar marcado", en: "defined jawline", es: "mandíbula marcada" },
    simulated: true,
    suggestions: [
      { name: main[0], desc: main[1], match: 94, every: easy ? 21 : 15, shape: 0 },
      corp
        ? { name: "Side part", desc: { pt: "Risca lateral marcada, do escritório ao fim de semana.", en: "Sharp side part that works from office to weekend.", es: "Raya lateral marcada, de la oficina al fin de semana." }, match: 88, every: easy ? 25 : 18, shape: 1 }
        : { name: "Mid fade + hard part", desc: { pt: "Risca desenhada à navalha, visual moderno com pouca manutenção.", en: "Razor-drawn part, modern look with little upkeep.", es: "Raya marcada a navaja, look moderno con poco mantenimiento." }, match: 88, every: easy ? 25 : 18, shape: 1 },
      { name: "Buzz cut + beard design", desc: { pt: "Realça o maxilar e leva 2 minutos para arrumar de manhã.", en: "Shows off the jawline and takes 2 minutes in the morning.", es: "Resalta la mandíbula y se arregla en 2 minutos por la mañana." }, match: sporty ? 86 : 79, every: 14, shape: 2 },
    ],
  };
}

/** Etapas do projeto de visual ao longo de ~10 semanas, a partir de `start` (AAAA-MM-DD). */
export function projectSteps(s: CutSuggestion, start: string): ProjectStep[] {
  const d = (n: number) => addDays(start, n);
  return [
    { wk: "S0", done: false, date: d(1),
      title: { pt: "Consulta e corte base", en: "Consultation and base cut", es: "Consulta y corte base" },
      desc: { pt: "O barbeiro valida a sugestão com você e prepara a base", en: "Your barber reviews the suggestion with you and sets the base", es: "El barbero valida la sugerencia contigo y prepara la base" } },
    { wk: "S3", done: false, date: d(22),
      title: { pt: "Crescimento guiado", en: "Guided growth", es: "Crecimiento guiado" },
      desc: { pt: "Só acabamento: o topo ganha o comprimento necessário", en: "Only clean-ups while the top grows out", es: "Solo terminaciones: la parte superior gana largo" } },
    { wk: "S5", done: false, date: d(36),
      title: { pt: "Primeira forma", en: "First shape", es: "Primera forma" },
      desc: { pt: `${s.name} em versão inicial, com textura`, en: `First version of the ${s.name}, with texture`, es: `${s.name} en versión inicial, con textura` } },
    { wk: "S8", done: false, date: d(57),
      title: { pt: "Ajuste fino", en: "Fine tuning", es: "Ajuste fino" },
      desc: { pt: "Barba e contorno alinhados ao formato do rosto", en: "Beard and outline matched to your face shape", es: "Barba y contorno alineados con la forma del rostro" } },
    { wk: "S10", done: false, date: d(71),
      title: { pt: "Resultado final", en: "Final result", es: "Resultado final" },
      desc: { pt: `Fotos de antes e depois, manutenção a cada ${s.every} dias`, en: `Before and after photos, touch-up every ${s.every} days`, es: `Fotos de antes y después, mantenimiento cada ${s.every} días` } },
  ];
}

/** Próxima etapa: a primeira ainda não feita. */
export const nextStepIndex = (steps: ProjectStep[]) => steps.findIndex((s) => !s.done);
