// Núcleo da loja no navegador: dados do catálogo, carrinho, cabeçalho, gaveta do carrinho e avisos.
import * as demo from './demo-db.js';

export const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const raiz = new URL('../../', import.meta.url).href; // raiz do site (funciona em subpastas também)

// ---------- modo: servidor de verdade (/api) ou demonstração no navegador ----------
let _modo;
export async function modo() {
  if (_modo) return _modo;
  try {
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(raiz + 'api/config', { signal: ctrl.signal });
    _modo = r.ok && (r.headers.get('content-type') || '').includes('json') ? 'api' : 'demo';
  } catch { _modo = 'demo'; }
  return _modo;
}
export async function api(caminho, corpo) {
  const r = await fetch(raiz + 'api/' + caminho, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Algo deu errado. Tente de novo.');
  return d;
}

// ---------- catálogo ----------
let _cat;
export async function catalogo() {
  if (_cat) return _cat;
  if ((await modo()) === 'api') _cat = await api('produtos');
  else { const d = await demo.carregar(); _cat = { produtos: d.produtos.filter((p) => p.ativo).sort((a, b) => a.ordem - b.ordem), ajustes: d.ajustes }; }
  return _cat;
}
export function precoEfetivo(e) {
  const p = Number(e.preco), promo = Number(e.preco_promo);
  const ate = e.promo_ate ? new Date(e.promo_ate + 'T23:59:59-03:00') : null;
  return promo > 0 && promo < p && (!ate || ate >= new Date()) ? promo : p;
}
export const emPromo = (e) => precoEfetivo(e) < Number(e.preco);
export const estoqueDe = (e, moagem) => Number(moagem === 'moido' ? e.estoque_moido : e.estoque_grao) || 0;
export const esgotado = (p) => (p.embalagens || []).every((e) => estoqueDe(e, 'grao') + (p.tem_moagem === false ? 0 : estoqueDe(e, 'moido')) <= 0);
export const menorPreco = (p) => Math.min(...(p.embalagens || []).map(precoEfetivo));

// cor do produto → texto claro ou escuro
export function cores(hex) {
  const h = String(hex || '#72765B').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { bg: '#' + h, fg: L > 0.55 ? '#1F2A33' : '#F6F1E6', claro: L > 0.55 };
}

// foto com reserva (se a do Wix/Supabase falhar, usa a cópia local; se não houver, placa com o nome)
export function foto(p, i = 0, cls = '') {
  const src = p.fotos?.[i] || p.fotos_local?.[i];
  const reserva = p.fotos_local?.[i] || '';
  if (!src) return `<div class="sem-foto ${cls}"><span>${esc(p.nome)}</span></div>`;
  return `<img class="${cls}" src="${esc(src.startsWith('http') || src.startsWith('data:') ? src : raiz + src)}" ${reserva ? `data-reserva="${esc(raiz + reserva)}"` : ''} data-nome="${esc(p.nome)}" alt="${esc(p.nome)}" loading="lazy" decoding="async">`;
}
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.reserva && img.src !== img.dataset.reserva) { img.src = img.dataset.reserva; img.removeAttribute('data-reserva'); return; }
  if (img.dataset.nome) { const d = document.createElement('div'); d.className = 'sem-foto'; d.innerHTML = `<span>${esc(img.dataset.nome)}</span>`; img.replaceWith(d); }
}, true);

// ---------- carrinho ----------
const CK = 'adm_carrinho';
export function carrinho() { try { return JSON.parse(localStorage.getItem(CK)) || []; } catch { return []; } }
function salvarCarrinho(c) { try { localStorage.setItem(CK, JSON.stringify(c)); } catch {} atualizarContador(); window.dispatchEvent(new Event('carrinho')); }
export function adicionar(item) {
  const c = carrinho();
  const ex = c.find((i) => i.produto_id === item.produto_id && i.embalagem_id === item.embalagem_id && i.moagem === item.moagem);
  if (ex) ex.quantidade += item.quantidade; else c.push(item);
  salvarCarrinho(c);
}
export function mudarQtd(idx, qtd) { const c = carrinho(); if (!c[idx]) return; if (qtd <= 0) c.splice(idx, 1); else c[idx].quantidade = qtd; salvarCarrinho(c); }
export function limparCarrinho() { salvarCarrinho([]); }
export async function itensDetalhados() {
  const { produtos } = await catalogo();
  return carrinho().map((c, idx) => {
    const p = produtos.find((x) => x.id === c.produto_id);
    const e = p?.embalagens?.find((x) => x.id === c.embalagem_id);
    if (!p || !e) return null;
    const max = p.tem_moagem === false ? estoqueDe(e, 'grao') : estoqueDe(e, c.moagem);
    return { ...c, idx, p, e, preco: precoEfetivo(e), max, op: [e.nome, p.tem_moagem === false ? '' : c.moagem === 'moido' ? 'moído' : 'em grão'].filter(Boolean).join(' · ') };
  }).filter(Boolean);
}
export const qtdTotal = () => carrinho().reduce((s, i) => s + i.quantidade, 0);

