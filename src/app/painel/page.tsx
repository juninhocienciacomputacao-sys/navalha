import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, supabaseConfigured, supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Lista as barbearias de quem está logado. */
export default async function MeusPaineis() {
  if (!supabaseConfigured()) redirect("/painel/dom-bigode");
  const user = await currentUser();
  if (!user) redirect("/entrar?next=/painel");
  const db = await supabaseServer();
  const { data } = await db.from("shop_members").select("role, shops(name, slug)").eq("user_id", user.id);
  const shops = ((data ?? []) as unknown as { role: string; shops: { name: string; slug: string } }[]).filter((x) => x.shops);
  if (shops.length === 1) redirect(`/painel/${shops[0].shops.slug}`);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Suas barbearias</h1>
      {shops.map((x) => (
        <Link key={x.shops.slug} href={`/painel/${x.shops.slug}`} className="card hover:border-amber-400">{x.shops.name}</Link>
      ))}
      {shops.length === 0 && <p className="text-sm text-neutral-500">Você ainda não faz parte de nenhuma barbearia.</p>}
      <Link href="/nova-barbearia" className="btn text-center">Cadastrar minha barbearia</Link>
    </main>
  );
}
