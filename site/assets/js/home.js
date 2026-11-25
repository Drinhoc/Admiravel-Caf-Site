// Página inicial: no topo, combos (abre ao tocar) de um lado e os cafés do outro; abaixo, um bloco de cor por café com compra direta.
import { iniciarComum, catalogo, brl, esc, foto, cores, menorPreco, esgotado, emPromo, precoEfetivo, abrirVeu, fecharTudo, $, $$ } from './loja.js';
import { caixaCompra, ligarCaixa } from './compra.js';

const PERFIL = [['docura', 'Doçura'], ['acidez', 'Acidez'], ['corpo', 'Corpo'], ['intensidade', 'Intensidade']];
const FICHA = [['variedade', 'Variedade'], ['processo', 'Processo'], ['altitude', 'Altitude'], ['origem', 'Origem'], ['produtor', 'Produtor'], ['torra', 'Torra']];

const linhaPrecos = (p) => p.embalagens.map((e) =>
  `${esc(e.nome.replace(/ 250g$/i, ''))} 250g ${emPromo(e) ? `<span class="preco-de">${brl(e.preco)}</span>` : ''}<b>${brl(precoEfetivo(e))}</b>`).join(' · ');

function cartao(p) {
  const c = cores(p.cor);
  const curto = p.embalagens.map((e) => `<span>${esc(e.nome.replace(/ 250g$/i, ''))} <b>${brl(precoEfetivo(e))}</b></span>`).join('');
  return `<a class="card${c.claro ? ' claro' : ''}" href="#${esc(p.slug)}" style="--bg:${c.bg};--fg:${c.fg}">
    <p class="kicker">${esc(p.selo || 'Café especial')}</p>
    <h3>${esc(p.nome)}</h3>
    <p class="notes">${esc(p.frase)}</p>
    <div class="tin">${foto(p)}</div>
    <div class="foot">
      <span class="precos">${esgotado(p) ? 'Esgotado no momento' : curto}</span>
      <span class="btn mustard comprar">${esgotado(p) ? 'Ver o café' : 'Comprar'}</span>
    </div>
  </a>`;
}

