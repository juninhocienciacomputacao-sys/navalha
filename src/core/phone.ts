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
