"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { formatMoney } from "@/core/money";
import type { ShopSettings } from "@/modules/settings/data";
import { CURRENCIES, FEATURES, GROUPS, WEEKDAYS, type FeatureDef, type FeatureState } from "@/modules/settings/features";
import { saveFeatureAction, saveHoursAction, savePlanRulesAction, saveShopInfoAction, saveWalkInAction } from "./actions";

type Result = { ok: boolean; error?: string };

function useSaver() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const save = (fn: () => Promise<Result>) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: "Salvo" } : { ok: false, text: r.error ?? "Erro" });
      if (r.ok) router.refresh();
    });
  };
  return { pending, msg, save };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</span>;
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40 ${on ? "bg-amber-500" : "bg-neutral-300 dark:bg-neutral-700"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function Settings({ slug, settings, canEdit, zones }: { slug: string; settings: ShopSettings; canEdit: boolean; zones: string[] }) {
  const { shop, features, walkIn } = settings;
  const onCount = features.filter((f) => f.enabled).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Recursos</p>
        <h1 className="text-2xl font-bold">Recursos e configurações</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Cada barbearia liga só o que quer usar e ajusta do seu jeito. <b>{onCount} de {features.length}</b> recursos ligados agora.
          As mudanças valem na hora no painel, na TV da recepção e no app do cliente.
        </p>
        {!canEdit && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Só o dono ou o gerente podem mudar estas opções.</p>}
      </header>

      {GROUPS.map((g) => (
        <section key={g.id} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.filter((f) => f.group === g.id).map((def) => {
              const st = features.find((f) => f.key === def.key)!;
              return <FeatureCard key={def.key + JSON.stringify(st)} slug={slug} def={def} state={st} canEdit={canEdit} currency={shop.currency} lang={shop.defaultLang} />;
            })}
          </div>
        </section>
      ))}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Funcionamento</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <HoursSection key={JSON.stringify([shop.openingHours, shop.slotStepMin])} slug={slug} hours={shop.openingHours} step={shop.slotStepMin} canEdit={canEdit} />
        <div className="flex flex-col gap-4">
          <WalkInSection key={JSON.stringify(walkIn)} slug={slug} policy={walkIn} canEdit={canEdit} />
          <PlanSection key={`${shop.planAlertDays}-${settings.blockExpiredPlans}`} slug={slug} days={shop.planAlertDays} block={settings.blockExpiredPlans} canEdit={canEdit} />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">Barbearia</h2>
      <ShopSection key={JSON.stringify([shop.name, shop.address, shop.defaultLang, shop.currency, shop.timezone])} slug={slug} shop={shop} canEdit={canEdit} zones={zones} />
    </main>
  );
}

