import Link from "next/link";
import { supabaseConfigured, safeNext } from "@/lib/supabase";
import Login from "./Login";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="text-3xl">✂️</p>
      <h1 className="mt-2 text-2xl font-bold">Entrar</h1>
      {supabaseConfigured() ? <Login next={next} /> : (
        <p className="mt-3 text-sm text-neutral-500">
          O app está em modo demonstração e não precisa de login. <Link className="underline" href={next}>Continuar</Link>
        </p>
      )}
      <p className="mt-6 text-xs text-neutral-500">
        Ao entrar, você concorda com os <Link className="underline" href="/termos">Termos de uso</Link> e a{" "}
        <Link className="underline" href="/privacidade">Política de privacidade</Link>. Usamos seu WhatsApp só para o login, seus agendamentos e os avisos da barbearia.
      </p>
    </main>
  );
}
