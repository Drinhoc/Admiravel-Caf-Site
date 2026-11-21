// POST /api/webhook-pagamento — aviso do InfinitePay ou Mercado Pago de que um pagamento mudou.
// Nunca confiamos no conteúdo do aviso: o pagamento é sempre conferido na API do provedor.
import { lerNotificacao } from './_lib/pagamento.mjs';
import { registrarPagamento } from './_lib/fluxo.mjs';
import { json } from './_lib/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const url = new URL(req.url);
  let corpo = null;
  try { corpo = await req.json(); } catch {}
  try {
    const pg = await lerNotificacao(req, corpo, url);
    if (!pg) return json({ ok: true, ignorado: true });
    const r = await registrarPagamento(pg);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('webhook-pagamento', e);
    // 500 faz o provedor reenviar o aviso mais tarde
    return json({ ok: false }, 500);
  }
};
export const config = { path: '/api/webhook-pagamento' };
