import type { Metadata } from "next";
import { asLang } from "@/i18n";
import { safeNext } from "@/lib/supabase";
import { company, terms } from "@/legal/content";
import LegalPage from "@/legal/LegalPage";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: terms(asLang((await searchParams).lang, "pt"), company()).title };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string; back?: string }> }) {
  const q = await searchParams;
  const lang = asLang(q.lang, "pt");
  return <LegalPage doc={terms(lang, company())} lang={lang} path="termos" back={safeNext(q.back)} />;
}
