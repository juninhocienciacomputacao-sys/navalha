"use client";

import { useEffect, useState } from "react";

/** Relógio grande no fuso da barbearia + botão de tela cheia. */
export default function Clock({ tz, initial }: { tz: string; initial: string }) {
  const fmt = () => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [time, setTime] = useState(initial);
  useEffect(() => {
    const t = setInterval(() => setTime(fmt()), 5_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);
  return (
    <div className="flex items-center gap-4">
      <span className="text-7xl font-black tabular-nums tracking-tight">{time}</span>
      <button
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800">
        Tela cheia
      </button>
    </div>
  );
}
