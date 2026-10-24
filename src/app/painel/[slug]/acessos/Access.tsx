"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AGENDA_LABEL, LEVELS, MENU, ROLE_HINT, ROLE_LABEL, SECTION_KEYS,
  type AgendaScope, type Level, type LevelAccess, type SectionKey, type StaffRole,
} from "@/core/access";
import { toE164 } from "@/core/phone";
import type { Invite, Member } from "@/modules/team/data";
import { Choice, Toggle } from "@/components/pick";
import {
  cancelInviteAction, inviteAction, removeMemberAction, saveLevelsAction, setMemberAction, startPreviewAction,
} from "./actions";

type BarberLite = { id: string; name: string; color: string | null };
const ROLES: StaffRole[] = ["owner", "manager", "reception", "barber"];
const FALLBACK = "#737373";
const fmtPhone = (p: string | null) => {
  if (!p) return "";
  const m = p.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
};

export default function Access({ slug, demo, barbers, levels, members, invites }: {
  slug: string; demo: boolean; barbers: BarberLite[]; levels: Record<Level, LevelAccess>; members: Member[]; invites: Invite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const barberName = (id: string | null) => barbers.find((b) => b.id === id)?.name;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string, after?: () => void) {
    setError(""); setSaved("");
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro");
      else { if (okMsg) setSaved(okMsg); after?.(); router.refresh(); }
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Acessos</p>
        <h1 className="text-2xl font-bold">Quem entra no painel e o que vê</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cadastre o WhatsApp de cada pessoa da equipe e escolha o nível. Ela entra pelo mesmo link do painel, com o código do WhatsApp, e já vê só o que o nível dela permite.
        </p>
      </header>

      {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {saved && <p className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{saved}</p>}

      <Team slug={slug} demo={demo} barbers={barbers} members={members} invites={invites} pending={pending} run={run} barberName={barberName} />
      <Levels slug={slug} levels={levels} pending={pending} run={run} />
      <PreviewCard slug={slug} barbers={barbers} pending={pending} run={run} />
    </main>
  );
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string, after?: () => void) => void;

// ---------------------------------------------------------------- equipe

function Team({ slug, demo, barbers, members, invites, pending, run, barberName }: {
  slug: string; demo: boolean; barbers: BarberLite[]; members: Member[]; invites: Invite[]; pending: boolean; run: Run;
  barberName: (id: string | null) => string | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="card mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Equipe com acesso</h2>
          <p className="text-xs text-neutral-500">{members.length} com acesso{invites.length ? ` · ${invites.length} aguardando entrar` : ""}</p>
        </div>
        {!adding && <button className="btn" onClick={() => setAdding(true)}>+ Dar acesso a alguém</button>}
      </div>

      {adding && <InviteForm barbers={barbers} pending={pending} onCancel={() => setAdding(false)}
        onSave={(inv) => run(() => inviteAction(slug, inv), "Pronto! Agora é só a pessoa entrar com esse WhatsApp.", () => setAdding(false))} />}

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {members.map((m) => (
          <li key={m.userId} className="py-3">
            {editing === m.userId ? (
              <MemberForm member={m} barbers={barbers} pending={pending} onCancel={() => setEditing(null)}
                onSave={(role, barberId) => run(() => setMemberAction(slug, m.userId, role, barberId), "Nível atualizado.", () => setEditing(null))} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Person name={m.isMe ? "Você" : m.name ?? barberName(m.barberId) ?? "Sem nome"} phone={m.phone} role={m.role} barber={barberName(m.barberId)} />
                <div className="flex gap-2">
                  <button className="chip" onClick={() => setEditing(m.userId)}>Mudar</button>
                  {!m.isMe && (
                    <button className="chip" disabled={pending} onClick={() => {
                      if (confirm(`Tirar o acesso de ${m.name ?? fmtPhone(m.phone)}? A pessoa deixa de entrar no painel.`)) run(() => removeMemberAction(slug, m.userId), "Acesso removido.");
                    }}>Tirar acesso</button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.phone} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Person name={i.name ?? barberName(i.barberId) ?? "Sem nome"} phone={i.phone} role={i.role} barber={barberName(i.barberId)} waiting />
            <button className="chip" disabled={pending} onClick={() => run(() => cancelInviteAction(slug, i.phone), "Convite cancelado.")}>Cancelar</button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">
        {demo
          ? "Na demonstração os convites ficam só na memória. Para testar cada nível agora, use \"Testar como\" lá embaixo."
          : "Quem está aguardando entra quando fizer o login com o código do WhatsApp. Até lá, não vê nada."}
      </p>
    </section>
  );
}

function Person({ name, phone, role, barber, waiting }: { name: string; phone: string | null; role: StaffRole; barber?: string; waiting?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold">
        {name}
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${role === "owner" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
          {ROLE_LABEL[role]}
        </span>
        {waiting && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">aguardando entrar</span>}
      </p>
      <p className="text-xs text-neutral-500">
        {fmtPhone(phone) || "sem telefone"}{barber ? ` · agenda de ${barber}` : ""}
      </p>
    </div>
  );
}

function RolePicker({ value, onChange }: { value: StaffRole; onChange: (r: StaffRole) => void }) {
  return (
    <div className="space-y-1">
      <Choice name="Nível" value={value} onChange={onChange} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <p className="text-xs text-neutral-500">{ROLE_HINT[value]}</p>
    </div>
  );
}

function BarberPicker({ barbers, value, onChange, role }: { barbers: BarberLite[]; value: string | null; onChange: (id: string | null) => void; role: StaffRole }) {
  return (
    <div className="space-y-1">
      <Choice name="Agenda de qual barbeiro" value={value} onChange={onChange}
        options={[{ value: null, label: "Não atende" }, ...barbers.map((b) => ({
          value: b.id as string | null,
          label: <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? FALLBACK }} />{b.name}</span>,
        }))]} />
      {role === "barber" && !value && <p className="text-xs text-amber-700 dark:text-amber-400">Escolha qual barbeiro é essa pessoa, senão ela não terá agenda própria para ver.</p>}
    </div>
  );
}

function InviteForm({ barbers, pending, onSave, onCancel }: {
  barbers: BarberLite[]; pending: boolean; onCancel: () => void;
  onSave: (inv: { phone: string; name: string | null; role: StaffRole; barberId: string | null }) => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("barber");
  const [barberId, setBarberId] = useState<string | null>(barbers[0]?.id ?? null);
  const [err, setErr] = useState("");
  const label = "mb-2 block text-sm font-medium";
  return (
    <form className="mb-4 space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20" onSubmit={(e) => {
      e.preventDefault();
      const e164 = toE164(phone);
      if (!e164) return setErr("Confira o WhatsApp com DDD.");
      setErr("");
      onSave({ phone: e164, name: name.trim() || (barbers.find((b) => b.id === barberId)?.name ?? null), role, barberId });
    }}>
      <h3 className="font-semibold">Dar acesso a alguém</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">WhatsApp da pessoa
          <input className="input mt-1" inputMode="tel" autoComplete="off" placeholder="(62) 99999-0000" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label className="block text-sm font-medium">Nome <span className="font-normal text-neutral-500">(opcional)</span>
          <input className="input mt-1" maxLength={60} placeholder="Ex.: Ana da recepção" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <fieldset><legend className={label}>Nível</legend><RolePicker value={role} onChange={setRole} /></fieldset>
      <fieldset><legend className={label}>Atende como barbeiro?</legend>
        <BarberPicker barbers={barbers} value={barberId} onChange={setBarberId} role={role} />
      </fieldset>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending}>{pending ? "Salvando…" : "Dar acesso"}</button>
        <button type="button" className="chip" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function MemberForm({ member, barbers, pending, onSave, onCancel }: {
  member: Member; barbers: BarberLite[]; pending: boolean; onCancel: () => void; onSave: (role: StaffRole, barberId: string | null) => void;
}) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [barberId, setBarberId] = useState<string | null>(member.barberId);
  return (
    <div className="space-y-4">
      <p className="font-semibold">{member.isMe ? "Você" : member.name ?? fmtPhone(member.phone)}</p>
      <RolePicker value={role} onChange={setRole} />
      <div><p className="mb-2 text-sm font-medium">Atende como barbeiro?</p><BarberPicker barbers={barbers} value={barberId} onChange={setBarberId} role={role} /></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={() => onSave(role, barberId)}>{pending ? "Salvando…" : "Salvar"}</button>
        <button className="chip" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- níveis

function Levels({ slug, levels, pending, run }: { slug: string; levels: Record<Level, LevelAccess>; pending: boolean; run: Run }) {
  const [draft, setDraft] = useState(levels);
  const dirty = JSON.stringify(draft) !== JSON.stringify(levels);
  const set = (l: Level, patch: Partial<LevelAccess>) => setDraft({ ...draft, [l]: { ...draft[l], ...patch } });
  const toggle = (l: Level, k: SectionKey, on: boolean) =>
    set(l, { sections: SECTION_KEYS.filter((x) => (x === k ? on : draft[l].sections.includes(x))) });
  const sections = MENU.filter((m) => m.key !== "agenda");

  return (
    <section className="card mb-6">
      <h2 className="font-semibold">O que cada nível vê</h2>
      <p className="mb-4 text-xs text-neutral-500">O dono vê tudo, sempre. Para os outros níveis, escolha a agenda e ligue as telas que cada um pode abrir e mudar.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {LEVELS.map((l) => (
          <div key={l} className="min-w-0 rounded-xl border border-neutral-100 p-4 dark:border-neutral-800">
            <p className="font-semibold">{ROLE_LABEL[l]}</p>
            <p className="mb-3 text-xs text-neutral-500">{ROLE_HINT[l]}</p>
            <p className="mb-2 text-sm font-medium">📅 Agenda</p>
            <div className="mb-4 space-y-2">
              {(Object.keys(AGENDA_LABEL) as AgendaScope[]).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={draft[l].agenda === s} onClick={() => set(l, { agenda: s })}
                  className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${draft[l].agenda === s
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : "border-neutral-200 dark:border-neutral-700"}`}>
                  <b>{draft[l].agenda === s ? "● " : "○ "}{AGENDA_LABEL[s].label}</b>
                  <span className="block text-xs text-neutral-500">{AGENDA_LABEL[s].hint}</span>
                </button>
              ))}
            </div>
            <p className="mb-2 text-sm font-medium">Telas</p>
            <div className="space-y-2.5">
              {sections.map((m) => (
                <Toggle key={m.key} on={draft[l].sections.includes(m.key as SectionKey)} onChange={(on) => toggle(l, m.key as SectionKey, on)}
                  label={<span><span aria-hidden>{m.icon}</span> {m.label}<span className="block text-xs text-neutral-500">{m.hint}</span></span>} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending || !dirty} onClick={() => run(() => saveLevelsAction(slug, draft), "Níveis salvos. Vale na hora para toda a equipe.")}>
          {pending ? "Salvando…" : "Salvar níveis"}
        </button>
        {dirty && <button className="chip" onClick={() => setDraft(levels)}>Desfazer</button>}
        {!dirty && <span className="text-xs text-neutral-500">Nada mudou.</span>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- testar

function PreviewCard({ slug, barbers, pending, run }: { slug: string; barbers: BarberLite[]; pending: boolean; run: Run }) {
  const router = useRouter();
  const go = (role: Level, barberId: string | null = null) =>
    run(() => startPreviewAction(slug, role, barberId), undefined, () => router.push(`/painel/${slug}/agenda`));
  return (
    <section className="card">
      <h2 className="font-semibold">Testar como</h2>
      <p className="mb-3 text-xs text-neutral-500">Veja o painel exatamente como cada nível vê, sem precisar de outro celular. Só muda na sua tela; para voltar, toque em &quot;Voltar a ver como dono&quot; na faixa roxa.</p>
      <div className="flex flex-wrap gap-2">
        <button className="chip" disabled={pending} onClick={() => go("manager")}>👁️ {ROLE_LABEL.manager}</button>
        <button className="chip" disabled={pending} onClick={() => go("reception")}>👁️ {ROLE_LABEL.reception}</button>
        {barbers.map((b) => (
          <button key={b.id} className="chip flex items-center gap-1.5" disabled={pending} onClick={() => go("barber", b.id)}>
            👁️ Barbeiro <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color ?? FALLBACK }} />{b.name}
          </button>
        ))}
      </div>
    </section>
  );
}