function bloco(p) {
  const c = cores(p.cor);
  const fotos = p.fotos?.length ? p.fotos : p.fotos_local || [];
  const thumbs = fotos.length > 1 ? `<div class="thumbs">${fotos.map((_, i) => `<button type="button" data-f="${i}" aria-pressed="${i === 0}" aria-label="Foto ${i + 1}">${foto(p, i)}</button>`).join('')}</div>` : '';
  const perfil = p.perfil ? `<h3>Perfil</h3><div class="bars">${PERFIL.map(([k, n]) => `<div class="bar"><span>${n}</span><i>${[1, 2, 3, 4, 5].map((v) => `<s class="${v <= (p.perfil[k] || 0) ? 'on' : ''}"></s>`).join('')}</i></div>`).join('')}</div>` : '';
  const ficha = p.ficha ? FICHA.filter(([k]) => p.ficha[k]).map(([k, n]) => `<div><dt>${n}</dt><dd>${esc(p.ficha[k])}</dd></div>`).join('') : '';
  return `<section class="coffee${c.claro ? ' claro' : ''}" id="${esc(p.slug)}" style="--bg:${c.bg};--fg:${c.fg}">
    <div class="wrap">
      <div class="media"><div class="tin">${foto(p)}</div>${thumbs}</div>
      <div>
        ${p.selo ? `<span class="selo">${esc(p.selo)}</span>` : '<p class="kicker">Café especial</p>'}
        <h2>${esc(p.nome)}</h2>
        <p class="price">${linhaPrecos(p)}</p>
        ${p.notas?.length ? `<div class="notes">${p.notas.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
        ${caixaCompra(p)}
        <h3>Como é o sabor</h3>
        <p class="taste">${esc(p.descricao)}</p>
        ${perfil}
        ${ficha ? `<h3>Ficha</h3><dl class="spec">${ficha}</dl>` : ''}
      </div>
    </div>
  </section>`;
}

function itemCombo(p) {
  const c = cores(p.cor);
  const esg = esgotado(p);
  const temPromo = p.embalagens.some(emPromo);
  return `<button type="button" class="prod${esg ? ' esgotado' : ''}" data-abrir="${esc(p.id)}" style="--bg:${c.bg}">
    <div class="ph">${foto(p)}</div>
    ${esg ? '<span class="esg">Esgotado</span>' : p.selo ? `<span class="selo">${esc(p.selo)}</span>` : ''}
    <span class="n">${esc(p.nome)}</span>
    <span class="d">${esc(p.frase)}</span>
    <span class="p">${p.embalagens.length > 1 ? 'a partir de ' : ''}${brl(menorPreco(p))}${temPromo ? '<span class="tag-promo">Promoção</span>' : ''}</span>
    <span class="buyl">${esg ? 'Ver' : 'Comprar →'}</span>
  </button>`;
}

function abrirModal(p) {
  const m = $('.modal');
  const c = cores(p.cor);
  m.innerHTML = `<div class="ft" style="--bg:${c.bg}">${foto(p)}</div>
    <div class="tx"><button class="fechar" aria-label="Fechar">×</button>
      ${p.selo ? `<span class="selo">${esc(p.selo)}</span>` : '<p class="kicker" style="color:var(--mustard-deep)">Combos e edições</p>'}
      <h3>${esc(p.nome)}</h3><p class="lead" style="font-size:20px">${esc(p.descricao || p.frase)}</p>${caixaCompra(p)}</div>`;
  ligarCaixa($('.buybox', m), p);
  $('.fechar', m).addEventListener('click', fecharTudo);
  abrirVeu(); m.classList.add('on');
  $('.fechar', m).focus();
}

async function iniciar() {
  await iniciarComum();
  let dados;
  try { dados = await catalogo(); } catch { $('#cartoes').innerHTML = '<p class="nota">Não conseguimos carregar os cafés agora. Atualize a página ou chame no WhatsApp.</p>'; return; }
  const cafes = dados.produtos.filter((p) => p.tipo === 'cafe');
  const outros = dados.produtos.filter((p) => p.tipo !== 'cafe');
  $('#cartoes').innerHTML = cafes.map(cartao).join('');
  $('#blocos').innerHTML = cafes.map(bloco).join('');
  $('#combos-lista').innerHTML = outros.map(itemCombo).join('');
  if (!outros.length) { $('#combos').hidden = true; $('.portas').style.gridTemplateColumns = '1fr'; }
  else {
    const comFoto = outros.find((p) => (p.fotos?.length || p.fotos_local?.length)) || outros[0];
    $('#combos-foto').innerHTML = foto(comFoto);
    const disp = outros.filter((p) => !esgotado(p));
    $('#combos-resumo').textContent = `${outros.length} ${outros.length === 1 ? 'opção' : 'opções'}${disp.length ? ` · a partir de ${brl(Math.min(...disp.map(menorPreco)))}` : ''}`;
  }
  const botaoCombos = $('.abre-combos');
  const abrirCombos = (abrir) => {
    const painel = $('#combos-painel');
    const vai = abrir ?? painel.hidden;
    painel.hidden = !vai; botaoCombos.setAttribute('aria-expanded', String(vai));
    if (vai) painel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  botaoCombos.addEventListener('click', () => abrirCombos());
  $$('a[href$="#combos"]').forEach((el) => el.addEventListener('click', () => abrirCombos(true)));

  for (const p of cafes) {
    const sec = document.getElementById(p.slug);
    ligarCaixa($('.buybox', sec), p);
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      $('.media .tin', sec).innerHTML = foto(p, Number(b.dataset.f));
      $$('[data-f]', sec).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  $('#combos-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-abrir]'); if (!b) return;
    abrirModal(outros.find((p) => p.id === b.dataset.abrir));
  });
  // dados estruturados dos produtos (ajuda o Google a mostrar preço e estoque)
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify(dados.produtos.map((p) => ({
    '@context': 'https://schema.org', '@type': 'Product', name: p.nome, description: p.frase, image: p.fotos?.[0],
    brand: { '@type': 'Brand', name: 'Admirável Café' },
    offers: p.embalagens.map((e) => ({ '@type': 'Offer', priceCurrency: 'BRL', price: precoEfetivo(e), name: e.nome, availability: esgotado(p) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' })),
  })));
  document.head.append(ld);
  if (location.hash === '#combos') abrirCombos(true);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
iniciar();
