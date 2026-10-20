import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Cliente do Supabase com a sessão do usuário (cookies). As regras de segurança do banco valem. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/** Usuário logado (ou null). Sempre null no modo demonstração. */
export async function currentUser() {
  if (!supabaseConfigured()) return null;
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  return data.user;
}

/** Só aceita caminhos internos no ?next= (evita redirecionar para outro site). */
export const safeNext = (next: string | undefined, fallback = "/") =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
