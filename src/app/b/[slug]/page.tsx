import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { repo } from "@/data";
import { daySlots } from "@/data/booking";
import { dayInZone } from "@/core/time";
import { asLang } from "@/i18n";
import { loadClientHome, resolveViewer } from "@/modules/client-app/data";
import { clientCatalog } from "@/modules/client-app/catalog";
import ClientApp, { type Tab } from "./ClientApp";

export const dynamic = "force-dynamic";

const TABS: Tab[] = ["home", "book", "shop", "plan"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await repo().shopBySlug((await params).slug);
  return { title: b ? b.shop.name : "Navalha" };
}

export default async function Page({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string; tab?: string; as?: string }>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const r = repo();
  const bundle = await r.shopBySlug(slug);
  if (!bundle) notFound();
  const lang = asLang(q.lang, bundle.shop.defaultLang);
  const now = new Date();
  const today = dayInZone(now, bundle.shop.timezone);
  const viewer = await resolveViewer(r, q.as);
  const [initial, home, catalog] = await Promise.all([
    daySlots(r, bundle, today, bundle.services[0].id),
    loadClientHome(r, bundle, viewer, now),
    clientCatalog(bundle),
  ]);
  const tab = TABS.includes(q.tab as Tab) ? (q.tab as Tab) : "home";
  return (
    <ClientApp
      key={viewer.kind === "demo" ? viewer.clientId : viewer.kind}
      bundle={bundle} lang={lang} today={today} initial={initial} viewer={viewer} home={home} catalog={catalog} initialTab={tab}
      hour={Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: bundle.shop.timezone }).format(now))}
    />
  );
}
