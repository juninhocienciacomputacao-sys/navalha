import type { ShopInfo } from "@/data/types";
import type { Lang } from "@/core/types";
import { locale, tx } from "@/i18n";
import type { MessageAppointment } from "./data";

export const fmtDay = (d: Date, tz: string, lang: Lang) =>
  d.toLocaleDateString(locale(lang), { weekday: "short", day: "2-digit", month: "2-digit", timeZone: tz });
export const fmtTime = (d: Date, tz: string, lang: Lang) =>
  d.toLocaleTimeString(locale(lang), { hour: "2-digit", minute: "2-digit", timeZone: tz });

/** Valores das variáveis para um agendamento real. */
export function varsForAppointment(shop: ShopInfo, a: MessageAppointment, link: string): Record<string, string> {
  const lang = a.lang;
  return {
    nome: a.clientName.split(" ")[0],
    servico: tx(a.serviceName, lang),
    barbeiro: a.barberName,
    data: fmtDay(a.startsAt, shop.timezone, lang),
    hora: fmtTime(a.startsAt, shop.timezone, lang),
    endereco: shop.address ?? "",
    barbearia: shop.name,
    link,
  };
}

/** Exemplo para a prévia (cliente fictício, dados da barbearia de verdade). */
export function sampleVars(shop: ShopInfo, barber: string, service: string, plan: string, link: string): Record<string, string> {
  const at = new Date(Date.now() + 86_400_000);
  const due = new Date(Date.now() + 5 * 86_400_000);
  return {
    nome: "Marcos", servico: service, barbeiro: barber,
    data: fmtDay(at, shop.timezone, shop.defaultLang), hora: "15:30",
    endereco: shop.address ?? "(endereço da barbearia)", plano: plan, dias: "5",
    vencimento: due.toLocaleDateString(locale(shop.defaultLang), { day: "2-digit", month: "2-digit", timeZone: shop.timezone }),
    link, barbearia: shop.name,
  };
}

/** Link do WhatsApp com o texto pronto. Sem telefone, o WhatsApp pede para escolher o contato. */
export const waLink = (phone: string | null, text: string) =>
  `https://wa.me/${phone ? phone.replace(/\D/g, "") : ""}?text=${encodeURIComponent(text)}`;
