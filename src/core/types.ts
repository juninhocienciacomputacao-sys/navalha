/** Minutos desde a meia-noite, no fuso da barbearia. Ex.: 9h30 = 570. */
export type Minutes = number;

export interface Interval {
  start: Minutes;
  end: Minutes;
}

export type Lang = "pt" | "en" | "es";

/** Texto traduzido. Português é obrigatório; os outros caem para o português. */
export type I18nText = { pt: string } & Partial<Record<Exclude<Lang, "pt">, string>>;

export interface Service {
  id: string;
  name: I18nText;
  durationMin: number;
  price: number;
  /** Planos que cobrem este serviço. */
  planIds: string[];
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  /** Quantos atendimentos o plano dá por ciclo. `null` = ilimitado. */
  quotaUses: number | null;
  periodDays: number;
}

export const toMinutes = (hhmm: string): Minutes => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const toHHMM = (m: Minutes): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
