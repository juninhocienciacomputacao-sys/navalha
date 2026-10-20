import { Minutes } from "./types";

/** Diferença (em minutos) entre o fuso `tz` e UTC no instante `at`. São Paulo = -180. */
function zoneOffset(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Dia (AAAA-MM-DD) de um instante, no fuso da barbearia. */
export function dayInZone(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
}

/** Minutos desde a meia-noite, no fuso da barbearia. */
export function minutesInZone(at: Date, tz: string): Minutes {
  return Math.round((at.getTime() - atMinutes(dayInZone(at, tz), 0, tz).getTime()) / 60_000);
}

/** Instante exato de "dia às X minutos" no fuso da barbearia. */
export function atMinutes(day: string, minutes: Minutes, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - zoneOffset(new Date(guess), tz) * 60_000;
  // segunda passada acerta dias de troca de horário de verão
  return new Date(guess - zoneOffset(new Date(first), tz) * 60_000);
}

/** Soma dias a um AAAA-MM-DD. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de um AAAA-MM-DD. */
export const weekday = (day: string) => new Date(day + "T12:00:00Z").getUTCDay();
