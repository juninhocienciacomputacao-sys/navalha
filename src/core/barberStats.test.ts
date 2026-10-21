import { describe, expect, it } from "vitest";
import { goalPace, openMinutesOn, totalOf, trend, weeklyStats, type StatAppointment } from "./barberStats";
import { atMinutes } from "./time";

const TZ = "America/Sao_Paulo";
// terça, 20/10/2026, 15h em São Paulo
const now = atMinutes("2026-10-20", 15 * 60, TZ);
const hours = { "1": { open: "09:00", close: "19:00" }, "2": { open: "09:00", close: "19:00" }, "6": { open: "08:00", close: "12:00" } };

const appt = (day: string, min: number, dur: number, status: StatAppointment["status"], price: number, barberId = "a"): StatAppointment => {
  const startsAt = atMinutes(day, min, TZ);
  return { barberId, startsAt, endsAt: new Date(+startsAt + dur * 60_000), status, price };
};

describe("openMinutesOn", () => {
  it("conta dia fechado como zero, hoje só até agora e futuro como zero", () => {
    expect(openMinutesOn("2026-10-18", hours, "2026-10-20", 900)).toBe(0); // domingo
    expect(openMinutesOn("2026-10-19", hours, "2026-10-20", 900)).toBe(600);
    expect(openMinutesOn("2026-10-20", hours, "2026-10-20", 900)).toBe(360);
    expect(openMinutesOn("2026-10-21", hours, "2026-10-20", 900)).toBe(0);
  });
});

describe("weeklyStats", () => {
  const rows = [
    appt("2026-10-19", 9 * 60, 60, "done", 50),
    appt("2026-10-20", 10 * 60, 30, "done", 0), // plano
    appt("2026-10-20", 11 * 60, 30, "no_show", 40),
    appt("2026-10-20", 12 * 60, 30, "cancelled", 40),
    appt("2026-10-12", 9 * 60, 40, "done", 80),
    appt("2026-10-12", 10 * 60, 40, "done", 40, "b"),
    appt("2026-10-12", 10 * 60, 40, "done", 40, "fora-da-lista"),
    appt("2026-08-01", 10 * 60, 40, "done", 40), // antes da janela
  ];
  const s = weeklyStats({ appointments: rows, barberIds: ["a", "b"], weeks: 2, now, tz: TZ, openingHours: hours });

  it("separa por semana terminando hoje", () => {
    const a = s.get("a")!;
    expect(a.map((w) => [w.start, w.end])).toEqual([["2026-10-07", "2026-10-13"], ["2026-10-14", "2026-10-20"]]);
    expect(a[1]).toMatchObject({ appointments: 2, revenue: 50, minutes: 90, noShows: 1, paid: 1, avgTicket: 50 });
    expect(a[1].noShowRate).toBeCloseTo(1 / 3);
    expect(a[0]).toMatchObject({ appointments: 1, revenue: 80, minutes: 40 });
  });

  it("calcula ocupação sobre o horário aberto", () => {
    const a = s.get("a")!;
    // semana atual: sáb 17 (240) + seg 19 (600) + ter 20 até 15h (360) = 1200
    expect(a[1].openMinutes).toBe(1200);
    expect(a[1].occupancy).toBeCloseTo(90 / 1200);
  });

  it("ignora barbeiros fora da lista", () => {
    expect(s.has("fora-da-lista")).toBe(false);
    expect(s.get("b")![0].appointments).toBe(1);
  });

  it("totaliza recalculando ticket e taxas", () => {
    const t = totalOf(s.get("a")!);
    expect(t).toMatchObject({ appointments: 3, revenue: 130, paid: 2, avgTicket: 65, noShows: 1 });
    expect(t.noShowRate).toBeCloseTo(0.25);
  });

  it("usa minutos reais quando registrados", () => {
    const r = weeklyStats({ appointments: [{ ...appt("2026-10-19", 600, 30, "done", 50), actualMinutes: 45 }], barberIds: ["a"], weeks: 1, now, tz: TZ, openingHours: hours });
    expect(r.get("a")![0].minutes).toBe(45);
  });
});

describe("trend e meta", () => {
  it("compara as duas últimas semanas", () => {
    expect(trend([10, 12])).toBeCloseTo(0.2);
    expect(trend([0, 5])).toBeNull();
    expect(trend([5])).toBeNull();
  });
  it("ritmo da meta", () => {
    expect(goalPace(5000, 10000, 15, 30)).toEqual({ done: 0.5, expected: 0.5, onTrack: true });
    expect(goalPace(4000, 10000, 15, 30).onTrack).toBe(false);
  });
});
