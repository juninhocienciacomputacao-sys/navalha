"use client";

import { useRef, useState, useTransition } from "react";
import type { MessageTemplate, MessageTrigger } from "@/core/messages";
import { renderTemplate } from "@/core/messages";
import type { Lang } from "@/core/types";
import { MESSAGE_VARS, TRIGGERS, whenLabel } from "@/modules/messages/defaults";
import { waLink } from "@/modules/messages/vars";
import { deleteTemplateAction, restoreDefaultsAction, saveTemplateAction, toggleTemplateAction } from "./actions";

type Draft = Omit<MessageTemplate, "id"> & { id?: string };
const LANG_LABEL: Record<Lang, string> = { pt: "Português", en: "Inglês", es: "Espanhol" };
const blank = (): Draft => ({ name: "Nova mensagem", trigger: "campaign", offset: 0, enabled: true, body: { pt: "Olá, {nome}! " } });

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
  const trig = TRIGGERS[d.trigger];
  const body = d.body[lang] ?? "";
  const previewText = renderTemplate(d.body[lang]?.trim() ? d.body[lang]! : d.body.pt, sample);

  const setBody = (v: string) => setD((x) => ({ ...x, body: { ...x.body, [lang]: v } }));

  function insertVar(v: string) {
    const el = area.current;
    const token = `{${v}}`;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + token.length, s + token.length); });
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
        <label className="block text-sm font-medium">
          Nome da mensagem
          <input className="input mt-1" value={d.name} maxLength={80} disabled={!canEdit} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[200px] flex-1 text-sm font-medium">
            Quando enviar
            <select className="input mt-1" value={d.trigger} disabled={!canEdit}
              onChange={(e) => setD({ ...d, trigger: e.target.value as MessageTrigger })}>
              {Object.entries(TRIGGERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          {d.trigger !== "campaign" && (
            <label className="block text-sm font-medium">
              Tempo
              <span className="mt-1 flex items-center gap-2">
                <input className="input w-24" type="number" min={0} max={720} step={0.5} value={d.offset} disabled={!canEdit}
                  onChange={(e) => setD({ ...d, offset: Number(e.target.value) })} />
                <span className="text-sm font-normal text-neutral-600 dark:text-neutral-400">{trig.unit}</span>
              </span>
            </label>
          )}
        </div>
        <p className="-mt-2 text-xs text-neutral-500">{trig.hint}</p>

        <label className="flex items-center gap-3 text-sm font-medium">
          <Switch on={d.enabled} disabled={!canEdit} onChange={() => setD({ ...d, enabled: !d.enabled })} label="Envio ligado" />
          {d.enabled ? "Envio ligado" : "Envio desligado"}
        </label>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Texto da mensagem</span>
            <div className="flex gap-1" role="tablist">
              {(["pt", "en", "es"] as Lang[]).map((l) => (
                <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}
                  className={`rounded-lg px-2 py-1 text-xs ${lang === l ? "bg-neutral-900 text-white dark:bg-amber-500 dark:text-neutral-950" : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
                  {LANG_LABEL[l]}{l !== "pt" && !d.body[l]?.trim() ? " ·" : ""}
                </button>
              ))}
            </div>
          </div>
          <textarea ref={area} className="input min-h-[150px] font-[inherit]" value={body} maxLength={2000} disabled={!canEdit}
            placeholder={lang === "pt" ? "Escreva a mensagem" : "Opcional. Sem texto aqui, o cliente recebe em português."}
            onChange={(e) => setBody(e.target.value)} />
          {lang !== "pt" && <p className="mt-1 text-xs text-neutral-500">Clientes com o app em {LANG_LABEL[lang].toLowerCase()} recebem este texto. Se ficar vazio, vai o de português.</p>}
        </div>

        {canEdit && (
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">Toque para inserir no texto</p>
            <div className="flex flex-wrap gap-1.5">
              {MESSAGE_VARS.map(([v, hint]) => (
                <button key={v} title={hint} onClick={() => insertVar(v)}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs hover:border-amber-400 dark:border-neutral-700 dark:bg-neutral-800">
                  {`{${v}}`}
                </button>
              ))}
            </div>
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
          <p className="text-xs text-neutral-500">Só o dono ou o gerente pode mudar as mensagens.</p>
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
