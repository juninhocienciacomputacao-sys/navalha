import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { repo } from "@/data";
import { daySlots } from "@/data/booking";
import { dayInZone } from "@/core/time";
import { asLang } from "@/i18n";
import { loadClientHome, resolveViewer } from "@/modules/client-app/data";
import { clientCatalog } from "@/modules/client-app/catalog";
import { bookingLimitSetting, rebookSetting } from "@/modules/settings/data";
import ClientApp, { type Tab } from "./ClientApp";

export const dynamic = "force-dynamic";

const TABS: Tab[] = ["home", "book", "shop", "plan"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await repo().shopBySlug((await params).slug);
  if (!b) return { title: "Navalha" };
  return {
    title: b.shop.name,
    description: `Agende seu horário na ${b.shop.name}`,
    manifest: `/b/${b.shop.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: b.shop.name, statusBarStyle: "black-translucent" },
  };
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
  // Barbearia recém-cadastrada, ainda sem serviço ou sem barbeiro: não dá para agendar.
  if (!bundle.services.length || !bundle.barbers.length) return <EmPreparo name={bundle.shop.name} lang={lang} />;
  const now = new Date();
  const today = dayInZone(now, bundle.shop.timezone);
  const viewer = await resolveViewer(r, q.as);
  const mods = bundle.shop.modules;
  const [rebook, limit] = await Promise.all([
    mods.planos ? rebookSetting(bundle.shop.id) : Promise.resolve({ on: false, days: 7 }),
    bookingLimitSetting(bundle.shop.id),
  ]);
  const [initial, home, catalog] = await Promise.all([
    daySlots(r, bundle, today, bundle.services[0].id),
    loadClientHome(r, bundle, viewer, now, rebook, limit),
    mods.shopping ? clientCatalog(bundle) : Promise.resolve(null),
  ]);
  // abas de módulos desligados não aparecem (nem pelo link direto)
  const tabs = TABS.filter((t) => (t === "shop" ? mods.shopping : t === "plan" ? mods.planos : true));
  const tab = tabs.includes(q.tab as Tab) ? (q.tab as Tab) : "home";
  return (
    <ClientApp
      key={viewer.kind === "demo" ? viewer.clientId : viewer.kind}
      bundle={bundle} lang={lang} today={today} initial={initial} viewer={viewer} home={home} catalog={catalog} initialTab={tab} limit={limit}
      hour={Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: bundle.shop.timezone }).format(now))}
    />
  );
}

const PREPARO = {
  pt: ["está preparando a agenda online.", "Volte em breve para agendar seu horário."],
  en: ["is setting up online booking.", "Come back soon to book your visit."],
  es: ["está preparando la agenda en línea.", "Vuelve pronto para reservar tu turno."],
} as const;

function EmPreparo({ name, lang }: { name: string; lang: keyof typeof PREPARO }) {
  const [a, b] = PREPARO[lang] ?? PREPARO.pt;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-2 px-6 text-center">
      <p className="text-4xl">💈</p>
      <h1 className="text-2xl font-bold">{name}</h1>
      <p className="text-neutral-600 dark:text-neutral-300">{a}</p>
      <p className="text-sm text-neutral-500">{b}</p>
    </main>
  );
}
