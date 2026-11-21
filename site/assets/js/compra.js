// Caixa de compra (embalagem, moagem, quantidade, botão adicionar) — usada nos blocos dos cafés e no modal dos combos.
import { brl, esc, precoEfetivo, emPromo, estoqueDe, adicionar, avisarAdicionado, carrinho } from './loja.js';

const noCarrinho = (p, e, m) => carrinho().filter((i) => i.produto_id === p.id && i.embalagem_id === e.id && i.moagem === m).reduce((s, i) => s + i.quantidade, 0);

export function caixaCompra(p) {
  return `<div class="buybox" data-produto="${esc(p.id)}"></div>`;
}

export function ligarCaixa(el, p) {
  const comMoagem = p.tem_moagem !== false;
  const disp = (e, m) => (comMoagem ? estoqueDe(e, m) : estoqueDe(e, 'grao')) - noCarrinho(p, e, comMoagem ? m : null);
  const total = (e) => disp(e, 'grao') + (comMoagem ? disp(e, 'moido') : 0);
  const st = { e: p.embalagens.find((e) => total(e) > 0) || p.embalagens[0], m: 'grao', q: 1 };
  if (comMoagem && disp(st.e, 'grao') <= 0 && disp(st.e, 'moido') > 0) st.m = 'moido';

  function render() {
    const max = disp(st.e, st.m);
    if (st.q > Math.max(1, max)) st.q = Math.max(1, max);
    const preco = precoEfetivo(st.e);
    const embs = p.embalagens.length > 1 ? `<div class="row" role="group" aria-label="Embalagem"><span class="lbl">Embalagem</span>${p.embalagens.map((e, i) =>
      `<button type="button" class="pill" data-emb="${i}" aria-pressed="${e === st.e}" ${total(e) <= 0 ? 'disabled' : ''}>${esc(e.nome)} <small>${emPromo(e) ? `<s>${brl(e.preco)}</s> ` : ''}${brl(precoEfetivo(e))}</small></button>`).join('')}</div>` : '';
    const moag = comMoagem ? `<div class="row" role="group" aria-label="Moagem"><span class="lbl">Moagem</span>${[['grao', 'Em grão'], ['moido', 'Moído']].map(([k, n]) =>
      `<button type="button" class="pill" data-moa="${k}" aria-pressed="${st.m === k}" ${disp(st.e, k) <= 0 ? 'disabled' : ''}>${n}</button>`).join('')}</div>` : '';
    const msg = max <= 0 ? 'Esgotado nesta opção.' : max <= 3 ? `Últimas ${max} ${max === 1 ? 'unidade' : 'unidades'}.` : '';
    el.innerHTML = `${embs}${moag}
      <div class="row"><div class="qtd" aria-label="Quantidade"><button type="button" data-qq="-" aria-label="Diminuir">−</button><output>${st.q}</output><button type="button" data-qq="+" aria-label="Aumentar">+</button></div>
      <button type="button" class="btn mustard add" ${max <= 0 ? 'disabled' : ''}>${max <= 0 ? 'Esgotado' : `Adicionar <span class="preco">${emPromo(st.e) ? `<span class="preco-de">${brl(st.e.preco * st.q)}</span>` : ''}${brl(preco * st.q)}</span>`}</button></div>
      <p class="estoque-msg" aria-live="polite">${msg}</p>`;
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.emb) { st.e = p.embalagens[Number(b.dataset.emb)]; if (disp(st.e, st.m) <= 0) st.m = st.m === 'grao' ? 'moido' : 'grao'; st.q = 1; }
    else if (b.dataset.moa) { st.m = b.dataset.moa; st.q = 1; }
    else if (b.dataset.qq === '+') { if (st.q < disp(st.e, st.m)) st.q++; }
    else if (b.dataset.qq === '-') { st.q = Math.max(1, st.q - 1); }
    else if (b.classList.contains('add')) {
      adicionar({ produto_id: p.id, embalagem_id: st.e.id, moagem: comMoagem ? st.m : null, quantidade: st.q });
      avisarAdicionado(`${p.nome} (${st.e.nome})`);
      st.q = 1;
    }
    render();
  });
  window.addEventListener('carrinho', render);
  render();
}
