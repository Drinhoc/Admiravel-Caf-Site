// Banco de verdade (Postgres): cria as tabelas, o catálogo inicial, o login do painel e as fotos.
// Roda só com TEST_DATABASE_URL apontando para um banco de teste (ele é APAGADO a cada rodada).
// Ex.: TEST_DATABASE_URL=postgres://postgres@localhost/admiravel_teste npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const pular = !URL_TESTE && 'defina TEST_DATABASE_URL para testar com Postgres';
let mod, admin, foto, banco;

const chamar = async (acao, dados = {}, passe) => {
  const r = await admin(new Request('https://loja/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', ...(passe ? { authorization: `Bearer ${passe}` } : {}) }, body: JSON.stringify({ acao, ...dados }) }));
  return { status: r.status, d: await r.json() };
};

before(async () => {
  if (pular) return;
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: URL_TESTE });
  await c.connect(); await c.query('drop schema public cascade; create schema public;'); await c.end();
  Object.assign(process.env, { DATABASE_URL: URL_TESTE, ADMIN_EMAIL: 'Dono@Admiravel.com, drinho@exemplo.com', ADMIN_SENHA: 'cafe-teste-2026' });
  mod = await import('../netlify/functions/_lib/db.mjs');
  admin = (await import('../netlify/functions/admin.mjs')).default;
  foto = (await import('../netlify/functions/foto.mjs')).default;
  banco = mod.db();
});
after(async () => { await banco?.encerrar?.(); });

test('cria tabelas e catálogo inicial sozinho', { skip: pular }, async () => {
  await banco.pronto();
  await banco.pronto(); // segunda vez não faz nada
  const ps = await banco.listarProdutos({ ativos: false });
  assert.equal(ps.length, 7);
  assert.equal(typeof ps[0].embalagens[0].preco, 'number');
  const a = await banco.ajustes();
  assert.equal(a.destaque_id, '11111111-1111-4111-8111-000000000001');
  assert.equal(typeof a.frete_gratis_acima, 'number');
});

test('login do painel pelas variáveis, troca de senha derruba o passe antigo', { skip: pular }, async () => {
  assert.equal((await chamar('entrar', { email: 'dono@admiravel.com', senha: 'errada123' })).status, 401);
  const ok = await chamar('entrar', { email: ' DONO@admiravel.com ', senha: 'cafe-teste-2026' });
  assert.equal(ok.status, 200);
  assert.equal(ok.d.email, 'dono@admiravel.com');
  assert.equal((await chamar('sessao', {}, ok.d.passe)).d.email, 'dono@admiravel.com');
  assert.equal((await chamar('produtos', {}, 'passe-falso.abc')).status, 401);

  assert.equal((await chamar('trocar_senha', { atual: 'errada', nova: 'nova-senha-boa' }, ok.d.passe)).status, 401);
  assert.equal((await chamar('trocar_senha', { atual: 'cafe-teste-2026', nova: '123' }, ok.d.passe)).status, 422);
  const novo = await chamar('trocar_senha', { atual: 'cafe-teste-2026', nova: 'nova-senha-boa' }, ok.d.passe);
  assert.equal(novo.status, 200);
  assert.equal((await chamar('sessao', {}, ok.d.passe)).status, 401, 'passe antigo deixou de valer');
  assert.equal((await chamar('sessao', {}, novo.d.passe)).status, 200);
  assert.equal((await chamar('entrar', { email: 'dono@admiravel.com', senha: 'nova-senha-boa' })).status, 200);
  // o outro admin segue com a senha das variáveis
  assert.equal((await chamar('entrar', { email: 'drinho@exemplo.com', senha: 'cafe-teste-2026' })).status, 200);
});

test('trocar ADMIN_SENHA no Railway redefine a senha (emergência)', { skip: pular }, async () => {
  await banco.encerrar();
  process.env.ADMIN_SENHA = 'outra-senha-2026';
  mod.usarBanco(null); banco = mod.db();
  await banco.pronto();
  assert.equal((await chamar('entrar', { email: 'dono@admiravel.com', senha: 'nova-senha-boa' })).status, 401);
  assert.equal((await chamar('entrar', { email: 'dono@admiravel.com', senha: 'outra-senha-2026' })).status, 200);
  // reiniciar com a mesma variável não mexe em senha trocada depois
  const s = await chamar('entrar', { email: 'dono@admiravel.com', senha: 'outra-senha-2026' });
  await chamar('trocar_senha', { atual: 'outra-senha-2026', nova: 'escolhida-pelo-dono' }, s.d.passe);
  await banco.encerrar(); mod.usarBanco(null); banco = mod.db(); await banco.pronto();
  assert.equal((await chamar('entrar', { email: 'dono@admiravel.com', senha: 'escolhida-pelo-dono' })).status, 200);
});

