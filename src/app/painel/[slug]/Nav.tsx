"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionOn, type Modules } from "@/core/modules";

/** Menu do painel. Novas telas entram aqui. */
export const SECTIONS: { href: string; label: string; icon: string }[] = [
  { href: "", label: "Painel", icon: "📊" },
  { href: "/agenda", label: "Agenda", icon: "📅" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/planos", label: "Planos", icon: "🎟️" },
  { href: "/financeiro", label: "Financeiro", icon: "💰" },
  { href: "/comissoes", label: "Comissões", icon: "🧮" },
  { href: "/equipe", label: "Equipe", icon: "💈" },
  { href: "/servicos", label: "Serviços", icon: "✂️" },
  { href: "/mensagens", label: "Mensagens", icon: "💬" },
  { href: "/shopping", label: "Shopping", icon: "🛍️" },
  { href: "/recursos", label: "Recursos", icon: "⚙️" },
];

export default function Nav({ slug, shopName, demo, modules }: { slug: string; shopName: string; demo: boolean; modules: Modules }) {
  const path = usePathname();
  const base = `/painel/${slug}`;
  const active = (href: string) => (href === "" ? path === base : path.startsWith(base + href));
  return (
    <aside className="border-b border-neutral-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
        <div>
          <p className="text-sm font-bold">✂️ Navalha</p>
          <p className="truncate text-xs text-neutral-500">{shopName}{demo ? " · demonstração" : ""}</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
        {SECTIONS.filter((s) => sectionOn(modules, s.href.slice(1))).map((s) => (
          <Link key={s.href} href={base + s.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${active(s.href)
              ? "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>
            <span aria-hidden>{s.icon}</span>{s.label}
          </Link>
        ))}
        <div className="my-2 hidden border-t border-neutral-200 md:block dark:border-neutral-800" />
        {modules.tv && <a href={`/tv/${slug}`} target="_blank" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"><span aria-hidden>📺</span>TV da recepção</a>}
        <a href={`/b/${slug}`} target="_blank" className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"><span aria-hidden>📱</span>App do cliente</a>
      </nav>
    </aside>
  );
}
