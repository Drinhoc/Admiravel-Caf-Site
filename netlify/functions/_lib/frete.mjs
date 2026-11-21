// Calcula as opções de frete do carrinho: Melhor Envio (ou tabela de demonstração) + entrega local + frete grátis.
import { soDigitos } from './util.mjs';
import { LOJA } from './loja.mjs';
import { meAtivo, cotar } from './melhorenvio.mjs';

function cotacaoDemo(itens) {
  const kg = itens.reduce((s, i) => s + (i.peso_g || 300) * i.quantidade, 0) / 1000;
  return [
    { id: 'me-1', servico: 1, nome: 'PAC', empresa: 'Correios', preco: Math.round((19.9 + kg * 4.5) * 100) / 100, prazo: 7, volumes: [], demo: true },
    { id: 'me-2', servico: 2, nome: 'SEDEX', empresa: 'Correios', preco: Math.round((29.9 + kg * 7.9) * 100) / 100, prazo: 3, volumes: [], demo: true },
  ];
}

export async function opcoesFrete(cep, itens, ajustes = {}) {
  const c = soDigitos(cep);
  if (c.length !== 8) throw new Error('CEP inválido.');
  let opcoes = meAtivo() ? await cotar(c, itens) : cotacaoDemo(itens);
  opcoes.sort((a, b) => a.preco - b.preco);

  const subtotal = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const gratisAcima = Number(ajustes.frete_gratis_acima || 0);
  if (gratisAcima > 0 && subtotal >= gratisAcima && opcoes.length) {
    opcoes[0] = { ...opcoes[0], preco_original: opcoes[0].preco, preco: 0, gratis: true };
  }
  const el = LOJA.entregaLocal;
  const n = Number(c);
  if (el.ativa && n >= el.cepDe && n <= el.cepAte) {
    opcoes.unshift({ id: 'local', nome: el.nome, empresa: 'Admirável Café', preco: el.preco, prazo_texto: el.prazo, local: true, volumes: [] });
  }
  return opcoes.map((o) => ({ ...o, prazo_texto: o.prazo_texto || (o.prazo ? `${o.prazo} ${o.prazo === 1 ? 'dia útil' : 'dias úteis'}` : '') }));
}
