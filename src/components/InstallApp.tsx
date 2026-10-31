"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/core/types";

// Cartão "Instalar o app": no Android/Chrome abre o pedido de instalação do próprio celular;
// no iPhone mostra os dois toques do Safari. Some quando o app já está instalado.

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const T = {
  pt: { title: "Instale o app", sub: "Agende em 1 toque, direto da tela inicial.", btn: "Instalar", ios: "No iPhone: toque em Compartilhar (quadrado com seta ↑) e depois em \"Adicionar à Tela de Início\".", other: "No menu do navegador, toque em \"Instalar app\" ou \"Adicionar à tela inicial\".", close: "Fechar" },
  en: { title: "Install the app", sub: "Book in one tap, right from your home screen.", btn: "Install", ios: "On iPhone: tap Share (square with ↑ arrow), then \"Add to Home Screen\".", other: "In the browser menu, tap \"Install app\" or \"Add to Home screen\".", close: "Close" },
  es: { title: "Instala la app", sub: "Reserva en un toque, desde la pantalla de inicio.", btn: "Instalar", ios: "En iPhone: toca Compartir (cuadrado con flecha ↑) y luego \"Añadir a pantalla de inicio\".", other: "En el menú del navegador, toca \"Instalar app\" o \"Añadir a pantalla de inicio\".", close: "Cerrar" },
} as const;

const HIDE_KEY = "navalha_install_hidden";

export default function InstallApp({ lang, name, className = "" }: { lang: Lang; name?: string; className?: string }) {
  const L = T[lang] ?? T.pt;
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios" | "other">("hidden");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let hidden = false;
    try { hidden = localStorage.getItem(HIDE_KEY) === "1"; } catch { /* navegação privada */ }
    if (standalone || hidden) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const mobile = ios || /Android/.test(ua);
    if (ios) setMode("ios");
    else if (mobile) setMode("other");
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); setMode("prompt"); };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (mode === "hidden") return null;
  const hide = () => { setMode("hidden"); try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* ok */ } };
  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setMode("hidden");
  }

  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30 ${className}`}>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-950 text-lg">✂️</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{L.title}{name ? ` · ${name}` : ""}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{mode === "ios" ? L.ios : mode === "other" ? L.other : L.sub}</p>
        {mode === "prompt" && <button onClick={install} className="mt-2 rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-neutral-950">{L.btn}</button>}
      </div>
      <button onClick={hide} aria-label={L.close} className="shrink-0 rounded-full px-2 text-lg leading-none text-neutral-500">×</button>
    </div>
  );
}
