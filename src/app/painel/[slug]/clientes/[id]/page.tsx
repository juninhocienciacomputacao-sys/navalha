import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { dayInZone } from "@/core/time";
import { formatMoney } from "@/core/money";
import { daysLeft, expiryMessage, waLink } from "@/core/planboard";
import { locale } from "@/i18n";
import { getClient } from "@/modules/clients/data";
import { listPlans, subscriptionPayments } from "@/modules/plans/data";
import { Avatar, Badge, fmtDay, fmtPhone, Kpi, planBadge, WhatsAppLink } from "@/modules/clients/ui";
import ClientForm from "./ClientForm";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  done: { label: "Atendido", tone: "ok" }, no_show: { label: "Faltou", tone: "bad" }, cancelled: { label: "Cancelado", tone: "neutral" },
  confirmed: { label: "Marcado", tone: "info" }, pending: { label: "A confirmar", tone: "warn" }, in_service: { label: "Na cadeira", tone: "info" },
};
const METHOD = { pix: "Pix", card: "Cartão", cash: "Dinheiro" } as const;

export default async function Ficha({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { bundle } = await requireStaff(slug);
  const { shop, barbers } = bundle;
  const c = await getClient(bundle, decodeURIComponent(id));
  if (!c) notFound();
  const [plans, pays] = await Promise.all([listPlans(bundle), subscriptionPayments(bundle, c.id)]);
  const lang = shop.defaultLang;
  const tz = shop.timezone;
  const today = dayInZone(new Date(), tz);
  const money = (n: number) => formatMoney(n, shop.currency, lang);
  const barber = (bid: string | null) => barbers.find((b) => b.id === bid);
  const plan = c.sub ? plans.find((p) => p.id === c.sub!.planId) : undefined;
  const left = c.sub ? daysLeft(c.sub.periodEnd, today) : null;
  const pb = left !== null ? planBadge(left, shop.planAlertDays) : null;
  const ago = c.lastVisit ? -daysLeft(c.lastVisit, today) : null;
  const doneDays = [...new Set(c.history.filter((h) => h.status === "done").map((h) => dayInZone(new Date(h.startsAt), tz)))].sort();
  const cycle = doneDays.length >= 2 ? Math.round(-daysLeft(doneDays[0], doneDays.at(-1)!) / (doneDays.length - 1)) : null;
  const when = (iso: string) => new Date(iso).toLocaleString(locale(lang), { timeZone: tz, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href={`/painel/${slug}/clientes`} className="text-sm text-neutral-500 hover:underline">← Clientes</Link>
      <header className="mt-3 flex flex-wrap items-center gap-4">
        <Avatar name={c.name} color={barber(c.barberId)?.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{c.name}</h1>
          <p className="text-sm text-neutral-500">{fmtPhone(c.phone)} · cliente desde {fmtDay(c.createdAt, lang)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan && pb ? <Badge tone={pb.tone}>{plan.name} · {pb.label}</Badge> : <Badge tone="neutral">Avulso</Badge>}
            {c.noShows > 0 && <Badge tone="bad">{c.noShows} falta{c.noShows > 1 ? "s" : ""}</Badge>}
            {ago !== null && ago > 30 && <Badge tone="warn">Sumido há {ago} dias</Badge>}
            {c.photoConsentAt ? <Badge tone="ok">Autorizou fotos</Badge> : <Badge tone="neutral">Sem autorização de fotos</Badge>}
          </div>
        </div>
        <WhatsAppLink href={waLink(c.phone, `Oi ${c.name.split(" ")[0]}! Aqui é da ${shop.name}. `)} label="Mensagem no WhatsApp" />
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Visitas" value={String(c.visits)} />
        <Kpi label="Gasto total" value={money(c.totalSpent)} hint="atendimentos + planos" />
        <Kpi label="Última visita" value={ago === null ? "—" : ago === 0 ? "Hoje" : `há ${ago} d`} hint={c.lastVisit ? fmtDay(c.lastVisit, lang) : "ainda não veio"} />
        <Kpi label="Volta a cada" value={cycle ? `${cycle} dias` : "—"} hint={barber(c.barberId) ? `prefere ${barber(c.barberId)!.name}` : undefined} />
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
        {shop.modules.planos && <section className="card">
          <h2 className="mb-3 font-semibold">Plano</h2>
          {c.sub && plan && left !== null ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-base">{plan.name}</b>
                <span className="tabular-nums text-neutral-500">{money(plan.price)} a cada {plan.periodDays} dias</span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-neutral-500">Ciclo atual</dt><dd className="text-right tabular-nums">{fmtDay(c.sub.periodStart, lang, true)} a {fmtDay(c.sub.periodEnd, lang, true)}</dd>
                <dt className="text-neutral-500">Situação</dt><dd className="text-right">{pb && <Badge tone={pb.tone}>{pb.label}</Badge>}</dd>
                <dt className="text-neutral-500">Uso no ciclo</dt><dd className="text-right tabular-nums">{c.sub.usesInPeriod}{plan.quotaUses ? ` de ${plan.quotaUses}` : " (ilimitado)"}</dd>
                <dt className="text-neutral-500">Vendido por</dt><dd className="text-right">{barber(c.sub.soldByBarberId)?.name ?? "—"}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                <Link href={`/painel/${slug}/planos?q=${encodeURIComponent(c.name)}`} className="chip">Registrar pagamento ou cancelar</Link>
                {left <= shop.planAlertDays && (
                  <WhatsAppLink compact label="Avisar vencimento" href={waLink(c.phone, expiryMessage({
                    clientName: c.name, planName: plan.name, shopName: shop.name, left, endLabel: fmtDay(c.sub.periodEnd, lang, true), price: money(plan.price),
                  }))} />
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500">
              <p>Cliente avulso, sem plano.</p>
              <Link href={`/painel/${slug}/planos?vender=${encodeURIComponent(c.id)}`} className="btn mt-3 inline-block">Vender plano</Link>
            </div>
          )}
          {pays.length > 0 && (
            <>
              <h3 className="mt-5 mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Pagamentos de plano</h3>
              <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                {pays.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex justify-between py-1.5">
                    <span className="text-neutral-500">{p.paidAt ? fmtDay(dayInZone(new Date(p.paidAt), tz), lang) : "—"} · {METHOD[p.method]}</span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>}

        <ClientForm slug={slug} barbers={barbers} client={{
          id: c.id, name: c.name, phone: c.phone, preferredBarberId: c.preferredBarberId, preferences: c.preferences, notes: c.notes,
          photoConsentAt: c.photoConsentAt ? fmtDay(dayInZone(new Date(c.photoConsentAt), tz), lang) : null,
        }} />
      </div>

      <section className="card mt-6">
        <h2 className="mb-3 font-semibold">Histórico de atendimentos</h2>
        {c.history.length === 0 ? <p className="text-sm text-neutral-500">Nenhum atendimento ainda.</p> : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {c.history.map((h) => {
              const st = STATUS[h.status] ?? STATUS.done;
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-neutral-500">{when(h.startsAt)}</span>
                  <span className="min-w-0 flex-1 font-medium">{h.serviceName}</span>
                  <span className="text-neutral-500">{barber(h.barberId)?.name ?? "—"}</span>
                  <span className="w-20 text-right tabular-nums">{h.viaPlan ? <span className="text-xs text-neutral-500">plano</span> : money(h.price)}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
