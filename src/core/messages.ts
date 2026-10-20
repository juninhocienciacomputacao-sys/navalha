import { Lang } from "./types";

export type MessageTrigger =
  | "before_appointment"
  | "after_appointment"
  | "plan_expiring"
  | "plan_expired"
  | "client_absent"
  | "birthday"
  | "campaign";

export interface MessageTemplate {
  id: string;
  name: string;
  trigger: MessageTrigger;
  /** Horas (antes/depois do horário), dias (plano, aniversário) ou fator do intervalo habitual (cliente sumido). */
  offset: number;
  enabled: boolean;
  body: Partial<Record<Lang, string>> & { pt: string };
}

/** Troca {variavel} pelo valor. Variável sem valor fica como está, para o dono perceber no teste. */
export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function pickBody(t: MessageTemplate, lang: Lang): string {
  return t.body[lang] ?? t.body.pt;
}

/** Momento de envio de um lembrete relativo ao horário (em ms epoch). */
export function sendAtForAppointment(t: MessageTemplate, appointmentStart: Date, appointmentEnd: Date): Date | null {
  if (t.trigger === "before_appointment") return new Date(appointmentStart.getTime() - t.offset * 3_600_000);
  if (t.trigger === "after_appointment") return new Date(appointmentEnd.getTime() + t.offset * 3_600_000);
  return null;
}
