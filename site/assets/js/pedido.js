// Página "Seu pedido": mostra a situação e, em demonstração, permite simular o pagamento.
import { iniciarComum, brl, esc, modo, api, raiz, $, $$ } from './loja.js';
import * as demo from './demo-db.js';

const q = new URLSearchParams(location.search);
const id = q.get('id'), t = q.get('t');
const agora = () => new Date().toISOString();

async function buscar() {
  if ((await modo()) === 'api') {
    const extra = ['order_nsu', 'transaction_nsu', 'slug', 'capture_method'].filter((k) => q.get(k)).map((k) => `&${k}=${encodeURIComponent(q.get(k))}`).join('');
    return api(`pedido?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}${extra}`);
  }
  const d = await demo.carregar();
  const p = d.pedidos.find((x) => x.id === id && x.token === t);
  if (!p) throw new Error('Pedido não encontrado.');
  return { ...p, demo: true };
}

// Simulação do que o servidor faz quando o pagamento é aprovado (só na prévia sem servidor).
async function pagarDemoLocal(forma) {
  return demo.alterar((d) => {
    const p = d.pedidos.find((x) => x.id === id && x.token === t);
    if (!p || p.status !== 'aguardando_pagamento') return p;
    Object.assign(p, { status: 'pago', pago_em: agora(), pagamento_forma: forma === 'cartao' ? '03' : '17', nf_status: 'dispensada' });
    for (const i of p.itens) {
      const e = d.produtos.find((x) => x.id === i.produto_id)?.embalagens.find((x) => x.id === i.embalagem_id);
      if (e) { const c = i.moagem === 'moido' ? 'estoque_moido' : 'estoque_grao'; e[c] = Math.max(0, (e[c] || 0) - i.quantidade); }
    }
    p.envio_status = p.frete.local ? 'entrega_local' : 'gerada';
    if (!p.frete.local) p.etiqueta_url = 'https://melhorenvio.com.br/ (etiqueta de demonstração)';
    p.avisos = { novo: agora(), pronto: agora() };
    p.historico.push(
      { em: agora(), msg: `Pagamento confirmado (${forma === 'cartao' ? 'cartão' : 'Pix'}) — demonstração.` },
      { em: agora(), msg: 'Aviso de pedido novo enviado ao dono.' },
      { em: agora(), msg: p.frete.local ? 'Entrega local: combinar com o cliente.' : 'Etiqueta gerada no Melhor Envio (com declaração de conteúdo).' },
      { em: agora(), msg: 'Aviso "pronto para despachar" enviado.' },
    );
    return p;
  });
}

