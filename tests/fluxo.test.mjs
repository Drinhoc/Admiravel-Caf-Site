// Testa o caminho inteiro sem internet: checkout → InfinitePay → webhook → Notaas → Melhor Envio → avisos.
// Todas as chamadas externas são simuladas (fetch falso), e o banco é o de memória.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bancoMemoria, usarBanco } from '../netlify/functions/_lib/db.mjs';
import checkout from '../netlify/functions/checkout.mjs';
import webhookPagamento from '../netlify/functions/webhook-pagamento.mjs';
import webhookNF from '../netlify/functions/webhook-nf.mjs';
import faxina from '../netlify/functions/faxina.mjs';
import painel from '../netlify/functions/painel.mjs';
import { processarPedido } from '../netlify/functions/_lib/fluxo.mjs';

const SEED = JSON.parse(readFileSync(new URL('../site/data/produtos-demo.json', import.meta.url)));
const CHAVE = '35251162774762000100550010000000011000000011';
const BASE = 'https://loja.teste';

let banco, chamadas, cenario;

// ---------- fetch falso ----------
const resp = (body, status = 200) => new Response(body == null ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  const corpo = opts.body ? JSON.parse(opts.body) : null;
  chamadas.push({ url, corpo, headers: opts.headers || {} });
  if (url.includes('viacep.com.br')) return resp({ ibge: '3550308' });
  if (url.endsWith('/links')) return resp({ url: 'https://checkout.infinitepay.io/admiravel/abc', slug: 'abc' });
  if (url.endsWith('/payment_check')) return resp(cenario.pagamento);
  if (url.includes('/me/shipment/calculate')) return resp([{ id: 1, name: 'PAC', company: { name: 'Correios' }, price: '21.50', delivery_time: 6, packages: [{ dimensions: { height: 12, width: 16, length: 20 }, weight: 0.65 }] }, { id: 2, name: 'SEDEX', company: { name: 'Correios' }, price: '34.90', delivery_time: 2, packages: [] }]);
  if (url.includes('/nfe/emitir')) return cenario.nfEmitir ? cenario.nfEmitir() : resp({ invoiceId: 'inv_1', status: 'queued' });
  if (url.includes('/invoices/')) return resp(cenario.nfStatus);
  if (url.includes('/me/cart')) return cenario.meCart ? cenario.meCart() : resp({ id: 'me-ord-1' });
  if (url.includes('/me/shipment/checkout') || url.includes('/me/shipment/generate')) return resp({});
  if (url.includes('/me/shipment/print')) return resp({ url: 'https://melhorenvio.com.br/imprimir/xyz' });
  if (url.includes('/me/orders/')) return resp({ tracking: 'QB000111222BR', status: 'posted' });
  if (url.includes('api.resend.com') || url.includes('api.telegram.org')) return resp({ ok: true });
  throw new Error('URL não simulada no teste: ' + url);
};
const de = (trecho) => chamadas.filter((c) => c.url.includes(trecho));

