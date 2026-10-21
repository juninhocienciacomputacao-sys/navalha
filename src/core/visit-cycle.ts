/**
 * De quantos em quantos dias o cliente costuma voltar, pelo histórico de visitas.
 * Usa a mediana dos intervalos das últimas visitas (um atraso isolado não distorce)
 * e limita entre `min` e `max` dias. Com menos de duas visitas, devolve `fallback`.
 */
export function visitCycleDays(visitDays: string[], fallback = 7, min = 7, max = 60, lastN = 6): number {
  const days = [...new Set(visitDays)].sort().slice(-lastN);
  if (days.length < 2) return fallback;
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    gaps.push(Math.round((Date.parse(days[i] + "T12:00:00Z") - Date.parse(days[i - 1] + "T12:00:00Z")) / 86_400_000));
  }
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  const median = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
  return Math.min(max, Math.max(min, median));
}
