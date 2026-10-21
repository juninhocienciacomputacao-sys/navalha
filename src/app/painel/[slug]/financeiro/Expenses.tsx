"use client";

import { useState, useTransition } from "react";
import type { Expense, ExpenseInMonth } from "@/core/finance";
import { formatMoney } from "@/core/money";
import { EXPENSE_PRESETS, priceSteps, suggest } from "@/core/presets";
import { Choice, PresetNumber, PresetText, SelectList } from "@/components/pick";
import type { Lang } from "@/core/types";
import { deleteExpenseAction, saveExpenseAction, setExpensePaidAction } from "./actions";

const CATEGORIES = ["Estrutura", "Pessoal", "Insumos", "Marketing", "Serviços", "Manutenção", "Impostos", "Outros"];

/** Ao escolher uma conta pronta, já sugere categoria e tipo (o dono pode trocar). */
const PRESET_HINT: Record<string, { category: string; kind: Expense["kind"] }> = {
  "Aluguel": { category: "Estrutura", kind: "fixed" }, "Energia": { category: "Estrutura", kind: "variable" },
  "Água": { category: "Estrutura", kind: "variable" }, "Internet": { category: "Estrutura", kind: "fixed" },
  "Telefone": { category: "Estrutura", kind: "fixed" }, "Produtos": { category: "Insumos", kind: "variable" },
  "Lâminas e descartáveis": { category: "Insumos", kind: "variable" }, "Manutenção": { category: "Manutenção", kind: "variable" },
  "Limpeza": { category: "Serviços", kind: "variable" }, "Marketing": { category: "Marketing", kind: "variable" },
  "Contador": { category: "Serviços", kind: "fixed" }, "Impostos": { category: "Impostos", kind: "variable" },
  "Sistema": { category: "Serviços", kind: "fixed" }, "Café e recepção": { category: "Insumos", kind: "variable" },
  "Salário": { category: "Pessoal", kind: "fixed" },
};
const DUE_DAYS = [1, 5, 10, 15, 20, 25, 30];