const req = (path, body, headers = {}) => new Request(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function configurar(extra = {}) {
  for (const k of Object.keys(process.env)) if (/^(INFINITEPAY|NOTAAS|NF_|ME_|FOCUS|MP_|PAGAMENTO|RESEND|AVISO|TELEGRAM|SUPABASE|SITE_URL)/.test(k)) delete process.env[k];
  Object.assign(process.env, {
    SITE_URL: BASE, INFINITEPAY_HANDLE: 'admiravel', NF_PROVEDOR: 'notaas', NOTAAS_API_KEY: 'nk_teste',
    ME_TOKEN: 'me_teste', RESEND_API_KEY: 're_teste', AVISO_EMAIL_PARA: 'dono@teste.com',
    TELEGRAM_BOT_TOKEN: 'tg', TELEGRAM_CHAT_ID: '1', ...extra,
  });
}

beforeEach(() => {
  banco = bancoMemoria(structuredClone(SEED));
  usarBanco(banco);
  chamadas = [];
  cenario = { nfStatus: { status: 'issued', chaveAcesso: CHAVE, numeroNfe: '1', pdfUrl: 'https://notaas/danfe.pdf' } };
  configurar();
});

async function fazerPedido({ cep = '01310100', freteNome = 'SEDEX', qtd = 2 } = {}) {
  const prod = SEED.produtos.find((p) => p.nome === 'Floral e Mel');
  const carrinho = [{ produto_id: prod.id, embalagem_id: prod.embalagens[0].id, moagem: 'grao', quantidade: qtd }];
  // frete escolhido = id que o servidor oferece
  const { opcoesFrete } = await import('../netlify/functions/_lib/frete.mjs');
  const { montarItens } = await import('../netlify/functions/_lib/precos.mjs');
  const ops = await opcoesFrete(cep, montarItens(carrinho, SEED.produtos), {});
  const frete = ops.find((o) => o.nome.includes(freteNome)) || ops[0];
  const r = await checkout(req('/api/checkout', {
    cliente: { nome: 'Maria Teste Silva', email: 'maria@exemplo.com', telefone: '(19) 99999-8888', cpf: '529.982.247-25' },
    endereco: { cep, rua: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: cep.startsWith('134') ? 'Limeira' : 'São Paulo', uf: 'SP' },
    itens: carrinho, frete_id: frete.id,
  }));
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return { ...d, prod, frete };
}

const pagar = async (pedido, extra = {}) => {
  const p = await banco.obterPedido(pedido.pedido_id);
  cenario.pagamento = { success: true, paid: true, amount: Math.round(p.total * 100), paid_amount: Math.round(p.total * 100), capture_method: 'pix', installments: 1, ...extra };
  return webhookPagamento(req('/api/webhook-pagamento?p=infinitepay', { order_nsu: pedido.pedido_id, transaction_nsu: 'tx-1', invoice_slug: 'abc', amount: 1 }));
};

// ================= testes =================

test('checkout cria o pedido e o link do InfinitePay com preços do servidor', async () => {
  const d = await fazerPedido();
  assert.match(d.url, /checkout\.infinitepay\.io/);
  const link = de('/links')[0].corpo;
  assert.equal(link.handle, 'admiravel');
  assert.equal(link.order_nsu, d.pedido_id);
  assert.equal(link.items[0].price, 6800); // R$ 68 em centavos, vindo do catálogo
  assert.equal(link.items[0].quantity, 2);
  assert.match(link.items.at(-1).description, /Frete/);
  assert.equal(link.webhook_url, `${BASE}/api/webhook-pagamento?p=infinitepay`);
  const p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.status, 'aguardando_pagamento');
  assert.equal(p.endereco.ibge, '3550308');
  assert.equal(p.total, 68 * 2 + 34.9);
});

test('checkout recusa CPF inválido e o campo-armadilha de robô', async () => {
  const r = await checkout(req('/api/checkout', { cliente: { nome: 'A B', email: 'a@b.com', telefone: '19999998888', cpf: '111.111.111-11' }, endereco: {}, itens: [] }));
  assert.equal(r.status, 422);
  assert.match((await r.json()).erro, /CPF/);
  const r2 = await checkout(req('/api/checkout', { site: 'http://spam' }));
  assert.equal(r2.status, 400);
});

