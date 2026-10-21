"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { slugify } from "@/core/phone";
import { ALLOWED_CURRENCY, ALLOWED_TZ } from "./countries";

const MESSAGES: Record<string, string> = {
  slug_taken: "Esse endereço já está em uso. Escolha outro.",
  invalid_slug: "Use de 3 a 40 letras, números ou hífens no endereço.",
  invalid_name: "Digite o nome da barbearia.",
  too_many_shops: "Limite de 5 barbearias por conta.",
  not_logged_in: "Entre com seu WhatsApp primeiro.",
};

export async function createShop(_: string, form: FormData): Promise<string> {
  const name = String(form.get("name") ?? "");
  const slug = slugify(String(form.get("slug") || name));
  const pick = (k: string, ok: (v: string) => boolean, def: string) => { const v = String(form.get(k) ?? ""); return ok(v) ? v : def; };
  const timezone = pick("timezone", (v) => ALLOWED_TZ.has(v), "America/Sao_Paulo");
  const currency = pick("currency", (v) => ALLOWED_CURRENCY.has(v), "BRL");
  const lang = pick("lang", (v) => ["pt", "en", "es"].includes(v), "pt");
  const db = await supabaseServer();
  const { error } = await db.rpc("create_shop", { p_name: name, p_slug: slug, p_timezone: timezone, p_currency: currency, p_lang: lang });
  if (error) {
    const known = Object.entries(MESSAGES).find(([k]) => error.message.includes(k))?.[1];
    if (known) return known;
    console.error("create_shop", error);
    // Mostra o código do erro para facilitar o suporte (sem dados do banco).
    return `Não deu certo. Tente de novo. (erro ${error.code || "?"}: ${error.message.slice(0, 120)})`;
  }
  redirect(`/painel/${slug}`);
}
