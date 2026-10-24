import { supabaseServer } from "@/lib/supabase";
import type { Lang } from "@/core/types";
import { toMinutes } from "@/core/types";
import type { AgendaItem, BookResult, Dashboard, Repo, ShopBundle } from "./types";

const minutes = (t: string) => toMinutes(t.slice(0, 5));

export const supabaseRepo: Repo = {
  mode: "supabase",

  async shopBySlug(slug) {
    const db = await supabaseServer();
    const { data: shop } = await db.from("shops").select("*").eq("slug", slug).maybeSingle();
    if (!shop) return null;
    const [barbers, services, plans, planServices, walkIn] = await Promise.all([
      db.from("barbers").select("id, display_name, role_title, color, photo").eq("shop_id", shop.id).eq("active", true).order("sort"),
      db.from("services").select("id, name, duration_min, price").eq("shop_id", shop.id).eq("active", true).order("sort"),
      db.from("plans").select("id, name, price, quota_uses, period_days").eq("shop_id", shop.id).eq("active", true),
      db.from("plan_services").select("plan_id, service_id"),
      db.from("walk_in_policy").select("*").eq("shop_id", shop.id).maybeSingle(),
    ]);
    const bundle: ShopBundle = {
      shop: {
        id: shop.id, slug: shop.slug, name: shop.name, address: shop.address, currency: shop.currency,
        defaultLang: shop.default_lang as Lang, timezone: shop.timezone, openingHours: shop.opening_hours,
        slotStepMin: shop.slot_step_min, planAlertDays: shop.plan_alert_days,
      },
      barbers: (barbers.data ?? []).map((b) => ({ id: b.id, name: b.display_name, roleTitle: b.role_title, color: b.color, photo: b.photo ?? null })),
      services: (services.data ?? []).map((s) => ({
        id: s.id, name: s.name, durationMin: s.duration_min, price: Number(s.price),
        planIds: (planServices.data ?? []).filter((x) => x.service_id === s.id).map((x) => x.plan_id),
      })),
      plans: (plans.data ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price), quotaUses: p.quota_uses, periodDays: p.period_days })),
      walkIn: walkIn.data
        ? { enabled: walkIn.data.enabled, perPeakHour: walkIn.data.per_peak_hour, peakStarts: walkIn.data.peak_starts.map(minutes), blockMin: walkIn.data.block_min }
        : { enabled: false, perPeakHour: 0, peakStarts: [], blockMin: 45 },
    };
    return bundle;
  },

  async busy(shopId, from, to) {
    const db = await supabaseServer();
    const { data, error } = await db.rpc("busy_slots", { p_shop: shopId, p_from: from.toISOString(), p_to: to.toISOString() });
    if (error) throw error;
    return (data ?? []).map((x: { barber_id: string; starts_at: string; ends_at: string }) =>
      ({ barberId: x.barber_id, startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at) }));
  },

  async book(input): Promise<BookResult> {
    const db = await supabaseServer();
    const { data, error } = await db.rpc("book_appointment", {
      p_shop: input.shopId, p_barber: input.barberId, p_service: input.serviceId,
      p_starts: input.startsAt.toISOString(), p_name: input.name,
    });
    if (error) {
      const known = ["not_logged_in", "slot_taken", "slot_in_past", "service_not_found", "barber_not_found"].find((k) => error.message.includes(k));
      return { ok: false, error: known ?? "unknown" };
    }
    return { ok: true, id: data as string };
  },

  async agenda(shopId, from, to): Promise<AgendaItem[]> {
    const db = await supabaseServer();
    const { data, error } = await db.from("appointments")
      .select("id, barber_id, walk_in_name, starts_at, ends_at, status, price, subscription_id, clients(name), services(name)")
      .eq("shop_id", shopId).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()).order("starts_at");
    if (error) throw error;
    type Row = {
      id: string; barber_id: string; walk_in_name: string | null; starts_at: string; ends_at: string; status: AgendaItem["status"];
      price: number; subscription_id: string | null; clients: { name: string } | null; services: { name: { pt: string } } | null;
    };
    return ((data ?? []) as unknown as Row[]).map((x) => ({
      id: x.id, barberId: x.barber_id, clientName: x.clients?.name ?? x.walk_in_name ?? "Encaixe",
      serviceName: x.services?.name.pt ?? "", startsAt: new Date(x.starts_at), endsAt: new Date(x.ends_at),
      status: x.status, price: Number(x.price), viaPlan: x.subscription_id !== null,
    }));
  },

  async dashboard(shopId, monthStart, now): Promise<Dashboard> {
    const db = await supabaseServer();
    const [{ data: shop }, items, clients, subs, paid] = await Promise.all([
      db.from("shops").select("plan_alert_days").eq("id", shopId).single(),
      this.agenda(shopId, monthStart, now),
      db.from("clients").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      db.from("subscriptions").select("period_end, clients(name, phone_e164), plans(name)").eq("shop_id", shopId).is("cancelled_at", null),
      db.from("payments").select("amount").eq("shop_id", shopId).eq("status", "paid").gte("created_at", monthStart.toISOString()),
    ]);
    const done = items.filter((x) => x.status === "done");
    const alertDays = shop?.plan_alert_days ?? 5;
    type Sub = { period_end: string; clients: { name: string; phone_e164: string } | null; plans: { name: string } | null };
    const allSubs = (subs.data ?? []) as unknown as Sub[];
    const today = now.toISOString().slice(0, 10);
    return {
      revenueMonth: (paid.data ?? []).reduce((t, p) => t + Number(p.amount), 0),
      appointmentsMonth: done.length,
      clients: clients.count ?? 0,
      activeSubscriptions: allSubs.filter((s) => s.period_end >= today).length,
      planAlerts: allSubs
        .filter((s) => (new Date(s.period_end).getTime() - now.getTime()) / 86_400_000 <= alertDays)
        .map((s) => ({ clientName: s.clients?.name ?? "", phone: s.clients?.phone_e164 ?? "", planName: s.plans?.name ?? "", periodEnd: new Date(s.period_end) }))
        .sort((a, b) => +a.periodEnd - +b.periodEnd),
      perBarber: [...new Set(done.map((x) => x.barberId))].map((barberId) => {
        const mine = done.filter((x) => x.barberId === barberId);
        return { barberId, appointments: mine.length, revenue: mine.reduce((t, x) => t + x.price, 0),
          minutes: mine.reduce((t, x) => t + (+x.endsAt - +x.startsAt) / 60_000, 0) };
      }),
    };
  },
};
