// InfinitePay — Checkout integrado (Pix grátis, cartão em até 12x). Docs: https://www.infinitepay.io/checkout-documentacao
// Não existe modo de teste: para testar, faça um pedido real de R$ 1,00 e estorne pelo app.
import { env, chamar, soDigitos } from './util.mjs';

const API = 'https://api.checkout.infinitepay.io';
export const ipAtivo = () => !!env('INFINITEPAY_HANDLE');
const handle = () => env('INFINITEPAY_HANDLE').replace(/^\$/, '');

export async function criarCobranca(pedido, base) {
  const items = pedido.itens.map((i) => ({ description: i.nome.slice(0, 120), price: Math.round(i.preco * 100), quantity: i.quantidade }));
  if (pedido.frete?.preco > 0) items.push({ description: `Frete · ${pedido.frete.nome}`, price: Math.round(pedido.frete.preco * 100), quantity: 1 });
  const e = pedido.endereco, c = pedido.cliente;
  const fone = soDigitos(c.telefone);
  const corpo = {
    handle: handle(),
    items,
    order_nsu: pedido.id,
    redirect_url: `${base}/pedido.html?id=${pedido.id}&t=${pedido.token}`,
    webhook_url: `${base}/api/webhook-pagamento?p=infinitepay`,
    customer: { name: c.nome, email: c.email, phone_number: fone ? `+55${fone}` : undefined },
    address: { cep: soDigitos(e.cep), street: e.rua, number: e.numero, neighborhood: e.bairro, city: e.cidade, state: e.uf, complement: e.complemento || undefined },
  };
  const headers = { 'Content-Type': 'application/json' };
  if (env('INFINITEPAY_API_KEY')) headers['X-Api-Key'] = env('INFINITEPAY_API_KEY');
  const r = await chamar(`${API}/links`, { method: 'POST', headers, body: JSON.stringify(corpo) }, 'InfinitePay');
  if (!r?.url) throw new Error('InfinitePay não devolveu o link de pagamento');
  return { url: r.url, referencia: r.slug || null };
}

// Confirma na InfinitePay se o pagamento existe e foi pago (o webhook deles não tem assinatura).
export async function confirmar({ order_nsu, transaction_nsu, slug }) {
  if (!order_nsu || !transaction_nsu || !slug) return null;
  const r = await chamar(`${API}/payment_check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: handle(), order_nsu: String(order_nsu), transaction_nsu: String(transaction_nsu), slug: String(slug) }),
  }, 'InfinitePay');
  if (!r?.success) return null;
  return {
    pedido_id: String(order_nsu), pago: !!r.paid, id: String(transaction_nsu),
    valor: Number(r.paid_amount ?? r.amount) / 100, valorCobrado: Number(r.amount) / 100,
    forma: r.capture_method === 'pix' ? '17' : '03', parcelas: r.installments, status: r.paid ? 'approved' : 'pending',
  };
}
