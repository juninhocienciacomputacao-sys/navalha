"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toHHMM } from "@/core/types";
import { formatMoney } from "@/core/money";
import type { ShopSettings } from "@/modules/settings/data";
import { CURRENCIES, FEATURES, GROUPS, WEEKDAYS, type FeatureDef, type FeatureState, type FieldDef } from "@/modules/settings/features";
import { Choice, MultiChoice, PresetNumber, SelectList, Stepper } from "@/components/pick";
import { DAY_STEPS, moneyStep, PERCENT_STEPS, priceSteps, timeSteps } from "@/core/presets";
import { saveFeatureAction, saveHoursAction, saveModulesAction, savePlanRulesAction, saveShopInfoAction, saveWalkInAction } from "./actions";
import { BASE_PARTS, MODULES, PACKAGES, packageOf, type Modules } from "@/core/modules";

type Result = { ok: boolean; error?: string };

/** Degraus prontos para um campo numérico de recurso, dentro do mínimo e do máximo dele. */
function numberPresets(f: Extract<FieldDef, { type: "number" }>, currency: string) {
  const pool = f.prefix === "money" ? priceSteps(currency, "service").slice(0, 10)
    : f.suffix?.startsWith("%") ? PERCENT_STEPS
    : f.suffix === "dias" ? DAY_STEPS
    : [1, 2, 3, 4, 5, 6, 8, 10];
  return pool.filter((n) => n >= f.min && n <= f.max);
}

