// Rosto do barbeiro: a foto enviada pelo dono ou, sem foto, as iniciais na cor dele.
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("").toUpperCase();

export function BarberFace({ name, color, photo, className = "h-10 w-10 text-sm", fallback = "#737373", textColor = "#fff" }: {
  name: string; color?: string | null; photo?: string | null; className?: string; fallback?: string; textColor?: string;
}) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- foto pequena guardada no banco (data URL)
    return <img src={photo} alt={name} className={`${className} shrink-0 rounded-full object-cover`} style={{ boxShadow: `0 0 0 2px ${color ?? fallback}` }} />;
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-full font-bold`} style={{ background: color ?? fallback, color: textColor }} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
