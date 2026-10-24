"use client";

import { useRef, useState, useTransition } from "react";
import type { MessageTemplate, MessageTrigger } from "@/core/messages";
import { renderTemplate } from "@/core/messages";
import type { Lang } from "@/core/types";
import { DEFAULT_TEMPLATES, MESSAGE_VARS, TRIGGERS, whenLabel } from "@/modules/messages/defaults";
import { Choice, PresetNumber, PresetText, Toggle } from "@/components/pick";
import { DAY_STEPS, HOUR_STEPS } from "@/core/presets";
import { ABSENT_STEPS, NAME_PRESETS, OFFSET_DEFAULT, VARIANTS } from "./variants";
import { waLink } from "@/modules/messages/vars";
import { deleteTemplateAction, restoreDefaultsAction, saveTemplateAction, toggleTemplateAction } from "./actions";

type Draft = Omit<MessageTemplate, "id"> & { id?: string };
const LANG_LABEL: Record<Lang, string> = { pt: "Português", en: "Inglês", es: "Espanhol" };
const blank = (): Draft => ({ name: NAME_PRESETS.campaign[0], trigger: "campaign", offset: 0, enabled: true, body: { pt: VARIANTS.campaign[0].body.pt } });

/** Degraus de tempo para cada gatilho. */
const offsetSteps = (t: MessageTrigger): number[] =>
  t === "before_appointment" || t === "after_appointment" ? HOUR_STEPS
    : t === "client_absent" ? ABSENT_STEPS
      : t === "birthday" ? [0, ...DAY_STEPS.filter((n) => n <= 7)]
        : DAY_STEPS;
const offsetLabel = (t: MessageTrigger) => (n: number) => {
  const v = String(n).replace(".", ",");
  if (t === "before_appointment" || t === "after_appointment") return n >= 24 && n % 24 === 0 ? `${n / 24} ${n === 24 ? "dia" : "dias"}` : `${v} h`;
  if (t === "client_absent") return `${v}×`;
  if (t === "birthday" && n === 0) return "No dia";
  return `${v} ${n === 1 ? "dia" : "dias"}`;
};

export default function Editor({ slug, templates, sample, canEdit }: {
  slug: string; templates: MessageTemplate[]; sample: Record<string, string>; canEdit: boolean;
}) {
  const [selected, setSelected] = useState<string | "new">(templates[0]?.id ?? "new");
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const current = selected === "new" ? undefined : templates.find((t) => t.id === selected);
  const pick = (id: string | "new") => { setSelected(id); setMsg(null); setVersion((v) => v + 1); };

  function toggle(t: MessageTemplate) {
    start(async () => {
      const r = await toggleTemplateAction(slug, t.id, !t.enabled);
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else if (t.id === selected) setVersion((v) => v + 1);
    });
  }

  function restore() {
    start(async () => {
      const r = await restoreDefaultsAction(slug);
      setMsg(r.ok ? { ok: true, text: r.count ? `${r.count} modelo(s) padrão de volta.` : "Todos os modelos padrão já estão na lista." } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
          <h2 className="text-sm font-semibold">Suas mensagens</h2>
          {canEdit && <button className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={() => pick("new")}>+ Nova</button>}
        </div>
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.id} className={`flex items-center gap-2 rounded-xl px-2 py-2 ${t.id === selected ? "bg-amber-50 ring-1 ring-amber-400 dark:bg-amber-950/40" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"}`}>
              <button className="min-w-0 flex-1 text-left" onClick={() => pick(t.id)}>
                <b className="block truncate text-sm">{t.name}</b>
                <span className="text-xs text-neutral-500">{whenLabel(t)}</span>
              </button>
              <Switch on={t.enabled} disabled={!canEdit || pending} onChange={() => toggle(t)} label={`Ligar ou desligar ${t.name}`} />
            </li>
          ))}
          {selected === "new" && (
            <li className="rounded-xl bg-amber-50 px-2 py-2 text-sm font-semibold ring-1 ring-amber-400 dark:bg-amber-950/40">Nova mensagem…</li>
          )}
        </ul>
        {canEdit && (
          <button className="mt-2 w-full rounded-xl px-2 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:hover:bg-neutral-800/60" disabled={pending} onClick={restore}>
            Recolocar os modelos padrão que foram excluídos
          </button>
        )}
      </aside>

      <TemplateForm
        key={`${selected}-${version}`}
        slug={slug}
        initial={current ? { ...current, body: { ...current.body } } : blank()}
        sample={sample}
        canEdit={canEdit}
        onSaved={(id, text) => { setSelected(id); setMsg({ ok: true, text }); }}
        onDeleted={() => { const next = templates.find((t) => t.id !== selected); pick(next?.id ?? "new"); setMsg({ ok: true, text: "Mensagem excluída." }); }}
        onError={(text) => setMsg({ ok: false, text })}
        msg={msg}
        isNew={!current}
      />
    </div>
  );
}

