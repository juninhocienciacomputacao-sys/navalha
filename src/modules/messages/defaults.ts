import type { MessageTemplate, MessageTrigger } from "@/core/messages";

/** Variáveis que o dono pode inserir no texto. */
export const MESSAGE_VARS = [
  ["nome", "primeiro nome do cliente"],
  ["servico", "serviço marcado"],
  ["barbeiro", "profissional"],
  ["data", "dia do horário"],
  ["hora", "hora do horário"],
  ["endereco", "endereço da barbearia"],
  ["plano", "nome do plano"],
  ["dias", "dias (para vencer ou sem vir)"],
  ["vencimento", "data de vencimento do plano"],
  ["link", "link do app da barbearia"],
  ["barbearia", "nome da barbearia"],
] as const;

/** Como o dono lê cada gatilho e a unidade do campo "offset". */
export const TRIGGERS: Record<MessageTrigger, { label: string; unit: string; hint: string }> = {
  before_appointment: { label: "Antes do horário marcado", unit: "horas antes", hint: "Ex.: 24 = um dia antes; 2 = duas horas antes." },
  after_appointment: { label: "Depois do atendimento", unit: "horas depois", hint: "Ex.: 1 = uma hora depois que o atendimento acaba." },
  plan_expiring: { label: "Plano vencendo", unit: "dias antes do vencimento", hint: "Ex.: 5 = cinco dias antes do plano vencer." },
  plan_expired: { label: "Plano vencido", unit: "dias depois do vencimento", hint: "Ex.: 1 = no dia seguinte ao vencimento." },
  client_absent: { label: "Cliente sumido", unit: "× o intervalo de costume dele", hint: "Ex.: 1,5 = se costuma vir a cada 20 dias, avisa com 30 dias sem vir." },
  birthday: { label: "Aniversário do cliente", unit: "dias antes (0 = no dia)", hint: "Ex.: 0 = no dia do aniversário." },
  campaign: { label: "Campanha (envio manual)", unit: "", hint: "Não sai sozinha: você envia quando quiser." },
};

export const whenLabel = (t: Pick<MessageTemplate, "trigger" | "offset">) =>
  t.trigger === "campaign" ? "envio manual" : `${String(t.offset).replace(".", ",")} ${TRIGGERS[t.trigger].unit}`;

/**
 * Modelos que toda barbearia nova recebe. A mesma lista está em supabase/migrations/0005_messages.sql
 * (o banco cria sozinho quando a barbearia é cadastrada).
 */
export const DEFAULT_TEMPLATES: Omit<MessageTemplate, "id">[] = [
  {
    name: "Lembrete 1 dia antes", trigger: "before_appointment", offset: 24, enabled: true,
    body: {
      pt: "Olá, {nome}! Passando para lembrar do seu horário amanhã, {data}, às {hora}, com {barbeiro} ({servico}).\n\nSe precisar remarcar: {link}",
      en: "Hi {nome}! Just a reminder of your visit tomorrow, {data}, at {hora}, with {barbeiro} ({servico}).\n\nNeed to reschedule? {link}",
      es: "¡Hola, {nome}! Te recordamos tu turno de mañana, {data}, a las {hora}, con {barbeiro} ({servico}).\n\nSi necesitas cambiarlo: {link}",
    },
  },
  {
    name: "Lembrete 2 horas antes", trigger: "before_appointment", offset: 2, enabled: true,
    body: {
      pt: "{nome}, falta pouco! Seu {servico} com {barbeiro} é hoje às {hora}.\nEstamos na {endereco}. Até já! 💈",
      en: "{nome}, almost time! Your {servico} with {barbeiro} is today at {hora}.\nWe are at {endereco}. See you soon! 💈",
      es: "¡{nome}, falta poco! Tu {servico} con {barbeiro} es hoy a las {hora}.\nEstamos en {endereco}. ¡Hasta pronto! 💈",
    },
  },
  {
    name: "Obrigado e avaliação", trigger: "after_appointment", offset: 1, enabled: true,
    body: {
      pt: "Valeu pela visita, {nome}! De 0 a 10, quanto você indicaria a {barbearia}? Sua nota ajuda o {barbeiro} a crescer.",
      en: "Thanks for coming, {nome}! From 0 to 10, how likely are you to recommend {barbearia}? Your score helps {barbeiro} grow.",
      es: "¡Gracias por venir, {nome}! Del 0 al 10, ¿cuánto recomendarías {barbearia}? Tu nota ayuda a {barbeiro} a crecer.",
    },
  },
  {
    name: "Plano vencendo", trigger: "plan_expiring", offset: 5, enabled: true,
    body: {
      pt: "Oi, {nome}! Seu plano {plano} vence em {dias} dias ({vencimento}).\nRenove e mantenha seus horários garantidos: {link}",
      en: "Hi {nome}! Your {plano} plan renews in {dias} days ({vencimento}).\nRenew now and keep your visits: {link}",
      es: "¡Hola, {nome}! Tu plan {plano} vence en {dias} días ({vencimento}).\nRenuévalo y mantén tus turnos: {link}",
    },
  },
  {
    name: "Plano vencido", trigger: "plan_expired", offset: 1, enabled: true,
    body: {
      pt: "Oi, {nome}. Seu plano {plano} venceu em {vencimento}.\nPague pelo link e ele volta a valer na hora: {link}",
      en: "Hi {nome}. Your {plano} plan expired on {vencimento}.\nPay through the link and it works again right away: {link}",
      es: "Hola, {nome}. Tu plan {plano} venció el {vencimento}.\nPaga por el enlace y vuelve a valer al instante: {link}",
    },
  },
  {
    name: "Cliente sumido", trigger: "client_absent", offset: 1.5, enabled: false,
    body: {
      pt: "{nome}, faz {dias} dias desde seu último corte com {barbeiro}. Bora deixar o visual em dia? Agende aqui: {link}",
      en: "{nome}, it has been {dias} days since your last cut with {barbeiro}. Time for a fresh look? Book here: {link}",
      es: "{nome}, ya son {dias} días desde tu último corte con {barbeiro}. ¿Renovamos el look? Reserva aquí: {link}",
    },
  },
  {
    name: "Aniversário", trigger: "birthday", offset: 0, enabled: true,
    body: {
      pt: "Feliz aniversário, {nome}! 🎉 A {barbearia} deseja um ótimo dia. Passa aqui para ficar no estilo: {link}",
      en: "Happy birthday, {nome}! 🎉 Everyone at {barbearia} wishes you a great day. Come by for a fresh look: {link}",
      es: "¡Feliz cumpleaños, {nome}! 🎉 {barbearia} te desea un gran día. Pasa a renovar tu estilo: {link}",
    },
  },
];
