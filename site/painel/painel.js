// Painel do dono: pedidos, produtos, pedidos de eventos e ajustes.
import { criarStore } from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const quando = (iso) => {
  const d = new Date(iso), min = Math.round((Date.now() - d) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const raizSite = new URL('../', location.href).href;
const urlFoto = (u) => (!u ? '' : /^(https?:|data:)/.test(u) ? u : raizSite + u);

let S, filtro = 'enviar', produtos = [];

function aviso(msg) {
  const a = $('#aviso'); a.textContent = msg; a.classList.add('on');
  clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('on'), 2800);
}
function abrirFolha(html) {
  const f = $('#folha'); f.innerHTML = html; f.classList.add('on'); f.setAttribute('aria-hidden', 'false');
  $('#veu').classList.add('on'); document.body.style.overflow = 'hidden';
  f.scrollTop = 0; $('.x', f)?.focus();
}
function fecharFolha() {
  $('#folha').classList.remove('on'); $('#folha').setAttribute('aria-hidden', 'true');
  $('#veu').classList.remove('on'); document.body.style.overflow = '';
}
// Confirmação por dois toques (sem janelas do navegador): o 1º toque pede confirmação, o 2º executa.
function doisToques(botao, texto = 'Toque de novo para confirmar') {
  if (botao.dataset.armado) { clearTimeout(botao._t); delete botao.dataset.armado; botao.textContent = botao._orig; return true; }
  botao._orig = botao.textContent; botao.dataset.armado = '1'; botao.textContent = texto;
  botao._t = setTimeout(() => { delete botao.dataset.armado; botao.textContent = botao._orig; }, 4000);
  return false;
}
async function ocupado(botao, fn) {
  const t = botao?.textContent; if (botao) { botao.disabled = true; botao.textContent = 'Aguarde…'; }
  try { return await fn(); } catch (e) { aviso(e.message || 'Não deu certo.'); throw e; } finally { if (botao) { botao.disabled = false; botao.textContent = t; } }
}

// ================= PEDIDOS =================
function chipPedido(p) {
  if (p.status === 'aguardando_pagamento') return '<span class="chip cinza">Aguardando pagamento</span>';
  if (p.status === 'cancelado') return '<span class="chip vermelho">Cancelado</span>';
  if (p.status === 'enviado') return '<span class="chip azul">Enviado</span>';
  if (p.status === 'entregue') return '<span class="chip verde">Entregue</span>';
  if (p.status === 'expirado') return '<span class="chip cinza">Expirou</span>';
  if (p.nf_status === 'erro' || p.envio_status === 'erro' || p.pagamento_alerta) return '<span class="chip vermelho">Precisa de você</span>';
  if (p.nf_status === 'manual' && !p.nf_chave) return '<span class="chip ouro">Falta a NF</span>';
  if (['gerada', 'entrega_local', 'manual', 'no_carrinho'].includes(p.envio_status)) return '<span class="chip verde">Pronto para enviar</span>';
  return '<span class="chip ouro">Preparando etiqueta</span>';
}

async function carregarPedidos() {
  const lista = $('#lista-pedidos');
  lista.innerHTML = '<div class="vazio-painel">Carregando…</div>';
  try {
    const ps = await S.pedidos(filtro);
    lista.innerHTML = ps.length ? ps.map((p) => `<button class="ped" data-id="${esc(p.id)}">
      <span class="num">#${esc(p.numero)}</span>
      <span><span class="nm">${esc(p.cliente?.nome)}</span><br><span class="sub">${esc(p.frete?.local ? 'Entrega local · Limeira' : `${p.endereco?.cidade}/${p.endereco?.uf} · ${p.frete?.nome || ''}`)} · ${quando(p.criado_em)}</span><br>${chipPedido(p)}</span>
      <span class="vl">${brl(p.total)}<br><span class="sub">${p.itens.reduce((s, i) => s + i.quantidade, 0)} ${p.itens.length === 1 && p.itens[0].quantidade === 1 ? 'item' : 'itens'}</span></span></button>`).join('')
      : `<div class="vazio-painel">${filtro === 'enviar' ? 'Nenhum pedido para enviar agora. ☕' : 'Nenhum pedido aqui.'}</div>`;
    lista._pedidos = ps;
  } catch (e) { lista.innerHTML = `<div class="vazio-painel">Erro ao carregar: ${esc(e.message)}</div>`; }
  atualizarBolhas();
}
async function atualizarBolhas() {
  try { const n = await S.contarParaEnviar(); const b = $('#bolha-pedidos'); b.textContent = n; b.hidden = !n; } catch {}
}

function passo(estado, titulo, texto) { return `<div class="passo-p ${estado}"><i>${{ ok: '✓', esp: '…', err: '!' }[estado] || '·'}</i><div><b>${titulo}</b>${texto ? `<small>${texto}</small>` : ''}</div></div>`; }

function folhaPedido(p) {
  const fone = String(p.cliente?.telefone || '').replace(/\D/g, '');
  const e = p.endereco || {};
  const pago = ['pago', 'enviado', 'entregue'].includes(p.status);
  const nf = {
    autorizada: passo('ok', 'Nota fiscal emitida', `${p.nf_numero ? 'Nº ' + esc(p.nf_numero) + ' · ' : ''}${p.nf_danfe_url ? `<a href="${esc(p.nf_danfe_url)}" target="_blank" rel="noopener">abrir PDF</a>` : ''}`),
    dispensada: passo('ok', 'Sem nota fiscal', 'MEI vendendo para pessoa física: o envio vai com declaração de conteúdo.'),
    processando: passo('esp', 'Nota fiscal sendo autorizada', 'Leva de segundos a poucos minutos.'),
    pendente: passo('esp', 'Nota fiscal na fila', ''),
    erro: passo('err', 'A nota fiscal deu erro', esc(p.nf_erro || '')),
    manual: p.nf_chave ? passo('ok', 'Nota fiscal informada', `Chave ${esc(p.nf_chave)}`) : passo('esp', 'Emita a nota e cole a chave aqui', `<span style="display:flex;gap:8px;margin-top:8px"><input id="chave-nf" inputmode="numeric" placeholder="44 números da chave"><button class="bt" data-acao="informar_nf">Salvar</button></span>`),
  }[p.nf_status] || '';
  const etq = {
    gerada: passo('ok', 'Etiqueta pronta', p.etiqueta_url ? `<a href="${esc(p.etiqueta_url)}" target="_blank" rel="noopener">Imprimir etiqueta</a>` : 'Disponível no Melhor Envio.'),
    no_carrinho: passo('esp', 'Etiqueta no carrinho do Melhor Envio', 'Entre no Melhor Envio e pague a etiqueta para imprimir.'),
    entrega_local: passo('ok', 'Entrega local', `Combine com o cliente pelo WhatsApp.`),
    manual: passo('ok', 'Envio por sua conta', 'Melhor Envio não conectado: gere a etiqueta como já faz hoje.'),
    aguardando_nf: passo('esp', 'Etiqueta esperando a nota fiscal', ''),
    pendente: passo('esp', 'Etiqueta na fila', ''),
    erro: passo('err', 'A etiqueta deu erro', esc(p.envio_erro || '')),
  }[p.envio_status] || '';
  const enviado = ['enviado', 'entregue'].includes(p.status)
    ? passo('ok', p.status === 'entregue' ? 'Entregue' : 'Enviado', p.rastreio ? `Rastreio ${esc(p.rastreio)} · <a href="https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(p.rastreio)}" target="_blank" rel="noopener">acompanhar</a>` : '')
    : pago ? passo('', 'Despachar', 'Depois de postar, marque como enviado: o cliente recebe o rastreio por e-mail.') : '';
  const temErro = p.nf_status === 'erro' || p.envio_status === 'erro';

  return `<div class="fcab"><h2>Pedido #${esc(p.numero)}</h2><button class="x" aria-label="Fechar">×</button></div>
  <div class="fcorpo" data-id="${esc(p.id)}">
    <div>${chipPedido(p)} <span class="sub" style="color:var(--muted);font-size:13px">feito ${quando(p.criado_em)}</span></div>
    ${p.pagamento_alerta ? `<div class="bloco" style="background:#F8DAD5"><b>Atenção:</b> ${esc(p.pagamento_alerta)}</div>` : ''}
    <div class="bloco"><h3>Andamento</h3><div class="passos">
      ${passo(pago ? 'ok' : 'esp', pago ? 'Pagamento aprovado' : 'Aguardando pagamento', pago ? `${p.pagamento_forma === '17' ? 'Pix' : p.pagamento_forma === '03' ? 'Cartão de crédito' : ''}${p.pago_em ? ' · ' + quando(p.pago_em) : ''}` : 'O cliente ainda não pagou.')}
      ${pago ? nf + etq + enviado : ''}
    </div></div>
    <div class="botoes">
      ${p.etiqueta_url && p.status === 'pago' ? `<a class="bt ouro" href="${esc(p.etiqueta_url)}" target="_blank" rel="noopener">Imprimir etiqueta</a>` : ''}
      ${p.status === 'pago' ? '<button class="bt" data-acao="marcar_enviado">Marcar como enviado</button>' : ''}
      ${temErro && p.status === 'pago' ? '<button class="bt claro" data-acao="tentar_de_novo">Tentar de novo</button>' : ''}
      ${p.status === 'enviado' ? '<button class="bt claro" data-acao="marcar_entregue">Marcar como entregue</button>' : ''}
    </div>
    ${p.status === 'pago' ? '<label style="display:grid;gap:6px;font-size:13px;font-weight:700;color:var(--muted)">Código de rastreio (opcional — com o Melhor Envio ele vem sozinho)<input id="rastreio" placeholder="AA123456789BR"></label>' : ''}
    <div class="bloco"><h3>Cliente</h3>
      <div><b>${esc(p.cliente?.nome)}</b></div>
      <div class="botoes">${fone ? `<a class="bt claro" href="https://wa.me/55${fone}?text=${encodeURIComponent(`Oi, ${String(p.cliente?.nome || '').split(' ')[0]}! Aqui é da Admirável Café, sobre o seu pedido #${p.numero}.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="bt claro" href="mailto:${esc(p.cliente?.email)}">E-mail</a></div>
      <div class="linha"><span>CPF</span><b>${esc(p.cliente?.cpf)}</b></div>
    </div>
    <div class="bloco"><h3>Entrega</h3>
      <div>${esc(e.rua)}, ${esc(e.numero)}${e.complemento ? ' · ' + esc(e.complemento) : ''}<br>${esc(e.bairro)} · ${esc(e.cidade)}/${esc(e.uf)} · CEP ${esc(e.cep)}</div>
      <div class="linha"><span>${esc(p.frete?.nome)}${p.frete?.prazo ? ` (${esc(p.frete.prazo)})` : ''}</span><b>${p.frete?.preco ? brl(p.frete.preco) : 'Grátis'}</b></div>
      ${p.observacao ? `<div><b>Observação do cliente:</b> ${esc(p.observacao)}</div>` : ''}
    </div>
    <div class="bloco"><h3>Itens</h3>
      ${p.itens.map((i) => `<div class="linha"><span>${i.quantidade}× ${esc(i.nome)}</span><b>${brl(i.preco * i.quantidade)}</b></div>`).join('')}
      <div class="linha" style="border-top:1px solid #E3DCD1;padding-top:8px"><span>Total</span><b>${brl(p.total)}</b></div>
    </div>
    ${p.historico?.length ? `<details class="bloco"><summary><b>Histórico</b></summary><div class="hist">${p.historico.slice().reverse().map((h) => `<div>${new Date(h.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(h.msg)}</div>`).join('')}</div></details>` : ''}
    ${['pago', 'aguardando_pagamento'].includes(p.status) ? '<button class="bt perigo" data-acao="cancelar">Cancelar pedido</button>' : ''}
  </div>`;
}

async function acaoPedido(botao) {
  const corpo = botao.closest('.fcorpo'); const id = corpo.dataset.id; const acao = botao.dataset.acao;
  const extra = {};
  if (acao === 'informar_nf') { extra.chave = $('#chave-nf').value; if (extra.chave.replace(/\D/g, '').length !== 44) return aviso('A chave da NF tem 44 números.'); }
  if (acao === 'marcar_enviado') extra.rastreio = $('#rastreio')?.value || '';
  if (acao === 'cancelar' && !doisToques(botao, 'Toque de novo para cancelar o pedido')) return aviso('Se ele já foi pago, faça o estorno no app do InfinitePay.');
  const p = await ocupado(botao, () => S.acao(acao, id, extra));
  aviso({ marcar_enviado: 'Marcado como enviado. O cliente foi avisado.', cancelar: 'Pedido cancelado.', informar_nf: 'Chave da NF salva.', tentar_de_novo: 'Tentando de novo…', marcar_entregue: 'Marcado como entregue.' }[acao]);
  abrirFolha(folhaPedido(p));
  carregarPedidos();
}

// ================= PRODUTOS =================
const estoqueTotal = (p) => (p.embalagens || []).reduce((s, e) => s + (Number(e.estoque_grao) || 0) + (p.tem_moagem === false ? 0 : Number(e.estoque_moido) || 0), 0);
const precoAtual = (e) => (Number(e.preco_promo) > 0 && Number(e.preco_promo) < Number(e.preco) && (!e.promo_ate || new Date(e.promo_ate + 'T23:59:59-03:00') >= new Date()) ? Number(e.preco_promo) : Number(e.preco));

async function carregarProdutos() {
  const g = $('#lista-produtos');
  g.innerHTML = '<div class="vazio-painel">Carregando…</div>';
  try { produtos = await S.produtos(); } catch (e) { g.innerHTML = `<div class="vazio-painel">Erro: ${esc(e.message)}</div>`; return; }
  g.innerHTML = produtos.map((p) => {
    const est = estoqueTotal(p);
    const promo = (p.embalagens || []).some((e) => precoAtual(e) < Number(e.preco));
    const f = p.fotos?.[0] || p.fotos_local?.[0];
    const reserva = p.fotos_local?.[0] && p.fotos_local[0] !== f ? urlFoto(p.fotos_local[0]) : '';
    return `<button class="prodp${p.ativo ? '' : ' off'}" data-id="${esc(p.id)}">
      <div class="ft" style="--bg:${esc(p.cor || '#72765B')}">${f ? `<img src="${esc(urlFoto(f))}" alt="" loading="lazy"${reserva ? ` data-reserva="${esc(reserva)}"` : ''}>` : `<span>${esc(p.nome)}</span>`}</div>
      <div class="tx"><span class="nm">${esc(p.nome)}</span>
      <span class="pr">${(p.embalagens || []).map((e) => `${esc(e.nome)}: <b>${brl(precoAtual(e))}</b>`).join(' · ')}</span>
      <span>${!p.ativo ? '<span class="chip cinza">Fora do site</span>' : est <= 0 ? '<span class="chip vermelho">Esgotado</span>' : est <= 3 ? `<span class="chip ouro">Só ${est} em estoque</span>` : `<span class="chip verde">${est} em estoque</span>`} ${promo ? '<span class="chip vermelho">Promoção</span>' : ''}</span></div></button>`;
  }).join('') || '<div class="vazio-painel">Nenhum produto ainda.</div>';
  const temWix = produtos.some((p) => (p.fotos || []).some((u) => /wixstatic\.com/.test(u)));
  $('#importar-wix').hidden = !temWix || S.demo;
}

const embVazia = () => ({ id: 'e' + Math.random().toString(36).slice(2, 7), nome: 'Lata 250g', preco: 0, preco_promo: null, promo_ate: null, estoque_grao: 0, estoque_moido: 0, peso_g: 650 });
let edit = null;

function htmlEmb(e, i) {
  return `<div class="emb" data-i="${i}">
    <div class="topo-emb"><label>Embalagem<input data-k="nome" value="${esc(e.nome)}" placeholder="Lata 250g"></label>${edit.embalagens.length > 1 ? `<button type="button" class="bt perigo" data-rm-emb="${i}" style="min-width:0">Remover</button>` : ''}</div>
    <div class="duas">
      <label>Preço<span class="moeda"><i>R$</i><input data-k="preco" inputmode="decimal" value="${e.preco ?? ''}"></span></label>
      <label>Preço promocional<span class="moeda"><i>R$</i><input data-k="preco_promo" inputmode="decimal" value="${e.preco_promo ?? ''}" placeholder="vazio = sem promoção"></span></label>
    </div>
    <label>Promoção vale até (opcional)<input type="date" data-k="promo_ate" value="${esc(e.promo_ate || '')}"><small>Depois dessa data o preço volta ao normal sozinho.</small></label>
    <div class="tres">
      <label>Estoque ${edit.tem_moagem === false ? '' : 'em grão'}<input data-k="estoque_grao" inputmode="numeric" value="${e.estoque_grao ?? 0}"></label>
      ${edit.tem_moagem === false ? '' : `<label>Estoque moído<input data-k="estoque_moido" inputmode="numeric" value="${e.estoque_moido ?? 0}"></label>`}
      <label>Peso (g)<input data-k="peso_g" inputmode="numeric" value="${e.peso_g ?? ''}"><small>com embalagem, p/ o frete</small></label>
    </div>
  </div>`;
}

function htmlFotos() {
  return `${(edit.fotos || []).map((u, i) => `<figure>${i === 0 ? '<span class="principal">Principal</span>' : ''}<img src="${esc(urlFoto(u))}" alt="">
    <div class="acoes">${i > 0 ? `<button type="button" data-principal="${i}">Principal</button>` : '<span></span>'}<button type="button" data-rm-foto="${i}">Tirar</button></div></figure>`).join('')}
    <label class="add-foto"><input type="file" accept="image/*" multiple id="input-foto">+ Adicionar foto</label>`;
}

function folhaProduto() {
  const p = edit;
  const f = p.ficha || {}, pf = p.perfil || {};
  const sel = (k) => `<select data-perfil="${k}"><option value="">—</option>${[1, 2, 3, 4, 5].map((v) => `<option ${Number(pf[k]) === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  return `<div class="fcab"><h2>${p.id ? esc(p.nome) : 'Novo produto'}</h2><button class="x" aria-label="Fechar">×</button></div>
  <form class="fcorpo form" id="form-produto">
    <label class="chave">À venda no site<input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}></label>
    <div class="bloco"><h3>Fotos</h3><div class="fotos" id="fotos">${htmlFotos()}</div><small style="color:var(--muted)">A primeira é a principal. Fotos grandes são reduzidas automaticamente.</small></div>
    <label>Nome<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Floral e Mel"></label>
    <label>Frase curta<input name="frase" maxlength="90" value="${esc(p.frase)}" placeholder="Aparece no cartão do produto"></label>
    <label>Como é o sabor / descrição<textarea name="descricao" rows="4">${esc(p.descricao)}</textarea></label>
    <label>Selo (opcional)<input name="selo" maxlength="60" value="${esc(p.selo)}" placeholder="Ex.: Novo · Edição limitada"></label>
    <div class="bloco"><h3>Preço e estoque</h3><div id="embs" style="display:grid;gap:12px">${p.embalagens.map(htmlEmb).join('')}</div>
      <button type="button" class="bt claro" id="add-emb">+ Outra embalagem (ex.: pacote)</button></div>
    <details class="mais bloco"><summary>Mais detalhes (ficha, perfil, cor)</summary>
      <label>Tipo<select name="tipo">${[['cafe', 'Café (ganha um bloco próprio na página inicial)'], ['combo', 'Combo'], ['edicao', 'Edição limitada'], ['outro', 'Outro']].map(([v, n]) => `<option value="${v}" ${p.tipo === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="chave">Tem opção de moagem (grão / moído)<input type="checkbox" name="tem_moagem" ${p.tem_moagem !== false ? 'checked' : ''}></label>
      <label>Notas de sabor<input name="notas" value="${esc((p.notas || []).join(', '))}" placeholder="separe por vírgula: laranja, capim-limão"></label>
      <div class="duas">
        ${[['variedade', 'Variedade'], ['processo', 'Processo'], ['origem', 'Origem'], ['produtor', 'Produtor'], ['altitude', 'Altitude'], ['torra', 'Torra']].map(([k, n]) => `<label>${n}<input data-ficha="${k}" value="${esc(f[k] || '')}"></label>`).join('')}
      </div>
      <div class="duas">${[['docura', 'Doçura'], ['acidez', 'Acidez'], ['corpo', 'Corpo'], ['intensidade', 'Intensidade']].map(([k, n]) => `<label>${n} (1 a 5)${sel(k)}</label>`).join('')}</div>
      <div class="duas"><label>Cor do bloco<input type="color" name="cor" value="${esc(p.cor || '#72765B')}" style="padding:4px;height:48px"></label>
      <label>Ordem na página<input name="ordem" inputmode="numeric" value="${esc(p.ordem ?? 0)}"></label></div>
    </details>
    <div class="salvar-fixo"><button class="bt ouro grande" type="submit">Salvar</button></div>
    ${p.id ? '<button type="button" class="bt perigo" id="excluir-produto">Excluir produto</button><small style="color:var(--muted)">Dica: para tirar do site por um tempo, desligue "À venda no site" em vez de excluir.</small>' : ''}
  </form>`;
}

function lerFormProduto() {
  const form = $('#form-produto'); const fd = new FormData(form);
  edit.nome = String(fd.get('nome') || '').trim();
  edit.frase = String(fd.get('frase') || '').trim();
  edit.descricao = String(fd.get('descricao') || '').trim();
  edit.selo = String(fd.get('selo') || '').trim();
  edit.ativo = !!fd.get('ativo');
  edit.tipo = fd.get('tipo') || edit.tipo || 'cafe';
  edit.tem_moagem = !!fd.get('tem_moagem');
  edit.notas = String(fd.get('notas') || '').split(',').map((s) => s.trim()).filter(Boolean);
  edit.cor = fd.get('cor') || edit.cor;
  edit.ordem = Math.round(num(fd.get('ordem')));
  const ficha = {}; $$('[data-ficha]', form).forEach((i) => { ficha[i.dataset.ficha] = i.value.trim(); });
  edit.ficha = Object.values(ficha).some(Boolean) ? ficha : null;
  const perfil = {}; $$('[data-perfil]', form).forEach((s) => { if (s.value) perfil[s.dataset.perfil] = Number(s.value); });
  edit.perfil = Object.keys(perfil).length ? perfil : null;
  $$('.emb', form).forEach((el) => {
    const e = edit.embalagens[Number(el.dataset.i)];
    $$('[data-k]', el).forEach((inp) => {
      const k = inp.dataset.k;
      if (k === 'nome' || k === 'promo_ate') e[k] = inp.value.trim() || (k === 'promo_ate' ? null : e[k]);
      else if (k === 'preco_promo') e[k] = inp.value.trim() ? num(inp.value) : null;
      else if (k === 'preco') e[k] = num(inp.value);
      else e[k] = Math.max(0, Math.round(num(inp.value)));
    });
  });
}

function validarProduto() {
  if (!edit.nome) return 'Dê um nome ao produto.';
  for (const e of edit.embalagens) {
    if (!e.nome) return 'Toda embalagem precisa de um nome.';
    if (!(e.preco > 0)) return `Coloque o preço de "${e.nome}".`;
    if (e.preco_promo != null && !(e.preco_promo > 0 && e.preco_promo < e.preco)) return `O preço promocional de "${e.nome}" tem que ser menor que o preço normal.`;
  }
  return '';
}

function abrirProduto(p) {
  edit = p ? structuredClone(p) : { nome: '', frase: '', descricao: '', selo: '', tipo: 'cafe', ativo: true, tem_moagem: true, notas: [], ficha: null, perfil: null, cor: '#72765B', fotos: [], fotos_local: [], ordem: (produtos.at(-1)?.ordem || 0) + 1, embalagens: [embVazia()] };
  edit.embalagens = edit.embalagens?.length ? edit.embalagens : [embVazia()];
  edit._daLocal = !edit.fotos?.length;
  edit.fotos = edit.fotos?.length ? edit.fotos : [...(edit.fotos_local || [])];
  abrirFolha(folhaProduto());
}

async function eventosFolha(ev) {
  const t = ev.target;
  if (t.closest('.x')) return fecharFolha();
  const bAcao = t.closest('[data-acao]'); if (bAcao) return acaoPedido(bAcao);
  if (!edit || !t.closest('#form-produto')) return;
  if (t.closest('#add-emb')) { lerFormProduto(); edit.embalagens.push({ ...embVazia(), nome: 'Pacote 250g', peso_g: 300 }); $('#embs').innerHTML = edit.embalagens.map(htmlEmb).join(''); return; }
  const rmE = t.closest('[data-rm-emb]'); if (rmE) { lerFormProduto(); edit.embalagens.splice(Number(rmE.dataset.rmEmb), 1); $('#embs').innerHTML = edit.embalagens.map(htmlEmb).join(''); return; }
  const rmF = t.closest('[data-rm-foto]'); if (rmF) { edit.fotos.splice(Number(rmF.dataset.rmFoto), 1); $('#fotos').innerHTML = htmlFotos(); return; }
  const pr = t.closest('[data-principal]'); if (pr) { const [f] = edit.fotos.splice(Number(pr.dataset.principal), 1); edit.fotos.unshift(f); $('#fotos').innerHTML = htmlFotos(); return; }
  if (t.closest('#excluir-produto')) {
    const b = t.closest('#excluir-produto');
    if (!doisToques(b, 'Toque de novo para excluir de vez')) return;
    await ocupado(b, () => S.excluirProduto(edit.id)); aviso('Produto excluído.'); fecharFolha(); carregarProdutos();
  }
}

async function enviarFotos(input) {
  const arquivos = [...input.files]; if (!arquivos.length) return;
  aviso(`Enviando ${arquivos.length} foto${arquivos.length > 1 ? 's' : ''}…`);
  for (const a of arquivos) {
    try { edit.fotos.push(await S.enviarFoto(a, edit.nome || 'produto')); $('#fotos').innerHTML = htmlFotos(); }
    catch (e) { aviso('Não consegui enviar uma foto: ' + e.message); }
  }
  aviso('Fotos adicionadas. Não esqueça de salvar.');
}

async function salvarProduto(ev) {
  ev.preventDefault();
  lerFormProduto();
  const erro = validarProduto(); if (erro) return aviso(erro);
  const fotosLocais = edit.fotos_local || [];
  // fotos que são cópias locais do site ficam em fotos_local; o resto em fotos
  const { _daLocal, ...resto } = edit;
  const dados = { ...resto, fotos: edit.fotos.filter((u) => /^(https?:|data:)/.test(u)), fotos_local: _daLocal ? fotosLocais.filter((u) => edit.fotos.includes(u)) : fotosLocais };
  const b = $('#form-produto [type=submit]');
  await ocupado(b, () => S.salvarProduto(dados));
  aviso('Salvo! Já aparece no site (pode levar até 1 minuto).');
  fecharFolha(); carregarProdutos();
}

async function importarWix(botao) {
  const doWix = produtos.filter((p) => (p.fotos || []).some((u) => /wixstatic\.com/.test(u)));
  let n = 0;
  await ocupado(botao, async () => {
    for (const [k, p] of doWix.entries()) {
      botao.textContent = `Copiando ${k + 1} de ${doWix.length}…`;
      n += (await S.importarFotos(p.id)).copiadas;
    }
  }).then(() => true, () => false).then((ok) => ok && aviso(`${n} foto${n === 1 ? '' : 's'} copiada${n === 1 ? '' : 's'} do Wix.`));
  carregarProdutos();
}

// ================= EVENTOS =================
async function carregarEventos() {
  const l = $('#lista-eventos');
  try {
    const cs = await S.contatos();
    const novos = cs.filter((c) => !c.respondido).length;
    $('#bolha-eventos').textContent = novos; $('#bolha-eventos').hidden = !novos;
    l.innerHTML = cs.length ? cs.map((c) => {
      const fone = String(c.whatsapp || '').replace(/\D/g, '');
      return `<div class="ped" style="grid-template-columns:1fr auto;cursor:default">
        <span><span class="nm">${esc(c.nome)}</span> ${c.respondido ? '<span class="chip verde">Respondido</span>' : '<span class="chip ouro">Novo</span>'}<br>
        <span class="sub">${esc(c.tipo || '')}${c.data ? ' · ' + esc(new Date(c.data + 'T12:00').toLocaleDateString('pt-BR')) : ''}${c.cidade ? ' · ' + esc(c.cidade) : ''}${c.convidados ? ' · ' + esc(c.convidados) + ' convidados' : ''} · recebido ${quando(c.criado_em)}</span>
        ${c.mensagem ? `<br><span style="font-size:14px">${esc(c.mensagem)}</span>` : ''}</span>
        <span class="botoes" style="flex-direction:column">${fone ? `<a class="bt ouro" href="https://wa.me/55${fone}?text=${encodeURIComponent(`Oi, ${String(c.nome).split(' ')[0]}! Aqui é da Admirável Café, sobre o seu evento.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button class="bt claro" data-resp="${esc(c.id)}" data-v="${c.respondido ? '' : '1'}">${c.respondido ? 'Marcar como novo' : 'Marcar respondido'}</button></span></div>`;
    }).join('') : '<div class="vazio-painel">Nenhum pedido de orçamento ainda.</div>';
  } catch (e) { l.innerHTML = `<div class="vazio-painel">Erro: ${esc(e.message)}</div>`; }
}

// ================= AJUSTES =================
async function carregarAjustes() {
  const a = await S.ajustes().catch(() => ({}));
  const f = $('#form-ajustes');
  f.aviso_topo.value = a.aviso_topo || '';
  f.frete_gratis_acima.value = Number(a.frete_gratis_acima || 0) ? String(a.frete_gratis_acima).replace('.', ',') : '0';
  const c = S.cfg || {};
  const linha = (nome, valor, ok) => `<div>${nome}: <span class="${ok ? 'ok' : 'nao'}">${esc(valor)}</span></div>`;
  $('#status-servicos').innerHTML = `<b>Conexões</b>
    ${linha('Pagamento', c.pagamento === 'infinitepay' ? 'InfinitePay conectado' : c.pagamento === 'mercadopago' ? 'Mercado Pago conectado' : 'não conectado (demonstração)', c.pagamento && c.pagamento !== 'demo')}
    ${linha('Frete', c.frete || 'não conectado', c.frete === 'Melhor Envio')}
    ${linha('Nota fiscal', c.nf || 'sem NF automática', c.nf === 'notaas' || c.nf === 'focus')}
    <small style="color:var(--muted)">Quem conecta é o Drinho, no Netlify (ver guia).</small>`;
}

// ================= navegação e início =================
function irPara(aba) {
  $$('[data-aba]').forEach((b) => (b.dataset.aba === aba ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  $$('[data-tela]').forEach((s) => { s.hidden = s.dataset.tela !== aba; });
  ({ pedidos: carregarPedidos, produtos: carregarProdutos, eventos: carregarEventos, ajustes: carregarAjustes })[aba]();
  history.replaceState(null, '', '#' + aba);
  window.scrollTo(0, 0);
}

async function mostrarApp(sessao) {
  $('#tela-login').hidden = true; $('#app').hidden = false;
  $('#quem').textContent = sessao?.user?.email || '';
  irPara(['pedidos', 'produtos', 'eventos', 'ajustes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'pedidos');
  carregarEventosBolha();
  setInterval(() => { if (!document.hidden) { atualizarBolhas(); if (!$('[data-tela=pedidos]').hidden && !$('#folha').classList.contains('on')) carregarPedidos(); } }, 60000);
}
async function carregarEventosBolha() { try { const n = (await S.contatos()).filter((c) => !c.respondido).length; $('#bolha-eventos').textContent = n; $('#bolha-eventos').hidden = !n; } catch {} }

// foto externa fora do ar: usa a cópia local, ou some com a imagem
document.addEventListener('error', (e) => {
  const img = e.target; if (img.tagName !== 'IMG') return;
  if (img.dataset.reserva) { img.src = img.dataset.reserva; delete img.dataset.reserva; } else img.style.visibility = 'hidden';
}, true);

async function iniciar() {
  S = await criarStore();
  if (S.demo) {
    $('#demo-faixa').hidden = false;
    $('#zerar-demo').addEventListener('click', (e) => { if (doisToques(e.currentTarget, 'Toque de novo para apagar tudo')) { S.zerar(); location.reload(); } });
    const f = $('#form-login'); f.email.value = 'dono@admiravelcafe.com.br'; f.senha.value = 'demonstracao';
  }
  S.aoRecuperarSenha(() => {
    $('#tela-login').hidden = true; $('#app').hidden = false;
    abrirFolha(`<div class="fcab"><h2>Nova senha</h2><button class="x" aria-label="Fechar">×</button></div><form class="fcorpo form" id="form-senha"><label>Nova senha<input type="password" name="s" minlength="8" required autocomplete="new-password"></label><button class="bt ouro grande">Salvar senha</button></form>`);
    $('#form-senha').addEventListener('submit', async (e) => { e.preventDefault(); await ocupado(e.submitter, () => S.novaSenha(e.target.s.value)); aviso('Senha trocada.'); fecharFolha(); });
  });

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault(); $('#erro-login').textContent = '';
    const f = e.target;
    try { mostrarApp(await ocupado(f.querySelector('[type=submit]'), () => S.entrar(f.email.value.trim(), f.senha.value))); }
    catch (err) { $('#erro-login').textContent = err.message; }
  });
  $('#esqueci').addEventListener('click', async () => {
    const email = $('#form-login').email.value.trim();
    if (!email) return ($('#erro-login').textContent = 'Digite seu e-mail acima e toque de novo em "Esqueci a senha".');
    try { await S.esqueci(email); $('#erro-login').textContent = 'Enviamos um link para criar uma nova senha no seu e-mail.'; } catch (err) { $('#erro-login').textContent = err.message; }
  });
  $('#sair').addEventListener('click', async () => { await S.sair(); location.reload(); });
  $$('[data-aba]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));
  $$('.filtros [data-f]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; $$('.filtros [data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); carregarPedidos(); }));
  $('#lista-pedidos').addEventListener('click', (e) => { const b = e.target.closest('.ped'); if (b) abrirFolha(folhaPedido($('#lista-pedidos')._pedidos.find((p) => p.id === b.dataset.id))); });
  $('#lista-produtos').addEventListener('click', (e) => { const b = e.target.closest('.prodp'); if (b) abrirProduto(produtos.find((p) => p.id === b.dataset.id)); });
  $('#novo-produto').addEventListener('click', () => abrirProduto(null));
  $('#bt-importar').addEventListener('click', (e) => importarWix(e.currentTarget));
  $('#lista-eventos').addEventListener('click', async (e) => { const b = e.target.closest('[data-resp]'); if (!b) return; await S.marcarContato(isNaN(b.dataset.resp) ? b.dataset.resp : Number(b.dataset.resp), !!b.dataset.v); carregarEventos(); });
  $('#form-ajustes').addEventListener('submit', async (e) => {
    e.preventDefault();
    await ocupado(e.submitter, () => S.salvarAjustes({ aviso_topo: e.target.aviso_topo.value.trim(), frete_gratis_acima: num(e.target.frete_gratis_acima.value) }));
    aviso('Ajustes salvos.');
  });
  $('#veu').addEventListener('click', fecharFolha);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharFolha());
  $('#folha').addEventListener('click', eventosFolha);
  $('#folha').addEventListener('submit', (e) => { if (e.target.id === 'form-produto') salvarProduto(e); });
  $('#folha').addEventListener('change', (e) => {
    if (e.target.id === 'input-foto') enviarFotos(e.target);
    if (e.target.name === 'tem_moagem') { lerFormProduto(); $('#embs').innerHTML = edit.embalagens.map(htmlEmb).join(''); }
  });

  const s = await S.sessao();
  if (s) mostrarApp(s); else $('#tela-login').hidden = false;
}
iniciar();
