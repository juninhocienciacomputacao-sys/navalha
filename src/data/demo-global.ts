/**
 * Guarda os dados de demonstração num lugar só do processo.
 * Em produção o Next.js pode carregar um módulo uma vez por rota; sem isto,
 * o que o cliente faz no app não apareceria no painel (cada rota teria a sua cópia).
 */
export function demoGlobal<T>(key: string, init: () => T): T {
  const g = globalThis as unknown as { __navalhaDemo?: Record<string, unknown> };
  g.__navalhaDemo ??= {};
  if (!(key in g.__navalhaDemo)) g.__navalhaDemo[key] = init();
  return g.__navalhaDemo[key] as T;
}
