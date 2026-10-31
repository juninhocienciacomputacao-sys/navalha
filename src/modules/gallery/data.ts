// Galeria de cortes e barbas: modelos que o cliente vê no app e o dono edita no painel.
// Com o Supabase ligado usa a tabela style_looks (só quem abre Serviços grava); sem ele, guarda na memória da demonstração.
import { supabaseConfigured, supabaseServer } from "@/lib/supabase";
import { demoSeed } from "@/data/demo";
import { demoGlobal } from "@/data/demo-global";
import type { I18nText } from "@/core/types";
import { DEFAULT_LOOKS, type LookKind } from "./defaults";
import type { Look } from "./types";

export * from "./types";
export * from "./defaults";

export interface LookInput {
  id?: string;
  kind: LookKind;
  name: I18nText;
  desc: I18nText | null;
  serviceId: string | null;
  /** undefined = manter a foto atual; null = tirar a foto (volta o desenho); texto = foto nova (data URL). */
  photo?: string | null;
}

type Row = {
  id: string; kind: LookKind; name: I18nText; description: I18nText | null; art: string | null;
  photo: string | null; service_id: string | null; sort: number; updated_at: string;
};

// ---------- demonstração ----------
const demo = demoGlobal("gallery.looks", () => ({ n: 1, rows: new Map<string, Row[]>() }));
function demoRows(shopId: string): Row[] {
  if (shopId !== demoSeed().bundle.shop.id) throw new Error("not_found");
  if (!demo.rows.has(shopId)) {
    const now = new Date(0).toISOString();
    // na demonstração os cortes já abrem o agendamento em "Corte" e as barbas em "Barba"
    const svc = (pt: string) => demoSeed().bundle.services.find((s) => s.name.pt === pt)?.id ?? null;
    const link = { cut: svc("Corte"), beard: svc("Barba") };
    demo.rows.set(shopId, DEFAULT_LOOKS.map((d, i) => ({
      id: `look-${demo.n++}`, kind: d.kind, name: d.name, description: d.desc, art: d.art, photo: null, service_id: link[d.kind], sort: i, updated_at: now,
    })));
  }
  return demo.rows.get(shopId)!;
}

const toLook = (r: Row): Look => ({
  id: r.id, kind: r.kind, name: r.name, desc: r.description, art: r.art, hasPhoto: !!r.photo,
  version: String(new Date(r.updated_at).getTime()), serviceId: r.service_id, sort: r.sort,
});
const bySort = (a: Look, b: Look) => a.sort - b.sort || a.id.localeCompare(b.id);

/** Todos os modelos da barbearia (sem a foto em si, que vem pelo endereço da imagem). */
export async function listLooks(shopId: string): Promise<Look[]> {
  if (!supabaseConfigured()) return demoRows(shopId).map(toLook).sort(bySort);
  const db = await supabaseServer();
  const { data, error } = await db.from("style_looks")
    .select("id, kind, name, description, art, service_id, sort, updated_at, has_photo")
    .eq("shop_id", shopId).order("sort");
  if (error) throw error;
  // a foto em si não vem na lista: é servida à parte, com cache (src/app/b/[slug]/galeria/[id]/route.ts)
  return ((data ?? []) as unknown as (Omit<Row, "photo"> & { has_photo: boolean })[])
    .map((r) => toLook({ ...r, photo: r.has_photo ? "1" : null })).sort(bySort);
}

/** A foto enviada pelo dono (data URL), ou null. */
export async function lookPhoto(shopId: string, id: string): Promise<string | null> {
  if (!supabaseConfigured()) return demoRows(shopId).find((r) => r.id === id)?.photo ?? null;
  const db = await supabaseServer();
  const { data } = await db.from("style_looks").select("photo").eq("shop_id", shopId).eq("id", id).maybeSingle();
  return data?.photo ?? null;
}