test('produtos, destaque, fotos e eventos pelo painel', { skip: pular }, async () => {
  const { d: { passe } } = await chamar('entrar', { email: 'drinho@exemplo.com', senha: 'outra-senha-2026' });
  const f = await chamar('enviar_foto', { tipo: 'image/webp', base64: Buffer.from([9, 8, 7]).toString('base64') }, passe);
  assert.equal(f.status, 200);
  assert.equal((await chamar('enviar_foto', { tipo: 'text/html', base64: 'PGgxPg==' }, passe)).status, 415);
  const servida = await foto(new Request('https://loja/' + f.d.url));
  assert.deepEqual([...new Uint8Array(await servida.arrayBuffer())], [9, 8, 7]);

  const novo = await chamar('salvar_produto', { produto: { nome: 'Teste', slug: 'teste', ativo: true, notas: ['mel'], fotos: [f.d.url], embalagens: [{ id: 'e1', nome: 'Lata', preco: 1, estoque_grao: 1 }], campo_que_nao_existe: 1 } }, passe);
  assert.equal(novo.status, 200, JSON.stringify(novo.d));
  assert.deepEqual(novo.d.fotos, [f.d.url]);
  assert.equal((await chamar('salvar_produto', { produto: { nome: 'Teste', slug: 'teste', embalagens: [] } }, passe)).status, 409);
  const editado = await chamar('salvar_produto', { produto: { ...novo.d, preco_ignorado: 2, selo: 'Novo' } }, passe);
  assert.equal(editado.d.selo, 'Novo');
  assert.equal((await chamar('salvar_ajustes', { ajustes: { destaque_id: novo.d.id } }, passe)).d.destaque_id, novo.d.id);
  await chamar('excluir_produto', { id: novo.d.id }, passe);
  assert.equal((await chamar('ajustes', {}, passe)).d.destaque_id, null, 'excluir o produto tira o destaque');

  await banco.salvarContatoEvento({ nome: 'Ana', whatsapp: '19999999999', tipo: 'Casamento' });
  const cs = (await chamar('contatos', {}, passe)).d;
  assert.equal(cs[0].nome, 'Ana');
  await chamar('marcar_contato', { id: cs[0].id, respondido: true }, passe);
  assert.equal((await chamar('contatos', {}, passe)).d[0].respondido, true);
});

test('no Railway, sem InfinitePay ligada, ninguém paga de mentira', { skip: pular }, async () => {
  const demoPagar = (await import('../netlify/functions/demo-pagar.mjs')).default;
  const checkout = (await import('../netlify/functions/checkout.mjs')).default;
  assert.equal((await demoPagar(new Request('https://loja/api/demo-pagar', { method: 'POST', body: '{"id":"x"}' }))).status, 404);
  const r = await checkout(new Request('https://loja/api/checkout', { method: 'POST', body: '{"itens":[]}' }));
  assert.equal(r.status, 503);
});

test('pedido: criar, travar status, histórico, estoque e fila da faxina', { skip: pular }, async () => {
  const [p] = await banco.listarProdutos();
  const emb = p.embalagens[0];
  const ped = await banco.criarPedido({ cliente: { nome: 'Bia' }, endereco: { cep: '13480000' }, itens: [{ produto_id: p.id, embalagem_id: emb.id, moagem: 'grao', quantidade: 2, preco: emb.preco, nome: p.nome }], subtotal: 10, frete: { nome: 'PAC', preco: 5 }, total: 15 });
  assert.ok(ped.numero >= 1001);
  assert.equal(ped.status, 'aguardando_pagamento');
  assert.equal(typeof ped.total, 'number');
  assert.equal(await banco.atualizarPedido(ped.id, { status: 'enviado' }, { seStatus: ['pago'] }), null);
  const pago = await banco.atualizarPedido(ped.id, { status: 'pago', avisos: { novo: true } }, { seStatus: ['aguardando_pagamento'] });
  assert.equal(pago.status, 'pago');
  await banco.registrar(ped.id, 'Pagamento aprovado');
  assert.equal((await banco.obterPedido(ped.id)).historico.at(-1).msg, 'Pagamento aprovado');
  await banco.baixarEstoque(pago.itens);
  const depois = (await banco.produtosPorIds([p.id]))[0].embalagens[0];
  assert.equal(depois.estoque_grao, Math.max(0, (emb.estoque_grao || 0) - 2));
  assert.ok((await banco.pedidosEmAndamento()).some((x) => x.id === ped.id));
  assert.equal(await banco.contarParaEnviar(), 1);
  assert.equal((await banco.listarPedidos('enviar'))[0].id, ped.id);
  assert.equal(await banco.obterPedido('nao-e-uuid'), null);
});
