import { requireStaff } from "@/lib/staff";
import Nav from "./Nav";

export default async function PainelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, allowed, r } = await requireStaff(slug);
  if (!allowed) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Sem acesso</h1>
        <p className="mt-2 text-sm text-neutral-500">Sua conta não faz parte da equipe de {bundle.shop.name}. Peça ao dono para te adicionar.</p>
      </main>
    );
  }
  return (
    <div className="min-h-screen md:flex">
      <Nav slug={slug} shopName={bundle.shop.name} demo={r.mode === "demo"} modules={bundle.shop.modules} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
