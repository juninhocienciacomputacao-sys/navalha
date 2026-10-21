import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoId, demoSeed } from "@/data/demo";
import type { MessageTemplate, MessageTrigger } from "@/core/messages";
import type { I18nText, Lang } from "@/core/types";
import { DEFAULT_TEMPLATES } from "./defaults";
import { demoGlobal } from "@/data/demo-global";

export type TemplateInput = Omit<MessageTemplate, "id"> & { id?: string };

/** Agendamento com o que a mensagem precisa (nome, telefone, idioma do cliente). */
export interface MessageAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  clientName: string;
  phone: string | null;
  lang: Lang;
  serviceName: I18nText;
  barberName: string;
}

// ---------- demonstração ----------
const demoTemplates = demoGlobal("messages.templates", (): MessageTemplate[] => []);
function demoList() {
  if (!demoTemplates.length) DEFAULT_TEMPLATES.forEach((t) => demoTemplates.push({ ...t, body: { ...t.body }, id: demoId("tpl") }));
  return demoTemplates;
}

type Row = { id: string; name: string; trigger: MessageTrigger; offset: number | string; enabled: boolean; body: MessageTemplate["body"] };
const fromRow = (r: Row): MessageTemplate => ({ id: r.id, name: r.name, trigger: r.trigger, offset: Number(r.offset), enabled: r.enabled, body: r.body });

export async function listTemplates(shopId: string): Promise<MessageTemplate[]> {
  if (!supabaseConfigured()) return demoList().map((t) => ({ ...t, body: { ...t.body } }));
  const db = await supabaseServer();
  const { data, error } = await db.from("message_templates").select("id, name, trigger, offset, enabled, body").eq("shop_id", shopId).order("name");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

/** Cria (sem id) ou atualiza um modelo. Devolve o id. */
export async function saveTemplate(shopId: string, t: TemplateInput): Promise<string> {
  const body = Object.fromEntries(Object.entries(t.body).filter(([, v]) => v && v.trim())) as MessageTemplate["body"];
  if (!supabaseConfigured()) {
    const list = demoList();
    const found = t.id ? list.find((x) => x.id === t.id) : undefined;
    if (found) {
      Object.assign(found, { name: t.name, trigger: t.trigger, offset: t.offset, enabled: t.enabled, body });
      return found.id;
    }
    const id = demoId("tpl");
    list.push({ id, name: t.name, trigger: t.trigger, offset: t.offset, enabled: t.enabled, body });
    return id;
  }
  const db = await supabaseServer();
  const row = { shop_id: shopId, name: t.name, trigger: t.trigger, offset: t.offset, enabled: t.enabled, body };
  if (t.id) {
    const { data, error } = await db.from("message_templates").update(row).eq("id", t.id).eq("shop_id", shopId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("not_found");
    return data.id;
  }
  const { data, error } = await db.from("message_templates").insert(row).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function setTemplateEnabled(shopId: string, id: string, enabled: boolean) {
  if (!supabaseConfigured()) {
    const t = demoList().find((x) => x.id === id);
    if (t) t.enabled = enabled;
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("message_templates").update({ enabled }).eq("id", id).eq("shop_id", shopId);
  if (error) throw error;
}

export async function deleteTemplate(shopId: string, id: string) {
  if (!supabaseConfigured()) {
    const list = demoList();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("message_templates").delete().eq("id", id).eq("shop_id", shopId);
  if (error) throw error;
}

/** Recoloca os modelos padrão que o dono excluiu (pelo nome). Não mexe nos que existem. */
export async function restoreDefaults(shopId: string): Promise<number> {
  const have = new Set((await listTemplates(shopId)).map((t) => t.name.trim().toLowerCase()));
  const missing = DEFAULT_TEMPLATES.filter((t) => !have.has(t.name.toLowerCase()));
  for (const t of missing) await saveTemplate(shopId, { ...t, body: { ...t.body } });
  return missing.length;
}

/** Agendamentos que começam (ou terminam) entre `from` e `to`, com os dados do cliente. */
export async function appointmentsForMessages(shopId: string, from: Date, to: Date): Promise<MessageAppointment[]> {
  if (!supabaseConfigured()) {
    const store = demoSeed();
    const { services, barbers } = store.bundle;
    return store.appointments
      .filter((a) => a.endsAt > from && a.startsAt < to)
      .sort((a, b) => +a.startsAt - +b.startsAt)
      .map((a) => {
        const c = a.clientId ? store.clients.find((x) => x.id === a.clientId) : undefined;
        return {
          id: a.id, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, clientName: c?.name ?? a.clientName,
          phone: c?.phone || null, lang: c?.lang ?? "pt",
          serviceName: services.find((s) => s.id === a.serviceId)?.name ?? { pt: a.serviceName },
          barberName: barbers.find((b) => b.id === a.barberId)?.name ?? "",
        };
      });
  }
  const db = await supabaseServer();
  const { data, error } = await db.from("appointments")
    .select("id, starts_at, ends_at, status, walk_in_name, clients(name, phone_e164, lang), services(name), barbers(display_name)")
    .eq("shop_id", shopId).gt("ends_at", from.toISOString()).lt("starts_at", to.toISOString())
    .not("status", "in", "(cancelled,no_show)").order("starts_at").limit(500);
  if (error) throw error;
  type ARow = {
    id: string; starts_at: string; ends_at: string; status: string; walk_in_name: string | null;
    clients: { name: string; phone_e164: string; lang: Lang } | null; services: { name: I18nText } | null; barbers: { display_name: string } | null;
  };
  return ((data ?? []) as unknown as ARow[]).map((x) => ({
    id: x.id, startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at), status: x.status,
    clientName: x.clients?.name ?? x.walk_in_name ?? "Cliente", phone: x.clients?.phone_e164 ?? null, lang: x.clients?.lang ?? "pt",
    serviceName: x.services?.name ?? { pt: "" }, barberName: x.barbers?.display_name ?? "",
  }));
}
