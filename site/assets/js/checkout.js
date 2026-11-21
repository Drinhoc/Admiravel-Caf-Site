// Checkout em uma página: dados → CEP/frete → resumo → pagamento (InfinitePay / Mercado Pago).
import { iniciarComum, itensDetalhados, renderItemLinha, brl, esc, modo, api, catalogo, raiz, limparCarrinho, $, $$ } from './loja.js';
import * as demo from './demo-db.js';

const so = (s) => String(s || '').replace(/\D+/g, '');
let opcoes = [], itens = [];

function cpfValido(cpf) {
  const c = so(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +c[t]) return false; }
  return true;
}
const mascara = {
  cpf: (v) => so(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
  telefone: (v) => { const d = so(v).slice(0, 11); return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (m, a, b, c) => `(${a}) ${b}${c ? '-' + c : ''}`); },
  cep: (v) => so(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
};

const subtotal = () => itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
function totais() {
  const f = opcoes.find((o) => o.id === $('input[name=frete]:checked')?.value);
  $('#v-sub').textContent = brl(subtotal());
  $('#v-frete').textContent = f ? (f.preco === 0 ? 'Grátis' : brl(f.preco)) : '—';
  $('#v-total').textContent = brl(subtotal() + (f?.preco || 0));
}

// frete de demonstração (mesma regra do servidor)
async function freteDemo(cep) {
  const kg = itens.reduce((s, i) => s + (Number(i.e.peso_g) || 300) * i.quantidade, 0) / 1000;
  let ops = [
    { id: 'me-1', nome: 'PAC', empresa: 'Correios', preco: Math.round((19.9 + kg * 4.5) * 100) / 100, prazo_texto: '7 dias úteis' },
    { id: 'me-2', nome: 'SEDEX', empresa: 'Correios', preco: Math.round((29.9 + kg * 7.9) * 100) / 100, prazo_texto: '3 dias úteis' },
  ];
  const { ajustes } = await catalogo();
  const meta = Number(ajustes?.frete_gratis_acima || 0);
  if (meta > 0 && subtotal() >= meta) ops[0] = { ...ops[0], preco_original: ops[0].preco, preco: 0, gratis: true };
  const n = Number(cep);
  if (n >= 13480000 && n <= 13489999) ops.unshift({ id: 'local', nome: 'Entrega local em Limeira', empresa: 'Admirável Café', preco: 7, prazo_texto: '1 a 4 dias úteis', local: true });
  return ops;
}

async function buscarCep() {
  const cep = so($('#cep').value);
  if (cep.length !== 8) return;
  const box = $('#fretes');
  box.innerHTML = '<p class="nota">Calculando o frete…</p>';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
    if (!r.erro) {
      if (!$('#rua').value) $('#rua').value = r.logradouro || '';
      if (!$('#bairro').value) $('#bairro').value = r.bairro || '';
      $('#cidade').value = r.localidade || $('#cidade').value;
      $('#uf').value = r.uf || $('#uf').value;
      (r.logradouro ? $('#numero') : $('#rua')).focus();
    }
  } catch {}
  try {
    opcoes = (await modo()) === 'api'
      ? (await api('frete', { cep, itens: itens.map(({ produto_id, embalagem_id, moagem, quantidade }) => ({ produto_id, embalagem_id, moagem, quantidade })) })).opcoes
      : await freteDemo(cep);
    box.innerHTML = opcoes.map((o, i) => `<label class="frete"><input type="radio" name="frete" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''}>
      <span><b>${esc(o.nome)}${o.empresa && !o.local ? ` · ${esc(o.empresa)}` : ''}</b><small>${esc(o.prazo_texto || '')}${o.local ? ' · combinamos a entrega pelo WhatsApp' : ''}</small></span>
      <span class="v">${o.preco === 0 ? `<s class="nota">${brl(o.preco_original)}</s> Grátis` : brl(o.preco)}</span></label>`).join('');
  } catch (e) {
    opcoes = [];
    box.innerHTML = `<p class="msg-erro">${esc(e.message)}</p>`;
  }
  totais();
}

function dados() {
  const f = new FormData($('#form'));
  const v = (k) => String(f.get(k) || '').trim();
  return {
    cliente: { nome: v('nome'), email: v('email'), telefone: so(v('telefone')), cpf: so(v('cpf')) },
    endereco: { cep: so(v('cep')), rua: v('rua'), numero: v('numero'), complemento: v('complemento'), bairro: v('bairro'), cidade: v('cidade'), uf: v('uf').toUpperCase() },
    observacao: v('observacao'), site: v('site'),
    frete_id: $('input[name=frete]:checked')?.value,
    itens: itens.map(({ produto_id, embalagem_id, moagem, quantidade }) => ({ produto_id, embalagem_id, moagem, quantidade })),
  };
}

