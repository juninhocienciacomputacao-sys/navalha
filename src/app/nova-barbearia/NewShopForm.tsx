"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/core/phone";
import { Choice } from "@/components/pick";
import { COUNTRIES } from "./countries";
import { createShop } from "./actions";
import { PACKAGES } from "@/core/modules";

/** Sugestões de endereço a partir do nome (sem precisar digitar outro campo). */
function slugIdeas(name: string): string[] {
  const base = slugify(name);
  if (base.length < 3) return [];
  const short = slugify(name.replace(/\b(barbearia|barber ?shop|barbeiro|barber|sal[aã]o)\b/gi, " "));
  const out = [short.length >= 3 ? short : "", base, short.length >= 3 ? `${short}-barbearia` : `${base}-2`, `${base}-2`];
  return [...new Set(out.filter((s) => s.length >= 3).map((s) => s.slice(0, 40)))].slice(0, 3);
}

export default function NewShopForm() {
  const [error, action, pending] = useActionState(createShop, "");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("");
  const [country, setCountry] = useState<string>(COUNTRIES[0].code);
  const c = COUNTRIES.find((x) => x.code === country) ?? COUNTRIES[0];
  const [tz, setTz] = useState<string>(c.zones[0].tz);
  const [lang, setLang] = useState<string>(c.lang);
  const [pkg, setPkg] = useState<string>("completo");
  const ideas = slugIdeas(name);
  const slug = ideas.includes(picked) ? picked : ideas[0] ?? "";

  function pickCountry(code: string) {
    const n = COUNTRIES.find((x) => x.code === code) ?? COUNTRIES[0];
    setCountry(n.code); setTz(n.zones[0].tz); setLang(n.lang);
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      <input className="input" name="name" placeholder="Nome da barbearia" aria-label="Nome da barbearia" required maxLength={80}
        value={name} onChange={(e) => setName(e.target.value)} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="timezone" value={tz} />
      <input type="hidden" name="currency" value={c.currency} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="package" value={pkg} />

      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-500">Link dos clientes</p>
        {ideas.length ? (
          <Choice name="Link dos clientes" size="sm" value={slug} onChange={setPicked}
            options={ideas.map((s) => ({ value: s, label: <span className="break-all">/b/{s}</span> }))} />
        ) : <p className="text-sm text-neutral-500">Escreva o nome para ver as opções.</p>}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-500">País</p>
        <Choice name="País" size="sm" value={country} onChange={pickCountry}
          options={COUNTRIES.map((x) => ({ value: x.code, label: `${x.flag} ${x.name}` }))} />
      </div>
      {c.zones.length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutral-500">Horário local</p>
          <Choice name="Fuso horário" size="sm" value={tz} onChange={setTz} options={c.zones.map((z) => ({ value: z.tz as string, label: z.label }))} />
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-500">Idioma principal</p>
        <Choice name="Idioma" size="sm" value={lang} onChange={setLang}
          options={[{ value: "pt", label: "Português" }, { value: "es", label: "Español" }, { value: "en", label: "English" }]} />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-neutral-500">Pacote <span className="font-normal">(dá para mudar depois em Recursos)</span></p>
        <Choice name="Pacote" size="sm" value={pkg} onChange={setPkg}
          options={PACKAGES.map((x) => ({ value: x.key, label: <span><b>{x.title}</b><span className="block text-xs font-normal opacity-70">{x.description}</span></span> }))} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={pending || !slug}>Criar</button>
    </form>
  );
}
