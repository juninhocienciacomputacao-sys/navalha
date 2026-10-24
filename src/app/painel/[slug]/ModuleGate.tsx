import Link from "next/link";
import { requireStaff } from "@/lib/staff";
import { MODULES, type ModuleKey } from "@/core/modules";

/**
 * Tela de um módulo: se o dono desligou o módulo (Recursos → Pacote e módulos), mostra um aviso no lugar.
 * Usada nos layout.tsx de cada módulo, assim nenhuma página precisa repetir a conferência.
 */
export default async function ModuleGate({ slug, module, children }: { slug: string; module: ModuleKey; children: React.ReactNode }) {
  const { bundle, role } = await requireStaff(slug);
  if (bundle.shop.modules[module]) return <>{children}</>;
  const def = MODULES.find((m) => m.key === module)!;
  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <p className="text-4xl" aria-hidden>{def.icon}</p>
      <h1 className="mt-2 text-xl font-semibold">{def.title} está desligado</h1>
      <p className="mt-2 text-sm text-neutral-500">{def.description}</p>
      {role === "owner" || role === "manager" ? (
        <Link href={`/painel/${slug}/recursos`} className="btn mt-5 inline-flex">Ligar em Recursos</Link>
      ) : (
        <p className="mt-4 text-sm text-neutral-500">Peça ao dono para ligar este módulo.</p>
      )}
    </main>
  );
}
