import { requireStaff } from "@/lib/staff";
import { addDays, atMinutes, dayInZone } from "@/core/time";
import { monthStartIn, weeklyStats, type WeekStat } from "@/core/barberStats";
import { listBarbers, statAppointments } from "@/modules/settings/data";
import Team from "./Team";

export const dynamic = "force-dynamic";

const WEEKS = 8;

export default async function EquipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, role } = await requireStaff(slug);
  const { shop } = bundle;
  const tz = shop.timezone;
  const now = new Date();
  const today = dayInZone(now, tz);
  const from = atMinutes(addDays(today, -(WEEKS * 7 - 1)), 0, tz);
  const monthStart = monthStartIn(now, tz);
  const [barbers, appts] = await Promise.all([
    listBarbers(shop.id),
    statAppointments(shop.id, from < monthStart ? from : monthStart, now),
  ]);

  const ids = barbers.map((b) => b.id);
  const stats = weeklyStats({ appointments: appts, barberIds: ids, weeks: WEEKS, now, tz, openingHours: shop.openingHours });
  const byBarber: Record<string, WeekStat[]> = Object.fromEntries(stats);
  const monthRevenue: Record<string, number> = Object.fromEntries(ids.map((id) => [id,
    appts.filter((a) => a.barberId === id && a.status === "done" && a.startsAt >= monthStart).reduce((t, a) => t + a.price, 0)]));
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return (
    <Team
      slug={slug}
      currency={shop.currency}
      lang={shop.defaultLang}
      canEdit={role === "owner" || role === "manager"}
      barbers={barbers}
      stats={byBarber}
      monthRevenue={monthRevenue}
      dayOfMonth={d}
      daysInMonth={daysInMonth}
    />
  );
}
