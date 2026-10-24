"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/staff";
import { toMinutes } from "@/core/types";
import { saveFeature, saveShop, saveWalkIn } from "@/modules/settings/data";
import { FEATURES, FEATURE_KEYS } from "@/modules/settings/features";

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos" };
  if (e instanceof Error && e.message === "forbidden") return { ok: false, error: "Seu nível de acesso não permite mudar as configurações. Peça ao dono." };
  return { ok: false, error: "Não deu para salvar. Tente de novo." };
};

async function guarded(slug: string, fn: (shopId: string, walkIn: Awaited<ReturnType<typeof assertStaff>>["bundle"]["walkIn"]) => Promise<void>): Promise<ActionResult> {
  try {
    const { bundle } = await assertStaff(slug, "recursos");
    await fn(bundle.shop.id, bundle.walkIn);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  revalidatePath(`/b/${slug}`);
  revalidatePath(`/tv/${slug}`);
  return { ok: true };
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato 09:00");

function configSchema(key: string) {
  const def = FEATURES.find((f) => f.key === key)!;
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    if (f.type === "bool") shape[f.key] = z.boolean();
    else if (f.type === "number") shape[f.key] = z.number().min(f.min, `${f.label}: mínimo ${f.min}`).max(f.max, `${f.label}: máximo ${f.max}`);
    else shape[f.key] = z.enum(f.options.map((o) => o.value) as [string, ...string[]]);
  }
  return z.object(shape).strict();
}

export async function saveFeatureAction(slug: string, key: string, enabled: boolean, config: Record<string, unknown>) {
  return guarded(slug, async (shopId, walkIn) => {
    const k = z.enum(FEATURE_KEYS).parse(key);
    const cfg = configSchema(k).parse(config) as Record<string, string | number | boolean>;
    await saveFeature(shopId, k, z.boolean().parse(enabled), cfg, walkIn);
  });
}

const hoursSchema = z.object({
  openingHours: z.partialRecord(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.object({ open: hhmm, close: hhmm })
    .refine((h) => toMinutes(h.close) > toMinutes(h.open), "O fechamento precisa ser depois da abertura")),
  slotStepMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
});

export async function saveHoursAction(slug: string, input: z.input<typeof hoursSchema>) {
  return guarded(slug, async (shopId) => {
    const p = hoursSchema.parse(input);
    await saveShop(shopId, { openingHours: p.openingHours as Record<string, { open: string; close: string }>, slotStepMin: p.slotStepMin });
  });
}

const walkInSchema = z.object({
  enabled: z.boolean(),
  perPeakHour: z.number().int().min(0, "Mínimo 0").max(10, "Máximo 10 por hora"),
  peakStarts: z.array(hhmm).max(24),
  blockMin: z.number().int().min(10, "Bloco mínimo de 10 minutos").max(240, "Bloco máximo de 4 horas"),
});

export async function saveWalkInAction(slug: string, input: z.input<typeof walkInSchema>) {
  return guarded(slug, async (shopId) => {
    const p = walkInSchema.parse(input);
    await saveWalkIn(shopId, { ...p, peakStarts: [...new Set(p.peakStarts.map(toMinutes))] });
  });
}

const plansSchema = z.object({
  planAlertDays: z.number().int().min(0, "Mínimo 0 dias").max(60, "Máximo 60 dias"),
  blockExpiredPlans: z.boolean(),
});

export async function savePlanRulesAction(slug: string, input: z.input<typeof plansSchema>) {
  return guarded(slug, async (shopId) => saveShop(shopId, plansSchema.parse(input)));
}

const validZone = (tz: string) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
};
const validCurrency = (c: string) => {
  try { new Intl.NumberFormat("en-US", { style: "currency", currency: c }); return true; } catch { return false; }
};

const shopSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  address: z.string().trim().max(200).transform((s) => s || null).nullable(),
  defaultLang: z.enum(["pt", "en", "es"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Moeda com 3 letras, ex.: BRL").refine(validCurrency, "Moeda desconhecida"),
  timezone: z.string().trim().min(1).refine(validZone, "Fuso horário desconhecido. Ex.: America/Sao_Paulo"),
});

export async function saveShopInfoAction(slug: string, input: z.input<typeof shopSchema>) {
  return guarded(slug, async (shopId) => saveShop(shopId, shopSchema.parse(input)));
}
