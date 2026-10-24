// Níveis de acesso da equipe: o que cada nível vê no painel e quanto da agenda enxerga.
// O dono sempre vê tudo. Os outros níveis seguem o que o dono escolheu (ou o padrão abaixo).
// O banco repete o mesmo padrão em access_defaults() (migração 0011); um teste confere que os dois batem.

export type StaffRole = "owner" | "manager" | "reception" | "barber";
export type Level = Exclude<StaffRole, "owner">;

/** Telas do painel que o dono pode liberar ou esconder. A Agenda é de todos e não entra aqui. */
export type SectionKey =
  | "painel" | "clientes" | "planos" | "financeiro" | "comissoes" | "equipe" | "servicos" | "mensagens" | "shopping" | "recursos";

/**
 * Quanto da agenda o nível enxerga:
 * - all: a agenda de todos, com nomes, e pode marcar para qualquer barbeiro;
 * - own_free: a própria agenda completa e, dos colegas, só os horários livres e ocupados (sem nomes);
 * - own: só a própria agenda.
 */
export type AgendaScope = "all" | "own_free" | "own";

export interface LevelAccess {
  sections: SectionKey[];
  agenda: AgendaScope;
}

export type AccessConfig = Partial<Record<Level, LevelAccess>>;

export const LEVELS: Level[] = ["manager", "reception", "barber"];

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Dono (administrador)",
  manager: "Gerente",
  reception: "Recepção",
  barber: "Barbeiro",
};

export const ROLE_HINT: Record<StaffRole, string> = {
  owner: "Vê e muda tudo, inclusive quem tem acesso.",
  manager: "Cuida do dia a dia da barbearia.",
  reception: "Marca horários e atende quem chega.",
  barber: "Acompanha a própria cadeira.",
};

/** Ordem do menu. `href` é o pedaço depois de /painel/[slug]. */
export const MENU: { key: SectionKey | "agenda"; href: string; label: string; icon: string; hint: string }[] = [
  { key: "painel", href: "", label: "Painel", icon: "📊", hint: "faturamento do mês, planos vencendo e números da barbearia" },
  { key: "agenda", href: "/agenda", label: "Agenda", icon: "📅", hint: "" },
  { key: "clientes", href: "/clientes", label: "Clientes", icon: "👥", hint: "lista de clientes com telefone e observações" },
  { key: "planos", href: "/planos", label: "Planos", icon: "🎟️", hint: "vender, renovar e cancelar planos" },
  { key: "financeiro", href: "/financeiro", label: "Financeiro", icon: "💰", hint: "faturamento e despesas" },
  { key: "comissoes", href: "/comissoes", label: "Comissões", icon: "🧮", hint: "regras e pagamentos de comissão de todos" },
  { key: "equipe", href: "/equipe", label: "Equipe", icon: "💈", hint: "cadastro dos barbeiros e desempenho de cada um" },
  { key: "servicos", href: "/servicos", label: "Serviços", icon: "✂️", hint: "preços e tempos dos serviços" },
  { key: "mensagens", href: "/mensagens", label: "Mensagens", icon: "💬", hint: "textos dos lembretes automáticos" },
  { key: "shopping", href: "/shopping", label: "Shopping", icon: "🛍️", hint: "lojas parceiras no app do cliente" },
  { key: "recursos", href: "/recursos", label: "Recursos", icon: "⚙️", hint: "horário de funcionamento e configurações" },
];

export const SECTION_KEYS = MENU.filter((m) => m.key !== "agenda").map((m) => m.key as SectionKey);

export const AGENDA_LABEL: Record<AgendaScope, { label: string; hint: string }> = {
  all: { label: "Agenda de todos", hint: "vê os clientes de todos os barbeiros e marca para qualquer um" },
  own_free: { label: "Só a sua + horários livres", hint: "vê os próprios clientes; dos colegas, só o que está livre ou ocupado, sem nomes" },
  own: { label: "Só a sua", hint: "vê apenas a própria agenda" },
};

/** Padrão de quem nunca mexeu nos acessos. Igual a access_defaults() no banco. */
export const DEFAULT_ACCESS: Record<Level, LevelAccess> = {
  manager: { sections: ["painel", "clientes", "planos", "financeiro", "comissoes", "equipe", "servicos", "mensagens", "shopping", "recursos"], agenda: "all" },
  reception: { sections: ["clientes", "planos"], agenda: "all" },
  barber: { sections: [], agenda: "own_free" },
};

const OWNER_ACCESS: LevelAccess = { sections: [...SECTION_KEYS], agenda: "all" };

const isScope = (v: unknown): v is AgendaScope => v === "all" || v === "own_free" || v === "own";

/** Limpa o que veio do banco ou da tela: só níveis, telas e escopos conhecidos. */
export function sanitizeAccess(raw: unknown): AccessConfig {
  const out: AccessConfig = {};
  if (!raw || typeof raw !== "object") return out;
  for (const level of LEVELS) {
    const v = (raw as Record<string, unknown>)[level];
    if (!v || typeof v !== "object") continue;
    const o = v as { sections?: unknown; agenda?: unknown };
    const def = DEFAULT_ACCESS[level];
    const sections = Array.isArray(o.sections)
      ? SECTION_KEYS.filter((k) => (o.sections as unknown[]).includes(k))
      : def.sections;
    out[level] = { sections, agenda: isScope(o.agenda) ? o.agenda : def.agenda };
  }
  return out;
}

/** O que um papel pode, juntando o padrão com a escolha do dono. */
export function accessFor(role: StaffRole, config: AccessConfig = {}): LevelAccess {
  if (role === "owner") return OWNER_ACCESS;
  return sanitizeAccess({ [role]: { ...DEFAULT_ACCESS[role], ...config[role] } })[role] ?? DEFAULT_ACCESS[role];
}

export const canSee = (a: LevelAccess, key: SectionKey | "agenda") => key === "agenda" || a.sections.includes(key);

/** Primeira tela do menu que a pessoa pode abrir (a Agenda sempre pode). */
export function homeHref(a: LevelAccess): string {
  return MENU.find((m) => canSee(a, m.key))?.href ?? "/agenda";
}

/**
 * Barbeiros que a pessoa pode mexer na agenda (marcar, remarcar, mudar situação).
 * Com "agenda de todos", todos; senão, só o(s) perfil(is) de barbeiro ligado(s) a ela.
 */
export function workableBarbers(a: LevelAccess, allIds: string[], myBarberIds: string[]): string[] {
  return a.agenda === "all" ? allIds : allIds.filter((id) => myBarberIds.includes(id));
}

/** Telefone em formato internacional (+55...), o mesmo usado no login pelo WhatsApp. */
export const isE164 = (s: string) => /^\+[1-9]\d{7,14}$/.test(s);
