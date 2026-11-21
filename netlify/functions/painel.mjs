// POST /api/painel — ações do painel que mexem com pedidos e serviços externos (só para quem está logado como dono).
// { acao: 'tentar_de_novo' | 'informar_nf' | 'marcar_enviado' | 'marcar_entregue' | 'cancelar' | 'gerar_etiqueta', pedido_id, ... }
import { db } from './_lib/db.mjs';
import { processarPedido } from './_lib/fluxo.mjs';
import { avisarCliente } from './_lib/avisos.mjs';
import { rastreio as rastreioME, meAtivo } from './_lib/melhorenvio.mjs';
import { json, erro, lerJson, soDigitos, limparTexto, siteUrl } from './_lib/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = await db().verificarAdmin(token);
  if (!admin) return erro('Faça login de novo.', 401);
  const c = await lerJson(req);
  const banco = db();
  const p = c?.pedido_id ? await banco.obterPedido(c.pedido_id) : null;
  if (!p) return erro('Pedido não encontrado.', 404);
  const log = (m) => banco.registrar(p.id, `${m} (${admin})`);

  switch (c.acao) {
    case 'tentar_de_novo': {
      const patch = {};
      if (p.nf_status === 'erro') Object.assign(patch, { nf_status: 'pendente', tentativas_nf: 0 });
      if (p.envio_status === 'erro') Object.assign(patch, { envio_status: 'pendente', tentativas_envio: 0 });
      if (Object.keys(patch).length) await banco.atualizarPedido(p.id, patch);
      await log('Pediu para tentar de novo');
      await processarPedido(p.id);
      break;
    }
    case 'informar_nf': {
      const chave = soDigitos(c.chave);
      if (chave.length !== 44) return erro('A chave da NF tem 44 números.', 422);
      await banco.atualizarPedido(p.id, { nf_chave: chave, nf_status: p.nf_status === 'autorizada' ? 'autorizada' : 'manual', ...(p.envio_status === 'aguardando_nf' ? { envio_status: 'pendente' } : {}) });
      await log('Informou a chave da NF');
      await processarPedido(p.id);
      break;
    }
    case 'marcar_enviado': {
      let cod = limparTexto(c.rastreio, 40).toUpperCase();
      if (!cod && p.envio_me_id && meAtivo()) { try { cod = (await rastreioME(p.envio_me_id)).codigo || ''; } catch {} }
      const novo = await banco.atualizarPedido(p.id, { status: 'enviado', enviado_em: new Date().toISOString(), rastreio: cod || null }, { seStatus: ['pago'] });
      if (!novo) return erro('Esse pedido não está como "pago".', 409);
      await log(`Marcou como enviado${cod ? ' · rastreio ' + cod : ''}`);
      await avisarCliente('enviado', novo, siteUrl(req)).catch(() => {});
      break;
    }
    case 'marcar_entregue': {
      await banco.atualizarPedido(p.id, { status: 'entregue' }, { seStatus: ['enviado', 'pago'] });
      await log('Marcou como entregue');
      break;
    }
    case 'cancelar': {
      await banco.atualizarPedido(p.id, { status: 'cancelado', motivo_cancelamento: limparTexto(c.motivo, 200) });
      await log('Cancelou o pedido (estorne o pagamento no app do InfinitePay/Mercado Pago, se foi pago)');
      break;
    }
    default:
      return erro('Ação desconhecida.', 400);
  }
  return json({ ok: true, pedido: await banco.obterPedido(p.id) });
};
export const config = { path: '/api/painel' };
