import type { ProductArt as Art } from "./types";

/** Desenho simples do produto (sem imagem externa). Funciona no claro e no escuro. */
export default function ProductArt({ art, color, className = "h-16 w-14" }: { art: Art; color: string; className?: string }) {
  const ink = "fill-neutral-800 dark:fill-neutral-300";
  return (
    <svg viewBox="0 0 60 70" className={className} aria-hidden="true">
      {art === "bottle" && (<>
        <rect x="25" y="3" width="10" height="9" rx="2" className={ink} />
        <rect x="17" y="12" width="26" height="54" rx="8" fill={color} />
        <rect x="21" y="30" width="18" height="18" rx="2" fill="#fff" opacity=".85" />
      </>)}
      {art === "jar" && (<>
        <rect x="10" y="22" width="40" height="10" rx="3" className={ink} />
        <rect x="12" y="32" width="36" height="28" rx="6" fill={color} />
        <rect x="18" y="40" width="24" height="10" rx="2" fill="#fff" opacity=".85" />
      </>)}
      {art === "tube" && (<>
        <path d="M20 8h20l-3 52H23z" fill={color} />
        <rect x="22" y="60" width="16" height="7" rx="2" className={ink} />
        <rect x="24" y="22" width="12" height="16" rx="2" fill="#fff" opacity=".85" />
      </>)}
      {art === "kit" && (<>
        <rect x="6" y="18" width="48" height="40" rx="5" fill={color} />
        <rect x="6" y="18" width="48" height="10" rx="5" fill="#000" opacity=".2" />
        <path d="M16 46l22-10" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="42" cy="34" r="4" fill="#fff" />
      </>)}
    </svg>
  );
}