function validar(d) {
  const erros = [];
  const marca = (id, ok) => { $('#' + id).setAttribute('aria-invalid', String(!ok)); if (!ok) erros.push(id); };
  marca('nome', d.cliente.nome.split(' ').filter(Boolean).length >= 2);
  marca('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.cliente.email));
  marca('telefone', d.cliente.telefone.length >= 10);
  marca('cpf', cpfValido(d.cliente.cpf));
  marca('cep', d.endereco.cep.length === 8);
  ['rua', 'numero', 'bairro', 'cidade'].forEach((k) => marca(k, !!d.endereco[k]));
  marca('uf', /^[A-Z]{2}$/.test(d.endereco.uf));
  if (erros.length) { $('#' + erros[0]).focus(); return 'Confira os campos marcados em vermelho.'; }
  if (!d.frete_id) return 'Escolha a forma de entrega.';
  return '';
}

async function pedidoDemo(d) {
  const f = opcoes.find((o) => o.id === d.frete_id);
  return demo.alterar((db) => {
    const p = {
      id: crypto.randomUUID(), token: crypto.randomUUID(), numero: ++db.numero, criado_em: new Date().toISOString(),
      status: 'aguardando_pagamento', cliente: d.cliente, endereco: d.endereco, observacao: d.observacao,
      itens: itens.map((i) => ({ produto_id: i.produto_id, embalagem_id: i.embalagem_id, moagem: i.moagem, nome: `${i.p.nome} · ${i.op}`, quantidade: i.quantidade, preco: i.preco })),
      subtotal: subtotal(), frete: { nome: f.nome, preco: f.preco, prazo: f.prazo_texto, local: !!f.local }, total: Math.round((subtotal() + f.preco) * 100) / 100,
      nf_status: 'pendente', envio_status: 'pendente', pagamento_provedor: 'demo', avisos: {}, historico: [{ em: new Date().toISOString(), msg: 'Pedido criado (demonstração).' }],
    };
    db.pedidos.unshift(p);
    return { url: `${raiz}pedido.html?id=${p.id}&t=${p.token}&demo=1` };
  });
}

async function enviar(ev) {
  ev.preventDefault();
  const d = dados();
  const msg = validar(d);
  $('#erro').textContent = msg;
  if (msg) return;
  const b = $('#pagar'); b.disabled = true; b.textContent = 'Abrindo o pagamento…';
  try { localStorage.setItem('adm_cliente', JSON.stringify({ ...d.cliente, ...d.endereco })); } catch {}
  try {
    const r = (await modo()) === 'api' ? await api('checkout', d) : await pedidoDemo(d);
    limparCarrinho();
    location.href = r.url;
  } catch (e) {
    $('#erro').textContent = e.message;
    b.disabled = false; b.textContent = 'Ir para o pagamento';
    if (/frete/i.test(e.message)) buscarCep();
  }
}

async function iniciar() {
  await iniciarComum();
  if ((await modo()) === 'demo') $('#aviso-demo').hidden = false;
  itens = await itensDetalhados();
  if (!itens.length) {
    $('#form').innerHTML = `<div class="vazio" style="grid-column:1/-1"><p>Seu carrinho está vazio.</p><a class="btn ink" href="index.html#cafes">Escolher café</a></div>`;
    return;
  }
  $('#itens').innerHTML = (await Promise.all(itens.map((i) => renderItemLinha(i, false)))).join('');
  totais();
  try {
    const salvo = JSON.parse(localStorage.getItem('adm_cliente') || 'null');
    if (salvo) for (const [k, v] of Object.entries(salvo)) { const el = $('#' + k); if (el && v) el.value = mascara[k] ? mascara[k](v) : v; }
  } catch {}
  for (const k of Object.keys(mascara)) $('#' + k).addEventListener('input', (e) => { e.target.value = mascara[k](e.target.value); if (k === 'cep' && so(e.target.value).length === 8) buscarCep(); });
  $('#fretes').addEventListener('change', totais);
  $('#form').addEventListener('submit', enviar);
  $$('input').forEach((i) => i.addEventListener('input', () => i.removeAttribute('aria-invalid')));
  if (so($('#cep').value).length === 8) buscarCep();
}
iniciar();
