// O coração da loja: o que acontece depois que o pagamento é confirmado.
//   pago → avisa o dono e o cliente → emite NF → gera etiqueta (com a chave da NF) → avisa "pronto para despachar"
// Cada passo grava o resultado no pedido. Se algo falhar, o pedido fica marcado com o erro,
// o dono recebe um aviso, e o passo é tentado de novo (a cada 15 min, até 3 vezes) ou pelo botão "Tentar de novo" do painel.
import { db } from './db.mjs';
import { provedorNF, emitirNF, consultarNF } from './nf.mjs';
import { meAtivo, gerarEtiqueta } from './melhorenvio.mjs';
import { avisarDono, avisarCliente } from './avisos.mjs';
import { agoraIso, env } from './util.mjs';
import { LOJA } from './loja.mjs';

const MAX_TENTATIVAS = 3;
const base = () => (env('SITE_URL') || env('URL') || 'http://localhost:8888').replace(/\/$/, '');

async function salvar(p, patch) {
  const novo = await db().atualizarPedido(p.id, patch);
  Object.assign(p, patch, novo || {});
  return p;
}
const log = (p, msg) => db().registrar(p.id, msg).catch(() => {});

// Recebe um pagamento já conferido na API do provedor.
export async function registrarPagamento(pg) {
  if (!pg?.pedido_id) return { ok: false, motivo: 'sem pedido' };
  const p = await db().obterPedido(pg.pedido_id);
  if (!p) return { ok: false, motivo: 'pedido não encontrado' };

  if (!pg.pago) {
    if (['refunded', 'charged_back', 'cancelled'].includes(pg.status) && ['pago', 'enviado'].includes(p.status)) {
      await salvar(p, { pagamento_alerta: `Pagamento ${pg.status === 'charged_back' ? 'contestado (chargeback)' : 'estornado/cancelado'} no provedor.` });
      await log(p, `Pagamento mudou para ${pg.status}`);
      await avisarDono('problema', p).catch(() => {});
    }
    return { ok: true, pago: false };
  }

  if (pg.valor + 0.05 < Number(p.total)) {
    await log(p, `Pagamento ${pg.id} com valor ${pg.valor} menor que o total ${p.total}. Não liberado.`);
    if (!p.pagamento_alerta) {
      await salvar(p, { pagamento_alerta: `Valor pago (R$ ${pg.valor}) menor que o total do pedido. Confira antes de enviar.` });
      await avisarDono('problema', p).catch(() => {});
    }
    return { ok: false, motivo: 'valor divergente' };
  }

  const local = !!p.frete?.local;
  const atualizado = await db().atualizarPedido(p.id, {
    status: 'pago', pago_em: agoraIso(), pagamento_id: String(pg.id), pagamento_forma: pg.forma || '99',
    nf_status: provedorNF() ? 'pendente' : (LOJA.envioSemNF === 'declaracao' ? 'dispensada' : 'manual'),
    envio_status: local ? 'entrega_local' : (meAtivo() ? 'pendente' : 'manual'),
  }, { seStatus: ['aguardando_pagamento', 'expirado'] });
  if (!atualizado) return { ok: true, repetido: true }; // já processado antes (webhook repetido)

  await db().baixarEstoque(atualizado.itens);
  await log(atualizado, `Pagamento confirmado (${pg.forma === '17' ? 'Pix' : 'cartão'}${pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ''}).`);
  await processarPedido(atualizado.id);
  return { ok: true, pago: true };
}

