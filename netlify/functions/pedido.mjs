// GET /api/pedido?id=...&t=...  — situação do pedido para a página "Seu pedido" (precisa do token secreto do link).
// Se o cliente voltou do InfinitePay com os dados do pagamento, confirma na hora (caso o aviso automático atrase).
import { db } from './_lib/db.mjs';
import { confirmarRetorno } from './_lib/pagamento.mjs';
import { registrarPagamento } from './_lib/fluxo.mjs';
import { json, erro } from './_lib/util.mjs';

export function visaoPublica(p) {
  return {
    numero: p.numero, status: p.status, criado_em: p.criado_em, pago_em: p.pago_em || null,
    itens: p.itens.map(({ nome, quantidade, preco }) => ({ nome, quantidade, preco })),
    subtotal: p.subtotal, frete: { nome: p.frete?.nome, preco: p.frete?.preco, prazo: p.frete?.prazo, local: !!p.frete?.local }, total: p.total,
    cliente: { nome: p.cliente?.nome }, endereco: { cidade: p.endereco?.cidade, uf: p.endereco?.uf },
    rastreio: p.rastreio || null, nf_danfe_url: p.nf_danfe_url || null,
    pagamento_url: p.status === 'aguardando_pagamento' ? p.pagamento_url : null,
    demo: p.pagamento_provedor === 'demo',
  };
}

export default async (req) => {
  const u = new URL(req.url);
  const id = u.searchParams.get('id'), t = u.searchParams.get('t');
  let p = id ? await db().obterPedido(id) : null;
  if (!p || !t || p.token !== t) return erro('Pedido não encontrado.', 404);
  if (p.status === 'aguardando_pagamento' && u.searchParams.get('transaction_nsu')) {
    try {
      const pg = await confirmarRetorno(u.searchParams);
      if (pg && pg.pedido_id === p.id) { await registrarPagamento(pg); p = await db().obterPedido(id); }
    } catch (e) { console.error('confirmar retorno', e); }
  }
  return json(visaoPublica(p));
};
export const config = { path: '/api/pedido' };
