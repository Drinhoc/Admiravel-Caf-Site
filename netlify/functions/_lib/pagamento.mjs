// Escolhe o meio de pagamento pela variável PAGAMENTO_PROVEDOR (infinitepay | mercadopago).
// Sem nenhum configurado, o site roda em "modo demonstração" (pagamento simulado).
import { env } from './util.mjs';
import * as ip from './infinitepay.mjs';
import * as mp from './mercadopago.mjs';

export function provedorPagamento() {
  const p = env('PAGAMENTO_PROVEDOR', 'infinitepay').toLowerCase();
  if (p === 'mercadopago' && mp.mpAtivo()) return 'mercadopago';
  if (p === 'infinitepay' && ip.ipAtivo()) return 'infinitepay';
  return null;
}

export async function criarCobranca(pedido, base) {
  const p = provedorPagamento();
  if (p === 'infinitepay') return ip.criarCobranca(pedido, base);
  if (p === 'mercadopago') return mp.criarCobranca(pedido, base);
  return { url: `${base}/pedido.html?id=${pedido.id}&t=${pedido.token}&demo=1`, referencia: 'demo' };
}

// Lê a notificação recebida e devolve o pagamento JÁ CONFERIDO na API do provedor
// { pedido_id, pago, id, valor, forma, status } — ou null se não for um pagamento válido.
export async function lerNotificacao(req, corpo, url) {
  const p = provedorPagamento();
  if (p === 'infinitepay') {
    return ip.confirmar({ order_nsu: corpo?.order_nsu, transaction_nsu: corpo?.transaction_nsu, slug: corpo?.invoice_slug || corpo?.slug });
  }
  if (p === 'mercadopago') {
    const tipo = corpo?.type || url.searchParams.get('type') || url.searchParams.get('topic');
    const id = corpo?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
    if (tipo !== 'payment' || !id) return null;
    if (!mp.assinaturaValida(req, String(id))) return null;
    const pg = await mp.consultarPagamento(id);
    return { pedido_id: pg.pedido_id, pago: pg.status === 'approved', id: pg.id, valor: pg.valor, forma: mp.formaPagamentoNF(pg.tipo), status: pg.status, parcelas: pg.parcelas };
  }
  return null;
}

// Volta do cliente (redirect) com os dados do pagamento: confirma direto, caso o webhook atrase.
export async function confirmarRetorno(params) {
  if (provedorPagamento() !== 'infinitepay') return null;
  return ip.confirmar({ order_nsu: params.get('order_nsu'), transaction_nsu: params.get('transaction_nsu'), slug: params.get('slug') });
}
