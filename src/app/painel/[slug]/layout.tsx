import { requireStaff } from "@/lib/staff";
import { MENU, ROLE_LABEL, canSee } from "@/core/access";
import Nav from "./Nav";
import { sectionOn } from "@/core/modules";
import { PreviewBar } from "./acessos/PreviewBar";

export default async function PainelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, allowed, r, access, role, realRole, preview } = await requireStaff(slug);
  if (!allowed) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Sem acesso</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Sua conta não faz parte da equipe de {bundle.shop.name}. Peça ao dono para te adicionar em Acessos com o número do seu WhatsApp e entre de novo.
        </p>
      </main>
    );
  }
  const barberName = preview?.barberId ? bundle.barbers.find((b) => b.id === preview.barberId)?.name : undefined;
  return (
    <div className="min-h-screen md:flex">
      <Nav slug={slug} shopName={bundle.shop.name} demo={r.mode === "demo"}
        allowed={MENU.filter((m) => canSee(access, m.key) && sectionOn(bundle.shop.modules, m.href.slice(1))).map((m) => m.key)}
        modules={bundle.shop.modules}
        showAccess={realRole === "owner" && !preview}
        roleLabel={role === "owner" ? undefined : ROLE_LABEL[role]} />
      <div className="min-w-0 flex-1">
        {preview && <PreviewBar slug={slug} label={`${ROLE_LABEL[preview.role]}${barberName ? ` (${barberName})` : ""}`} />}
        {children}
      </div>
    </div>
  );
}