// datas como "AAAA-MM-DD", contadas em UTC para não depender do fuso do aparelho
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (m: string, n: number) => { const d = new Date(m + "-15T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

const L = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-xs font-medium text-neutral-500">{children}</span>;

type Draft = {
  id?: string; name: string; category: string; kind: Expense["kind"]; amount: number | null; recurring: boolean;
  dueDay: number; dueDate: string; startsOn: string;
};

const STATE: Record<ExpenseInMonth["state"], { label: (d: number) => string; cls: string }> = {
  paid: { label: () => "Paga", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  overdue: { label: (d) => `Atrasada ${-d} d`, cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  due_soon: { label: (d) => (d === 0 ? "Vence hoje" : `Vence em ${d} d`), cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  upcoming: { label: () => "A vencer", cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
};

export default function Expenses({ slug, month, monthLabel, items, totals, currency, lang, today }: {
  slug: string; month: string; monthLabel: string; items: ExpenseInMonth[];
  totals: { fixed: number; variable: number; total: number; paid: number; open: number };
  currency: string; lang: Lang; today: string;
}) {
  const money = (n: number) => formatMoney(n, currency, lang);
  const loc = lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US";
  const dayLabel = (d: string) => new Intl.DateTimeFormat(loc, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"));
  const monthLabelOf = (m: string) => new Intl.DateTimeFormat(loc, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-15T12:00:00Z"));
  const blank = (): Draft => ({ name: "", category: "Estrutura", kind: "fixed", amount: null, recurring: true, dueDay: 10,
    dueDate: month === today.slice(0, 7) ? today : `${month}-10`, startsOn: `${month}-01` });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pending, go] = useTransition();

  const edit = (e: Expense) => setDraft({
    id: e.id, name: e.name, category: e.category, kind: e.kind, amount: e.amount, recurring: e.recurring,
    dueDay: e.dueDay ?? 10, dueDate: e.dueDate ?? `${month}-10`, startsOn: e.startsOn,
  });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => go(async () => {
    const r = await fn();
    if (r.ok) { setError(""); after?.(); } else setError(r.error ?? "Não deu certo.");
  });
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    if (draft.name.trim().length < 2) { setError("Escolha qual é a conta."); return; }
    if (draft.amount == null) { setError("Escolha o valor da conta."); return; }
    run(() => saveExpenseAction(slug, {
      id: draft.id, name: draft.name, category: draft.category, kind: draft.kind, amount: draft.amount ?? -1,
      recurring: draft.recurring, dueDay: draft.recurring ? draft.dueDay : null, dueDate: draft.recurring ? null : draft.dueDate,
      startsOn: draft.recurring ? draft.startsOn : draft.dueDate,
    }), () => setDraft(null));
  };
  const patch = (p: Partial<Draft>) => setDraft((d) => d && ({ ...d, ...p }));
  const pickName = (name: string) => setDraft((d) => d && ({ ...d, name, ...(!d.id && PRESET_HINT[name] ? PRESET_HINT[name] : {}) }));

  // vencimento da conta avulsa: atalhos + lista dos dias (31 para trás até o fim do mês / 60 dias à frente)
  const quickDates = (() => {
    const out: { value: string; label: string }[] = [
      { value: today, label: "Hoje" }, { value: addDays(today, -1), label: "Ontem" }, { value: addDays(today, 1), label: "Amanhã" },
    ];
    for (const n of [5, 10, 15, 20, 25]) {
      const v = `${month}-${String(n).padStart(2, "0")}`;
      if (!out.some((o) => o.value === v)) out.push({ value: v, label: `dia ${n}` });
    }
    return out;
  })();
  const dateList = (() => {
    const from = [addDays(today, -31), `${month}-01`].sort()[0];
    const to = [addDays(today, 60), `${month}-${lastDay(month)}`].sort().at(-1)!;
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    if (draft && !out.includes(draft.dueDate)) out.push(draft.dueDate);
    return out.sort().map((d) => ({ value: d, label: d === today ? `Hoje (${dayLabel(d)})` : dayLabel(d) }));
  })();
  const monthList = (() => {
    const out = Array.from({ length: 16 }, (_, i) => addMonths(month, i - 12));
    const cur = draft?.startsOn.slice(0, 7);
    if (cur && !out.includes(cur)) out.unshift(cur);
    return out.sort().map((m) => ({ value: `${m}-01`, label: monthLabelOf(m) }));
  })();

  return (
    <section className="card mt-6">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Contas de {monthLabel}</h2>
          <p className="text-xs text-neutral-500">Fixas {money(totals.fixed)} · variáveis {money(totals.variable)} · pagas {money(totals.paid)} · falta {money(totals.open)}</p>
        </div>
        {!draft && <button className="btn" type="button" onClick={() => { setDraft(blank()); setError(""); }}>+ Nova conta</button>}
      </header>

      {draft && (
        <form key={draft.id ?? "new"} onSubmit={submit} className="mb-4 grid min-w-0 gap-4 rounded-xl border border-amber-300 p-3 lg:grid-cols-2 dark:border-amber-800">
          <div className="min-w-0 lg:col-span-2"><L>Qual conta?</L>
            <PresetText name="Descrição" presets={EXPENSE_PRESETS} value={draft.name} onChange={pickName} otherPlaceholder="Ex.: Conta de luz" /></div>
          <div className="min-w-0 lg:col-span-2"><L>Valor ({currency})</L>
            <PresetNumber name="Valor" presets={priceSteps(currency, "expense")} value={draft.amount} onChange={(v) => patch({ amount: v })}
              format={money} step={suggest(10, currency)} max={10_000_000} /></div>
          <div className="min-w-0"><L>Categoria</L>
            <Choice name="Categoria" size="sm" options={[...new Set([...CATEGORIES, draft.category])].map((c) => ({ value: c, label: c }))}
              value={draft.category} onChange={(v) => patch({ category: v })} /></div>
          <div className="min-w-0"><L>Tipo</L>
            <Choice name="Tipo" options={[{ value: "fixed" as const, label: "Fixa" }, { value: "variable" as const, label: "Variável" }]}
              value={draft.kind} onChange={(v) => patch({ kind: v })} />
            <p className="mt-1 text-[11px] text-neutral-500">Fixa: mesmo valor todo mês (aluguel). Variável: muda (luz, produtos).</p>
          </div>
          <div className="min-w-0"><L>Repete?</L>
            <Choice name="Repete?" options={[{ value: true, label: "Todo mês" }, { value: false, label: "Uma vez" }]}
              value={draft.recurring} onChange={(v) => patch({ recurring: v })} /></div>
          {draft.recurring ? (
            <>
              <div className="min-w-0"><L>Vence todo dia</L>
                <PresetNumber name="Dia do vencimento" presets={DUE_DAYS} value={draft.dueDay} onChange={(v) => patch({ dueDay: v ?? 10 })} min={1} max={31} /></div>
              <div className="min-w-0"><L>A partir de</L>
                <div className="space-y-2">
                  <Choice name="A partir de" size="sm" value={draft.startsOn}
                    options={[{ value: `${addMonths(month, -1)}-01`, label: "Mês passado" }, { value: `${month}-01`, label: "Este mês" }, { value: `${addMonths(month, 1)}-01`, label: "Próximo mês" }]}
                    onChange={(v) => patch({ startsOn: v })} />
                  <SelectList name="Mês de início" className="w-full sm:w-64 first-letter:uppercase" options={monthList}
                    value={`${draft.startsOn.slice(0, 7)}-01`} onChange={(v) => patch({ startsOn: v })} />
                </div></div>
            </>
          ) : (
            <div className="min-w-0"><L>Vencimento</L>
              <div className="space-y-2">
                <Choice name="Vencimento" size="sm" options={quickDates} value={draft.dueDate} onChange={(v) => patch({ dueDate: v })} />
                <SelectList name="Outra data" className="w-full sm:w-64" options={dateList} value={draft.dueDate} onChange={(v) => patch({ dueDate: v })} />
              </div></div>
          )}
          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <button className="btn" type="submit" disabled={pending}>{pending ? "Salvando…" : draft.id ? "Salvar alterações" : "Adicionar conta"}</button>
            <button className="chip" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancelar</button>
            {draft.id && draft.recurring && <span className="text-xs text-neutral-500">Mudar uma conta que repete altera todos os meses.</span>}
          </div>
        </form>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {items.length === 0 ? <p className="text-sm text-neutral-500">Nenhuma conta neste mês. Cadastre aluguel, luz, água, internet, produtos…</p> : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {items.map(({ expense: e, due, state, daysLeft }) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
              <div className="min-w-0 flex-1 basis-48">
                <b className="block">{e.name}</b>
                <span className="text-xs text-neutral-500">
                  {e.kind === "fixed" ? "Fixa" : "Variável"} · {e.category} · {e.recurring ? `todo dia ${e.dueDay}` : "uma vez"} · vence {due.slice(8)}/{due.slice(5, 7)}
                </span>
              </div>
              <span className="tabular-nums font-semibold">{money(e.amount)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE[state].cls}`}>{STATE[state].label(daysLeft)}</span>
              <span className="flex gap-1.5">
                <button type="button" className={state === "paid" ? "chip px-2 py-1 text-xs" : "btn px-3 py-1 text-xs"} disabled={pending}
                  onClick={() => run(() => setExpensePaidAction(slug, e.id, month, state !== "paid"))}>
                  {state === "paid" ? "Desmarcar" : "Marcar paga"}
                </button>
                <button type="button" className="chip px-2 py-1 text-xs" onClick={() => { edit(e); setError(""); }}>Editar</button>
                {confirmDel === e.id ? (
                  <>
                    <button type="button" className="chip border-red-400 px-2 py-1 text-xs text-red-700 dark:text-red-400" disabled={pending}
                      onClick={() => run(() => deleteExpenseAction(slug, e.id), () => setConfirmDel(null))}>Excluir de vez{e.recurring ? " (todos os meses)" : ""}</button>
                    <button type="button" className="chip px-2 py-1 text-xs" onClick={() => setConfirmDel(null)}>Não</button>
                  </>
                ) : <button type="button" className="chip px-2 py-1 text-xs" onClick={() => setConfirmDel(e.id)}>Excluir</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