// ---------- interface comum (cabeçalho, gaveta, toast) ----------
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600);
}
function atualizarContador(pulsar) {
  const n = qtdTotal();
  $$('.cart-btn .n').forEach((el) => { el.textContent = n; el.classList.toggle('on', n > 0); });
  if (pulsar) $$('.cart-btn').forEach((b) => { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); });
}

let veu, gaveta;
function montarGaveta() {
  veu = document.createElement('div'); veu.className = 'veu';
  gaveta = document.createElement('aside'); gaveta.className = 'gaveta'; gaveta.setAttribute('aria-label', 'Carrinho'); gaveta.setAttribute('aria-hidden', 'true');
  gaveta.innerHTML = `<header><h2>Seu pedido</h2><button class="fechar" aria-label="Fechar carrinho">×</button></header><div class="corpo"></div><div class="pe"></div>`;
  document.body.append(veu, gaveta);
  veu.addEventListener('click', fecharTudo);
  $('.fechar', gaveta).addEventListener('click', fecharTudo);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharTudo());
  gaveta.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    const idx = Number(b.dataset.idx);
    const atual = carrinho()[idx]?.quantidade || 0;
    if (b.dataset.q === 'rm') mudarQtd(idx, 0);
    else if (b.dataset.q === '+' && atual < Number(b.dataset.max)) mudarQtd(idx, atual + 1);
    else if (b.dataset.q === '+') toast('Esse é todo o estoque que temos.');
    else mudarQtd(idx, atual - 1);
    renderGaveta();
  });
}
export function fecharTudo() {
  veu?.classList.remove('on'); gaveta?.classList.remove('on'); gaveta?.setAttribute('aria-hidden', 'true');
  $$('.modal.on').forEach((m) => m.classList.remove('on'));
  document.body.style.overflow = '';
}
export function abrirVeu() { veu.classList.add('on'); document.body.style.overflow = 'hidden'; }

export async function renderItemLinha(i, controles = true) {
  const { bg } = cores(i.p.cor);
  const fi = Math.max(0, i.p.embalagens.indexOf(i.e));
  const idx = i.p.fotos?.[fi] || i.p.fotos_local?.[fi] ? fi : 0;
  return `<div class="citem"><div class="ft" style="--bg:${bg}">${i.p.fotos?.[idx] || i.p.fotos_local?.[idx] ? foto(i.p, idx) : `<span>${esc(i.p.nome)}</span>`}</div>
    <div><div class="nm">${esc(i.p.nome)}</div><div class="op">${esc(i.op)}${controles ? '' : ` · ${i.quantidade}×`}</div>
    ${controles ? `<div class="qtd"><button data-q="-" data-idx="${i.idx}" aria-label="Diminuir">−</button><output>${i.quantidade}</output><button data-q="+" data-idx="${i.idx}" data-max="${i.max}" aria-label="Aumentar">+</button></div>` : ''}</div>
    <div class="vl">${brl(i.preco * i.quantidade)}${controles ? `<button class="rm" data-q="rm" data-idx="${i.idx}">remover</button>` : ''}</div></div>`;
}

export async function renderGaveta() {
  const itens = await itensDetalhados();
  const corpo = $('.corpo', gaveta), pe = $('.pe', gaveta);
  if (!itens.length) {
    corpo.innerHTML = `<div class="vazio"><p>Seu carrinho está vazio.</p><a class="btn ink" href="${raiz}index.html#cafes">Escolher café</a></div>`;
    pe.innerHTML = ''; return;
  }
  corpo.innerHTML = (await Promise.all(itens.map((i) => renderItemLinha(i)))).join('');
  const sub = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const { ajustes } = await catalogo();
  const meta = Number(ajustes?.frete_gratis_acima || 0);
  const barra = meta > 0 ? `<div class="barra-gratis">${sub >= meta ? 'Você ganhou frete grátis (PAC).' : `Faltam ${brl(meta - sub)} para o frete grátis.`}<i><s style="width:${Math.min(100, (sub / meta) * 100)}%"></s></i></div>` : '';
  pe.innerHTML = `${barra}<div class="linha-total"><span>Subtotal</span><b>${brl(sub)}</b></div><p class="nota">O frete é calculado no próximo passo, pelo CEP.</p><a class="btn mustard" href="${raiz}checkout.html">Finalizar compra</a>`;
}
export async function abrirCarrinho() {
  await renderGaveta();
  abrirVeu(); gaveta.classList.add('on'); gaveta.setAttribute('aria-hidden', 'false');
  $('.fechar', gaveta).focus();
}

export async function iniciarComum() {
  montarGaveta();
  atualizarContador();
  $$('.cart-btn').forEach((b) => b.addEventListener('click', abrirCarrinho));
  window.addEventListener('storage', (e) => e.key === CK && atualizarContador());
  try {
    const { ajustes } = await catalogo();
    $$('.aviso-topo').forEach((el) => { el.textContent = ajustes?.aviso_topo || ''; });
  } catch {}
  if ((await modo()) === 'demo') document.documentElement.dataset.demo = '1';
}
export function avisarAdicionado(nome) { atualizarContador(true); toast(`${nome} foi para o carrinho.`); }
export { raiz };