test('caminho feliz: pago → NF autorizada → etiqueta com a chave → avisos', async () => {
  const d = await fazerPedido();
  const estoqueAntes = banco.produtos.find((p) => p.id === d.prod.id).embalagens[0].estoque_grao;
  const autorizada = cenario.nfStatus;
  cenario.nfStatus = { status: 'processing' }; // SEFAZ ainda autorizando
  const r = await pagar(d);
  assert.equal(r.status, 200);

  let p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.status, 'pago');
  assert.equal(p.pagamento_forma, '17');
  assert.equal(p.nf_status, 'processando'); // Notaas é assíncrono
  assert.equal(p.nf_ref, 'inv_1');
  assert.equal(p.envio_status, 'aguardando_nf');
  assert.equal(banco.produtos.find((x) => x.id === d.prod.id).embalagens[0].estoque_grao, estoqueAntes - 2);

  const nota = de('/nfe/emitir')[0];
  assert.equal(nota.headers['x-api-key'], 'nk_teste');
  assert.equal(nota.corpo.dest.endereco.codigoMunicipio, '3550308');
  assert.equal(nota.corpo.referencia, `pedido-${p.numero}`);
  // aviso de pedido novo para o dono (Telegram + e-mail) e e-mail de confirmação ao cliente
  assert.ok(de('api.telegram.org').length >= 1);
  assert.ok(de('api.resend.com').some((c) => c.corpo.to[0] === 'maria@exemplo.com'));

  // webhook da Notaas: nota autorizada
  cenario.nfStatus = autorizada;
  const wr = await webhookNF(req('/api/webhook-nf?p=notaas', { event: 'invoice.issued', invoiceId: 'inv_1' }));
  assert.equal(wr.status, 200);
  p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.nf_status, 'autorizada');
  assert.equal(p.nf_chave, CHAVE);
  assert.equal(p.envio_status, 'gerada');
  assert.equal(p.etiqueta_url, 'https://melhorenvio.com.br/imprimir/xyz');
  const cart = de('/me/cart')[0].corpo;
  assert.equal(cart.options.invoice.key, CHAVE);
  assert.equal(cart.options.non_commercial, false);
  assert.equal(cart.service, 2); // SEDEX
  assert.equal(cart.to.document, '52998224725');
  assert.ok(p.avisos.pronto, 'dono avisado de que está pronto para despachar');
  assert.ok(de('/me/cart')[0].headers['User-Agent']);
});

test('webhook repetido não processa duas vezes nem baixa estoque de novo', async () => {
  const d = await fazerPedido();
  await pagar(d);
  const est = banco.produtos.find((p) => p.id === d.prod.id).embalagens[0].estoque_grao;
  const r = await pagar(d);
  assert.equal((await r.json()).repetido, true);
  assert.equal(banco.produtos.find((p) => p.id === d.prod.id).embalagens[0].estoque_grao, est);
  assert.equal(de('/nfe/emitir').length, 1);
});

test('aviso falso (InfinitePay diz que não existe) é ignorado', async () => {
  const d = await fazerPedido();
  cenario.pagamento = { success: false };
  await webhookPagamento(req('/api/webhook-pagamento?p=infinitepay', { order_nsu: d.pedido_id, transaction_nsu: 'falso', invoice_slug: 'x' }));
  assert.equal((await banco.obterPedido(d.pedido_id)).status, 'aguardando_pagamento');
});

test('valor pago menor que o total não libera o pedido e avisa o dono', async () => {
  const d = await fazerPedido();
  await pagar(d, { paid_amount: 100 });
  const p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.status, 'aguardando_pagamento');
  assert.match(p.pagamento_alerta, /menor/);
});

test('sem NF automática: MEI vende com declaração de conteúdo e a etiqueta sai na hora', async () => {
  configurar({ NF_PROVEDOR: '', NOTAAS_API_KEY: '' });
  const d = await fazerPedido();
  await pagar(d);
  const p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.nf_status, 'dispensada');
  assert.equal(p.envio_status, 'gerada');
  const cart = de('/me/cart')[0].corpo;
  assert.equal(cart.options.non_commercial, true);
  assert.equal(cart.options.invoice, undefined);
  assert.equal(de('/nfe/emitir').length, 0);
  assert.ok(p.avisos.pronto);
});

test('entrega local em Limeira não gera etiqueta', async () => {
  const d = await fazerPedido({ cep: '13480000', freteNome: 'Limeira' });
  assert.ok(d.frete.local, 'opção local oferecida');
  configurar({ NF_PROVEDOR: '', NOTAAS_API_KEY: '' });
  await pagar(d);
  const p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.envio_status, 'entrega_local');
  assert.equal(de('/me/cart').length, 0);
  assert.ok(p.avisos.pronto);
});

