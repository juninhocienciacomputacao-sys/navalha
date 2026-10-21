import type { MessageTrigger } from "@/core/messages";
import type { Lang } from "@/core/types";

/** Textos prontos por gatilho, para o dono escolher em vez de escrever. */
export type Variant = { label: string; body: Record<Lang, string> };

export const VARIANTS: Record<MessageTrigger, Variant[]> = {
  before_appointment: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. Confirmamos seu horário de {servico} com {barbeiro} em {data}, às {hora}.\nEndereço: {endereco}.\nPara remarcar: {link}",
      en: "Hello {nome}. Your {servico} with {barbeiro} is confirmed for {data} at {hora}.\nAddress: {endereco}.\nTo reschedule: {link}",
      es: "Hola, {nome}. Confirmamos tu turno de {servico} con {barbeiro} el {data} a las {hora}.\nDirección: {endereco}.\nPara cambiarlo: {link}" } },
    { label: "Descontraído", body: {
      pt: "E aí, {nome}! 💈 Tá marcado: {servico} com {barbeiro}, {data} às {hora}. Te esperamos! Se precisar mudar: {link}",
      en: "Hey {nome}! 💈 You're booked: {servico} with {barbeiro}, {data} at {hora}. See you! Need to change? {link}",
      es: "¡Hola, {nome}! 💈 Ya está: {servico} con {barbeiro}, {data} a las {hora}. ¡Te esperamos! Si necesitas cambiar: {link}" } },
    { label: "Curto", body: {
      pt: "{nome}, lembrete: {servico} {data} às {hora} com {barbeiro}.",
      en: "{nome}, reminder: {servico} {data} at {hora} with {barbeiro}.",
      es: "{nome}, recordatorio: {servico} {data} a las {hora} con {barbeiro}." } },
  ],
  after_appointment: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. Obrigado pela preferência! Gostaríamos de saber: de 0 a 10, quanto você recomendaria a {barbearia}?",
      en: "Hello {nome}. Thank you for choosing us! From 0 to 10, how likely are you to recommend {barbearia}?",
      es: "Hola, {nome}. ¡Gracias por elegirnos! Del 0 al 10, ¿cuánto recomendarías {barbearia}?" } },
    { label: "Descontraído", body: {
      pt: "Ficou na régua, {nome}! 😎 Valeu por vir. Já deixa o próximo marcado: {link}",
      en: "Looking sharp, {nome}! 😎 Thanks for coming. Book your next visit: {link}",
      es: "¡Quedaste impecable, {nome}! 😎 Gracias por venir. Reserva el próximo: {link}" } },
    { label: "Curto", body: {
      pt: "Valeu, {nome}! Até a próxima. 💈",
      en: "Thanks, {nome}! See you next time. 💈",
      es: "¡Gracias, {nome}! Hasta la próxima. 💈" } },
  ],
  plan_expiring: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. Seu plano {plano} vence em {vencimento}. Para continuar com seus atendimentos, renove pelo link: {link}",
      en: "Hello {nome}. Your {plano} plan is due on {vencimento}. To keep your visits, renew here: {link}",
      es: "Hola, {nome}. Tu plan {plano} vence el {vencimento}. Para seguir con tus turnos, renuévalo aquí: {link}" } },
    { label: "Descontraído", body: {
      pt: "Fala, {nome}! Faltam {dias} dias pro seu {plano} vencer. Renova aí pra não perder a vaga: {link}",
      en: "Hey {nome}! {dias} days until your {plano} renews. Renew so you don't lose your spot: {link}",
      es: "¡Hola, {nome}! Faltan {dias} días para que venza tu {plano}. Renuévalo para no perder tu lugar: {link}" } },
    { label: "Curto", body: {
      pt: "{nome}, seu plano vence em {dias} dias. Renove: {link}",
      en: "{nome}, your plan is due in {dias} days. Renew: {link}",
      es: "{nome}, tu plan vence en {dias} días. Renueva: {link}" } },
  ],
  plan_expired: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. Seu plano {plano} venceu em {vencimento}. Assim que o pagamento for feito, ele volta a valer: {link}",
      en: "Hello {nome}. Your {plano} plan expired on {vencimento}. Once paid, it works again: {link}",
      es: "Hola, {nome}. Tu plan {plano} venció el {vencimento}. Al pagarlo, vuelve a valer: {link}" } },
    { label: "Descontraído", body: {
      pt: "Opa, {nome}! Seu {plano} venceu. Bora reativar? É só pagar aqui: {link}",
      en: "Hey {nome}! Your {plano} expired. Let's reactivate it? Pay here: {link}",
      es: "¡Hola, {nome}! Tu {plano} venció. ¿Lo reactivamos? Paga aquí: {link}" } },
    { label: "Curto", body: {
      pt: "{nome}, seu plano venceu. Reative: {link}",
      en: "{nome}, your plan expired. Reactivate: {link}",
      es: "{nome}, tu plan venció. Reactívalo: {link}" } },
  ],
  client_absent: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. Sentimos sua falta na {barbearia}. Que tal agendar seu próximo horário? {link}",
      en: "Hello {nome}. We miss you at {barbearia}. How about booking your next visit? {link}",
      es: "Hola, {nome}. Te extrañamos en {barbearia}. ¿Agendamos tu próximo turno? {link}" } },
    { label: "Descontraído", body: {
      pt: "Sumiu, hein, {nome}! 😄 O {barbeiro} tá com horário livre. Marca aqui: {link}",
      en: "Long time no see, {nome}! 😄 {barbeiro} has free slots. Book here: {link}",
      es: "¡Desapareciste, {nome}! 😄 {barbeiro} tiene turnos libres. Reserva aquí: {link}" } },
    { label: "Curto", body: {
      pt: "{nome}, bora cortar? {link}",
      en: "{nome}, time for a cut? {link}",
      es: "{nome}, ¿un corte? {link}" } },
  ],
  birthday: [
    { label: "Formal", body: {
      pt: "Olá, {nome}. A equipe da {barbearia} deseja um feliz aniversário! 🎉",
      en: "Hello {nome}. The {barbearia} team wishes you a happy birthday! 🎉",
      es: "Hola, {nome}. ¡El equipo de {barbearia} te desea feliz cumpleaños! 🎉" } },
    { label: "Descontraído", body: {
      pt: "Parabéns, {nome}! 🎂 Dia de ficar no estilo. Seu horário te espera: {link}",
      en: "Happy birthday, {nome}! 🎂 A day to look sharp. Book here: {link}",
      es: "¡Feliz cumple, {nome}! 🎂 Día para verse bien. Reserva aquí: {link}" } },
    { label: "Curto", body: {
      pt: "Feliz aniversário, {nome}! 🎉",
      en: "Happy birthday, {nome}! 🎉",
      es: "¡Feliz cumpleaños, {nome}! 🎉" } },
  ],
  campaign: [
    { label: "Promoção", body: {
      pt: "Olá, {nome}! Esta semana tem condição especial na {barbearia}. Garanta seu horário: {link}",
      en: "Hi {nome}! Special deal this week at {barbearia}. Book your spot: {link}",
      es: "¡Hola, {nome}! Esta semana hay promoción en {barbearia}. Reserva tu turno: {link}" } },
    { label: "Horário livre", body: {
      pt: "{nome}, abriu horário hoje na {barbearia}! Quer aproveitar? {link}",
      en: "{nome}, we have an opening today at {barbearia}! Want it? {link}",
      es: "{nome}, ¡se liberó un turno hoy en {barbearia}! ¿Lo quieres? {link}" } },
    { label: "Aviso", body: {
      pt: "Olá, {nome}. Aviso da {barbearia}: nosso horário de funcionamento muda no feriado. Agende com antecedência: {link}",
      en: "Hi {nome}. Notice from {barbearia}: our opening hours change on the holiday. Book ahead: {link}",
      es: "Hola, {nome}. Aviso de {barbearia}: nuestro horario cambia en el feriado. Reserva con tiempo: {link}" } },
  ],
};

/** Nomes prontos para a mensagem, por gatilho. */
export const NAME_PRESETS: Record<MessageTrigger, string[]> = {
  before_appointment: ["Lembrete 1 dia antes", "Lembrete 2 horas antes", "Lembrete no dia", "Confirmação do horário"],
  after_appointment: ["Obrigado e avaliação", "Obrigado pela visita", "Marque o próximo"],
  plan_expiring: ["Plano vencendo", "Lembrete de renovação"],
  plan_expired: ["Plano vencido", "Reative seu plano"],
  client_absent: ["Cliente sumido", "Sentimos sua falta"],
  birthday: ["Aniversário", "Parabéns"],
  campaign: ["Promoção da semana", "Horário livre hoje", "Aviso de feriado", "Novidade na barbearia"],
};

/** Tempos prontos para cada gatilho (a unidade está em TRIGGERS[trigger].unit). */
export const OFFSET_DEFAULT: Record<MessageTrigger, number> = {
  before_appointment: 24, after_appointment: 1, plan_expiring: 5, plan_expired: 1, client_absent: 1.5, birthday: 0, campaign: 0,
};
export const ABSENT_STEPS = [1, 1.25, 1.5, 2, 3];
