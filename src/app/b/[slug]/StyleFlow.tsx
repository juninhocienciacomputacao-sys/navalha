"use client";

import { useRef, useState, useTransition } from "react";
import type { ShopBundle } from "@/data/types";
import type { Lang } from "@/core/types";
import { fill, tx, type Dict } from "@/i18n";
import type { ClientHome, StyleProject } from "@/modules/client-app/types";
import { HAIR, ROUTINE, VIBE, analyzeFace, nextStepIndex, projectSteps, type FaceAnalysis, type StylePrefs } from "@/modules/client-app/style";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { createProject, photoConsent } from "./actions";
import type { BookPreset } from "./Booking";
import { Back, Bar, BigButton, CutArt, Icon, Label, LoginCard, shortDate } from "./ui";

interface Common { bundle: ShopBundle; lang: Lang; L: Dict; today: string; demoAs?: string }

/** Reduz a foto no próprio celular (máx. 480 px, JPEG) antes de mostrar ou enviar. */
async function shrink(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url;
    });
    const k = Math.min(1, 480 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Foto de exemplo desenhada na hora (para testar sem tirar foto). */
function samplePhoto(): string {
  const c = document.createElement("canvas"); c.width = 300; c.height = 400;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, "#8aa1ad"); g.addColorStop(1, "#3d5260");
  x.fillStyle = g; x.fillRect(0, 0, 300, 400);
  x.fillStyle = "#2b2018"; x.fillRect(110, 300, 80, 60);
  x.fillStyle = "#1f2a33"; x.beginPath(); x.ellipse(150, 420, 120, 90, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#c99a78"; x.beginPath(); x.ellipse(150, 200, 72, 92, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#2b2018"; x.beginPath(); x.ellipse(150, 140, 78, 58, 0, Math.PI, Math.PI * 2); x.fill();
  x.fillRect(72, 135, 14, 60); x.fillRect(214, 135, 14, 60);
  x.fillStyle = "#3a2a20"; x.beginPath(); x.ellipse(150, 262, 48, 26, 0, 0, Math.PI); x.fill();
  x.fillStyle = "#1d1612";
  [[124, 196], [176, 196]].forEach(([a, b]) => { x.beginPath(); x.ellipse(a, b, 7, 4, 0, 0, Math.PI * 2); x.fill(); });
  x.fillRect(110, 178, 28, 4); x.fillRect(162, 178, 28, 4);
  return c.toDataURL("image/jpeg", 0.85);
}

type Step = "form" | "ig" | "analyzing" | "result";

export default function StyleFlow({ bundle, lang, L, today, demoAs, home, loginHref, onBack, onCreated }: Common & {
  home: ClientHome | null; loginHref: string; onBack: () => void; onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [photo, setPhoto] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<StylePrefs>({ hair: 1, routine: 0, vibe: 1 });
  const [analysis, setAnalysis] = useState<FaceAnalysis | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [consentAt, setConsentAt] = useState<string | null>(home?.me.photoConsentAt ?? null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const galRef = useRef<HTMLInputElement>(null);

  if (!home) {
    return (<div><Back onClick={onBack} L={L} /><h1 className="mb-4 text-2xl font-bold tracking-tight">{L.style_t}</h1><LoginCard L={L} href={loginHref} /></div>);
  }
  const me = home.me;

  function consent(v: boolean) {
    start(async () => {
      const r = await photoConsent({ slug: bundle.shop.slug, as: demoAs, consent: v });
      if (r.ok) { setConsentAt(r.at); if (!v) setPhoto(null); } else setErr(L.error);
    });
  }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try { setPhoto(await shrink(f)); setStep("form"); } catch { setErr(L.photo_error); }
  }
  function analyze() {
    setStep("analyzing"); setChosen(null);
    // análise simulada (src/modules/client-app/style.ts). A foto não sai do celular nesta etapa.
    setTimeout(() => { setAnalysis(analyzeFace(prefs)); setStep("result"); }, 1800);
  }
  function makeProject() {
    if (!analysis || chosen === null) return;
    const s = analysis.suggestions[chosen];
    setErr("");
    start(async () => {
      let photoPath: string | null = null;
      if (photo && !demoAs && consentAt) {
        // Supabase: envia direto do celular para a pasta do cliente (regras do bucket conferem o consentimento)
        const blob = await (await fetch(photo)).blob();
        const path = `${bundle.shop.id}/${me.id}/${Date.now()}.jpg`;
        const { error } = await supabaseBrowser().storage.from("client-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (!error) photoPath = path;
      }
      const r = await createProject({
        slug: bundle.shop.slug, as: demoAs, goal: s.name, steps: projectSteps(s, today),
        photoDataUrl: demoAs && consentAt ? photo : null, photoPath,
      });
      if (r.ok) onCreated(r.id); else setErr((L as Record<string, string>)[r.error] ?? L.error);
    });
  }

  if (step === "ig") {
    return (
      <div>
        <Back onClick={() => setStep("form")} L={L} />
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-white"><Icon name="instagram" className="size-7" /></span>
          <h1 className="text-2xl font-bold tracking-tight">{L.ig_t}</h1>
        </div>
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">{L.ig_body}</p>
        <ol className="mt-4 space-y-3">
          {[L.ig_s1, L.ig_s2, L.ig_s3].map((s, i) => (
            <li key={i} className="flex gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-500 text-xs font-bold text-neutral-950">{i + 1}</span>{s}
            </li>
          ))}
        </ol>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-2xl border border-neutral-300 py-3 text-center text-sm font-semibold dark:border-neutral-700">{L.ig_open}</a>
        <BigButton className="mt-2" onClick={() => galRef.current?.click()}>{L.ig_pick}</BigButton>
        <input ref={galRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
    );
  }

  if (step === "analyzing") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{L.analyzing}</h1>
        <div className="relative mt-4 aspect-[3/4] overflow-hidden rounded-3xl bg-neutral-200 dark:bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img src={photo} alt="" className="size-full object-cover" />}
          <div className="absolute inset-x-0 h-1/4 animate-pulse bg-gradient-to-b from-transparent via-amber-400/50 to-transparent" style={{ top: "35%" }} />
          <div className="absolute inset-[18%] rounded-[45%] border-2 border-dashed border-amber-400/80" />
        </div>
        <p className="mt-3 text-center text-sm text-neutral-500">{L.analyzing_sub}</p>
      </div>
    );
  }

  if (step === "result" && analysis) {
    return (
      <div>
        <Back onClick={() => setStep("form")} L={L} />
        <h1 className="text-2xl font-bold tracking-tight">{L.made_for_you}</h1>
        <div className="mt-4 grid grid-cols-[64px_1fr] items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="aspect-[3/4] overflow-hidden rounded-xl bg-neutral-200 dark:bg-neutral-800">{photo && <img src={photo} alt="" className="size-full object-cover" />}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
            <dt className="text-neutral-500">{L.face}</dt><dd>{tx(analysis.face, lang)}</dd>
            <dt className="text-neutral-500">{L.hair}</dt><dd>{tx(HAIR[prefs.hair], lang)}, {tx(analysis.density, lang)}</dd>
            <dt className="text-neutral-500">{L.strong}</dt><dd>{tx(analysis.strong, lang)}</dd>
          </dl>
        </div>
        <div className="mt-3 space-y-2">
          {analysis.suggestions.map((s, i) => (
            <button key={s.name} onClick={() => setChosen(i)} aria-pressed={chosen === i}
              className={`flex w-full gap-3 rounded-2xl border p-3 text-left transition ${chosen === i ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500 dark:bg-amber-950/30" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
              <CutArt shape={s.shape} className="w-14 shrink-0" />
              <span className="min-w-0">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{fill(L.compat, { n: String(s.match) })}</span>
                <b className="block text-[15px]">{s.name}</b>
                <small className="block text-neutral-500">{tx(s.desc, lang)}</small>
                <small className="font-semibold">{fill(L.maint, { n: String(s.every) })}</small>
              </span>
            </button>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <BigButton gold className="mt-4" disabled={chosen === null || pending} onClick={makeProject}>{L.mk_project}</BigButton>
        <p className="mt-2 text-[11.5px] text-neutral-500">{L.sim_note}</p>
      </div>
    );
  }

  const locked = !consentAt;
  const Src = ({ icon, label, capture, accept = "image/*" }: { icon: "camera" | "image" | "upload"; label: string; capture?: "user"; accept?: string }) => (
    <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-medium transition hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900 ${locked ? "pointer-events-none opacity-40" : ""}`}>
      <Icon name={icon} />{label}
      <input type="file" accept={accept} capture={capture} hidden disabled={locked} onChange={onFile} />
    </label>
  );
  const Choice = ({ k, opts }: { k: keyof StylePrefs; opts: typeof HAIR }) => (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o, i) => (
        <button key={i} onClick={() => setPrefs({ ...prefs, [k]: i })}
          className={`rounded-full border px-3 py-1.5 text-sm capitalize ${prefs[k] === i ? "border-amber-500 bg-amber-500 text-neutral-950" : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"}`}>
          {tx(o, lang)}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <Back onClick={onBack} L={L} />
      <h1 className="text-2xl font-bold tracking-tight">{L.style_t}</h1>
      <p className="text-sm text-neutral-500">{L.style_sub}</p>

      <div className={`mt-4 rounded-2xl border p-4 ${consentAt ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-400 bg-amber-50 dark:bg-amber-950/30"}`}>
        <p className="flex items-center gap-2 font-semibold"><Icon name="shield" className="size-5" />{L.consent_t}</p>
        {consentAt ? (
          <p className="mt-1 text-sm">
            {fill(L.consent_given, { d: shortDate(consentAt, lang) })}{" "}
            <button disabled={pending} onClick={() => consent(false)} className="font-medium text-neutral-500 underline">{L.consent_revoke}</button>
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{fill(L.consent_body, { shop: bundle.shop.name })}</p>
            <button disabled={pending} onClick={() => consent(true)} className="mt-3 w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">{L.consent_ok}</button>
          </>
        )}
      </div>

      <div className="mt-4 grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" className="size-full object-contain" /> : <Icon name="camera" className="size-10 text-neutral-400" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Src icon="camera" label={L.src_cam} capture="user" />
        <Src icon="image" label={L.src_gal} />
        <Src icon="upload" label={L.src_file} accept="image/*,.heic,.heif" />
        <button disabled={locked} onClick={() => setStep("ig")}
          className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 text-sm font-medium transition hover:border-amber-400 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900">
          <Icon name="instagram" />{L.src_ig}
        </button>
      </div>
      {!photo && !locked && <button onClick={() => setPhoto(samplePhoto())} className="mt-2 w-full py-2 text-sm font-medium text-neutral-500 underline">{L.use_sample}</button>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      <Label>{L.your_hair}</Label><Choice k="hair" opts={HAIR} />
      <Label>{L.routine}</Label><Choice k="routine" opts={ROUTINE} />
      <Label>{L.daily}</Label><Choice k="vibe" opts={VIBE} />

      <BigButton gold className="mt-6" disabled={!photo || locked} onClick={analyze}>{L.analyze}</BigButton>
    </div>
  );
}

export function ProjectScreen({ bundle, lang, L, today, project, onBack, onBookStep }: Common & {
  project: StyleProject; onBack: () => void; onBookStep: (p: BookPreset) => void;
}) {
  const b = bundle.barbers.find((x) => x.id === project.barberId);
  const doneN = project.steps.filter((s) => s.done).length;
  const next = nextStepIndex(project.steps);
  const nextStep = next >= 0 ? project.steps[next] : null;
  const service = bundle.services[0];
  const started = shortDate(project.steps[0]?.date ?? project.createdAt, lang);
  return (
    <div>
      <Back onClick={onBack} L={L} />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600">{L.proj_label}</p>
      <h1 className="text-2xl font-bold tracking-tight">{project.goal}</h1>
      <p className="text-sm text-neutral-500">{b ? fill(L.started, { b: b.name, d: started }) : fill(L.started_nob, { d: started })}</p>
      <div className="mt-3 flex items-center gap-3">
        <Bar value={doneN / project.steps.length} className="h-2" />
        <span className="shrink-0 text-xs font-semibold tabular-nums">{doneN}/{project.steps.length}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <figure className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-neutral-200 dark:bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {project.photoUrl ? <img src={project.photoUrl} alt="" className="size-full object-cover" /> : <Icon name="camera" className="size-8 text-neutral-400" />}
          <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{L.before}</figcaption>
        </figure>
        <figure className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-amber-50 dark:bg-amber-950/30">
          <CutArt shape={project.cutShape} className="w-2/3" />
          <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-neutral-950">{L.goal}</figcaption>
        </figure>
      </div>

      <ol className="relative mt-5 space-y-4 border-l-2 border-neutral-200 pl-5 dark:border-neutral-800">
        {project.steps.map((s, i) => {
          const isNext = i === next;
          return (
            <li key={i} className="relative">
              <span className={`absolute -left-[31px] top-0 grid size-6 place-items-center rounded-full text-[10px] font-bold ${s.done
                ? "bg-emerald-500 text-white" : isNext ? "bg-amber-500 text-neutral-950 ring-4 ring-amber-500/25" : "bg-neutral-200 text-neutral-500 dark:bg-neutral-800"}`}>
                {s.done ? <Icon name="check" className="size-3.5" /> : s.wk}
              </span>
              <p className={`font-semibold ${s.done ? "text-neutral-500 line-through decoration-neutral-400/60" : ""}`}>
                {tx(s.title, lang)}{isNext && <span className="ml-2 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">{L.next_word}</span>}
              </p>
              <p className="text-sm text-neutral-500">{tx(s.desc, lang)}</p>
              <p className="font-mono text-xs text-neutral-400">{shortDate(s.date, lang)}</p>
            </li>
          );
        })}
      </ol>

      {nextStep && (
        <BigButton gold className="mt-6" onClick={() => onBookStep({ serviceId: service?.id, barberId: project.barberId ?? undefined, day: nextStep.date >= today ? nextStep.date : today })}>
          {L.book_step}
        </BigButton>
      )}
    </div>
  );
}
