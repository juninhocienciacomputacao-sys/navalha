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
    <div className="flex items-center gap-[0.8vw]">
      <span className="font-mono text-[2.3em] font-semibold tabular-nums text-white">{time}</span>
      <button
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        className="rounded-lg border border-[#2a3a44] bg-[#18252e] px-[0.8em] py-[0.4em] text-[0.8em] text-[#e8eef1] hover:bg-[#223340]">
        Tela cheia
      </button>
    </div>
  );
}
