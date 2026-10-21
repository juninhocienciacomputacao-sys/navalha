import { sendAtForAppointment, type MessageTemplate } from "./messages";

export interface ScheduledAppointment {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
}

export interface PlannedSend<A extends ScheduledAppointment> {
  template: MessageTemplate;
  appointment: A;
  sendAt: Date;
}

/**
 * Lembretes que ainda vão sair: para cada agendamento ativo e cada modelo ligado de antes/depois do horário,
 * o momento de envio entre `now` e `until`. Ordenado pelo momento de envio.
 */
export function plannedSends<A extends ScheduledAppointment>(
  templates: MessageTemplate[], appointments: A[], now: Date, until: Date,
): PlannedSend<A>[] {
  const out: PlannedSend<A>[] = [];
  for (const a of appointments) {
    if (a.status === "cancelled" || a.status === "no_show") continue;
    for (const t of templates) {
      if (!t.enabled) continue;
      // "depois do atendimento" só faz sentido para quem não faltou; antes, só para quem ainda vem
      if (t.trigger === "before_appointment" && a.startsAt <= now) continue;
      const at = sendAtForAppointment(t, a.startsAt, a.endsAt);
      if (!at || at < now || at > until) continue;
      out.push({ template: t, appointment: a, sendAt: at });
    }
  }
  return out.sort((x, y) => +x.sendAt - +y.sendAt);
}
