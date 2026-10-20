import { redirect } from "next/navigation";
import { currentUser, supabaseConfigured } from "@/lib/supabase";
import NewShopForm from "./NewShopForm";

export const dynamic = "force-dynamic";

export default async function NovaBarbearia() {
  if (!supabaseConfigured()) redirect("/painel/dom-bigode");
  if (!(await currentUser())) redirect("/entrar?next=/nova-barbearia");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Cadastrar barbearia</h1>
      <p className="mt-1 text-sm text-neutral-500">Depois você ajusta horários, equipe, serviços e planos no painel.</p>
      <NewShopForm />
    </main>
  );
}
