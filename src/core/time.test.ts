import { describe, expect, it } from "vitest";
import { addDays, atMinutes, dayInZone, minutesInZone, weekday } from "./time";

describe("fuso da barbearia", () => {
  it("São Paulo: 9h30 local = 12h30 UTC", () => {
    expect(atMinutes("2026-10-21", 570, "America/Sao_Paulo").toISOString()).toBe("2026-10-21T12:30:00.000Z");
  });
  it("Lisboa no verão (UTC+1) e no inverno (UTC+0)", () => {
    expect(atMinutes("2026-07-01", 600, "Europe/Lisbon").toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(atMinutes("2026-12-01", 600, "Europe/Lisbon").toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });
  it("ida e volta", () => {
    const at = atMinutes("2026-10-21", 1110, "America/New_York");
    expect(dayInZone(at, "America/New_York")).toBe("2026-10-21");
    expect(minutesInZone(at, "America/New_York")).toBe(1110);
  });
  it("datas", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekday("2026-10-20")).toBe(2);
  });
});
