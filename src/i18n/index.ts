import type { I18nText, Lang } from "@/core/types";

const dict = {
  pt: {
    book: "Agendar", service: "Serviço", professional: "Profissional", anyone: "Qualquer um", day: "Dia", time: "Horário",
    with: "com", closed: "Fechado neste dia", noSlots: "Sem horários livres neste dia.", fewSlots: "Poucos horários com {name}. Outras opções perto:",
    yourName: "Seu nome", whatsapp: "WhatsApp", confirm: "Confirmar agendamento", booked: "Agendado!", bookedMsg: "{service} com {barber}, {day} às {time}. Você recebe o lembrete no WhatsApp 1 dia e 2 horas antes.",
    another: "Marcar outro", today: "Hoje", tomorrow: "Amanhã", min: "min", loginNeeded: "Entre com seu WhatsApp para confirmar.",
    slot_taken: "Esse horário acabou de ser ocupado. Escolha outro.", slot_in_past: "Esse horário já passou.", error: "Não deu certo. Tente de novo.",
    demo: "Modo demonstração",
  },
  en: {
    book: "Book", service: "Service", professional: "Professional", anyone: "Anyone", day: "Day", time: "Time",
    with: "with", closed: "Closed on this day", noSlots: "No free times on this day.", fewSlots: "Few times with {name}. Other options nearby:",
    yourName: "Your name", whatsapp: "WhatsApp", confirm: "Confirm booking", booked: "Booked!", bookedMsg: "{service} with {barber}, {day} at {time}. You'll get a WhatsApp reminder 1 day and 2 hours before.",
    another: "Book another", today: "Today", tomorrow: "Tomorrow", min: "min", loginNeeded: "Sign in with your WhatsApp to confirm.",
    slot_taken: "That time was just taken. Please pick another.", slot_in_past: "That time has passed.", error: "Something went wrong. Try again.",
    demo: "Demo mode",
  },
  es: {
    book: "Reservar", service: "Servicio", professional: "Profesional", anyone: "Cualquiera", day: "Día", time: "Hora",
    with: "con", closed: "Cerrado este día", noSlots: "No hay horarios libres este día.", fewSlots: "Pocos horarios con {name}. Otras opciones cerca:",
    yourName: "Tu nombre", whatsapp: "WhatsApp", confirm: "Confirmar reserva", booked: "¡Reservado!", bookedMsg: "{service} con {barber}, {day} a las {time}. Recibirás el recordatorio por WhatsApp 1 día y 2 horas antes.",
    another: "Reservar otro", today: "Hoy", tomorrow: "Mañana", min: "min", loginNeeded: "Entra con tu WhatsApp para confirmar.",
    slot_taken: "Ese horario acaba de ocuparse. Elige otro.", slot_in_past: "Ese horario ya pasó.", error: "Algo salió mal. Inténtalo de nuevo.",
    demo: "Modo demostración",
  },
} as const;

export type Dict = { [K in keyof (typeof dict)["pt"]]: string };
export const LANGS: Lang[] = ["pt", "en", "es"];
export const asLang = (v: unknown, fallback: Lang): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : fallback);
export const t = (lang: Lang): Dict => dict[lang];
export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
export const tx = (text: I18nText, lang: Lang) => text[lang] ?? text.pt;
export const locale = (lang: Lang) => ({ pt: "pt-BR", en: "en-US", es: "es-ES" })[lang];
