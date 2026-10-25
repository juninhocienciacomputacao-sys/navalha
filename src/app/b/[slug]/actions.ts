"use server";

// Ações do app do cliente. Não são da equipe: quem confere permissão é o banco
// (funções security definer que só mexem nos dados do próprio cliente logado pelo WhatsApp).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repo } from "@/data";
import { daySlots } from "@/data/booking";
import { addDays } from "@/core/time";
import {
  bookAsViewer, cancelAsViewer, createStyleProject, paymentStatus, resolveViewer, setPhotoConsent, startPlanPayment,
} from "@/modules/client-app/data";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().min(1).max(60);
/** Cliente de exemplo escolhido no modo demonstração (ignorado com Supabase). */
const as = z.string().max(20).optional();

async function ctx(s: string, a?: string) {
  const r = repo();
  const b = await r.shopBySlug(slug.parse(s));
  if (!b) return null;
  return { r, b, viewer: await resolveViewer(r, as.parse(a)) };
}
const done = (s: string) => revalidatePath(`/b/${s}`);

export async function loadSlots(s: string, d: string, serviceId: string, barberId?: string) {
  const c = await ctx(s);
  if (!c) return null;
  return daySlots(c.r, c.b, day.parse(d), z.string().parse(serviceId), barberId ? z.string().parse(barberId) : undefined);
}

/** Primeiro horário livre a partir de um dia (até 30 dias), para "Próximo horário livre". */
export async function nextFree(s: string, from: string, serviceId: string, barberId?: string) {
  const c = await ctx(s);
  if (!c) return null;
  const sid = z.string().max(64).parse(serviceId);
  const bid = barberId ? z.string().max(64).parse(barberId) : undefined;
  for (let i = 0; i < 30; i++) {
    const d = addDays(day.parse(from), i);
    const r = await daySlots(c.r, c.b, d, sid, bid);
    if (r.closed) continue;
    if (bid && r.preferred) {
      if (r.preferred.own.length) return { day: d, minutes: r.preferred.own[0], barberId: bid };
    } else if (r.options.length) return { day: d, minutes: r.options[0].time, barberId: r.options[0].barberIds[0] };
  }
  return null;
}

const bookSchema = z.object({
  slug, as, day, minutes: z.number().int().min(0).max(1440),
  serviceId: z.string(), barberId: z.string(),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(20).optional(),
});

export async function confirmBooking(input: z.infer<typeof bookSchema>) {
  const p = bookSchema.parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return { ok: false as const, error: "not_found" };
  const r = await bookAsViewer(c.b, c.viewer, p);
  if (r.ok) done(p.slug);
  return r;
}

export async function cancelAppointment(input: { slug: string; as?: string; id: string }) {
  const p = z.object({ slug, as, id: z.string().min(1).max(64) }).parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return { ok: false, error: "not_found" };
  const r = await cancelAsViewer(c.viewer, p.id);
  if (r.ok) done(p.slug);
  return r;
}

export async function payPlan(input: { slug: string; as?: string; method: "pix" | "card" }) {
  const p = z.object({ slug, as, method: z.enum(["pix", "card"]) }).parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return { ok: false as const, error: "not_found" };
  const r = await startPlanPayment(c.b, c.viewer, p.method);
  done(p.slug);
  return r;
}

export async function checkPayment(input: { slug: string; as?: string; paymentId: string }) {
  const p = z.object({ slug, as, paymentId: z.string().min(1).max(64) }).parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return null;
  const st = await paymentStatus(c.viewer, p.paymentId);
  if (st === "paid") done(p.slug);
  return st;
}

export async function photoConsent(input: { slug: string; as?: string; consent: boolean }) {
  const p = z.object({ slug, as, consent: z.boolean() }).parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return { ok: false, at: null };
  const r = await setPhotoConsent(c.b, c.viewer, p.consent);
  done(p.slug);
  return r;
}

const i18n = z.object({ pt: z.string().max(200), en: z.string().max(200).optional(), es: z.string().max(200).optional() });
const projectSchema = z.object({
  slug, as,
  goal: z.string().trim().min(2).max(80),
  barberId: z.string().max(64).nullable().optional(),
  steps: z.array(z.object({ wk: z.string().max(8), title: i18n, desc: i18n, date: day, done: z.boolean() })).min(1).max(12),
  // demonstração: foto reduzida no navegador (≈ 50 KB) como data URL
  photoDataUrl: z.string().max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,/).nullable().optional(),
  // Supabase: caminho no bucket client-photos, enviado direto do navegador
  photoPath: z.string().max(300).nullable().optional(),
});

export async function createProject(input: z.infer<typeof projectSchema>) {
  const p = projectSchema.parse(input);
  const c = await ctx(p.slug, p.as);
  if (!c) return { ok: false as const, error: "not_found" };
  const r = await createStyleProject(c.b, c.viewer, {
    goal: p.goal, steps: p.steps, barberId: p.barberId,
    photoDataUrl: c.viewer.kind === "demo" ? p.photoDataUrl : null,
    photoPath: c.viewer.kind === "demo" ? null : p.photoPath,
  });
  if (r.ok) done(p.slug);
  return r;
}
