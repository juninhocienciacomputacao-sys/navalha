// Formatos simples (sem Date) que as telas client recebem do servidor.
import type { Minutes } from "@/core/types";

export type ViewStatus = "pending" | "confirmed" | "in_service" | "done" | "no_show" | "cancelled";

export interface DayItem {
  id: string;
  barberId: string;
  clientName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  start: Minutes;
  end: Minutes;
  status: ViewStatus;
  viaPlan: boolean;
  walkIn: boolean;
}

export interface ReserveView {
  barberId: string;
  start: Minutes;
  end: Minutes;
}

export interface QueueView {
  id: string;
  name: string;
  serviceId: string | null;
  serviceName: string;
  /** Instante de chegada em ms (o tempo de espera é contado no navegador). */
  joinedAt: number;
  via: "reception" | "app" | "qr";
  forecast: { barberId: string; time: Minutes; reserved: boolean } | null;
}

export interface BarberView {
  id: string;
  name: string;
  color: string;
}

export interface ServiceView {
  id: string;
  name: string;
  durationMin: number;
}

export const STATUS_TEXT: Record<ViewStatus, string> = {
  pending: "Aguardando confirmação",
  confirmed: "Confirmado",
  in_service: "Na cadeira",
  done: "Concluído",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

export const ERROR_TEXT: Record<string, string> = {
  slot_taken: "Esse horário acabou de ser ocupado. Escolha outro.",
  slot_in_past: "Esse horário já passou.",
  name_required: "Escolha um cliente ou escreva o nome.",
  no_slot: "Não há horário livre hoje para esse serviço.",
  not_found: "Não encontrado. Atualize a página.",
  forbidden: "Sua conta não pode fazer isso.",
};
export const errorText = (e: string) => ERROR_TEXT[e] ?? "Não deu certo. Tente de novo.";