function TemplateForm({ slug, initial, sample, canEdit, onSaved, onDeleted, onError, msg, isNew }: {
  slug: string; initial: Draft; sample: Record<string, string>; canEdit: boolean; isNew: boolean;
  onSaved: (id: string, text: string) => void; onDeleted: () => void; onError: (text: string) => void;
  msg: { ok: boolean; text: string } | null;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [lang, setLang] = useState<Lang>("pt");
  const [armDelete, setArmDelete] = useState(false);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const trig = TRIGGERS[d.trigger];
  const body = d.body[lang] ?? "";
  const previewText = renderTemplate(d.body[lang]?.trim() ? d.body[lang]! : d.body.pt, sample);

  const setBody = (v: string) => setD((x) => ({ ...x, body: { ...x.body, [lang]: v } }));
  // textos prontos deste gatilho: os modelos padrão + variações (formal, descontraído, curto)
  const ready = [
    ...DEFAULT_TEMPLATES.filter((t) => t.trigger === d.trigger).map((t) => ({ label: `Padrão: ${t.name}`, text: t.body[lang] ?? t.body.pt })),
    ...VARIANTS[d.trigger].map((v) => ({ label: v.label, text: v.body[lang] })),
  ].filter((o) => o.text);

  function insertVar(v: string) {
    const el = editing ? area.current : null;
    if (!el) { setBody(body + (body && !/\s$/.test(body) ? " " : "") + `{${v}}`); return; }
    const token = `{${v}}`;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + token.length, s + token.length); });
  }

  // trocar o gatilho troca também nome e texto, se ainda forem os prontos do gatilho anterior
  function changeTrigger(t: MessageTrigger) {
    const readyOf = (tr: MessageTrigger, l: Lang) => [
      ...DEFAULT_TEMPLATES.filter((x) => x.trigger === tr).map((x) => x.body[l] ?? ""), ...VARIANTS[tr].map((v) => v.body[l]),
    ];
    const firstOf = (tr: MessageTrigger, l: Lang) => DEFAULT_TEMPLATES.find((x) => x.trigger === tr)?.body[l] ?? VARIANTS[tr][0].body[l];
    const nextBody = { ...d.body };
    for (const l of ["pt", "en", "es"] as Lang[]) {
      const cur = d.body[l] ?? "";
      if ((l === "pt" && !cur.trim()) || (cur.trim() && readyOf(d.trigger, l).includes(cur))) nextBody[l] = firstOf(t, l);
    }
    const keepName = d.name.trim() && !NAME_PRESETS[d.trigger].includes(d.name) && !DEFAULT_TEMPLATES.some((x) => x.name === d.name);
    setD({ ...d, trigger: t, offset: OFFSET_DEFAULT[t], body: nextBody, name: keepName ? d.name : NAME_PRESETS[t][0] });
    setEditing(false);
  }

  function save(copy = false) {
    start(async () => {
      const input = copy ? { ...d, id: undefined, name: `${d.name} (cópia)` } : d;
      const r = await saveTemplateAction(slug, { ...input, body: { pt: input.body.pt, en: input.body.en, es: input.body.es } });
      if (r.ok && r.id) onSaved(r.id, copy ? "Cópia criada." : "Mensagem salva.");
      else if (!r.ok) onError(r.error);
    });
  }

  function remove() {
    if (!d.id) return;
    if (!armDelete) { setArmDelete(true); return; }
    start(async () => {
      const r = await deleteTemplateAction(slug, d.id!);
      if (r.ok) onDeleted(); else onError(r.error);
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <section className="card space-y-4">
        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium">Quando enviar</p>
          <Choice name="Quando enviar" size="sm" value={d.trigger}
            options={(Object.keys(TRIGGERS) as MessageTrigger[]).map((k) => ({ value: k, label: TRIGGERS[k].label }))}
            onChange={(t) => { if (canEdit && t !== d.trigger) changeTrigger(t); }} />
        </div>

        {d.trigger !== "campaign" && (
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-medium">Tempo <span className="font-normal text-neutral-500">({trig.unit})</span></p>
            <PresetNumber key={d.trigger} name="Tempo" presets={offsetSteps(d.trigger)} value={d.offset} format={offsetLabel(d.trigger)}
              min={0} max={720} step={d.trigger === "client_absent" ? 0.25 : 1} onChange={(v) => canEdit && setD({ ...d, offset: v ?? 0 })} />
            <p className="mt-1 text-xs text-neutral-500">{trig.hint}</p>
          </div>
        )}
        {d.trigger === "campaign" && <p className="-mt-2 text-xs text-neutral-500">{trig.hint}</p>}

        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium">Nome da mensagem</p>
          <PresetText key={d.trigger} name="Nome da mensagem" presets={NAME_PRESETS[d.trigger]} value={d.name} otherPlaceholder="Nome da mensagem"
            onChange={(v) => canEdit && setD({ ...d, name: v.slice(0, 80) })} />
        </div>

        {canEdit ? (
          <Toggle on={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={<b className="font-medium">{d.enabled ? "Envio ligado" : "Envio desligado"}</b>} />
        ) : <p className="text-sm font-medium">{d.enabled ? "Envio ligado" : "Envio desligado"}</p>}

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Texto da mensagem</span>
            <div className="flex gap-1" role="tablist">
              {(["pt", "en", "es"] as Lang[]).map((l) => (
                <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
                  className={`rounded-lg px-2 py-1 text-xs ${lang === l ? "bg-neutral-900 text-white dark:bg-amber-500 dark:text-neutral-950" : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
                  {LANG_LABEL[l]}{l !== "pt" && !d.body[l]?.trim() ? " ·" : ""}
                </button>
              ))}
            </div>
          </div>
          {canEdit && (
            <>
              <p className="mb-1 text-xs text-neutral-500">Escolha um texto pronto</p>
              <div role="radiogroup" aria-label="Texto pronto" className="mb-2 flex flex-wrap gap-2">
                {lang !== "pt" && (
                  <button type="button" role="radio" aria-checked={!body.trim()} className={`chip px-2.5 py-1.5 text-xs ${!body.trim() ? "chip-on" : ""}`}
                    onClick={() => setBody("")}>Usar o português</button>
                )}
                {ready.map((o) => {
                  const on = body === o.text;
                  return (
                    <button type="button" role="radio" aria-checked={on} key={o.label} className={`chip px-2.5 py-1.5 text-xs ${on ? "chip-on" : ""}`}
                      onClick={() => setBody(o.text)}>{o.label}</button>
                  );
                })}
              </div>
            </>
          )}
          {editing && canEdit ? (
            <textarea ref={area} className="input min-h-[150px] font-[inherit]" value={body} maxLength={2000} autoFocus
              placeholder={lang === "pt" ? "Escreva a mensagem" : "Opcional. Sem texto aqui, o cliente recebe em português."}
              onChange={(e) => setBody(e.target.value)} />
          ) : (
            <div className="min-h-[60px] whitespace-pre-line break-words rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-800/50">
              {body || <span className="text-neutral-500">{lang === "pt" ? "(sem texto: escolha um texto pronto acima)" : "Sem texto aqui: o cliente recebe em português."}</span>}
            </div>
          )}
          {lang !== "pt" && <p className="mt-1 text-xs text-neutral-500">Clientes com o app em {LANG_LABEL[lang].toLowerCase()} recebem este texto. Se ficar vazio, vai o de português.</p>}
        </div>

        {canEdit && (
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">{editing ? "Toque para inserir no texto" : "Toque para acrescentar no fim do texto"}</p>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_VARS.map(([v, hint]) => (
                <button key={v} type="button" title={hint} onClick={() => insertVar(v)}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-800">
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <button type="button" className="mt-3 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400" onClick={() => setEditing((x) => !x)}>
              {editing ? "Fechar edição do texto" : "Editar texto (último recurso)"}
            </button>
          </div>
        )}

        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</p>}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={pending} onClick={() => save()}>{pending ? "Salvando…" : isNew ? "Criar mensagem" : "Salvar"}</button>
            <a className="chip" href={waLink(null, previewText)} target="_blank" rel="noopener noreferrer">Testar no meu WhatsApp</a>
            {!isNew && <button className="chip" disabled={pending} onClick={() => save(true)}>Duplicar</button>}
            {!isNew && (
              <button className="chip text-red-600 dark:text-red-400" disabled={pending} onClick={remove} onBlur={() => setArmDelete(false)}>
                {armDelete ? "Toque de novo para excluir" : "Excluir"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">Seu nível de acesso não permite mudar as mensagens. Peça ao dono.</p>
        )}
      </section>

      <section className="card h-fit">
        <h2 className="mb-3 text-sm font-semibold">Como o cliente recebe</h2>
        <div className="rounded-xl bg-[#e5ddd5] p-3 dark:bg-[#0b141a]">
          <div className="ml-auto max-w-[90%] whitespace-pre-line break-words rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm text-neutral-900 shadow-sm dark:bg-[#005c4b] dark:text-neutral-100">
            {previewText || <span className="text-neutral-500">(sem texto)</span>}
            <span className="mt-1 block text-right text-[10px] text-neutral-500 dark:text-neutral-300">{sample.hora} ✓✓</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Prévia com um cliente de exemplo ({sample.nome}). Variável escrita errado aparece entre chaves, como {"{xyz}"}.</p>
      </section>
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
