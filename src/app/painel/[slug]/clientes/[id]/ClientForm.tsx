"use client";

import { useState, useTransition } from "react";
import type { BarberInfo } from "@/data/types";
import { saveClient } from "../actions";
import { fmtPhone } from "@/modules/clients/ui";
import { Choice, Toggle } from "@/components/pick";
import { CLIENT_NOTE_PRESETS, CLIENT_PREF_PRESETS } from "@/core/presets";
import NoteChips from "./NoteChips";

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
      <div className="text-sm"><span className={label}>Barbeiro preferido</span>
        <Choice name="Barbeiro preferido" value={barberId} onChange={setBarberId}
          options={[{ value: "", label: "Sem preferência" }, ...barbers.map((b) => ({
            value: b.id, label: <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? "#a3a3a3" }} />{b.name}</span>,
          }))]} />
      </div>
      <div className="text-sm"><span className={label}>Preferências de corte <span className="font-normal">(toque em quantas quiser)</span></span>
        <NoteChips name="Preferências de corte" presets={CLIENT_PREF_PRESETS} value={preferences} onChange={setPreferences}
          otherPlaceholder="Ex.: máquina 0,5 na nuca" />
      </div>
      <div className="text-sm"><span className={label}>Observações da equipe</span>
        <NoteChips name="Observações da equipe" presets={CLIENT_NOTE_PRESETS} value={notes} onChange={setNotes}
          otherPlaceholder="Ex.: alergia a pomada X" />
      </div>
      <div className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-700">
        <Toggle on={consent} onChange={setConsent} label={<b>Autoriza fotos do corte</b>} />
        <span className="mt-1 block text-xs text-neutral-500">
          Pela LGPD, só tire ou guarde fotos do cliente com a autorização dele.
          {client.photoConsentAt && consent ? ` Autorizado em ${client.photoConsentAt}.` : ""}
          {client.photoConsentAt && !consent ? " Ao salvar, a autorização será retirada." : ""}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
