import Link from "next/link";
import { LANGS } from "@/i18n";
import type { Lang } from "@/core/types";
import type { LegalDoc } from "./content";

const BACK = { pt: "Voltar", en: "Back", es: "Volver" } as const;
const OTHER = {
  privacidade: { pt: "Termos de uso", en: "Terms of Use", es: "Términos de uso" },
  termos: { pt: "Política de privacidade", en: "Privacy Policy", es: "Política de privacidad" },
} as const;

/** Página de texto legal, legível no celular e para imprimir. */
export default function LegalPage({ doc, lang, path, back }: { doc: LegalDoc; lang: Lang; path: "privacidade" | "termos"; back: string }) {
  const other = path === "privacidade" ? "termos" : "privacidade";
  const q = (l: Lang) => `?lang=${l}${back !== "/" ? `&back=${encodeURIComponent(back)}` : ""}`;
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 text-[15px] leading-relaxed">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={back} className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white">← {BACK[lang]}</Link>
        <nav className="flex gap-1 text-xs">
          {LANGS.map((l) => (
            <Link key={l} href={q(l)} className={`rounded-full px-2 py-0.5 font-semibold uppercase ${l === lang ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-neutral-500"}`}>{l}</Link>
          ))}
        </nav>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{doc.updated}</p>
      <p className="mt-5">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.h} className="mt-6">
          <h2 className="text-lg font-semibold">{s.h}</h2>
          {s.p.map((x, i) => <p key={i} className="mt-2 text-neutral-700 dark:text-neutral-300">{x}</p>)}
        </section>
      ))}
      <p className="mt-10 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800 print:hidden">
        <Link href={`/${other}${q(lang)}`} className="underline">{OTHER[path][lang]}</Link>
      </p>
    </main>
  );
}

/** Links do rodapé (app do cliente, login, cadastro). */
export function LegalLinks({ lang, back, className = "" }: { lang: Lang; back?: string; className?: string }) {
  const q = `?lang=${lang}${back ? `&back=${encodeURIComponent(back)}` : ""}`;
  return (
    <p className={`text-center text-xs text-neutral-500 ${className}`}>
      <Link href={`/privacidade${q}`} className="underline">{OTHER.termos[lang]}</Link>
      {" · "}
      <Link href={`/termos${q}`} className="underline">{OTHER.privacidade[lang]}</Link>
    </p>
  );
}