test('NF recusada: marca erro, avisa uma vez e tenta de novo depois', async () => {
  const d = await fazerPedido();
  cenario.nfEmitir = () => resp({ message: 'CPF do destinatário inválido' }, 400);
  await pagar(d);
  let p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.nf_status, 'erro');
  assert.equal(p.tentativas_nf, 1);
  assert.equal(p.envio_status, 'aguardando_nf');
  assert.match(p.avisos.problema, /CPF/);
  const avisosAntes = de('api.telegram.org').length;
  await processarPedido(d.pedido_id); // mesmo erro: não repete o aviso
  p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.tentativas_nf, 2);
  assert.equal(de('api.telegram.org').length, avisosAntes);

  cenario.nfEmitir = null; // Notaas voltou
  await processarPedido(d.pedido_id); // 3ª tentativa: emite
  await processarPedido(d.pedido_id); // consulta: autorizada → etiqueta
  p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.nf_status, 'autorizada');
  assert.equal(p.envio_status, 'gerada');
});

test('etiqueta com erro (sem saldo) e botão "Tentar de novo" do painel', async () => {
  configurar({ NF_PROVEDOR: '', NOTAAS_API_KEY: '' });
  const d = await fazerPedido();
  cenario.meCart = () => resp({ message: 'Saldo insuficiente' }, 422);
  await pagar(d);
  let p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.envio_status, 'erro');
  assert.match(p.envio_erro, /Saldo/);
  cenario.meCart = null;
  const r = await painel(req('/api/painel', { acao: 'tentar_de_novo', pedido_id: d.pedido_id }, { authorization: 'Bearer demo' }));
  assert.equal(r.status, 200);
  p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.envio_status, 'gerada');
});

test('painel: sem login não entra; marcar enviado pega o rastreio e avisa o cliente', async () => {
  configurar({ NF_PROVEDOR: '', NOTAAS_API_KEY: '' });
  const d = await fazerPedido();
  await pagar(d);
  const negado = await painel(req('/api/painel', { acao: 'marcar_enviado', pedido_id: d.pedido_id }, { authorization: 'Bearer errado' }));
  assert.equal(negado.status, 401);
  const r = await painel(req('/api/painel', { acao: 'marcar_enviado', pedido_id: d.pedido_id }, { authorization: 'Bearer demo' }));
  const { pedido } = await r.json();
  assert.equal(pedido.status, 'enviado');
  assert.equal(pedido.rastreio, 'QB000111222BR'); // veio do Melhor Envio
  assert.ok(de('api.resend.com').some((c) => c.corpo.to[0] === 'maria@exemplo.com' && /saiu para entrega/.test(c.corpo.subject) && c.corpo.html.includes('QB000111222BR')));
});

test('faxina das 15 min termina pedidos parados (NF que ficou processando)', async () => {
  const d = await fazerPedido();
  cenario.nfStatus = { status: 'processing' };
  await pagar(d);
  assert.equal((await banco.obterPedido(d.pedido_id)).nf_status, 'processando');
  cenario.nfStatus = { status: 'issued', chaveAcesso: CHAVE, numeroNfe: '7' };
  await faxina(new Request(BASE + '/.netlify/functions/faxina', { method: 'POST' }));
  const p = await banco.obterPedido(d.pedido_id);
  assert.equal(p.nf_status, 'autorizada');
  assert.equal(p.envio_status, 'gerada');
});

test('estorno depois de pago gera alerta para o dono', async () => {
  const d = await fazerPedido();
  await pagar(d);
  cenario.pagamento = { success: true, paid: false, amount: 1, capture_method: 'pix' };
  const { registrarPagamento } = await import('../netlify/functions/_lib/fluxo.mjs');
  await registrarPagamento({ pedido_id: d.pedido_id, pago: false, status: 'refunded' });
  assert.match((await banco.obterPedido(d.pedido_id)).pagamento_alerta, /estornado/);
});