function render(p) {
  const pago = ['pago', 'enviado', 'entregue'].includes(p.status);
  const titulos = {
    aguardando_pagamento: ['Falta só o pagamento.', 'Assim que o pagamento for aprovado, a gente separa o seu café.'],
    pago: ['Pagamento aprovado!', `Obrigado, ${esc(p.cliente?.nome?.split(' ')[0] || '')}. Já estamos separando o seu café e você recebe um e-mail quando ele sair daqui.`],
    enviado: ['Seu café está a caminho.', p.frete?.local ? 'Vamos combinar a entrega pelo WhatsApp.' : 'Acompanhe a entrega pelo código de rastreio.'],
    entregue: ['Entregue. Bom café!', 'Conta pra gente o que achou no Instagram @admiravelcafe.'],
    cancelado: ['Pedido cancelado.', 'Se tiver qualquer dúvida, fale com a gente no WhatsApp.'],
    expirado: ['Este pedido expirou.', 'Monte o carrinho de novo para comprar.'],
  }[p.status] || ['Seu pedido', ''];
  $('#k').textContent = `Pedido nº ${p.numero}`;
  $('#titulo').innerHTML = esc(titulos[0]);
  $('#sub').innerHTML = titulos[1];
  const etapas = $('#etapas'); etapas.hidden = ['cancelado', 'expirado'].includes(p.status);
  const ordem = ['feito', 'pago', 'enviado', 'entregue'];
  const nivel = { aguardando_pagamento: 0, pago: 1, enviado: 2, entregue: 3 }[p.status] ?? 0;
  $$('[data-e]', etapas).forEach((d) => d.classList.toggle('ok', ordem.indexOf(d.dataset.e) <= nivel));

  let acoes = '';
  if (p.status === 'aguardando_pagamento') {
    if (p.demo) acoes = `<div class="demo-aviso">Demonstração: aqui o cliente seria levado ao InfinitePay para pagar com Pix ou cartão. Simule o resultado:</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn mustard" data-pagar="pix">Simular pagamento com Pix</button><button class="btn ink" data-pagar="cartao">Simular com cartão</button></div>`;
    else if (p.pagamento_url) acoes = `<a class="btn mustard" href="${esc(p.pagamento_url)}">Pagar agora</a> <p class="nota" style="margin-top:10px">Já pagou? Esta página atualiza sozinha em alguns segundos.</p>`;
  }
  if (p.rastreio) acoes += `<div class="caixa"><b>Rastreio:</b> ${esc(p.rastreio)} · <a href="https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(p.rastreio)}" target="_blank" rel="noopener">acompanhar entrega</a></div>`;
  if (p.nf_danfe_url) acoes += `<p style="margin-top:12px"><a href="${esc(p.nf_danfe_url)}" target="_blank" rel="noopener">Baixar nota fiscal (PDF)</a></p>`;
  $('#acoes').innerHTML = acoes;

  const det = $('#detalhe'); det.hidden = false;
  det.innerHTML = `<h2 style="font-family:var(--display);text-transform:uppercase;font-size:26px;margin-bottom:10px">Itens</h2>
    ${p.itens.map((i) => `<div class="linha-total" style="padding:6px 0;border-bottom:1px solid var(--linha)"><span>${i.quantidade}× ${esc(i.nome)}</span><span>${brl(i.preco * i.quantidade)}</span></div>`).join('')}
    <div class="linha-total" style="padding:6px 0"><span>Frete · ${esc(p.frete?.nome || '')}${p.frete?.prazo ? ` (${esc(p.frete.prazo)})` : ''}</span><span>${p.frete?.preco ? brl(p.frete.preco) : 'Grátis'}</span></div>
    <div class="linha-total" style="padding-top:10px"><span>Total</span><b>${brl(p.total)}</b></div>
    ${p.endereco?.cidade ? `<p class="nota" style="margin-top:10px">Entrega em ${esc(p.endereco.cidade)}/${esc(p.endereco.uf)}</p>` : ''}
    ${p.demo && p.historico?.length ? `<details style="margin-top:16px"><summary class="nota">O que aconteceu nos bastidores (demonstração)</summary><ul class="nota">${p.historico.map((h) => `<li>${new Date(h.em).toLocaleTimeString('pt-BR')} · ${esc(h.msg)}</li>`).join('')}</ul></details>` : ''}`;
  return pago;
}

async function iniciar() {
  await iniciarComum();
  if (!id || !t) { $('#titulo').textContent = 'Pedido não encontrado.'; return; }
  let p;
  try { p = await buscar(); } catch (e) { $('#titulo').textContent = e.message; return; }
  render(p);
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pagar]'); if (!b) return;
    b.disabled = true;
    p = (await modo()) === 'api' ? await api('demo-pagar', { id, t, forma: b.dataset.pagar }) : { ...(await pagarDemoLocal(b.dataset.pagar)), demo: true };
    render(p);
  });
  // enquanto aguarda o pagamento (o aviso do InfinitePay pode levar alguns segundos), confere de novo
  let n = 0;
  const h = setInterval(async () => {
    if (p.status !== 'aguardando_pagamento' || p.demo || ++n > 40) return clearInterval(h);
    try { p = await buscar(); render(p); } catch {}
  }, 5000);
}
iniciar();
