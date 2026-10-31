"use client";

import { useState, useTransition } from "react";
import type { Lang } from "@/core/types";
import { deleteMyAccount, downloadMyData } from "./actions";

const T = {
  pt: {
    title: "Meus dados", sub: "Você controla o que a barbearia guarda sobre você.",
    download: "Baixar meus dados", del: "Apagar meu cadastro",
    del_q: "Apagar seu cadastro nesta barbearia? Somem sua ficha, plano, fotos e projetos, e os próximos horários são cancelados. Isso não tem volta.",
    del_yes: "Sim, apagar tudo", keep: "Cancelar", deleted: "Cadastro apagado. Obrigado por ter vindo!", demo: "Na demonstração nada é apagado de verdade.",
    error: "Não deu certo. Tente de novo.",
  },
  en: {
    title: "My data", sub: "You control what the barbershop keeps about you.",
    download: "Download my data", del: "Delete my account",
    del_q: "Delete your account at this barbershop? Your profile, plan, photos and projects are erased and upcoming bookings are cancelled. This cannot be undone.",
    del_yes: "Yes, delete everything", keep: "Cancel", deleted: "Account deleted. Thanks for coming!", demo: "In the demo nothing is really deleted.",
    error: "Something went wrong. Try again.",
  },
  es: {
    title: "Mis datos", sub: "Tú controlas lo que la barbería guarda sobre ti.",
    download: "Descargar mis datos", del: "Borrar mi cuenta",
    del_q: "¿Borrar tu cuenta en esta barbería? Se eliminan tu ficha, plan, fotos y proyectos, y se cancelan los próximos turnos. No se puede deshacer.",
    del_yes: "Sí, borrar todo", keep: "Cancelar", deleted: "Cuenta borrada. ¡Gracias por venir!", demo: "En la demostración no se borra nada de verdad.",
    error: "Algo salió mal. Inténtalo de nuevo.",
  },
} as const;

/** Direitos do titular no app do cliente: baixar (acesso e portabilidade) e apagar (exclusão). */
export default function PrivacyBox({ slug, lang, demoAs }: { slug: string; lang: Lang; demoAs?: string }) {
  const L = T[lang] ?? T.pt;
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function download() {
    setMsg("");
    start(async () => {
      const data = await downloadMyData({ slug, as: demoAs });
      if (!data) { setMsg(L.error); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  function remove() {
    start(async () => {
      const r = await deleteMyAccount({ slug, as: demoAs });
      setAsk(false);
      if (!r.ok) { setMsg(L.error); return; }
      if ("demo" in r && r.demo) { setMsg(L.demo); return; }
      setMsg(L.deleted);
      setTimeout(() => window.location.assign(`/b/${slug}?lang=${lang}`), 1500);
    });
  }

  return (
    <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">{L.title}</h2>
      <p className="text-sm text-neutral-500">{L.sub}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={pending} onClick={download} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700">{L.download}</button>
        <button disabled={pending} onClick={() => setAsk(true)} className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30">{L.del}</button>
      </div>
      {ask && (
        <div role="alertdialog" className="mt-3 rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/30">
          <p>{L.del_q}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setAsk(false)} className="rounded-lg px-3 py-1.5 font-medium">{L.keep}</button>
            <button disabled={pending} onClick={remove} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{L.del_yes}</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{msg}</p>}
    </section>
  );
}
