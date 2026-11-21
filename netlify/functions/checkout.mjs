// POST /api/checkout — cria o pedido (preços e frete recalculados no servidor) e devolve o link de pagamento.
import { db } from './_lib/db.mjs';
import { json, erro, lerJson, cpfValido, emailValido, soDigitos, limparTexto, siteUrl, chamar } from './_lib/util.mjs';
import { montarItens, subtotalDe } from './_lib/precos.mjs';
import { opcoesFrete } from './_lib/frete.mjs';
import { criarCobranca, provedorPagamento } from './_lib/pagamento.mjs';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

async function codigoIbge(cep) {
  try { return (await chamar(`https://viacep.com.br/ws/${cep}/json/`, { timeout: 3000 }, 'ViaCEP'))?.ibge || null; } catch { return null; }
}

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const c = await lerJson(req);
  if (!c) return erro('Pedido inválido');
  if (c.site) return erro('Pedido inválido'); // campo-armadilha contra robôs

  const cliente = {
    nome: limparTexto(c.cliente?.nome, 120), email: limparTexto(c.cliente?.email, 160).toLowerCase(),
    telefone: soDigitos(c.cliente?.telefone).slice(0, 13), cpf: soDigitos(c.cliente?.cpf),
  };
  const e = c.endereco || {};
  const endereco = {
    cep: soDigitos(e.cep), rua: limparTexto(e.rua, 120), numero: limparTexto(e.numero, 20), complemento: limparTexto(e.complemento, 60),
    bairro: limparTexto(e.bairro, 80), cidade: limparTexto(e.cidade, 80), uf: limparTexto(e.uf, 2).toUpperCase(),
  };
  const faltando = [];
  if (cliente.nome.split(' ').filter(Boolean).length < 2) faltando.push('nome e sobrenome');
  if (!emailValido(cliente.email)) faltando.push('e-mail');
  if (cliente.telefone.length < 10) faltando.push('WhatsApp com DDD');
  if (!cpfValido(cliente.cpf)) faltando.push('CPF válido');
  if (endereco.cep.length !== 8) faltando.push('CEP');
  if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || !UFS.includes(endereco.uf)) faltando.push('endereço completo');
  if (faltando.length) return erro(`Confira: ${faltando.join(', ')}.`, 422);

  try {
    const banco = db();
    const ids = [...new Set((c.itens || []).map((i) => i.produto_id))];
    const itens = montarItens(c.itens, await banco.produtosPorIds(ids));
    const opcoes = await opcoesFrete(endereco.cep, itens, await banco.ajustes());
    const frete = opcoes.find((o) => o.id === c.frete_id);
    if (!frete) return erro('Escolha o frete de novo (os valores mudaram).', 409);
    endereco.ibge = await codigoIbge(endereco.cep);

    const subtotal = subtotalDe(itens);
    const total = Math.round((subtotal + Number(frete.preco)) * 100) / 100;
    const pedido = await banco.criarPedido({
      status: 'aguardando_pagamento', cliente, endereco, itens, subtotal, total,
      frete: { id: frete.id, servico: frete.servico || null, nome: frete.nome, empresa: frete.empresa, preco: frete.preco, prazo: frete.prazo_texto, local: !!frete.local, volumes: frete.volumes || [] },
      observacao: limparTexto(c.observacao, 300), nf_status: 'pendente', envio_status: 'pendente',
      pagamento_provedor: provedorPagamento() || 'demo',
    });
    const cobranca = await criarCobranca(pedido, siteUrl(req));
    await banco.atualizarPedido(pedido.id, { pagamento_url: cobranca.url, pagamento_ref: cobranca.referencia });
    return json({ pedido_id: pedido.id, numero: pedido.numero, token: pedido.token, url: cobranca.url });
  } catch (err) {
    console.error(err);
    return erro(err.status ? 'O pagamento está fora do ar agora. Tente em alguns minutos ou chame no WhatsApp.' : err.message, err.status ? 502 : 422);
  }
};
export const config = { path: '/api/checkout' };
