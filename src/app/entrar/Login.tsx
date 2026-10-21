"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { toE164 } from "@/core/phone";

export default function Login({ next }: { next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [via, setVia] = useState<"whatsapp" | "sms">("whatsapp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const e164 = toE164(phone);
    if (!e164) return setError("Confira o número com DDD.");
    setBusy(true); setError("");
    const auth = supabaseBrowser().auth;
    // Tenta pelo WhatsApp; se o WhatsApp ainda não estiver liberado no provedor, manda por SMS.
    let via: "whatsapp" | "sms" = "whatsapp";
    let { error } = await auth.signInWithOtp({ phone: e164, options: { channel: "whatsapp" } });
    if (error && error.status !== 429) {
      via = "sms";
      ({ error } = await auth.signInWithOtp({ phone: e164, options: { channel: "sms" } }));
    }
    setBusy(false);
    setVia(via);
    if (error) return setError(error.status === 429 ? "Muitas tentativas. Espere um minuto." : "Não conseguimos enviar o código. Tente de novo.");
    setSentTo(e164);
  }

  async function verify() {
    if (!sentTo) return;
    setBusy(true); setError("");
    const { error } = await supabaseBrowser().auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return setError("Código errado ou vencido.");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {!sentTo ? (
        <>
          <label className="block text-sm text-neutral-600 dark:text-neutral-300">Seu WhatsApp</label>
          <input className="input" inputMode="tel" autoComplete="tel" placeholder="(11) 98888-7777" value={phone}
            onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="btn w-full" disabled={busy || !phone} onClick={send}>Receber código no WhatsApp</button>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">Mandamos um código {via === "sms" ? "por SMS" : "pelo WhatsApp"} para <b>{sentTo}</b>.</p>
          <input className="input text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && verify()} />
          <button className="btn w-full" disabled={busy || code.length < 6} onClick={verify}>Entrar</button>
          <button className="w-full text-sm text-neutral-500 underline" onClick={() => { setSentTo(null); setCode(""); }}>Trocar número</button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
