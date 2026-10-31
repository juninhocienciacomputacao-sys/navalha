"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { I18nText } from "@/core/types";
import { DEFAULT_LOOKS, KIND_LABEL, type LookKind } from "@/modules/gallery/defaults";
import { lookImage, type Look } from "@/modules/gallery/types";
import { deleteLookAction, moveLookAction, restoreLooksAction, saveLookAction } from "./actions";

type Svc = { id: string; name: string };

const W = 560, H = 700;

/** Recorta a foto no formato dos cartões (4:5, centro) e reduz para ficar leve no celular do cliente. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error("bad_image"));
      i.src = url;
    });
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) throw new Error("bad_image");
    const k = Math.max(W / iw, H / ih);
    const sw = W / k, sh = H / k;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Gallery({ slug, looks, services }: { slug: string; looks: Look[]; services: Svc[] }) {
  const [kind, setKind] = useState<LookKind>("cut");
  const [editing, setEditing] = useState<Look | "new" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const list = looks.filter((l) => l.kind === kind);
  const missing = DEFAULT_LOOKS.filter((d) => !looks.some((l) => l.art === d.art)).length;
  const svcName = (id: string | null) => services.find((s) => s.id === id)?.name;

  function run(fn: () => Promise<{ ok: boolean; error?: string; n?: number }>, after?: (n?: number) => void) {
    setError(""); setNote("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro");
      else { after?.(r.n); router.refresh(); }
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">Galeria</p>
          <h1 className="text-2xl font-bold">Cortes e barbas</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            O cliente vê estes modelos no app para escolher antes de agendar. Toque em <b>Editar</b> para trocar a imagem por uma foto
            de um corte feito aqui, mudar o nome ou ligar o modelo a um serviço.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="chip" href={`/b/${slug}?gal=1`} target="_blank" rel="noreferrer">Ver no app do cliente</a>
          <button className="btn" onClick={() => { setEditing("new"); setError(""); }}>Novo modelo</button>
        </div>
      </header>

      {error && !editing && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {note && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{note}</p>}

      {editing && (
        <LookForm key={editing === "new" ? `new-${kind}` : editing.id} slug={slug} initial={editing === "new" ? null : editing}
          defaultKind={kind} services={services} pending={pending} error={error}
          onCancel={() => { setEditing(null); setError(""); }}
          onSave={(input) => run(() => saveLookAction(slug, input), () => { setEditing(null); setKind(input.kind); setNote("Modelo salvo. Já aparece no app do cliente."); })} />
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["cut", "beard"] as LookKind[]).map((k) => (
          <button key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k].pt} <span className="text-neutral-500">· {looks.filter((l) => l.kind === k).length}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && (
        <p className="card py-10 text-center text-sm text-neutral-500">
          Nenhum modelo de {KIND_LABEL[kind].pt.toLowerCase()} ainda. Toque em <b>Novo modelo</b> para enviar uma foto.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((l, i) => {
          const src = lookImage(slug, l);
          return (
            <li key={l.id} className="card flex min-w-0 flex-col gap-2 p-2">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
                {/* eslint-disable-next-line @next/next/no-img-element -- desenho padrão ou foto do dono */}
                {src && <img src={src} alt={l.name.pt} loading="lazy" className="size-full object-cover" />}
                <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.hasPhoto ? "bg-emerald-600 text-white" : "bg-white/90 text-neutral-700"}`}>
                  {l.hasPhoto ? "Foto da casa" : "Desenho"}
                </span>
              </div>
              <div className="min-w-0 px-1">
                <p className="truncate text-sm font-semibold">{l.name.pt}</p>
                <p className="truncate text-xs text-neutral-500">{svcName(l.serviceId) ? `Agenda: ${svcName(l.serviceId)}` : "Sem serviço ligado"}</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-1">
                <button className="chip flex-1 px-2 py-1.5 text-xs" onClick={() => { setEditing(l); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
                <button className="chip px-2 py-1.5 text-xs" aria-label="Mover para a frente" disabled={pending || i === 0} onClick={() => run(() => moveLookAction(slug, l.id, -1))}>←</button>
                <button className="chip px-2 py-1.5 text-xs" aria-label="Mover para trás" disabled={pending || i === list.length - 1} onClick={() => run(() => moveLookAction(slug, l.id, 1))}>→</button>
                <button className="chip px-2 py-1.5 text-xs text-red-600" aria-label="Remover" disabled={pending} onClick={() => {
                  if (confirm(`Remover "${l.name.pt}" da galeria? Ele some do app do cliente.`)) run(() => deleteLookAction(slug, l.id), () => setNote(`"${l.name.pt}" removido.`));
                }}>✕</button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-neutral-500">
        Dica: fotos dos cortes feitos aqui vendem mais que qualquer desenho. Tire de frente, com fundo limpo, e a foto é ajustada sozinha ao formato do cartão.
        {missing > 0 && <> {" "}
          <button className="underline" disabled={pending} onClick={() => run(() => restoreLooksAction(slug), (n) => setNote(`${n} modelo(s) inicial(is) de volta.`))}>
            Trazer de volta os {missing} modelo(s) inicial(is) removido(s)
          </button>
        </>}
      </p>
    </main>
  );
}

type LookInput = Parameters<typeof saveLookAction>[1];

function LookForm({ slug, initial, defaultKind, services, pending, error, onSave, onCancel }: {
  slug: string; initial: Look | null; defaultKind: LookKind; services: Svc[]; pending: boolean; error: string;
  onSave: (input: LookInput & { kind: LookKind }) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<LookKind>(initial?.kind ?? defaultKind);
  const [name, setName] = useState<I18nText>(initial?.name ?? { pt: "" });
  const [desc, setDesc] = useState<I18nText>(initial?.desc ?? { pt: "" });
  const [serviceId, setServiceId] = useState<string | null>(initial?.serviceId ?? null);
  // undefined = mantém a foto atual
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [langs, setLangs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const current = photo !== undefined ? photo : null;
  const hasPhoto = photo === undefined ? !!initial?.hasPhoto : photo !== null;
  const preview = current ?? (hasPhoto && initial ? lookImage(slug, initial) : initial?.art ? `/galeria/${initial.art}.svg` : null);

  // Se o nome em português mudou e a tradução é a antiga, a tradução antiga não vale mais.
  const fresh = (now: I18nText, before: I18nText | null | undefined): I18nText => {
    const out: I18nText = { pt: now.pt.trim() };
    for (const l of ["en", "es"] as const) {
      const v = now[l]?.trim();
      if (v && !(before && now.pt.trim() !== before.pt && v === before[l])) out[l] = v;
    }
    return out;
  };

  const label = "mb-2 block text-sm font-medium";
  return (
    <form className="card mb-6 grid min-w-0 gap-5 md:grid-cols-[220px_1fr]" onSubmit={(e) => {
      e.preventDefault();
      setLocalError("");
      if (!name.pt.trim()) return setLocalError("Escreva o nome do modelo.");
      if (!initial && !photo) return setLocalError("Envie uma foto do modelo.");
      onSave({
        id: initial?.id, kind, name: fresh(name, initial?.name), desc: desc.pt.trim() ? fresh(desc, initial?.desc) : null,
        serviceId, ...(photo !== undefined ? { photo } : {}),
      });
    }}>
      <div className="min-w-0">
        <div className="aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="" className="size-full object-cover" />
            : <div className="grid size-full place-items-center p-4 text-center text-sm text-neutral-500">Sem imagem ainda</div>}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Escolher foto" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!f.type.startsWith("image/")) return setLocalError("Escolha um arquivo de imagem.");
          setBusy(true); setLocalError("");
          try { setPhoto(await shrink(f)); } catch { setLocalError("Não deu para abrir essa foto. Tente outra."); } finally { setBusy(false); }
        }} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="chip flex-1" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Preparando…" : hasPhoto ? "Trocar foto" : preview ? "Trocar por uma foto" : "Enviar foto"}
          </button>
          {hasPhoto && initial?.art ? (
            <button type="button" className="chip" onClick={() => setPhoto(null)}>Voltar ao desenho</button>
          ) : photo ? (
            <button type="button" className="chip" onClick={() => setPhoto(undefined)}>Desfazer</button>
          ) : null}
        </div>
        {photo && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Foto nova pronta. Toque em Salvar.</p>}
      </div>

      <div className="min-w-0 space-y-5">
        <h2 className="font-semibold">{initial ? `Editar ${initial.name.pt}` : "Novo modelo"}</h2>
        <fieldset><legend className={label}>Tipo</legend>
          <div className="flex gap-2">
            {(["cut", "beard"] as LookKind[]).map((k) => (
              <button type="button" key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>
                {k === "cut" ? "Corte de cabelo" : "Barba"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">Nome
          <input className="input mt-1" maxLength={60} value={name.pt} onChange={(e) => setName({ ...name, pt: e.target.value })} placeholder="Ex.: Degradê com risca" />
        </label>
        <label className="block text-sm font-medium">Descrição para o cliente
          <textarea className="input mt-1" rows={2} maxLength={280} value={desc.pt} onChange={(e) => setDesc({ ...desc, pt: e.target.value })}
            placeholder="Ex.: Laterais baixas e topo com textura. Fácil de arrumar." />
        </label>
        <div className="text-xs text-neutral-500">
          {name.en || name.es ? <>Inglês: <b>{name.en || "—"}</b> · Espanhol: <b>{name.es || "—"}</b></> : "Sem tradução: o cliente estrangeiro vê em português."}
          {" "}<button type="button" className="underline" onClick={() => setLangs((v) => !v)}>{langs ? "fechar" : "mudar traduções"}</button>
        </div>
        {langs && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Nome em inglês<input className="input mt-1" maxLength={60} value={name.en ?? ""} onChange={(e) => setName({ ...name, en: e.target.value })} placeholder="Opcional" /></label>
            <label className="text-sm">Nome em espanhol<input className="input mt-1" maxLength={60} value={name.es ?? ""} onChange={(e) => setName({ ...name, es: e.target.value })} placeholder="Opcional" /></label>
            <label className="text-sm">Descrição em inglês<input className="input mt-1" maxLength={280} value={desc.en ?? ""} onChange={(e) => setDesc({ ...desc, en: e.target.value })} placeholder="Opcional" /></label>
            <label className="text-sm">Descrição em espanhol<input className="input mt-1" maxLength={280} value={desc.es ?? ""} onChange={(e) => setDesc({ ...desc, es: e.target.value })} placeholder="Opcional" /></label>
          </div>
        )}
        <fieldset><legend className={label}>Serviço para agendar este modelo</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`chip ${serviceId === null ? "chip-on" : ""}`} onClick={() => setServiceId(null)}>O cliente escolhe</button>
            {services.map((s) => (
              <button type="button" key={s.id} className={`chip ${serviceId === s.id ? "chip-on" : ""}`} onClick={() => setServiceId(s.id)}>{s.name}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Quando o cliente tocar em “Quero este”, o agendamento já abre com esse serviço.</p>
        </fieldset>
        {(localError || error) && <p className="text-sm text-red-600 dark:text-red-400">{localError || error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={pending || busy}>{pending ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="chip" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </form>
  );
}
