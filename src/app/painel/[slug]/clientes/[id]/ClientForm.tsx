"use client";

import { useState, useTransition } from "react";
import type { BarberInfo } from "@/data/types";
import { saveClient } from "../actions";
import { fmtPhone } from "@/modules/clients/ui";

export default function ClientForm({ slug, barbers, client }: {
  slug: string; barbers: BarberInfo[];
  client: { id: string; name: string; phone: string; preferredBarberId: string | null; preferences: string; notes: string; photoConsentAt: string | null };
}) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(fmtPhone(client.phone));
  const [barberId, setBarberId] = useState(client.preferredBarberId ?? "");
  const [preferences, setPreferences] = useState(client.preferences);
  const [notes, setNotes] = useState(client.notes);
  const [consent, setConsent] = useState(Boolean(client.photoConsentAt));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await saveClient(slug, client.id, { name, phone, preferredBarberId: barberId || null, preferences, notes, photoConsent: consent });
      setMsg(r.ok ? { ok: true, text: "Salvo." } : { ok: false, text: r.error });
    });
  }

  const label = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="font-semibold">Cadastro e preferências</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className={label}>Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm"><span className={label}>WhatsApp</span>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
        </label>
      </div>
      <label className="block text-sm"><span className={label}>Barbeiro preferido</span>
        <select className="input" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
          <option value="">Sem preferência</option>
          {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="block text-sm"><span className={label}>Preferências de corte</span>
        <textarea className="input min-h-20" value={preferences} onChange={(e) => setPreferences(e.target.value)}
          placeholder="Ex.: degradê navalhado, máquina 1 nas laterais, não gosta de risco" maxLength={2000} />
      </label>
      <label className="block text-sm"><span className={label}>Observações da equipe</span>
        <textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: prefere horário depois das 18h, alergia a pomada X" maxLength={2000} />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          <b>Autoriza fotos do corte</b>
          <span className="block text-xs text-neutral-500">
            Pela LGPD, só tire ou guarde fotos do cliente com a autorização dele.
            {client.photoConsentAt && consent ? ` Autorizado em ${client.photoConsentAt}.` : ""}
            {client.photoConsentAt && !consent ? " Ao salvar, a autorização será retirada." : ""}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
