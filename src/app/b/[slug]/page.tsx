import { notFound } from "next/navigation";
import { repo } from "@/data";
import { currentUser } from "@/lib/supabase";
import { daySlots } from "@/data/booking";
import { dayInZone } from "@/core/time";
import { asLang } from "@/i18n";
import Booking from "./Booking";

export default async function Page({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const r = repo();
  const bundle = await r.shopBySlug(slug);
  if (!bundle) notFound();
  const lang = asLang((await searchParams).lang, bundle.shop.defaultLang);
  const today = dayInZone(new Date(), bundle.shop.timezone);
  const first = bundle.services[0];
  const initial = await daySlots(r, bundle, today, first.id);
  return <Booking bundle={bundle} lang={lang} today={today} initial={initial} demo={r.mode === "demo"} loggedIn={r.mode === "demo" || Boolean(await currentUser())} />;
}
