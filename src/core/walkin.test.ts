import { describe, expect, it } from "vitest";
import { firstWalkInFit, freeGaps, openReserves, planQueue } from "./walkin";

const hours = { open: 540, close: 1200, step: 15 };

describe("encaixes", () => {
  it("mostra só os blocos de encaixe que ninguém ocupou", () => {
    const reserves = new Map([["a", [{ start: 660, end: 705 }]], ["b", [{ start: 660, end: 705 }, { start: 1020, end: 1065 }]]]);
    const busy = new Map([["a", [{ start: 680, end: 720 }]], ["b", []]]);
    expect(openReserves(reserves, busy)).toEqual([
      { barberId: "b", start: 660, end: 705 },
      { barberId: "b", start: 1020, end: 1065 },
    ]);
  });

  it("lista janelas livres a partir de agora", () => {
    const busy = [{ start: 540, end: 600 }, { start: 620, end: 700 }, { start: 700, end: 760 }];
    expect(freeGaps(hours, busy, 590, 15)).toEqual([{ start: 600, end: 620 }, { start: 760, end: 1200 }]);
    expect(freeGaps(hours, busy, 590, 30)).toEqual([{ start: 760, end: 1200 }]);
  });

  it("encaixa no horário mais cedo de qualquer barbeiro", () => {
    const busy = new Map([["a", [{ start: 600, end: 700 }]], ["b", [{ start: 600, end: 640 }]]]);
    expect(firstWalkInFit({ hours, durationMin: 40, barberIds: ["a", "b"], busyByBarber: busy, notBefore: 600 }))
      .toEqual({ barberId: "b", time: 645, reserved: false });
  });

  it("no empate prefere o bloco guardado para encaixe", () => {
    const busy = new Map([["a", []], ["b", []]]);
    const reserves = new Map([["a", []], ["b", [{ start: 660, end: 705 }]]]);
    expect(firstWalkInFit({ hours, durationMin: 40, barberIds: ["a", "b"], busyByBarber: busy, reserves, notBefore: 660 }))
      .toEqual({ barberId: "b", time: 660, reserved: true });
  });

  it("devolve null quando o dia acabou", () => {
    expect(firstWalkInFit({ hours, durationMin: 40, barberIds: ["a"], busyByBarber: new Map(), notBefore: 1190 })).toBeNull();
  });

  it("prevê a fila inteira sem colocar duas pessoas no mesmo horário", () => {
    const busy = new Map([["a", [{ start: 600, end: 700 }]]]);
    const plan = planQueue({ hours, barberIds: ["a"], busyByBarber: busy, notBefore: 600 }, [40, 30]);
    expect(plan).toEqual([{ barberId: "a", time: 705, reserved: false }, { barberId: "a", time: 750, reserved: false }]);
    expect(busy.get("a")).toHaveLength(1); // não altera a entrada
  });
});
