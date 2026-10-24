// Tipos do app do cliente. Tudo serializável (datas como texto ISO / AAAA-MM-DD) para ir do servidor para a tela.
import type { I18nText } from "@/core/types";
import type { SubscriptionStatus } from "@/core/plans";
import type { PlanRules } from "@/core/plan-rules";

export interface ClientMe {
  id: string;
  name: string;
  phone: string;
  photoConsentAt: string | null;
}

export interface MyPlan {
  subscriptionId: string;
  planId: string;
  planName: string;
  price: number;
  quotaUses: number | null;
  usesInPeriod: number;
  periodDays: number;
  /** Último dia do ciclo pago (AAAA-MM-DD, no fuso da barbearia). */
  periodEnd: string;
  daysLeft: number;
  status: SubscriptionStatus;
  /** Serviços que o plano cobre. */
  serviceIds: string[];
  /** Regras de uso do plano (intervalo, dias, horário, barbeiros). */
  rules: PlanRules;
  /** Dias (AAAA-MM-DD) em que o plano já foi ou vai ser usado (sem cancelados e faltas), para o intervalo mínimo. */
  useDays: string[];
}

export interface MyAppointment {
  id: string;
  startsAt: string;
  /** Dia e minuto no fuso da barbearia. */
  day: string;
  minutes: number;
  barberId: string;
  serviceId: string | null;
  serviceName: I18nText;
  status: "pending" | "confirmed" | "in_service" | "done" | "no_show" | "cancelled";
  viaPlan: boolean;
  price: number;
}

export interface MyPayment {
  id: string;
  amount: number;
  method: "pix" | "card" | "cash";
  status: "pending" | "paid" | "failed" | "refunded";
  /** Data do pagamento (ou da criação, se pendente). */
  at: string;
}

export interface ProjectStep {
  /** Semana relativa ao início, ex. "S0", "S5". */
  wk: string;
  title: I18nText;
  desc: I18nText;
  /** AAAA-MM-DD previsto. */
  date: string;
  done: boolean;
}

export interface StyleProject {
  id: string;
  goal: string;
  barberId: string | null;
  createdAt: string;
  steps: ProjectStep[];
  /** URL para mostrar a foto de "antes" (data: na demonstração; link assinado no Supabase). */
  photoUrl: string | null;
  /** Índice do desenho do corte (0..2) para a prévia. */
  cutShape: number;
}

export interface RebookOffer {
  day: string;
  minutes: number;
  barberId: string;
  serviceId: string;
  /** Ciclo usado (dias). */
  cycle: number;
  /** Dia do atendimento usado como base. */
  baseDay: string;
  /** A base é um horário futuro já marcado (não um atendimento concluído). */
  baseUpcoming: boolean;
}

export interface ClientHome {
  me: ClientMe;
  plan: MyPlan | null;
  upcoming: MyAppointment[];
  history: MyAppointment[];
  payments: MyPayment[];
  projects: StyleProject[];
  rebook: RebookOffer | null;
}

/** Quem está usando o app agora. */
export type Viewer =
  | { kind: "demo"; clientId: string; choices: { id: string; label: string }[] }
  | { kind: "guest" }
  | { kind: "user"; phone: string };

export type PayStart =
  | { ok: true; mode: "demo"; paymentId: string; periodEnd: string }
  | { ok: true; mode: "pending"; paymentId: string; pixCode: string | null; checkoutUrl: string | null }
  | { ok: false; error: string };
