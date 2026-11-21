// Regras pequenas: preço/promoção, estoque, CPF, rateio do frete na NF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { precoEfetivo, montarItens, subtotalDe } from '../netlify/functions/_lib/precos.mjs';
import { cpfValido } from '../netlify/functions/_lib/util.mjs';
import { ratearFrete } from '../netlify/functions/_lib/nf.mjs';

const { produtos } = JSON.parse(readFileSync(new URL('../site/data/produtos-demo.json', import.meta.url)));
const floral = structuredClone(produtos.find((p) => p.nome === 'Floral e Mel'));

test('promoção vale até a data e depois volta ao preço normal', () => {
  const e = { preco: 68, preco_promo: 59.9, promo_ate: '2026-12-01' };
  assert.equal(precoEfetivo(e, new Date('2026-11-30T12:00:00-03:00')), 59.9);
  assert.equal(precoEfetivo(e, new Date('2026-12-03T12:00:00-03:00')), 68);
  assert.equal(precoEfetivo({ preco: 68, preco_promo: 80 }), 68); // "promo" maior que o preço é ignorada
  assert.equal(precoEfetivo({ preco: 68, preco_promo: null }), 68);
});

test('carrinho usa o preço do servidor, não o que veio do navegador', () => {
  const itens = montarItens([{ produto_id: floral.id, embalagem_id: floral.embalagens[0].id, moagem: 'grao', quantidade: 2, preco: 1 }], [floral]);
  assert.equal(itens[0].preco, 68);
  assert.equal(subtotalDe(itens), 136);
});

test('não vende mais do que o estoque nem produto desligado', () => {
  const sem = structuredClone(floral); sem.embalagens[0].estoque_moido = 0;
  assert.throws(() => montarItens([{ produto_id: sem.id, embalagem_id: sem.embalagens[0].id, moagem: 'moido', quantidade: 1 }], [sem]));
  const pouco = structuredClone(floral); pouco.embalagens[0].estoque_grao = 1;
  assert.throws(() => montarItens([{ produto_id: pouco.id, embalagem_id: pouco.embalagens[0].id, moagem: 'grao', quantidade: 2 }], [pouco]));
  const off = { ...structuredClone(floral), ativo: false };
  assert.throws(() => montarItens([{ produto_id: off.id, embalagem_id: off.embalagens[0].id, moagem: 'grao', quantidade: 1 }], [off]), /não está mais à venda/);
  assert.throws(() => montarItens([], [floral]), /vazio/);
});

test('CPF', () => {
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(!cpfValido('111.111.111-11'));
  assert.ok(!cpfValido('529.982.247-26'));
});

test('rateio do frete entre os itens da NF fecha no centavo', () => {
  const partes = ratearFrete([{ preco: 68, quantidade: 1 }, { preco: 42, quantidade: 2 }, { preco: 39, quantidade: 1 }], 23.47);
  assert.equal(Math.round(partes.reduce((s, x) => s + x, 0) * 100), 2347);
  assert.deepEqual(ratearFrete([{ preco: 10, quantidade: 1 }], 0), [0]);
});
