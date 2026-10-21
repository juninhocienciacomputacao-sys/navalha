import { describe, expect, it } from "vitest";
import type { MessageTemplate } from "./messages";
import { plannedSends } from "./message-schedule";

const tpl = (id: string, trigger: MessageTemplate["trigger"], offset: number, enabled = true): MessageTemplate =>
  ({ id, name: id, trigger, offset, enabled, body: { pt: "" } });

const now = new Date("2026-10-20T12:00:00Z");
const appt = (id: string, start: string, min = 40, status = "confirmed") => {
  const startsAt = new Date(start);
  return { id, startsAt, endsAt: new Date(startsAt.getTime() + min * 60_000), status };
};

describe("próximos envios", () => {
  const templates = [tpl("d1", "before_appointment", 24), tpl("h2", "before_appointment", 2), tpl("av", "after_appointment", 1),
    tpl("off", "before_appointment", 3, false), tpl("pv", "plan_expiring", 5)];

  it("calcula lembretes de 1 dia e 2 horas antes e o obrigado depois, em ordem", () => {
    const r = plannedSends(templates, [appt("a", "2026-10-21T15:00:00Z")], now, new Date("2026-10-23T00:00:00Z"));
    expect(r.map((x) => [x.template.id, x.sendAt.toISOString()])).toEqual([
      ["d1", "2026-10-20T15:00:00.000Z"],
      ["h2", "2026-10-21T13:00:00.000Z"],
      ["av", "2026-10-21T16:40:00.000Z"],
    ]);
  });
  it("ignora modelo desligado, horário cancelado e envio que já passou", () => {
    const r = plannedSends(templates, [appt("a", "2026-10-20T13:00:00Z"), appt("b", "2026-10-21T15:00:00Z", 40, "cancelled")],
      now, new Date("2026-10-23T00:00:00Z"));
    // o de 1 dia antes (ontem) e o de 2 horas antes (11h) já passaram; sobra o obrigado
    expect(r.map((x) => x.template.id)).toEqual(["av"]);
  });
  it("respeita o limite da janela", () => {
    const r = plannedSends(templates, [appt("a", "2026-10-25T15:00:00Z")], now, new Date("2026-10-23T00:00:00Z"));
    expect(r).toEqual([]);
  });
});
