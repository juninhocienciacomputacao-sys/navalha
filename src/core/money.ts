import { Lang } from "./types";

const LOCALE: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

/** Cada barbearia tem sua moeda; o idioma do cliente só muda a formatação. */
export function formatMoney(amount: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
