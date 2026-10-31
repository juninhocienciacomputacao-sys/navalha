"use client";

import { useEffect } from "react";

/** Liga o service worker (public/sw.js): deixa o app instalável e mostra uma tela amigável sem internet. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* sem service worker o app funciona igual */ });
  }, []);
  return null;
}
