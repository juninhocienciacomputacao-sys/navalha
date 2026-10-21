"use client";

import { useState, useTransition } from "react";
import type { Expense, ExpenseInMonth } from "@/core/finance";
import { formatMoney } from "@/core/money";
import type { Lang } from "@/core/types";
import { deleteExpenseAction, saveExpenseAction, setExpensePaidAction } from "./actions";

const CATEGORIES = ["Estrutura", "Pessoal", "Insumos", "Marketing", "Serviços", "Manutenção", "Impostos", "Outros"];

type Draft = {
  id?: string; name: string; category: string; kind: Expense["kind"]; amount: string; recurring: boolean;
  dueDay: string; dueDate: string; startsOn: string;
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
  const blank = (): Draft => ({ name: "", category: "Estrutura", kind: "fixed", amount: "", recurring: true, dueDay: "10",
    dueDate: month === today.slice(0, 7) ? today : `${month}-10`, startsOn: `${month}-01` });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pending, go] = useTransition();

  const edit = (e: Expense) => setDraft({
    id: e.id, name: e.name, category: e.category, kind: e.kind, amount: String(e.amount), recurring: e.recurring,
    dueDay: String(e.dueDay ?? 10), dueDate: e.dueDate ?? `${month}-10`, startsOn: e.startsOn,
  });
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => go(async () => {
    const r = await fn();
    if (r.ok) { setError(""); after?.(); } else setError(r.error ?? "Não deu certo.");
  });
  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!draft) return;
    const amount = Number(draft.amount.replace(",", "."));
    run(() => saveExpenseAction(slug, {
      id: draft.id, name: draft.name, category: draft.category, kind: draft.kind, amount: Number.isFinite(amount) ? amount : -1,
      recurring: draft.recurring, dueDay: draft.recurring ? Number(draft.dueDay) : null, dueDate: draft.recurring ? null : draft.dueDate,
      startsOn: draft.recurring ? draft.startsOn : draft.dueDate,
    }), () => setDraft(null));
  };
  const field = (k: keyof Draft) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((d) => d && ({ ...d, [k]: ev.target.value }));

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
        <form onSubmit={submit} className="mb-4 grid gap-3 rounded-xl border border-amber-300 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-amber-800">
          <label className="text-sm sm:col-span-2"><span className="mb-1 block text-xs text-neutral-500">Descrição</span>
            <input className="input" required value={draft.name} onChange={field("name")} placeholder="Ex.: Conta de luz" maxLength={80} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">Valor ({currency})</span>
            <input className="input tabular-nums" required inputMode="decimal" value={draft.amount} onChange={field("amount")} placeholder="500" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">Categoria</span>
            <select className="input" value={draft.category} onChange={field("category")}>
              {[...new Set([...CATEGORIES, draft.category])].map((c) => <option key={c}>{c}</option>)}
            </select></label>
          <fieldset className="text-sm">
            <legend className="mb-1 text-xs text-neutral-500">Tipo</legend>
            <div className="flex gap-2">
              <button type="button" className={`chip ${draft.kind === "fixed" ? "chip-on" : ""}`} onClick={() => setDraft({ ...draft, kind: "fixed" })}>Fixa</button>
              <button type="button" className={`chip ${draft.kind === "variable" ? "chip-on" : ""}`} onClick={() => setDraft({ ...draft, kind: "variable" })}>Variável</button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Fixa: mesmo valor todo mês (aluguel). Variável: muda (luz, produtos).</p>
          </fieldset>
          <fieldset className="text-sm">
            <legend className="mb-1 text-xs text-neutral-500">Repete?</legend>
            <div className="flex gap-2">
              <button type="button" className={`chip ${draft.recurring ? "chip-on" : ""}`} onClick={() => setDraft({ ...draft, recurring: true })}>Todo mês</button>
              <button type="button" className={`chip ${!draft.recurring ? "chip-on" : ""}`} onClick={() => setDraft({ ...draft, recurring: false })}>Uma vez</button>
            </div>
          </fieldset>
          {draft.recurring ? (
            <>
              <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">Vence todo dia</span>
                <input className="input" type="number" min={1} max={31} required value={draft.dueDay} onChange={field("dueDay")} /></label>
              <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">A partir de</span>
                <input className="input" type="date" required value={draft.startsOn} onChange={field("startsOn")} /></label>
            </>
          ) : (
            <label className="text-sm"><span className="mb-1 block text-xs text-neutral-500">Vencimento</span>
              <input className="input" type="date" required value={draft.dueDate} onChange={field("dueDate")} /></label>
          )}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
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