export async function processarPedido(id) {
  const p = await db().obterPedido(id);
  if (!p || p.status !== 'pago') return p;
  p.avisos = p.avisos || {};

  // 1) Avisos de pedido novo
  if (!p.avisos.novo) {
    const r = await avisarDono('novo', p).catch((e) => ({ usados: [], falhas: [e.message] }));
    await avisarCliente('confirmado', p, base()).catch(() => {});
    await salvar(p, { avisos: { ...p.avisos, novo: agoraIso() } });
    await log(p, `Aviso de pedido novo enviado${r.usados?.length ? ' por ' + r.usados.join(' e ') : ' (nenhum canal configurado)'}.`);
  }

  // 2) Nota fiscal
  const tentNF = Number(p.tentativas_nf || 0);
  if (p.nf_status === 'pendente' || (p.nf_status === 'erro' && tentNF < MAX_TENTATIVAS)) {
    try {
      const r = await emitirNF(p);
      await salvar(p, {
        nf_status: r.status, nf_ref: r.ref || p.nf_ref, nf_erro: r.erro || null, tentativas_nf: tentNF + (r.status === 'erro' ? 1 : 0),
        ...(r.status === 'autorizada' ? { nf_chave: r.chave, nf_numero: r.numero, nf_danfe_url: r.danfe, nf_xml_url: r.xml } : {}),
      });
      await log(p, r.status === 'erro' ? `NF recusada: ${r.erro}` : `NF enviada (${r.status}).`);
    } catch (e) {
      await salvar(p, { nf_status: 'erro', nf_erro: e.message, tentativas_nf: tentNF + 1 });
      await log(p, `Erro ao emitir NF: ${e.message}`);
    }
  }
  if (p.nf_status === 'processando') {
    try {
      const r = await consultarNF(p);
      if (r.status !== 'processando') {
        await salvar(p, {
          nf_status: r.status === 'cancelada' ? 'erro' : r.status, nf_erro: r.erro || (r.status === 'cancelada' ? 'NF cancelada' : null),
          ...(r.status === 'autorizada' ? { nf_chave: r.chave, nf_numero: r.numero, nf_danfe_url: r.danfe, nf_xml_url: r.xml } : {}),
          ...(r.status === 'erro' ? { tentativas_nf: tentNF + 1 } : {}),
        });
        await log(p, r.status === 'autorizada' ? `NF autorizada (nº ${r.numero || '?'}).` : `NF: ${r.erro || r.status}`);
      }
    } catch (e) { await log(p, `Não consegui consultar a NF agora: ${e.message}`); }
  }

  // 3) Etiqueta (precisa da chave da NF: automática ou colada no painel)
  const nfOk = ['autorizada', 'dispensada'].includes(p.nf_status) || (p.nf_status === 'manual' && p.nf_chave);
  const tentEnv = Number(p.tentativas_envio || 0);
  if (['pendente', 'aguardando_nf'].includes(p.envio_status) || (p.envio_status === 'erro' && tentEnv < MAX_TENTATIVAS)) {
    if (!nfOk) {
      if (p.envio_status !== 'aguardando_nf' && p.envio_status !== 'erro') await salvar(p, { envio_status: 'aguardando_nf' });
    } else {
      try {
        const r = await gerarEtiqueta(p, p.nf_chave);
        await salvar(p, { envio_status: r.comprada ? 'gerada' : 'no_carrinho', envio_me_id: r.envioId, etiqueta_url: r.etiquetaUrl, envio_erro: null });
        await log(p, r.comprada ? 'Etiqueta comprada e gerada no Melhor Envio.' : 'Envio criado no carrinho do Melhor Envio (falta pagar a etiqueta lá).');
      } catch (e) {
        await salvar(p, { envio_status: 'erro', envio_erro: e.message, tentativas_envio: tentEnv + 1 });
        await log(p, `Erro ao gerar etiqueta: ${e.message}`);
      }
    }
  }

  // 4) Pronto para despachar? (etiqueta pronta e NF resolvida)
  const envioOk = ['gerada', 'no_carrinho', 'entrega_local', 'manual'].includes(p.envio_status);
  const nfPronta = ['autorizada', 'dispensada'].includes(p.nf_status) || !!p.nf_chave
    || (p.nf_status === 'manual' && ['entrega_local', 'manual'].includes(p.envio_status));
  if (envioOk && nfPronta && !p.avisos.pronto) {
    await avisarDono('pronto', p).catch(() => {});
    await salvar(p, { avisos: { ...p.avisos, pronto: agoraIso() } });
    await log(p, 'Aviso "pronto para despachar" enviado.');
  }

  // 5) Problemas: avisa uma vez por erro diferente
  const problema = [p.nf_status === 'erro' && p.nf_erro, p.envio_status === 'erro' && p.envio_erro].filter(Boolean).join(' | ');
  if (problema && p.avisos.problema !== problema) {
    await avisarDono('problema', p).catch(() => {});
    await salvar(p, { avisos: { ...p.avisos, problema } });
  }
  return p;
}
