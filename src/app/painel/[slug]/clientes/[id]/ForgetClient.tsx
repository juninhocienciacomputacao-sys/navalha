"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forgetClientAction } from "../actions";

/** LGPD/GDPR: apagar o cadastro de um cliente que pediu (só aparece para o dono). */
export default function ForgetClient({ slug, id, name }: { slug: string; id: string; name: string }) {
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const first = name.split(" ")[0];

  function go() {
    setErr("");
    start(async () => {
      const r = await forgetClientAction(slug, id);
      if (!r.ok) { setErr(r.error ?? "Não deu certo."); return; }
      router.push(`/painel/${slug}/clientes`);
    });
  }

  return (
    <section className="card mt-6 border-red-200 dark:border-red-900/60">
      <h2 className="font-semibold">Privacidade (LGPD / GDPR)</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Se o cliente pedir para apagar os dados dele, use este botão. Somem a ficha, o plano, as fotos e os projetos, e os próximos horários são cancelados.
        Os atendimentos e pagamentos que já aconteceram ficam sem nome, porque a barbearia precisa deles na contabilidade.
        O próprio cliente também consegue fazer isso no app, em Início → Meus dados.
      </p>
      {!ask ? (
        <button onClick={() => setAsk(true)} className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-300 hover:bg-red-50 dark:ring-red-800 dark:hover:bg-red-950/30">
          Apagar cadastro de {first}
        </button>
      ) : (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/30">
          <label className="block">
            Isso não tem volta. Para confirmar, digite <b>{first}</b>:
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="input mt-2 w-full" autoComplete="off" />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setAsk(false); setTyped(""); }} className="rounded-lg px-3 py-1.5 font-medium">Cancelar</button>
            <button disabled={pending || typed.trim().toLowerCase() !== first.toLowerCase()} onClick={go}
              className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40">Apagar para sempre</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </section>
  );
}
