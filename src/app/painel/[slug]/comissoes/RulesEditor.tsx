"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { planVisitValue, type BarberPay, type CommissionRules, type PlanCommissionModel } from "@/core/commission";
import { formatMoney } from "@/core/money";
import type { Lang } from "@/core/types";
import type { PayoutPeriod } from "@/core/finance";
import { saveRulesAction } from "./actions";

interface Stored { rules: CommissionRules; payout: PayoutPeriod; pixSplit: boolean }

const MODELS: { k: PlanCommissionModel; title: string; desc: string; reco?: boolean }[] = [
  { k: "usage_split", reco: true, title: "Rateio pelo uso",
    desc: "O valor do plano no mês é dividido pelas vezes que o cliente veio. O barbeiro recebe a % sobre cada fatia. Nunca paga mais do que o plano rendeu." },
  { k: "quota_split", title: "Divisão pela cota do plano",
    desc: "O valor do plano é dividido pela quantidade de usos a que ele dá direito (ex.: 4). Usos que o cliente não aproveitou ficam com a barbearia." },
  { k: "list_price", title: "Preço de tabela do serviço",
    desc: "A comissão é calculada como se o serviço fosse avulso. Simples para o barbeiro, mas pode custar mais do que o plano rende se o cliente vier muito." },
  { k: "fixed", title: "Valor fixo por atendimento",
    desc: "Cada atendimento de plano paga o mesmo valor ao barbeiro, seja qual for o serviço." },
];

