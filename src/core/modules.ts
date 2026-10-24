// Módulos do Navalha: o dono escolhe um pacote ("Só agendamento" ou "Completo") e liga ou desliga cada parte.
// Módulo desligado some do menu do painel, da TV e do app do cliente. Os dados ficam guardados: religou, volta tudo.
// Fica salvo em shops.modules (jsonb { chave: true/false }); chave ausente = ligado (barbearias antigas continuam iguais).

export type ModuleKey = "mensagens" | "planos" | "financeiro" | "comissoes" | "shopping" | "tv" | "estilo";

export type Modules = Record<ModuleKey, boolean>;

export interface ModuleDef {
  key: ModuleKey;
  title: string;
  icon: string;
  description: string;
  /** Onde aparece, em palavras simples (mostrado na tela Recursos). */
  where: string;
}

/** A agenda, os clientes, os serviços e a equipe são a base: sempre ligados. */
export const BASE_PARTS = ["Agenda", "Agendamento pelo app", "Clientes", "Serviços", "Equipe"];

export const MODULES: ModuleDef[] = [
  { key: "mensagens", icon: "💬", title: "Lembretes no WhatsApp",
    description: "Lembrete 1 dia e 2 horas antes, agradecimento, aniversário e cliente sumido, com o texto do dono.",
    where: "Painel → Mensagens" },
  { key: "planos", icon: "🎟️", title: "Planos e assinaturas",
    description: "Venda de planos mensais, controle de vencimento com alertas e pagamento pelo app para reativar.",
    where: "Painel → Planos, alertas no Painel e aba Meu plano no app" },
  { key: "financeiro", icon: "💰", title: "Financeiro",
    description: "Faturamento, despesas fixas e variáveis, contas a vencer e lucro do mês.",
    where: "Painel → Financeiro e faturamento no Painel" },
  { key: "comissoes", icon: "🧮", title: "Comissões",
    description: "Comissão ou aluguel de cadeira por barbeiro, rateio dos planos e fechamento do pagamento.",
    where: "Painel → Comissões" },
  { key: "shopping", icon: "🛍️", title: "Shopping de parceiros",
    description: "Aba de produtos de lojas parceiras no app, com indicação do barbeiro.",
    where: "Painel → Shopping e aba Shopping no app" },
  { key: "tv", icon: "📺", title: "TV da recepção",
    description: "Tela para a TV com a agenda do dia, horários livres, fila e QR para agendar.",
    where: "Link TV da recepção no painel" },
  { key: "estilo", icon: "📸", title: "Corte ideal e projeto de visual",
    description: "O cliente manda uma foto, recebe sugestões de corte e um projeto com etapas.",
    where: "Início do app do cliente" },
];

export const MODULE_KEYS = MODULES.map((m) => m.key) as [ModuleKey, ...ModuleKey[]];

export type PackageKey = "agendamento" | "completo";

export const PACKAGES: { key: PackageKey; title: string; description: string; modules: Modules }[] = [
  {
    key: "agendamento", title: "Só agendamento",
    description: "Agenda, app do cliente e lembretes no WhatsApp. Simples e direto.",
    modules: { mensagens: true, planos: false, financeiro: false, comissoes: false, shopping: false, tv: false, estilo: false },
  },
  {
    key: "completo", title: "Completo",
    description: "Tudo: planos, financeiro, comissões, TV, shopping e corte ideal.",
    modules: { mensagens: true, planos: true, financeiro: true, comissoes: true, shopping: true, tv: true, estilo: true },
  },
];

/** Junta o que está salvo com o padrão (tudo ligado). Aceita qualquer coisa vinda do banco. */
export function resolveModules(saved: unknown): Modules {
  const s = saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, s[k] !== false])) as Modules;
}

/** Qual pacote os módulos ligados formam, ou "personalizado". */
export function packageOf(m: Modules): PackageKey | "personalizado" {
  const p = PACKAGES.find((x) => MODULE_KEYS.every((k) => x.modules[k] === m[k]));
  return p ? p.key : "personalizado";
}

/** Telas do painel que dependem de um módulo (o pedaço do endereço depois de /painel/[slug]/). */
export const SECTION_MODULE: Record<string, ModuleKey> = {
  mensagens: "mensagens",
  planos: "planos",
  financeiro: "financeiro",
  comissoes: "comissoes",
  shopping: "shopping",
};

/** A tela do painel está disponível com estes módulos? Telas da base sempre estão. */
export function sectionOn(m: Modules, section: string): boolean {
  const mod = SECTION_MODULE[section];
  return mod ? m[mod] : true;
}