async function nextSort(shopId: string, kind: LookKind): Promise<number> {
  const all = await listLooks(shopId);
  return Math.max(-1, ...all.filter((l) => l.kind === kind).map((l) => l.sort)) + 1;
}

export async function saveLook(shopId: string, input: LookInput): Promise<string> {
  const now = new Date().toISOString();
  const patch: Partial<Row> = { kind: input.kind, name: input.name, description: input.desc, service_id: input.serviceId, updated_at: now };
  if (input.photo !== undefined) patch.photo = input.photo;
  if (!supabaseConfigured()) {
    const rows = demoRows(shopId);
    if (input.id) {
      const r = rows.find((x) => x.id === input.id);
      if (!r) throw new Error("not_found");
      if (r.kind !== input.kind) r.sort = await nextSort(shopId, input.kind);
      Object.assign(r, patch);
      return r.id;
    }
    const r: Row = { id: `look-${demo.n++}`, art: null, photo: null, sort: await nextSort(shopId, input.kind), ...patch } as Row;
    rows.push(r);
    return r.id;
  }
  const db = await supabaseServer();
  if (input.id) {
    const { error } = await db.from("style_looks").update(patch).eq("id", input.id).eq("shop_id", shopId);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db.from("style_looks")
    .insert({ ...patch, shop_id: shopId, sort: await nextSort(shopId, input.kind) }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function deleteLook(shopId: string, id: string) {
  if (!supabaseConfigured()) {
    const rows = demoRows(shopId);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("not_found");
    rows.splice(i, 1);
    return;
  }
  const db = await supabaseServer();
  const { error } = await db.from("style_looks").delete().eq("id", id).eq("shop_id", shopId);
  if (error) throw error;
}

/** Troca de lugar com o vizinho (dir -1 = para a frente, 1 = para trás), dentro do mesmo tipo. */
export async function moveLook(shopId: string, id: string, dir: -1 | 1) {
  const all = await listLooks(shopId);
  const me = all.find((l) => l.id === id);
  if (!me) throw new Error("not_found");
  const list = all.filter((l) => l.kind === me.kind);
  const i = list.indexOf(me);
  const other = list[i + dir];
  if (!other) return;
  // renumera o tipo inteiro para não depender de números repetidos
  const order = list.map((l) => l.id);
  [order[i], order[i + dir]] = [order[i + dir], order[i]];
  if (!supabaseConfigured()) {
    const rows = demoRows(shopId);
    order.forEach((lid, n) => { const r = rows.find((x) => x.id === lid); if (r) r.sort = n; });
    return;
  }
  const db = await supabaseServer();
  for (const [n, lid] of order.entries()) {
    const { error } = await db.from("style_looks").update({ sort: n }).eq("id", lid).eq("shop_id", shopId);
    if (error) throw error;
  }
}

/** Coloca de volta os modelos iniciais que a barbearia apagou. Devolve quantos voltaram. */
export async function restoreDefaultLooks(shopId: string): Promise<number> {
  const all = await listLooks(shopId);
  const have = new Set(all.map((l) => l.art).filter(Boolean));
  const missing = DEFAULT_LOOKS.filter((d) => !have.has(d.art));
  if (!missing.length) return 0;
  const sorts: Record<LookKind, number> = { cut: await nextSort(shopId, "cut"), beard: await nextSort(shopId, "beard") };
  const rows = missing.map((d) => ({
    kind: d.kind, art: d.art, name: d.name, description: d.desc, photo: null, service_id: null,
    sort: sorts[d.kind]++, updated_at: new Date().toISOString(),
  }));
  if (!supabaseConfigured()) {
    demoRows(shopId).push(...rows.map((r) => ({ ...r, id: `look-${demo.n++}` })));
    return rows.length;
  }
  const db = await supabaseServer();
  const { error } = await db.from("style_looks").insert(rows.map((r) => ({ ...r, shop_id: shopId })));
  if (error) throw error;
  return rows.length;
}