export default function RulesEditor({ slug, initial, currency, lang, barbers, services, plans }: {
  slug: string;
  initial: Stored;
  currency: string;
  lang: Lang;
  barbers: { id: string; name: string; color: string | null; pay: BarberPay }[];
  services: { id: string; name: string; price: number; overridePct: number | null }[];
  plans: { id: string; name: string; price: number; quotaUses: number | null }[];
}) {
  const [s, setS] = useState<Stored>(initial);
  const [saved, setSaved] = useState<Stored>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, go] = useTransition();
  const r = s.rules;
  const set = (patch: Partial<CommissionRules>) => { setS({ ...s, rules: { ...r, ...patch } }); setMsg(null); };
  const money = (n: number) => formatMoney(Math.round(n * 100) / 100, currency, lang);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  // dados do exemplo ao vivo
  const examplePlans = plans.length ? plans : [{ id: "x", name: "Plano de exemplo", price: 100, quotaUses: 4 }];
  const [planId, setPlanId] = useState(examplePlans[0].id);
  const plan = examplePlans.find((p) => p.id === planId) ?? examplePlans[0];
  const exServices = services.length ? services : [{ id: "x", name: "Corte", price: 50, overridePct: null }];
  const [svcId, setSvcId] = useState(exServices[0].id);
  const svc = exServices.find((x) => x.id === svcId) ?? exServices[0];
  const [uses, setUses] = useState(3);
  const exBarber = barbers.find((b) => b.pay.kind === "commission");
  const exName = exBarber?.name ?? "o barbeiro";
  const exPct = exBarber?.pay.kind === "commission" ? exBarber.pay.pct : 40;

  const perVisit = planVisitValue({ serviceId: svc.id, servicePrice: svc.price, planPrice: plan.price, quotaUses: plan.quotaUses, usesInCycle: uses }, r);
  const toBarber = perVisit * uses;
  const toShop = plan.price - toBarber;
  const how = {
    usage_split: `${money(plan.price)} ÷ ${uses} ${uses === 1 ? "uso" : "usos"} = ${money(plan.price / uses)} por atendimento × ${r.planPct}%`,
    quota_split: plan.quotaUses
      ? `${money(plan.price)} ÷ cota de ${plan.quotaUses} usos = ${money(plan.price / plan.quotaUses)} × ${r.planPct}%`
      : `plano ilimitado: sem cota, divide pelos ${uses} usos, como no rateio (${money(plan.price / uses)} × ${r.planPct}%)`,
    list_price: `preço de tabela ${money(svc.price)} (${svc.name}) × ${r.listPricePct}%`,
    fixed: "valor fixo por atendimento",
  }[r.planModel];

  const save = () => go(async () => {
    const res = await saveRulesAction(slug, { ...s, rules: { ...r } });
    if (res.ok) { setSaved(s); setMsg({ ok: true, text: "Regras salvas. O extrato já usa as novas regras." }); }
    else setMsg({ ok: false, text: res.error });
  });

  const tiers = [...r.tiers];
  const exTurnover = 12000;
  const exWalkIn = 8000;
  const exTier = [...tiers].sort((a, b) => b.above - a.above).find((t) => exTurnover > t.above);

  return (
    <div className="space-y-4 pb-24">
      <Section n={1} title="Como cada profissional ganha" sub="Comissão sobre o que faz, ou aluguel da cadeira. Muda-se na tela Equipe.">
        <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          {barbers.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: b.color ?? "#555" }} />
                <b>{b.name}</b>
              </span>
              <span className="text-neutral-600 dark:text-neutral-300">
                {b.pay.kind === "commission" ? `Comissão de ${b.pay.pct}% nos serviços` : `Cadeira alugada · ${money(b.pay.monthlyRent)}/mês`}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/painel/${slug}/equipe`} className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">Alterar na Equipe →</Link>
        <Hint>Na cadeira alugada o profissional fica com o que fatura e paga o aluguel à barbearia. As regras abaixo valem para quem ganha por comissão.</Hint>
      </Section>

      <Section n={2} title="Comissão nos atendimentos de plano" sub="A parte mais delicada: o cliente paga um valor fixo e vem quantas vezes quiser. Quanto vale cada visita?">
        <div className="grid gap-2 sm:grid-cols-2">
          {MODELS.map((m) => (
            <button key={m.k} type="button" onClick={() => set({ planModel: m.k })} aria-pressed={r.planModel === m.k}
              className={`chip text-left ${r.planModel === m.k ? "chip-on" : ""}`}>
              <b className="flex flex-wrap items-center gap-2">{m.title}{m.reco && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">recomendado</span>}</b>
              <small className="mt-1 block text-neutral-500">{m.desc}</small>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          {(r.planModel === "usage_split" || r.planModel === "quota_split") && (
            <NumField label="% do barbeiro sobre o valor do plano" suffix="%" value={r.planPct} max={100} onChange={(v) => set({ planPct: v })} />
          )}
          {r.planModel === "list_price" && (
            <NumField label="% sobre o preço de tabela" suffix="%" value={r.listPricePct} max={100} onChange={(v) => set({ listPricePct: v })} />
          )}
          {r.planModel === "fixed" && (
            <NumField label="Valor por atendimento" prefix={currency} value={r.fixedPerVisit} step={0.5} onChange={(v) => set({ fixedPerVisit: v })} />
          )}
        </div>

        <Example>
          <div className="flex flex-wrap gap-2">
            <select className="input w-auto" value={plan.id} onChange={(e) => setPlanId(e.target.value)} aria-label="Plano do exemplo">
              {examplePlans.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}
            </select>
            {r.planModel === "list_price" && (
              <select className="input w-auto" value={svc.id} onChange={(e) => setSvcId(e.target.value)} aria-label="Serviço do exemplo">
                {exServices.map((x) => <option key={x.id} value={x.id}>{x.name} · {money(x.price)}</option>)}
              </select>
            )}
          </div>
          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="whitespace-nowrap">Cliente veio <b className="tabular-nums">{uses}</b> {uses === 1 ? "vez" : "vezes"} no mês</span>
            <input type="range" min={1} max={8} value={uses} onChange={(e) => setUses(Number(e.target.value))} className="flex-1 accent-amber-500" />
          </label>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-500">Cálculo</dt><dd>{how}</dd>
            <dt className="text-neutral-500">Por atendimento</dt><dd className="tabular-nums">{money(perVisit)}</dd>
            <dt className="text-neutral-500">{exName} recebe no mês</dt><dd className="tabular-nums">{money(toBarber)}</dd>
            <dt className="text-neutral-500">Fica para a barbearia</dt>
            <dd className={`tabular-nums font-semibold ${toShop < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{money(toShop)}</dd>
          </dl>
          {toShop < 0
            ? <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">Atenção: nesta regra, se o cliente vem muito, a barbearia paga mais comissão do que recebeu do plano.</p>
            : r.planModel === "usage_split" && <p className="mt-2 text-xs text-neutral-500">Mova a barra: no rateio a comissão nunca passa do valor do plano, e cada visita vale mais quando o cliente vem pouco.</p>}
        </Example>
      </Section>

      <Section n={3} title="Comissão diferente por serviço" sub="Ex.: química a 30% porque o produto é caro. Muda-se na tela Serviços.">
        {services.some((x) => x.overridePct !== null) ? (
          <ul className="text-sm">
            {services.filter((x) => x.overridePct !== null).map((x) => <li key={x.id} className="flex justify-between py-1"><span>{x.name}</span><b>{x.overridePct}%</b></li>)}
          </ul>
        ) : <p className="text-sm text-neutral-500">Nenhuma exceção: todos os serviços usam o % de cada profissional.</p>}
        <Link href={`/painel/${slug}/servicos`} className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">Alterar em Serviços →</Link>
      </Section>

      <Section n={4} title="Bônus e descontos">
        <div className="space-y-5">
          <Opt title="Comissão em produtos vendidos" ex={`Vendeu ${money(200)} em pomadas → ganha ${money((200 * r.productPct) / 100)}.`}>
            <NumField label="% sobre a venda" suffix="%" value={r.productPct} max={100} onChange={(v) => set({ productPct: v })} />
          </Opt>
          <Opt title="Bônus por vender plano" ex={`Vendeu o ${plan.name} (${money(plan.price)}) → ganha ${money((plan.price * r.planSaleBonusPct) / 100)} uma vez, na 1ª mensalidade.`}>
            <NumField label="% da primeira mensalidade" suffix="%" value={r.planSaleBonusPct} max={100} onChange={(v) => set({ planSaleBonusPct: v })} />
          </Opt>
          <Opt title="Descontar a taxa do cartão"
            ex={r.deductCardFee
              ? `Corte de ${money(svc.price)} no cartão, comissão de ${exPct}% = ${money((svc.price * exPct) / 100)}; desconta ${r.cardFeePct}% disso: ${money((svc.price * exPct * r.cardFeePct) / 10000)}.`
              : "A taxa do cartão fica toda com a barbearia."}>
            <Toggle on={r.deductCardFee} onChange={(v) => set({ deductCardFee: v })} label="Descontar da comissão a parte da taxa" />
            {r.deductCardFee && <NumField label="Taxa média da maquininha" suffix="%" value={r.cardFeePct} max={100} step={0.1} onChange={(v) => set({ cardFeePct: v })} />}
          </Opt>
          <Opt title="Custo de insumos por atendimento"
            ex={r.suppliesPerVisit ? `80 atendimentos no mês → desconta ${money(80 * r.suppliesPerVisit)} (lâmina, toalha, gel).` : "Sem desconto de insumos."}>
            <NumField label="Valor descontado por atendimento" prefix={currency} value={r.suppliesPerVisit} step={0.5} onChange={(v) => set({ suppliesPerVisit: v })} />
          </Opt>
        </div>
      </Section>

      <Section n={5} title="Metas e garantia" sub="Incentivo para quem fatura mais e segurança para quem está começando.">
        <p className="text-sm font-semibold">Bônus por meta de faturamento</p>
        <p className="text-xs text-neutral-500">Faturamento = avulsos + preço de tabela dos atendimentos de plano. Vale o maior degrau atingido, como % extra sobre os avulsos.</p>
        <div className="mt-2 space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <NumField label="Acima de" prefix={currency} value={t.above} step={500} onChange={(v) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, above: v } : x)) })} />
              <NumField label="ganha mais" suffix="%" value={t.extraPct} max={100} onChange={(v) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, extraPct: v } : x)) })} />
              <button type="button" className="chip text-xs" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}>Remover</button>
            </div>
          ))}
          {tiers.length < 10 && (
            <button type="button" className="chip text-sm"
              onClick={() => set({ tiers: [...tiers, { above: (tiers.at(-1)?.above ?? 5000) + 5000, extraPct: (tiers.at(-1)?.extraPct ?? 0) + 2 }] })}>
              + Adicionar degrau
            </button>
          )}
        </div>
        <Example>
          {tiers.length
            ? <>Faturou {money(exTurnover)} no mês ({money(exWalkIn)} avulsos) → {exTier ? <>passou de {money(exTier.above)}: ganha +{exTier.extraPct}% = <b>{money((exWalkIn * exTier.extraPct) / 100)}</b> de bônus.</> : "não atingiu nenhuma meta."}</>
            : "Sem metas: ninguém ganha bônus por faturamento."}
        </Example>

        <div className="mt-5">
          <NumField label="Garantia mínima mensal (0 = sem garantia)" prefix={currency} value={r.monthlyFloor} step={100} onChange={(v) => set({ monthlyFloor: v })} />
          <Example>
            {r.monthlyFloor
              ? <>Se a comissão do mês der {money(r.monthlyFloor * 0.7)}, a barbearia completa {money(r.monthlyFloor * 0.3)} e ele recebe {money(r.monthlyFloor)}.</>
              : "Sem garantia: o profissional recebe só o que a comissão der."}
          </Example>
        </div>
      </Section>

      <Section n={6} title="Pagamento">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Pagar a comissão</span>
          <select className="input sm:w-64" value={s.payout} onChange={(e) => { setS({ ...s, payout: e.target.value as PayoutPeriod }); setMsg(null); }}>
            <option value="weekly">toda semana (segunda a domingo)</option>
            <option value="biweekly">a cada quinzena (1 a 15 e 16 ao fim)</option>
            <option value="monthly">todo mês</option>
          </select>
        </label>
        <div className="mt-4">
          <Toggle on={s.pixSplit} onChange={(v) => { setS({ ...s, pixSplit: v }); setMsg(null); }} label="Pix dividido: a comissão cai na conta do profissional na hora do pagamento" />
          <Hint>
            {s.pixSplit
              ? "Com o Pix dividido não existe fechamento: cada pagamento já sai separado. Precisa de conta num parceiro de pagamentos (em breve)."
              : "Desligado: a barbearia recebe tudo e paga a comissão no fechamento do período."}
          </Hint>
        </div>
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur md:left-56 dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={save} disabled={pending || !dirty}>{pending ? "Salvando…" : "Salvar regras"}</button>
          {dirty && !pending && <button type="button" className="chip" onClick={() => { setS(saved); setMsg(null); }}>Desfazer</button>}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>{msg.text}</span>}
          {!msg && dirty && <span className="text-sm text-neutral-500">Há mudanças não salvas.</span>}
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-semibold">{n}. {title}</h2>
      {sub && <p className="mb-3 text-sm text-neutral-500">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Opt({ title, ex, children }: { title: string; ex: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      <p className="mt-1 text-xs text-neutral-500"><b>Exemplo:</b> {ex}</p>
    </div>
  );
}

const Example = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Exemplo ao vivo</p>
    {children}
  </div>
);

const Hint = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-xs text-neutral-500">{children}</p>;

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-amber-500" : "bg-neutral-300 dark:bg-neutral-700"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-5" : "left-0.5"}`} />
      </button>
      {label}
    </label>
  );
}

/** Campo numérico que aceita apagar e digitar de novo (guarda o texto enquanto edita). */
function NumField({ label, value, onChange, prefix, suffix, step = 1, max }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number; max?: number;
}) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); if (Number(text.replace(",", ".")) !== value) setText(String(value)); }
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <span className="flex items-center gap-1">
        {prefix && <span className="text-xs text-neutral-500">{prefix}</span>}
        <input className="input w-28 tabular-nums" inputMode="decimal" type="number" min={0} max={max} step={step} value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(n) && n >= 0) { setLast(n); onChange(max !== undefined ? Math.min(max, n) : n); }
          }} />
        {suffix && <span className="text-xs text-neutral-500">{suffix}</span>}
      </span>
    </label>
  );
}
