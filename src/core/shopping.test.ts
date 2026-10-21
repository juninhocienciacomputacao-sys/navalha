import { describe, expect, it } from "vitest";
import { affiliateLink, estimateReferralCommission } from "./shopping";

describe("shopping de lojas parceiras", () => {
  it("estima a comissão da barbearia (metade da comissão da loja)", () => {
    const e = estimateReferralCommission({ activeClients: 200, buyerRate: 0.1, avgTicket: 60, avgCommissionPct: 12 });
    expect(e.orders).toBe(20);
    expect(e.sales).toBe(1200);
    expect(e.storeCommission).toBe(144);
    expect(e.shopCommission).toBe(72);
  });
  it("não aceita taxa fora de 0 a 100%", () => {
    expect(estimateReferralCommission({ activeClients: 10, buyerRate: 3, avgTicket: 10, avgCommissionPct: 10 }).orders).toBe(10);
    expect(estimateReferralCommission({ activeClients: 10, buyerRate: -1, avgTicket: 10, avgCommissionPct: 10 }).shopCommission).toBe(0);
  });
  it("marca o link com a barbearia", () => {
    const l = new URL(affiliateLink("https://loja.example/p/1?x=1", "dom-bigode", "b-rafa"));
    expect(l.searchParams.get("x")).toBe("1");
    expect(l.searchParams.get("ref")).toBe("navalha-dom-bigode");
    expect(l.searchParams.get("utm_content")).toBe("b-rafa");
  });
  it("link inválido volta como está", () => {
    expect(affiliateLink("não é link", "x")).toBe("não é link");
  });
});
