import Link from "next/link";
import { repo } from "@/data";
import { LegalLinks } from "@/legal/LegalPage";

export default function Home() {
  const demo = repo().mode === "demo";
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-4xl">✂️</p>
        <h1 className="mt-2 text-3xl font-bold">Navalha</h1>
        <p className="mt-1 text-neutral-500">Gestão e agendamento para barbearias.</p>
      </div>
      {demo && <p className="text-sm text-neutral-500">Rodando com dados de demonstração da barbearia Dom Bigode.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/b/dom-bigode" className="card hover:border-amber-400"><b>App do cliente</b><span className="block text-sm text-neutral-500">Agendar um horário</span></Link>
        <Link href="/painel/dom-bigode" className="card hover:border-amber-400"><b>Painel do dono</b><span className="block text-sm text-neutral-500">Agenda, faturamento e planos</span></Link>
      </div>
      <LegalLinks lang="pt" />
    </main>
  );
}
