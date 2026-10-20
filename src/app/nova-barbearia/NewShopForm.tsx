"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/core/phone";
import { createShop } from "./actions";

export default function NewShopForm() {
  const [error, action, pending] = useActionState(createShop, "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <form action={action} className="mt-6 space-y-3">
      <input className="input" name="name" placeholder="Nome da barbearia" required value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <input className="input" name="slug" placeholder={slugify(name) || "endereco-da-barbearia"} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <p className="mt-1 text-xs text-neutral-500">Link dos clientes: /b/{slugify(slug || name) || "..."}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={pending}>Criar</button>
    </form>
  );
}
