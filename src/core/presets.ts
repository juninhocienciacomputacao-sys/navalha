// Opções prontas para o dono escolher em vez de digitar.
// Os valores em dinheiro estão em "unidades de referência" (pensadas para BRL) e são ajustados pela moeda.

/** Fator aproximado para sugerir preços em outras moedas (só sugestão; o dono escolhe). */
const CURRENCY_FACTOR: Record<string, number> = { BRL: 1, USD: 0.4, EUR: 0.35, GBP: 0.3, ARS: 200, CLP: 180, COP: 800, MXN: 4, PEN: 0.7, UYU: 8, PYG: 1500, BOB: 1.4 };

const niceRound = (n: number) => {
  if (n < 10) return Math.round(n * 2) / 2;
  if (n < 100) return Math.round(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
};

/** Converte um valor pensado em BRL para a moeda da barbearia, arredondado para um número "bonito". */
export const suggest = (brl: number, currency: string) => {
  const f = CURRENCY_FACTOR[currency] ?? 1;
  return f === 1 ? brl : niceRound(brl * f);
};

/** Degraus de preço para escolher (serviços, planos, produtos). */
export const priceSteps = (currency: string, kind: "service" | "plan" | "product" | "expense" = "service") => {
  const base = {
    service: [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 100, 120, 150, 200],
    plan: [49.9, 59.9, 69.9, 79.9, 89.9, 99.9, 119.9, 139.9, 159.9, 199.9, 249.9],
    product: [10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150],
    expense: [50, 100, 150, 200, 300, 500, 800, 1000, 1500, 2000, 3000, 5000],
  }[kind];
  return [...new Set(base.map((v) => suggest(v, currency)))];
};

/** Serviços comuns de barbearia, com duração e preço sugeridos (BRL). */
export const SERVICE_PRESETS = [
  { name: "Corte", minutes: 30, price: 40 },
  { name: "Barba", minutes: 30, price: 30 },
  { name: "Corte + barba", minutes: 60, price: 65 },
  { name: "Sobrancelha", minutes: 15, price: 15 },
  { name: "Pezinho", minutes: 15, price: 15 },
  { name: "Corte infantil", minutes: 30, price: 35 },
  { name: "Degradê", minutes: 40, price: 45 },
  { name: "Pigmentação", minutes: 30, price: 35 },
  { name: "Luzes", minutes: 90, price: 120 },
  { name: "Platinado", minutes: 120, price: 150 },
  { name: "Hidratação", minutes: 20, price: 30 },
  { name: "Relaxamento", minutes: 45, price: 60 },
  { name: "Barboterapia", minutes: 40, price: 45 },
  { name: "Limpeza de pele", minutes: 40, price: 50 },
] as const;

export const DURATION_STEPS = [10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];

export const PLAN_NAME_PRESETS = ["Clube do Corte", "Corte ilimitado", "Corte + barba ilimitado", "4 cortes por mês", "2 cortes por mês", "Barba ilimitada", "Plano VIP", "Plano família"];
export const PERIOD_PRESETS = [{ value: 7, label: "Semanal" }, { value: 15, label: "Quinzenal" }, { value: 30, label: "Mensal" }, { value: 60, label: "Bimestral" }, { value: 90, label: "Trimestral" }];
export const QUOTA_PRESETS = [1, 2, 3, 4, 6, 8, 10];

export const EXPENSE_PRESETS = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Produtos", "Lâminas e descartáveis", "Manutenção", "Limpeza", "Marketing", "Contador", "Impostos", "Sistema", "Café e recepção", "Salário"];
export const PRODUCT_PRESETS = ["Pomada modeladora", "Óleo para barba", "Balm para barba", "Shampoo", "Condicionador", "Cera", "Gel", "Minoxidil", "Pente", "Kit barba"];
export const BARBER_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#ca8a04", "#4b5563", "#0f766e"];
export const PERCENT_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];
export const DAY_STEPS = [1, 2, 3, 5, 7, 10, 15, 30];
export const HOUR_STEPS = [1, 2, 3, 4, 6, 12, 24, 48];

