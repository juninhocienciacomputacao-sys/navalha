// Pagamento online do plano (Pix e cartão) e reativação automática.
//
// Fluxo no sistema real:
//   1. Cliente toca "Pagar e reativar" → start_plan_payment (banco) cria o pagamento `pending`.
//   2. createProviderCharge pede a cobrança ao provedor e guarda o id dele (set_payment_provider_ref).
//   3. O provedor avisa que caiu (webhook) → handlePaymentWebhook → confirmPlanPayment →
//      confirm_plan_payment (banco) marca pago e estende o plano sozinho (mesma regra de applyPayment).
//
// Para ligar: escolha o provedor e preencha as variáveis de ambiente (só no servidor, nunca NEXT_PUBLIC_):
//   PAYMENTS_PROVIDER=asaas | mercadopago | stripe
//   SUPABASE_SERVICE_ROLE_KEY=...        (o webhook confirma o pagamento com esta chave)
//   ASAAS_API_KEY=..., ASAAS_WEBHOOK_TOKEN=..., ASAAS_BASE_URL=https://api.asaas.com/v3  (sandbox: https://api-sandbox.asaas.com/v3)
// e crie a rota do webhook (ex.: src/app/api/pagamentos/[provider]/route.ts) chamando handlePaymentWebhook.
import { createClient } from "@supabase/supabase-js";

export type Provider = "asaas" | "mercadopago" | "stripe";

export interface ChargeRequest {
  /** Id do pagamento no Navalha: vai como referência externa para o webhook achar o pagamento. */
  paymentId: string;
  amount: number;
  currency: string;
  method: "pix" | "card";
  description: string;
  customer: { name: string; phone: string };
}

export interface Charge {
  provider: Provider;
  providerRef: string;
  /** Pix copia e cola. */
  pixCode: string | null;
  /** Página segura do provedor (cartão e, em alguns, Pix). O cartão nunca passa pelo nosso servidor. */
  checkoutUrl: string | null;
}

const provider = () => (process.env.PAYMENTS_PROVIDER as Provider | undefined) ?? null;

/** Cliente do banco com a chave de serviço. Só para o servidor (webhook). */
function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * >>> AQUI ENTRA O PROVEDOR DE PAGAMENTO <<<
 * Cria a cobrança no provedor. Sem provedor configurado devolve null e o app mostra
 * "pague na recepção" (o pagamento continua `pending` e a equipe confirma no painel).
 */
export async function createProviderCharge(req: ChargeRequest): Promise<Charge | null> {
  const p = provider();
  if (!p) return null;
  let charge: Charge;
  if (p === "asaas") charge = await asaasCharge(req);
  else {
    // Mercado Pago: POST /v1/payments (pix) ou /checkout/preferences (cartão), external_reference = paymentId.
    // Stripe: Checkout Session (mode=payment, payment_method_types pix/card), client_reference_id = paymentId.
    throw new Error(`Provedor ${p} ainda não implementado`);
  }
  await serviceDb().rpc("set_payment_provider_ref", { p_payment: req.paymentId, p_provider: charge.provider, p_provider_ref: charge.providerRef });
  return charge;
}

async function asaasCharge(req: ChargeRequest): Promise<Charge> {
  const base = process.env.ASAAS_BASE_URL ?? "https://api.asaas.com/v3";
  const headers = { "content-type": "application/json", access_token: process.env.ASAAS_API_KEY ?? "" };
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(base + path, { ...init, headers });
    if (!res.ok) throw new Error(`asaas ${path}: ${res.status}`);
    return res.json();
  };
  // o Asaas exige um "customer"; o telefone do WhatsApp identifica o cliente
  const phone = req.customer.phone.replace(/\D/g, "");
  const found = await call(`/customers?mobilePhone=${phone}`);
  const customer = found.data?.[0]?.id ?? (await call("/customers", { method: "POST", body: JSON.stringify({ name: req.customer.name, mobilePhone: phone }) })).id;
  const due = new Date().toISOString().slice(0, 10);
  const pay = await call("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer, value: req.amount, dueDate: due, description: req.description, externalReference: req.paymentId,
      billingType: req.method === "pix" ? "PIX" : "CREDIT_CARD",
    }),
  });
  let pixCode: string | null = null;
  if (req.method === "pix") pixCode = (await call(`/payments/${pay.id}/pixQrCode`)).payload ?? null;
  return { provider: "asaas", providerRef: pay.id, pixCode, checkoutUrl: pay.invoiceUrl ?? null };
}

/**
 * Pagamento aprovado: marca pago e reativa o plano no banco. Pode ser chamada de novo sem efeito (webhooks repetem).
 * Devolve o novo fim do plano (AAAA-MM-DD).
 */
export async function confirmPlanPayment(i: { paymentId: string; provider?: Provider; providerRef?: string; amount?: number; paidAt?: Date }): Promise<string> {
  const { data, error } = await serviceDb().rpc("confirm_plan_payment", {
    p_payment: i.paymentId, p_provider: i.provider ?? null, p_provider_ref: i.providerRef ?? null,
    p_amount: i.amount ?? null, p_paid_at: (i.paidAt ?? new Date()).toISOString(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Recebe o aviso do provedor. Confere a autenticidade antes de qualquer coisa.
 * Devolve o status HTTP para a rota responder.
 */
export async function handlePaymentWebhook(p: Provider, headers: Headers, body: unknown): Promise<{ status: number; periodEnd?: string }> {
  if (p === "asaas") {
    const token = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!token || headers.get("asaas-access-token") !== token) return { status: 401 };
    const ev = body as { event?: string; payment?: { id: string; externalReference?: string; value?: number; confirmedDate?: string; paymentDate?: string } };
    const pay = ev.payment;
    if (!pay?.externalReference) return { status: 200 };
    if (ev.event === "PAYMENT_RECEIVED" || ev.event === "PAYMENT_CONFIRMED") {
      const when = pay.paymentDate ?? pay.confirmedDate;
      const periodEnd = await confirmPlanPayment({
        paymentId: pay.externalReference, provider: "asaas", providerRef: pay.id, amount: pay.value,
        paidAt: when ? new Date(when + "T12:00:00Z") : new Date(),
      });
      return { status: 200, periodEnd };
    }
    if (ev.event === "PAYMENT_OVERDUE" || ev.event === "PAYMENT_DELETED" || ev.event === "PAYMENT_REFUSED") {
      await serviceDb().rpc("fail_plan_payment", { p_payment: pay.externalReference });
    }
    return { status: 200 };
  }
  // Mercado Pago: o aviso traz só o id; buscar GET /v1/payments/{id} com o token e conferir status "approved".
  // Stripe: validar a assinatura "stripe-signature" com STRIPE_WEBHOOK_SECRET e tratar checkout.session.completed.
  return { status: 501 };
}
