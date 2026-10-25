/** Aceita "11 98888-7777", "(11) 98888-7777" ou "+55 11 98888-7777". Sem DDI, assume Brasil. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const full = raw.trim().startsWith("+") ? digits : digits.length <= 11 ? "55" + digits : digits;
  return full.length >= 11 && full.length <= 15 ? "+" + full : null;
}

/** "Barbearia do Zé!" → "barbearia-do-ze" (endereço do link da barbearia). */
export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/** Junta espaços repetidos: "  joão   silva " → "joão silva". */
export const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ");

/**
 * Nome completo = nome e sobrenome (pelo menos duas palavras, a primeira com 2 letras ou mais).
 * "João Silva" e "Zé da Silva" passam; "João" e "J S" não.
 */
export function isFullName(raw: string): boolean {
  const parts = cleanName(raw).split(" ").filter((p) => /\p{L}/u.test(p));
  return parts.length >= 2 && parts[0].replace(/[^\p{L}]/gu, "").length >= 2;
}
