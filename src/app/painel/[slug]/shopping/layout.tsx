import ModuleGate from "../ModuleGate";

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  return <ModuleGate slug={(await params).slug} module="shopping">{children}</ModuleGate>;
}