function FeatureCard({ slug, def, state, canEdit, currency, lang }: {
  slug: string; def: FeatureDef; state: FeatureState; canEdit: boolean; currency: string; lang: ShopSettings["shop"]["defaultLang"];
}) {
  const [cfg, setCfg] = useState(state.config);
  const { pending, msg, save } = useSaver();
  const dirty = JSON.stringify(cfg) !== JSON.stringify(state.config);
  const onlyFields = Object.fromEntries(def.fields.map((f) => [f.key, cfg[f.key]]));

  return (
    <div className={`card flex flex-col gap-3 ${state.enabled ? "" : "opacity-80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{def.title}</h3>
          <p className="mt-1 text-sm text-neutral-500">{def.description}</p>
        </div>
        <Switch on={state.enabled} label={def.title} disabled={!canEdit || pending}
          onChange={(v) => save(() => saveFeatureAction(slug, def.key, v, onlyFields))} />
      </div>
      {state.enabled && def.fields.length > 0 && (
        <div className="space-y-2 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
          {def.fields.map((f) => (
            <div key={f.key} className="flex flex-wrap items-center justify-between gap-2">
              <span>{f.label}</span>
              {f.type === "bool" ? (
                <Switch on={Boolean(cfg[f.key])} label={f.label} disabled={!canEdit} onChange={(v) => setCfg({ ...cfg, [f.key]: v })} />
              ) : f.type === "select" ? (
                <select className="input w-[6.5rem] min-w-0 py-1.5" disabled={!canEdit} value={String(cfg[f.key])} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <span className="flex items-center gap-1.5">
                  {f.prefix === "money" && <span className="text-neutral-500">{formatMoney(0, currency, lang).replace(/[\d\s.,]/g, "")}</span>}
                  <input className="input w-20 py-1.5 text-right" type="number" min={f.min} max={f.max} disabled={!canEdit}
                    value={String(cfg[f.key] ?? "")} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value === "" ? "" : Number(e.target.value) })} />
                  {f.suffix && <span className="text-neutral-500">{f.suffix}</span>}
                </span>
              )}
            </div>
          ))}
          {def.note && <p className="text-xs text-neutral-500">{def.note}</p>}
          {canEdit && (
            <div className="flex items-center gap-3 pt-1">
              <button className="btn py-1.5" disabled={!dirty || pending} onClick={() => save(() => saveFeatureAction(slug, def.key, true, onlyFields))}>Salvar ajustes</button>
              <Msg msg={msg} />
            </div>
          )}
        </div>
      )}
      {(!state.enabled || def.fields.length === 0) && msg && <Msg msg={msg} />}
    </div>
  );
}

function HoursSection({ slug, hours, step, canEdit }: { slug: string; hours: Record<string, { open: string; close: string }>; step: number; canEdit: boolean }) {
  const [rows, setRows] = useState(() => WEEKDAYS.map((_, i) => {
    const h = hours[String(i)];
    return { open: Boolean(h), from: h?.open ?? "09:00", to: h?.close ?? "19:00" };
  }));
  const [slot, setSlot] = useState(step);
  const { pending, msg, save } = useSaver();
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const openingHours: Record<string, { open: string; close: string }> = {};
      rows.forEach((r, i) => { if (r.open) openingHours[String(i)] = { open: r.from, close: r.to }; });
      save(() => saveHoursAction(slug, { openingHours, slotStepMin: slot as 15 }));
    }}>
      <h3 className="font-semibold">Horário de funcionamento</h3>
      <p className="mb-3 text-sm text-neutral-500">O app só oferece horários dentro destes intervalos. Desmarque o dia em que a barbearia fecha.</p>
      <div className="space-y-2">
        {order.map((i) => {
          const r = rows[i];
          const upd = (p: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[130px_minmax(0,1fr)]">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-amber-500" disabled={!canEdit} checked={r.open} onChange={(e) => upd({ open: e.target.checked })} />
                {WEEKDAYS[i]}
              </label>
              {r.open ? (
                <span className="flex items-center gap-2">
                  <input type="time" className="input w-[6.5rem] min-w-0 py-1.5" disabled={!canEdit} value={r.from} onChange={(e) => upd({ from: e.target.value })} aria-label={`Abre ${WEEKDAYS[i]}`} />
                  <span className="text-neutral-500">às</span>
                  <input type="time" className="input w-[6.5rem] min-w-0 py-1.5" disabled={!canEdit} value={r.to} onChange={(e) => upd({ to: e.target.value })} aria-label={`Fecha ${WEEKDAYS[i]}`} />
                </span>
              ) : <span className="text-neutral-500">Fechado</span>}
            </div>
          );
        })}
      </div>
      <label className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
        <span>Intervalo entre horários na agenda<br /><span className="text-xs text-neutral-500">Ex.: de 15 em 15 minutos (9:00, 9:15, 9:30…)</span></span>
        <select className="input w-[6.5rem] min-w-0 py-1.5" disabled={!canEdit} value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
          {[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
        </select>
      </label>
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar horários</button><Msg msg={msg} /></div>}
    </form>
  );
}

function WalkInSection({ slug, policy, canEdit }: { slug: string; policy: ShopSettings["walkIn"]; canEdit: boolean }) {
  const [p, setP] = useState({ enabled: policy.enabled, perPeakHour: policy.perPeakHour, blockMin: policy.blockMin, peaks: policy.peakStarts.map(toHHMM) });
  const [add, setAdd] = useState("12:00");
  const { pending, msg, save } = useSaver();
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      save(() => saveWalkInAction(slug, { enabled: p.enabled, perPeakHour: p.perPeakHour, blockMin: p.blockMin, peakStarts: p.peaks }));
    }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Encaixes para quem chega sem horário</h3>
          <p className="text-sm text-neutral-500">Nos horários de pico, alguns barbeiros ficam com um bloco livre (em rodízio) para quem chega na hora.</p>
        </div>
        <Switch on={p.enabled} label="Encaixes ligados" disabled={!canEdit} onChange={(v) => setP({ ...p, enabled: v })} />
      </div>
      {p.enabled && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex flex-wrap items-center justify-between gap-2">
            Barbeiros reservados em cada hora de pico
            <input className="input w-20 py-1.5 text-right" type="number" min={0} max={10} disabled={!canEdit} value={p.perPeakHour}
              onChange={(e) => setP({ ...p, perPeakHour: Number(e.target.value) })} />
          </label>
          <label className="flex flex-wrap items-center justify-between gap-2">
            Duração do bloco reservado
            <span className="flex items-center gap-1.5">
              <input className="input w-20 py-1.5 text-right" type="number" min={10} max={240} step={5} disabled={!canEdit} value={p.blockMin}
                onChange={(e) => setP({ ...p, blockMin: Number(e.target.value) })} />
              <span className="text-neutral-500">min</span>
            </span>
          </label>
          <div>
            <p>Horários de pico</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {p.peaks.length === 0 && <span className="text-neutral-500">Nenhum horário de pico.</span>}
              {p.peaks.map((t) => (
                <span key={t} className="chip flex items-center gap-1.5 py-1">
                  {t}
                  {canEdit && <button type="button" aria-label={`Tirar ${t}`} className="text-neutral-500 hover:text-red-600" onClick={() => setP({ ...p, peaks: p.peaks.filter((x) => x !== t) })}>×</button>}
                </span>
              ))}
              {canEdit && (
                <span className="flex items-center gap-1.5">
                  <input type="time" className="input w-auto py-1" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Novo horário de pico" />
                  <button type="button" className="chip py-1" onClick={() => add && !p.peaks.includes(add) && setP({ ...p, peaks: [...p.peaks, add].sort() })}>Adicionar</button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar encaixes</button><Msg msg={msg} /></div>}
    </form>
  );
}

function PlanSection({ slug, days, block, canEdit }: { slug: string; days: number; block: boolean; canEdit: boolean }) {
  const [d, setD] = useState(days);
  const [b, setB] = useState(block);
  const { pending, msg, save } = useSaver();
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); save(() => savePlanRulesAction(slug, { planAlertDays: d, blockExpiredPlans: b })); }}>
      <h3 className="font-semibold">Planos de assinatura</h3>
      <div className="mt-3 space-y-3 text-sm">
        <label className="flex flex-wrap items-center justify-between gap-2">
          Avisar quantos dias antes de vencer
          <span className="flex items-center gap-1.5">
            <input className="input w-20 py-1.5 text-right" type="number" min={0} max={60} disabled={!canEdit} value={d} onChange={(e) => setD(Number(e.target.value))} />
            <span className="text-neutral-500">dias</span>
          </span>
        </label>
        <div className="flex items-center justify-between gap-3">
          <span>Bloquear atendimentos do plano quando ele vencer<br /><span className="text-xs text-neutral-500">O cliente volta a usar assim que pagar.</span></span>
          <Switch on={b} label="Bloquear plano vencido" disabled={!canEdit} onChange={setB} />
        </div>
      </div>
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar</button><Msg msg={msg} /></div>}
    </form>
  );
}

function ShopSection({ slug, shop, canEdit, zones }: { slug: string; shop: ShopSettings["shop"]; canEdit: boolean; zones: string[] }) {
  const [f, setF] = useState({ name: shop.name, address: shop.address ?? "", defaultLang: shop.defaultLang, currency: shop.currency, timezone: shop.timezone });
  const { pending, msg, save } = useSaver();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  let preview = "";
  try { preview = formatMoney(49.9, f.currency.toUpperCase(), f.defaultLang); } catch { preview = "moeda desconhecida"; }
  let clock = "";
  try { clock = new Date().toLocaleTimeString("pt-BR", { timeZone: f.timezone, hour: "2-digit", minute: "2-digit" }); } catch { clock = "fuso desconhecido"; }

  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); save(() => saveShopInfoAction(slug, f)); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nome da barbearia
          <input className="input mt-1" required minLength={2} maxLength={80} disabled={!canEdit} value={f.name} onChange={set("name")} />
        </label>
        <label className="text-sm">Endereço
          <input className="input mt-1" maxLength={200} disabled={!canEdit} value={f.address} onChange={set("address")} placeholder="Rua, número · bairro · cidade" />
        </label>
        <label className="text-sm">Idioma padrão
          <select className="input mt-1" disabled={!canEdit} value={f.defaultLang} onChange={set("defaultLang")}>
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <span className="text-xs text-neutral-500">O cliente ainda pode trocar o idioma no app.</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Moeda
            <input className="input mt-1 uppercase" list="navalha-currencies" maxLength={3} disabled={!canEdit} value={f.currency} onChange={set("currency")} />
            <datalist id="navalha-currencies">{CURRENCIES.map((c) => <option key={c} value={c} />)}</datalist>
            <span className="text-xs text-neutral-500">Ex.: {preview}</span>
          </label>
          <label className="text-sm">Fuso horário
            <input className="input mt-1" list="navalha-zones" disabled={!canEdit} value={f.timezone} onChange={set("timezone")} />
            <datalist id="navalha-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
            <span className="text-xs text-neutral-500">Agora lá: {clock}</span>
          </label>
        </div>
      </div>
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar dados</button><Msg msg={msg} /></div>}
    </form>
  );
}
