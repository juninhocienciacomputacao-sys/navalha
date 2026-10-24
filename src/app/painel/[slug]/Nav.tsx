"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU } from "@/core/access";
import type { Modules } from "@/core/modules";

/** Menu do painel. Novas telas entram em MENU (src/core/access.ts). */
export default function Nav({ slug, shopName, demo, allowed, showAccess, roleLabel, modules }: {
  slug: string; shopName: string; demo: boolean;
  /** Telas que o nível de quem entrou pode abrir (chaves de MENU). */
  allowed: string[];
  /** Só o dono vê a tela de Acessos. */
  showAccess: boolean;
  /** Nome do nível, quando não é o dono (aparece embaixo do nome da barbearia). */
  roleLabel?: string;
  /** Módulos ligados (a TV da recepção some quando desligada). */
  modules: Modules;
}) {
  const items = [
    ...MENU.filter((m) => allowed.includes(m.key)),
    ...(showAccess ? [{ key: "acessos", href: "/acessos", label: "Acessos", icon: "🔐" }] : []),
  ];
  const path = usePathname();
  const base = `/painel/${slug}`;
  const active = (href: string) => (href === "" ? path === base : path.startsWith(base + href));
  return (
    <aside className="border-b border-neutral-200 bg-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
        <div>
          <p className="text-sm font-bold">✂️ Navalha</p>
          <p className="truncate text-xs text-neutral-500">{shopName}{demo ? " · demonstração" : ""}{roleLabel ? ` · ${roleLabel}` : ""}</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
        {items.map((s) => (
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
