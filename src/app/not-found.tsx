import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-neutral-500">Esse endereço não existe ou a barbearia mudou de link.</p>
      <Link href="/painel" className="btn">Ir para o meu painel</Link>
      <Link href="/" className="text-sm text-neutral-500 underline">Página inicial</Link>
    </main>
  );
}
