import type { Lang, Plan, Service } from "@/core/types";
import type { WalkInPolicy } from "@/core/slots";

export interface ShopInfo {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  currency: string;
  defaultLang: Lang;
  timezone: string;
  /** Dia da semana ("0" = domingo) → horário; dia ausente = fechado. */
  openingHours: Record<string, { open: string; close: string }>;
  slotStepMin: number;
  planAlertDays: number;
}

export interface BarberInfo {
  id: string;
  name: string;
  roleTitle: string | null;
  color: string | null;
}

export interface ShopBundle {
  shop: ShopInfo;
  barbers: BarberInfo[];
  services: Service[];
  plans: Plan[];
  walkIn: WalkInPolicy;
}

export interface Busy {
  barberId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface AgendaItem {
  id: string;
  barberId: string;
  clientName: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  status: "pending" | "confirmed" | "in_service" | "done" | "no_show" | "cancelled";
  price: number;
  viaPlan: boolean;
}

export interface PlanAlert {
  clientName: string;
  phone: string;
  planName: string;
  periodEnd: Date;
}

export interface Dashboard {
  revenueMonth: number;
  appointmentsMonth: number;
  clients: number;
  activeSubscriptions: number;
  planAlerts: PlanAlert[];
  perBarber: { barberId: string; appointments: number; revenue: number; minutes: number }[];
}

export interface BookInput {
  shopId: string;
  barberId: string;
  serviceId: string;
  startsAt: Date;
  name: string;
  /** Só no modo demonstração; no sistema real o telefone vem do login pelo WhatsApp. */
  phone?: string;
}

export type BookResult = { ok: true; id: string } | { ok: false; error: string };

export interface Repo {
  mode: "demo" | "supabase";
  shopBySlug(slug: string): Promise<ShopBundle | null>;
  busy(shopId: string, from: Date, to: Date): Promise<Busy[]>;
  book(input: BookInput): Promise<BookResult>;
  /** Telas da equipe (exigem login de funcionário no sistema real). */
  agenda(shopId: string, from: Date, to: Date): Promise<AgendaItem[]>;
  dashboard(shopId: string, monthStart: Date, now: Date): Promise<Dashboard>;
}
