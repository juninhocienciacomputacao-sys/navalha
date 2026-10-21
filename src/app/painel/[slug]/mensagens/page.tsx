import { requireStaff } from "@/lib/staff";
import { pickBody, renderTemplate } from "@/core/messages";
import { plannedSends } from "@/core/message-schedule";
import { dayInZone } from "@/core/time";
import { tx } from "@/i18n";
import { appointmentsForMessages, listTemplates } from "@/modules/messages/data";
import { fmtDay, fmtTime, sampleVars, varsForAppointment, waLink } from "@/modules/messages/vars";
import { siteOrigin } from "@/modules/messages/origin";
import Editor from "./Editor";

export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
const WINDOW_H = 48;

export default async function Mensagens({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { bundle, role } = await requireStaff(slug);
  const { shop } = bundle;
  const canEdit = role === "owner" || role === "manager";
  const now = new Date();
  const templates = await listTemplates(shop.id);
  const link = `${await siteOrigin()}/b/${shop.slug}`;

  // agendamentos que podem gerar envio nas próximas 48 h
  const maxBefore = Math.min(720, Math.max(0, ...templates.filter((t) => t.trigger === "before_appointment").map((t) => t.offset)));
  const maxAfter = Math.min(720, Math.max(0, ...templates.filter((t) => t.trigger === "after_appointment").map((t) => t.offset)));
  const until = new Date(now.getTime() + WINDOW_H * HOUR);
  const appts = await appointmentsForMessages(shop.id, new Date(now.getTime() - maxAfter * HOUR), new Date(until.getTime() + maxBefore * HOUR));
  const sends = plannedSends(templates, appts, now, until);
  const shown = sends.slice(0, 40);
  const today = dayInZone(now, shop.timezone);

  const sample = sampleVars(shop, bundle.barbers[0]?.name ?? "Rafa", bundle.services[0] ? tx(bundle.services[0].name, shop.defaultLang) : "Corte",
    bundle.plans[0]?.name ?? "Clube do Corte", link);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Mensagens</p>
        <h1 className="text-2xl font-bold">Mensagens automáticas</h1>
        <p className="mt-1 text-sm text-neutral-500">Crie, edite, ligue, desligue ou exclua. Cada mensagem tem o seu momento de envio.</p>
      </header>

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <b>O envio sozinho pelo WhatsApp oficial entra na próxima etapa.</b> Para isso a barbearia precisa de uma conta Meta Business
        (WhatsApp Business API). Até lá, os textos já ficam prontos aqui: toque em <b>Enviar agora</b> e o WhatsApp abre com a mensagem
        escrita para o cliente — é só apertar enviar.
      </div>

      <Editor slug={shop.slug} templates={templates} sample={sample} canEdit={canEdit} />

      <section className="card mt-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Próximos envios</h2>
          <span className="text-xs text-neutral-500">
            {sends.length} mensagem(ns) nas próximas {WINDOW_H} horas{sends.length > shown.length ? ` · mostrando as ${shown.length} primeiras` : ""}
          </span>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-neutral-500">Nada para enviar nas próximas {WINDOW_H} horas. Os lembretes aparecem aqui quando houver horários marcados e mensagens ligadas.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {shown.map(({ template, appointment: a, sendAt }) => {
              const body = renderTemplate(pickBody(template, a.lang), varsForAppointment(shop, a, link));
              const sendDay = dayInZone(sendAt, shop.timezone);
              const late = sendAt.getTime() - now.getTime() < 15 * 60_000;
              return (
                <li key={template.id + a.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[110px_1fr_auto] sm:items-start">
                  <div className="tabular-nums">
                    <b>{fmtTime(sendAt, shop.timezone, shop.defaultLang)}</b>
                    <span className="ml-1 text-xs text-neutral-500 sm:ml-0 sm:block">
                      {sendDay === today ? "hoje" : fmtDay(sendAt, shop.timezone, shop.defaultLang)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p>
                      <b>{a.clientName}</b> <span className="text-neutral-500">· {template.name}</span>
                      {late && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">agora</span>}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {tx(a.serviceName, shop.defaultLang)} com {a.barberName} · {fmtDay(a.startsAt, shop.timezone, shop.defaultLang)} às {fmtTime(a.startsAt, shop.timezone, shop.defaultLang)}
                    </p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-neutral-600 dark:text-neutral-400">{body}</p>
                  </div>
                  {a.phone ? (
                    <a href={waLink(a.phone, body)} target="_blank" rel="noopener noreferrer"
                      className="justify-self-start rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 sm:justify-self-end">
                      Enviar agora
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-400">sem WhatsApp</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Aqui entram os lembretes de antes do horário e as mensagens de depois do atendimento. Plano vencendo, plano vencido, cliente sumido e aniversário
          vão sair sozinhos quando o envio automático estiver ligado; os avisos de plano também aparecem no Painel.
        </p>
      </section>
    </main>
  );
}
