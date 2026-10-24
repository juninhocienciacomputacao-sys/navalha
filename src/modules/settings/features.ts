// Catálogo dos recursos liga/desliga (tabela shop_features). Sem dependências de servidor: a tela usa também.

// Shopping e Corte ideal viraram módulos (src/core/modules.ts): ligam e desligam abas inteiras.
import type { ModuleKey } from "@/core/modules";

export type FeatureKey =
  | "ai_receptionist" | "style_passport" | "autofill" | "qr_checkin" | "referral"
  | "rebook" | "no_show_deposit" | "network" | "walk_in";

export type FieldDef =
  | { key: string; label: string; type: "bool" }
  | { key: string; label: string; type: "number"; min: number; max: number; suffix?: string; prefix?: "money" }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

export interface FeatureDef {
  key: FeatureKey;
  group: "agenda" | "cliente" | "dinheiro";
  title: string;
  description: string;
  defaultOn: boolean;
  defaults: Record<string, string | number | boolean>;
  fields: FieldDef[];
  note?: string;
  /** Ainda não funciona no sistema: aparece como "Em breve" e não pode ser ligado. */
  soon?: boolean;
  /** Só aparece com este módulo ligado. */
  requires?: ModuleKey;
}

export const GROUPS: { id: FeatureDef["group"]; title: string }[] = [
  { id: "agenda", title: "Atendimento e agenda" },
  { id: "cliente", title: "Experiência do cliente" },
  { id: "dinheiro", title: "Dinheiro e crescimento" },
];

export const FEATURES: FeatureDef[] = [
  {
    key: "ai_receptionist", group: "agenda", title: "Recepcionista de IA no WhatsApp",
    description: "Responde texto e áudio no WhatsApp: agenda, remarca, tira dúvidas e cobra plano, no idioma do cliente.",
    defaultOn: false, soon: true, defaults: { tone: "casual", hours: "24h", charge: true },
    fields: [
      { key: "tone", label: "Jeito de falar", type: "select", options: [{ value: "casual", label: "Descontraído" }, { value: "formal", label: "Formal" }] },
      { key: "hours", label: "Atende", type: "select", options: [{ value: "24h", label: "24 horas" }, { value: "open", label: "Só no horário da barbearia" }] },
      { key: "charge", label: "Pode cobrar plano vencido", type: "bool" },
    ],
  },
  {
    key: "walk_in", group: "agenda", title: "Encaixes sem horário",
    description: "Guarda vagas nos horários de pico para quem chega sem marcar, com fila virtual. Ajuste os horários de pico mais abaixo.",
    defaultOn: true, defaults: {}, fields: [],
  },
  {
    key: "autofill", group: "agenda", title: "Agenda que se preenche sozinha",
    description: "Vaga cancelada é oferecida em segundos para a lista de espera. Horário parado pode ganhar desconto automático.",
    defaultOn: false, soon: true, defaults: { offer: true, idleDiscountPct: 15 },
    fields: [
      { key: "offer", label: "Oferecer vaga cancelada para a lista de espera", type: "bool" },
      { key: "idleDiscountPct", label: "Desconto em horário parado", type: "number", min: 0, max: 50, suffix: "%" },
    ],
  },
  {
    key: "rebook", group: "agenda", title: "Sugerir o próximo horário (assinantes)",
    description: "Depois do atendimento, sugere ao assinante o próximo horário pelo histórico dele.",
    defaultOn: true, requires: "planos", defaults: { days: 7 },
    fields: [{ key: "days", label: "Sugerir para daqui a", type: "number", min: 3, max: 60, suffix: "dias" }],
  },
  {
    key: "qr_checkin", group: "agenda", title: "QR para agendar na TV",
    description: "A TV da recepção mostra um QR: o cliente lê com o celular e abre o app para agendar ou entrar na fila.",
    defaultOn: true, requires: "tv", defaults: {}, fields: [],
  },
  {
    key: "no_show_deposit", group: "agenda", title: "Sinal para quem falta",
    description: "Cobra um sinal via Pix na hora de marcar, só de clientes que já faltaram.",
    defaultOn: false, soon: true, defaults: { pct: 30, after: 2 },
    fields: [
      { key: "pct", label: "Valor do sinal", type: "number", min: 5, max: 100, suffix: "% do serviço" },
      { key: "after", label: "Cobrar a partir de", type: "number", min: 1, max: 10, suffix: "faltas" },
    ],
  },
  {
    key: "style_passport", group: "cliente", title: "Passaporte de estilo",
    description: "Ficha do corte (máquina, pente, medidas, fotos) que acompanha o cliente.",
    defaultOn: false, soon: true, defaults: { share: true, preview: true },
    fields: [
      { key: "share", label: "Levar para outras barbearias da rede", type: "bool" },
      { key: "preview", label: "Prévia do corte por IA", type: "bool" },
    ],
    note: "Fotos só com consentimento do cliente (LGPD).",
  },
  {
    key: "referral", group: "cliente", title: "Indique um amigo",
    description: "Quem indica e quem chega ganham desconto. O código aparece no app do cliente.",
    defaultOn: false, soon: true, defaults: { reward: 15 },
    fields: [{ key: "reward", label: "Desconto para cada um", type: "number", min: 0, max: 1000, prefix: "money" }],
  },
  {
    key: "network", group: "dinheiro", title: "Rede Navalha",
    description: "Sua barbearia aparece para clientes da rede que estão de passagem pela cidade.",
    defaultOn: false, soon: true, defaults: { travelers: true },
    fields: [{ key: "travelers", label: "Aceitar clientes de outras cidades", type: "bool" }],
  },
];

export interface FeatureState {
  key: FeatureKey;
  enabled: boolean;
  config: Record<string, string | number | boolean>;
}

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as [FeatureKey, ...FeatureKey[]];

/** Junta o que está salvo com os padrões de cada recurso. */
export function withDefaults(saved: { key: string; enabled: boolean; config: unknown }[]): FeatureState[] {
  return FEATURES.map((f) => {
    const row = saved.find((s) => s.key === f.key);
    const config = row?.config && typeof row.config === "object" ? (row.config as Record<string, string | number | boolean>) : {};
    // recurso "em breve" fica sempre desligado, mesmo se alguém ligou antes
    return { key: f.key, enabled: f.soon ? false : row ? row.enabled : f.defaultOn, config: { ...f.defaults, ...config } };
  });
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const CURRENCIES = ["BRL", "USD", "EUR", "ARS", "MXN", "CLP", "COP", "PEN", "UYU", "PYG", "BOB", "GBP", "CAD", "AUD", "JPY"];
export const COLORS = ["#c2410c", "#0f766e", "#4338ca", "#be185d", "#a16207", "#15803d", "#7c3aed", "#0369a1", "#b91c1c", "#525252"];
