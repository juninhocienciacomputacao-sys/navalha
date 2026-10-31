import type { I18nText } from "@/core/types";
import type { LookKind } from "./defaults";

/** Um modelo da galeria (corte ou barba). */
export interface Look {
  id: string;
  kind: LookKind;
  name: I18nText;
  desc: I18nText | null;
  /** Desenho padrão (public/galeria/<art>.svg), usado quando não há foto. */
  art: string | null;
  /** O dono enviou uma foto própria. */
  hasPhoto: boolean;
  /** Muda quando o modelo é editado (evita mostrar a foto antiga guardada no celular). */
  version: string;
  /** Serviço para agendar este modelo. */
  serviceId: string | null;
  sort: number;
}

/** Endereço da imagem do modelo: a foto do dono ou o desenho padrão. */
export function lookImage(slug: string, l: Pick<Look, "id" | "art" | "hasPhoto" | "version">): string | null {
  if (l.hasPhoto) return `/b/${slug}/galeria/${l.id}?v=${l.version}`;
  return l.art ? `/galeria/${l.art}.svg` : null;
}
