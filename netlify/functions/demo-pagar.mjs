// POST /api/demo-pagar {id, t} — SÓ no modo demonstração (sem meio de pagamento configurado): simula o pagamento aprovado.
import { db } from './_lib/db.mjs';
import { provedorPagamento } from './_lib/pagamento.mjs';
import { registrarPagamento } from './_lib/fluxo.mjs';
import { json, erro, lerJson } from './_lib/util.mjs';
import { visaoPublica } from './pedido.mjs';

export default async (req) => {
  if (provedorPagamento()) return erro('Indisponível', 404);
  const c = await lerJson(req);
  const p = c?.id ? await db().obterPedido(c.id) : null;
  if (!p || p.token !== c.t || p.pagamento_provedor !== 'demo') return erro('Pedido não encontrado.', 404);
  await registrarPagamento({ pedido_id: p.id, pago: true, id: `demo-${Date.now()}`, valor: p.total, forma: c.forma === 'cartao' ? '03' : '17', status: 'approved' });
  return json(visaoPublica(await db().obterPedido(p.id)));
};
export const config = { path: '/api/demo-pagar' };