/** Horários em degraus (ex.: "06:00" … "23:30") para listas de escolha. */
export const timeSteps = (from = 6 * 60, to = 23 * 60 + 30, step = 30) => {
  const out: string[] = [];
  for (let m = from; m <= to; m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
};

/** Passo dos botões − e + para valores em dinheiro, proporcional à moeda (1, 10, 100…). */
export const moneyStep = (steps: number[]) => 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, steps[0] ?? 1))) - 1);

// ---- clientes e agenda (escolhas rápidas para fichas e anotações) ----
export const CLIENT_PREF_PRESETS = ["Degradê", "Navalhado", "Social", "Máquina 1 nas laterais", "Máquina 2 nas laterais", "Tesoura em cima", "Topete", "Risco", "Sem risco", "Pezinho quadrado", "Pezinho redondo", "Barba alinhada", "Barba desenhada", "Sobrancelha", "Sem pomada"];
export const CLIENT_NOTE_PRESETS = ["Prefere de manhã", "Prefere depois das 18h", "Prefere sábado", "Alergia a produto", "Pele sensível", "Gosta de conversar", "Prefere silêncio", "Costuma atrasar", "Traz o filho", "Paga no Pix", "Cliente VIP"];
export const APPT_NOTE_PRESETS = ["Chegou atrasado", "Pediu desconto", "Primeira vez", "Gostou muito", "Reclamou", "Quer voltar em 15 dias", "Comprou produto", "Indicado por amigo"];

/** Especialidades comuns de barbeiro. */
export const BARBER_ROLE_PRESETS = ["Corte clássico", "Degradê", "Barba e navalha", "Corte infantil", "Química e coloração", "Desenhos e freestyle", "Barbeiro sênior", "Aprendiz"];
/** Metas de faturamento mensal por barbeiro (BRL; use suggest para outras moedas). */
export const GOAL_PRESETS = [3000, 5000, 8000, 10000, 12000, 15000, 20000, 30000];

/**
 * Modelos de plano para começar rápido. O dono escolhe um, ajusta e escolhe os serviços.
 * `price` em BRL (use `suggest` para outras moedas).
 */
export const PLAN_TEMPLATES = [
  {
    id: "semanal", title: "Toda semana", pitch: "Ilimitado, 1 uso a cada 7 dias. Fideliza quem corta toda semana sem lotar a agenda.",
    name: "Clube semanal", price: 119.9, periodDays: 30, quotaUses: null,
    rules: { minDaysBetween: 7 },
  },
  {
    id: "executivo", title: "Executivo (horário vazio)", pitch: "Segunda a quinta, das 9h às 16h. Enche os horários de menor movimento.",
    name: "Plano executivo", price: 79.9, periodDays: 30, quotaUses: 4,
    rules: { weekdays: [1, 2, 3, 4], hours: { start: 9 * 60, end: 16 * 60 } },
  },
  {
    id: "quinzenal", title: "Quinzenal econômico", pitch: "2 cortes no mês, com pelo menos 14 dias entre eles.",
    name: "2 cortes por mês", price: 69.9, periodDays: 30, quotaUses: 2,
    rules: { minDaysBetween: 14 },
  },
  {
    id: "vip", title: "VIP exclusivo", pitch: "Não aparece no app: a equipe oferece a quem você escolher. Poucas vagas.",
    name: "Plano VIP", price: 249.9, periodDays: 30, quotaUses: null,
    rules: { exclusive: true, maxSubscribers: 10, minDaysBetween: 3 },
  },
  {
    id: "fim_de_semana", title: "Fim de semana", pitch: "Para quem só pode no sábado. 1 uso por semana.",
    name: "Plano sábado", price: 99.9, periodDays: 30, quotaUses: 4,
    rules: { weekdays: [6], minDaysBetween: 7 },
  },
] as const;
