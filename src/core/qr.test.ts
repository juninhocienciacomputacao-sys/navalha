import { describe, expect, it } from "vitest";
import { QR_MAX_BYTES, penalty, qrEncode, qrSvgPath, rsRemainder } from "./qr";

describe("qr", () => {
  it("calcula a correção Reed-Solomon do exemplo clássico (HELLO WORLD 1-M)", () => {
    const data = [0x20, 0x5b, 0x0b, 0x78, 0xd1, 0x72, 0xdc, 0x4d, 0x43, 0x40, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, 10)).toEqual([0xc4, 0x23, 0x27, 0x77, 0xeb, 0xd7, 0xe7, 0xe2, 0x5d, 0x17]);
  });

  it("gera exatamente a mesma matriz de um gerador de referência (versão 1-M, máscara 3)", () => {
    // matriz conferida com a biblioteca segno (Python)
    const ref = [
      "111111101101001111111", "100000101001001000001", "101110100110001011101", "101110101110001011101",
      "101110100011001011101", "100000100100001000001", "111111101010101111111", "000000001010000000000",
      "101101110000001001011", "000110011100000110101", "101011101010011100011", "001101000001000111000",
      "001000111010101100000", "000000001011101011000", "111111101111000111000", "100000101001110001101",
      "101110100011000001110", "101110101010110000010", "101110101101110001100", "100000100100011100001",
      "111111101010011010100",
    ];
    const q = qrEncode("a".repeat(14), { mask: 3 });
    expect(q.version).toBe(1);
    expect(q.modules.map((r) => r.map((b) => (b ? "1" : "0")).join(""))).toEqual(ref);
  });

  it("escolhe a menor versão que cabe e recusa texto longo demais", () => {
    expect(qrEncode("a".repeat(14)).version).toBe(1);
    expect(qrEncode("a".repeat(15)).version).toBe(2);
    expect(qrEncode("https://navalha.app/b/dom-bigode").version).toBe(3);
    expect(qrEncode("y".repeat(QR_MAX_BYTES)).version).toBe(10);
    expect(() => qrEncode("y".repeat(QR_MAX_BYTES + 1))).toThrow();
  });

  it("escolhe a máscara de menor penalidade", () => {
    const text = "https://navalha.app/b/dom-bigode";
    const auto = qrEncode(text);
    for (let m = 0; m < 8; m++) expect(penalty(auto.modules)).toBeLessThanOrEqual(penalty(qrEncode(text, { mask: m }).modules));
  });

  it("desenha os três quadrados de canto e a margem no SVG", () => {
    const q = qrEncode("oi");
    const corner = (x0: number, y0: number) => [0, 1, 2, 3, 4, 5, 6].every((i) => q.modules[y0][x0 + i] && q.modules[y0 + 6][x0 + i]);
    expect(corner(0, 0) && corner(q.size - 7, 0) && corner(0, q.size - 7)).toBe(true);
    const svg = qrSvgPath(q);
    expect(svg.viewBox).toBe(`0 0 ${q.size + 8} ${q.size + 8}`);
    expect(svg.d.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});
