import { describe, expect, it } from "vitest";
import { cleanName, isFullName, slugify, toE164 } from "./phone";

describe("telefone e endereço", () => {
  it("normaliza números", () => {
    expect(toE164("(11) 98888-7777")).toBe("+5511988887777");
    expect(toE164("+1 415 555 0100")).toBe("+14155550100");
    expect(toE164("5511988887777")).toBe("+5511988887777");
    expect(toE164("1234")).toBeNull();
  });
  it("cria endereço sem acento", () => {
    expect(slugify("Barbearia do Zé!")).toBe("barbearia-do-ze");
    expect(slugify("  Corte & Cia  ")).toBe("corte-cia");
  });
  it("exige nome completo", () => {
    expect(isFullName("João Silva")).toBe(true);
    expect(isFullName("  Zé   da Silva ")).toBe(true);
    expect(isFullName("Ana Maria O'Neil")).toBe(true);
    expect(isFullName("João")).toBe(false);
    expect(isFullName("J S")).toBe(false);
    expect(isFullName("João 123")).toBe(false);
    expect(cleanName("  joão   silva ")).toBe("joão silva");
  });
});
