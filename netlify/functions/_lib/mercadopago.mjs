// Mercado Pago — Checkout Pro (página de pagamento do próprio Mercado Pago: Pix, cartão, parcelamento).
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, chamar } from './util.mjs';
import { LOJA } from './loja.mjs';

const API = 'https://api.mercadopago.com';
export const mpAtivo = () => !!env('MP_ACCESS_TOKEN');
const headers = (extra = {}) => ({ Authorization: `Bearer ${env('MP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', ...extra });

export async function criarCobranca(pedido, base) {
  const itens = pedido.itens.map((i) => ({
    id: i.sku, title: i.nome.slice(0, 250), quantity: i.quantidade, unit_price: Number(i.preco), currency_id: 'BRL',
  }));
  if (pedido.frete?.preco > 0) {
    itens.push({ id: 'frete', title: `Frete · ${pedido.frete.nome}`, quantity: 1, unit_price: Number(pedido.frete.preco), currency_id: 'BRL' });
  }
  const [nome, ...resto] = String(pedido.cliente.nome).split(' ');
  const volta = (s) => `${base}/pedido.html?id=${pedido.id}&t=${pedido.token}&r=${s}`;
  const corpo = {
    items: itens,
    payer: {
      name: nome, surname: resto.join(' '), email: pedido.cliente.email,
      identification: { type: 'CPF', number: pedido.cliente.cpf },
    },
    external_reference: pedido.id,
    back_urls: { success: volta('ok'), pending: volta('pendente'), failure: volta('falhou') },
    auto_return: 'approved',
    notification_url: `${base}/api/webhook-pagamento`,
    statement_descriptor: 'ADMIRAVELCAFE',
    payment_methods: { installments: LOJA.parcelasMax, excluded_payment_types: [{ id: 'ticket' }] },
    expires: true,
    expiration_date_to: new Date(Date.now() + 2 * 864e5).toISOString(),
    metadata: { pedido_numero: pedido.numero },
  };
  const r = await chamar(`${API}/checkout/preferences`, {
    method: 'POST', headers: headers({ 'X-Idempotency-Key': `pref-${pedido.id}` }), body: JSON.stringify(corpo),
  }, 'Mercado Pago');
  const teste = env('MP_ACCESS_TOKEN').startsWith('TEST-') || env('MP_SANDBOX') === 'true';
  return { url: (teste && r.sandbox_init_point) || r.init_point, referencia: r.id };
}

export async function consultarPagamento(id) {
  if (!/^\d{1,20}$/.test(String(id))) throw new Error('id de pagamento inválido');
  const p = await chamar(`${API}/v1/payments/${id}`, { headers: headers() }, 'Mercado Pago');
  return {
    id: String(p.id), status: p.status, detalhe: p.status_detail, pedido_id: p.external_reference,
    valor: Number(p.transaction_amount), tipo: p.payment_type_id, metodo: p.payment_method_id,
    parcelas: p.installments, aprovado_em: p.date_approved,
  };
}

// Confere a assinatura x-signature do webhook (se MP_WEBHOOK_SECRET estiver configurado).
// Mesmo sem ela, o pagamento é sempre reconsultado na API do Mercado Pago antes de valer.
export function assinaturaValida(req, dataId) {
  const segredo = env('MP_WEBHOOK_SECRET');
  if (!segredo) return true;
  const sig = req.headers.get('x-signature') || '';
  const reqId = req.headers.get('x-request-id') || '';
  const partes = Object.fromEntries(sig.split(',').map((s) => s.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
  const manifesto = `id:${id};request-id:${reqId};ts:${partes.ts};`;
  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex');
  try { return timingSafeEqual(Buffer.from(esperado), Buffer.from(partes.v1)); } catch { return false; }
}

// Código da forma de pagamento na NF-e (tPag)
export function formaPagamentoNF(tipo) {
  return { credit_card: '03', debit_card: '04', ticket: '15', bank_transfer: '17', account_money: '99' }[tipo] || '99';
}