/** Horários para escolher, incluindo o atual se ele estiver fora dos degraus. */
const timeOptions = (current: string) =>
  [...new Set([...timeSteps(5 * 60, 23 * 60 + 30, 30), current])].sort().map((t) => ({ value: t, label: t }));

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
  const visible = FEATURES.filter((f) => !f.requires || shop.modules[f.requires]);
  const ready = visible.filter((f) => !f.soon);
  const onCount = features.filter((f) => f.enabled && ready.some((d) => d.key === f.key)).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Recursos</p>
        <h1 className="text-2xl font-bold">Recursos e configurações</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          Cada barbearia liga só o que quer usar e ajusta do seu jeito. <b>{onCount} de {ready.length}</b> recursos ligados agora.
          As mudanças valem na hora no painel, na TV da recepção e no app do cliente.
        </p>
        {!canEdit && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Seu nível de acesso não permite mudar estas opções. Peça ao dono.</p>}
      </header>

      <ModulesSection slug={slug} modules={shop.modules} canEdit={canEdit} />

      {GROUPS.filter((g) => visible.some((f) => f.group === g.id)).map((g) => (
        <section key={g.id} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.filter((f) => f.group === g.id).sort((a, b) => Number(Boolean(a.soon)) - Number(Boolean(b.soon))).map((def) => {
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
          {shop.modules.planos && <PlanSection key={`${shop.planAlertDays}-${settings.blockExpiredPlans}`} slug={slug} days={shop.planAlertDays} block={settings.blockExpiredPlans} canEdit={canEdit} />}
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
    <div className={`card flex flex-col gap-3 ${state.enabled ? "" : "opacity-80"} ${def.soon ? "border-dashed" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{def.title}</h3>
          <p className="mt-1 text-sm text-neutral-500">{def.description}</p>
        </div>
        {def.soon
          ? <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 dark:bg-neutral-800">Em breve</span>
          : <Switch on={state.enabled} label={def.title} disabled={!canEdit || pending}
              onChange={(v) => save(() => saveFeatureAction(slug, def.key, v, onlyFields))} />}
      </div>
      {state.enabled && !def.soon && def.fields.length > 0 && (
        <div className="space-y-2 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
          {def.fields.map((f) => f.type === "bool" ? (
            <div key={f.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0">{f.label}</span>
              <Switch on={Boolean(cfg[f.key])} label={f.label} disabled={!canEdit} onChange={(v) => setCfg({ ...cfg, [f.key]: v })} />
            </div>
          ) : (
            <fieldset key={f.key} className="min-w-0" disabled={!canEdit}>
              <legend className="mb-1.5">{f.label}</legend>
              {f.type === "select" ? (
                <Choice size="sm" name={f.label} value={String(cfg[f.key])} onChange={(v) => setCfg({ ...cfg, [f.key]: v })} options={f.options} />
              ) : (() => {
                const steps = numberPresets(f, currency);
                const fmt = (n: number) => f.prefix === "money" ? formatMoney(n, currency, lang) : `${n}${f.suffix ? (f.suffix.startsWith("%") ? f.suffix : ` ${f.suffix}`) : ""}`;
                return <PresetNumber name={f.label} presets={steps} value={Number(cfg[f.key] ?? f.min)} min={f.min} max={f.max}
                  step={f.prefix === "money" ? moneyStep(steps) : 1} format={fmt} onChange={(v) => setCfg({ ...cfg, [f.key]: v ?? f.min })} />;
              })()}
            </fieldset>
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
      <fieldset className="min-w-0 space-y-2" disabled={!canEdit}>
        {order.map((i) => {
          const r = rows[i];
          const upd = (p: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="flex w-32 items-center gap-2">
                <Switch on={r.open} label={`Abre ${WEEKDAYS[i]}`} disabled={!canEdit} onChange={(v) => upd({ open: v })} />
                {WEEKDAYS[i]}
              </span>
              {r.open ? (
                <span className="flex min-w-0 items-center gap-2">
                  <SelectList className="w-[5.75rem] min-w-0 py-1.5" name={`Abre ${WEEKDAYS[i]}`} options={timeOptions(r.from)} value={r.from} onChange={(v) => upd({ from: v })} />
                  <span className="text-neutral-500">às</span>
                  <SelectList className="w-[5.75rem] min-w-0 py-1.5" name={`Fecha ${WEEKDAYS[i]}`} options={timeOptions(r.to)} value={r.to} onChange={(v) => upd({ to: v })} />
                </span>
              ) : <span className="text-neutral-500">Fechado</span>}
            </div>
          );
        })}
      </fieldset>
      <fieldset className="mt-4 min-w-0 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800" disabled={!canEdit}>
        <legend className="sr-only">Intervalo entre horários na agenda</legend>
        <p>Intervalo entre horários na agenda</p>
        <p className="mb-2 text-xs text-neutral-500">Ex.: de 15 em 15 minutos (9:00, 9:15, 9:30…)</p>
        <Choice size="sm" name="Intervalo entre horários" value={slot} onChange={setSlot}
          options={[5, 10, 15, 20, 30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))} />
      </fieldset>
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar horários</button><Msg msg={msg} /></div>}
    </form>
  );
}

function WalkInSection({ slug, policy, canEdit }: { slug: string; policy: ShopSettings["walkIn"]; canEdit: boolean }) {
  const [p, setP] = useState({ enabled: policy.enabled, perPeakHour: policy.perPeakHour, blockMin: policy.blockMin, peaks: policy.peakStarts.map(toHHMM) });
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">Barbeiros reservados em cada hora de pico</span>
            {canEdit ? <Stepper name="Barbeiros reservados" value={p.perPeakHour} onChange={(v) => setP({ ...p, perPeakHour: v })} min={0} max={10} />
              : <b>{p.perPeakHour}</b>}
          </div>
          <fieldset className="min-w-0" disabled={!canEdit}>
            <legend className="mb-1.5">Duração do bloco reservado</legend>
            <PresetNumber name="Duração do bloco" presets={[10, 15, 20, 30, 45, 60, 90, 120]} value={p.blockMin} min={10} max={240} step={5}
              format={(n) => `${n} min`} onChange={(v) => setP({ ...p, blockMin: v ?? 30 })} />
          </fieldset>
          <fieldset className="min-w-0" disabled={!canEdit}>
            <legend className="mb-1.5">Horários de pico <span className="text-xs text-neutral-500">(toque para marcar)</span></legend>
            <MultiChoice name="Horários de pico" value={p.peaks} onChange={(v) => setP({ ...p, peaks: [...v].sort() })}
              options={[...new Set([...timeSteps(7 * 60, 22 * 60, 60), ...p.peaks])].sort().map((t) => ({ value: t, label: t }))} />
          </fieldset>
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
        <fieldset className="min-w-0" disabled={!canEdit}>
          <legend className="mb-1.5">Avisar quantos dias antes de vencer</legend>
          <PresetNumber name="Dias de aviso" presets={DAY_STEPS} value={d} min={0} max={60} format={(n) => `${n} dia${n === 1 ? "" : "s"}`} onChange={(v) => setD(v ?? 0)} />
        </fieldset>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">Bloquear atendimentos do plano quando ele vencer<br /><span className="text-xs text-neutral-500">O cliente volta a usar assim que pagar.</span></span>
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
        <fieldset className="min-w-0 text-sm" disabled={!canEdit}>
          <legend className="mb-1.5">Idioma padrão</legend>
          <Choice name="Idioma padrão" value={f.defaultLang} onChange={(v) => setF({ ...f, defaultLang: v })}
            options={[{ value: "pt", label: "Português" }, { value: "en", label: "English" }, { value: "es", label: "Español" }]} />
          <span className="mt-1 block text-xs text-neutral-500">O cliente ainda pode trocar o idioma no app.</span>
        </fieldset>
        <fieldset className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2" disabled={!canEdit}>
          <label className="min-w-0 text-sm">Moeda
            <SelectList className="mt-1 w-full min-w-0" name="Moeda" value={f.currency} onChange={(v) => setF({ ...f, currency: v })}
              options={[...new Set([...CURRENCIES, f.currency])].map((c) => ({ value: c, label: c }))} />
            <span className="text-xs text-neutral-500">Ex.: {preview}</span>
          </label>
          <label className="min-w-0 text-sm">Fuso horário
            <SelectList className="mt-1 w-full min-w-0" name="Fuso horário" value={f.timezone} onChange={(v) => setF({ ...f, timezone: v })}
              options={[...new Set([f.timezone, ...zones])].map((z) => ({ value: z, label: z.replace(/_/g, " ") }))} />
            <span className="text-xs text-neutral-500">Agora lá: {clock}</span>
          </label>
        </fieldset>
      </div>
      {canEdit && <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={pending}>Salvar dados</button><Msg msg={msg} /></div>}
    </form>
  );
}

/** Pacote ("Só agendamento" ou "Completo") e o liga/desliga de cada módulo. */
function ModulesSection({ slug, modules, canEdit }: { slug: string; modules: Modules; canEdit: boolean }) {
  const [m, setM] = useState(modules);
  const { pending, msg, save } = useSaver();
  const current = packageOf(m);
  const dirty = JSON.stringify(m) !== JSON.stringify(modules);
  const label = current === "personalizado" ? "Personalizado" : PACKAGES.find((p) => p.key === current)!.title;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Pacote e módulos</h2>
          <p className="text-sm text-neutral-500">
            Escolha um pacote pronto ou ligue só o que quiser. Módulo desligado some do menu, da TV e do app do cliente.
            Nada é apagado: religou, volta como estava.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Agora: {label}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PACKAGES.map((p) => {
          const on = current === p.key;
          return (
            <button key={p.key} type="button" disabled={!canEdit || pending} aria-pressed={on} onClick={() => setM({ ...p.modules })}
              className={`card text-left transition disabled:cursor-not-allowed ${on ? "ring-2 ring-amber-500" : "hover:border-amber-400"}`}>
              <span className="flex items-center justify-between gap-2">
                <b className="text-base">{p.title}</b>
                <span className={`grid size-5 place-items-center rounded-full border-2 ${on ? "border-amber-500 bg-amber-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                  {on && <span className="size-2 rounded-full bg-white" />}
                </span>
              </span>
              <span className="mt-1 block text-sm text-neutral-500">{p.description}</span>
            </button>
          );
        })}
      </div>

      <div className="card mt-3">
        <p className="text-sm text-neutral-500">
          <b className="text-neutral-700 dark:text-neutral-200">Sempre ligados:</b> {BASE_PARTS.join(", ")}.
        </p>
        <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
          {MODULES.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <b className="text-sm"><span aria-hidden>{d.icon}</span> {d.title}</b>
                <span className="block text-xs text-neutral-500">{d.description} <i>({d.where})</i></span>
              </span>
              <Switch on={m[d.key]} label={d.title} disabled={!canEdit || pending} onChange={(v) => setM({ ...m, [d.key]: v })} />
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn" type="button" disabled={!dirty || pending} onClick={() => save(() => saveModulesAction(slug, m))}>Salvar módulos</button>
            {dirty && <button type="button" className="text-sm text-neutral-500 hover:underline" onClick={() => setM(modules)}>Desfazer</button>}
            <Msg msg={msg} />
          </div>
        )}
      </div>
    </section>
  );
}
