// Regras de preço: promoção vale se tiver preço promocional menor que o normal
// e (se tiver data) ainda não tiver acabado.
export function precoEfetivo(emb, agora = new Date()) {
  const p = Number(emb.preco);
  const promo = Number(emb.preco_promo);
  const ate = emb.promo_ate ? new Date(emb.promo_ate + 'T23:59:59-03:00') : null;
  if (promo > 0 && promo < p && (!ate || ate >= agora)) return promo;
  return p;
}

// Monta os itens do pedido a partir do carrinho, sempre com preço e estoque do banco.
export function montarItens(carrinho, produtos) {
  if (!Array.isArray(carrinho) || !carrinho.length) throw new Error('Carrinho vazio.');
  if (carrinho.length > 30) throw new Error('Carrinho grande demais.');
  const porId = new Map(produtos.map((p) => [String(p.id), p]));
  const itens = [];
  const usado = new Map();
  for (const c of carrinho) {
    const prod = porId.get(String(c.produto_id));
    if (!prod || !prod.ativo) throw new Error('Um produto do carrinho não está mais à venda.');
    const emb = (prod.embalagens || []).find((e) => e.id === c.embalagem_id);
    if (!emb) throw new Error(`Opção indisponível em ${prod.nome}.`);
    const moagem = prod.tem_moagem === false ? null : (c.moagem === 'moido' ? 'moido' : 'grao');
    const qtd = Math.floor(Number(c.quantidade));
    if (!(qtd >= 1 && qtd <= 20)) throw new Error('Quantidade inválida.');
    const chave = `${prod.id}|${emb.id}|${moagem}`;
    const estoque = moagem === 'moido' ? Number(emb.estoque_moido ?? 0) : Number(emb.estoque_grao ?? 0);
    const total = (usado.get(chave) || 0) + qtd;
    if (total > estoque) {
      throw new Error(estoque > 0
        ? `Só temos ${estoque} de ${prod.nome} (${emb.nome}${moagem ? ', ' + (moagem === 'moido' ? 'moído' : 'em grão') : ''}).`
        : `${prod.nome} (${emb.nome}${moagem ? ', ' + (moagem === 'moido' ? 'moído' : 'em grão') : ''}) esgotou.`);
    }
    usado.set(chave, total);
    itens.push({
      produto_id: prod.id,
      embalagem_id: emb.id,
      moagem,
      nome: `${prod.nome} · ${emb.nome}${moagem ? (moagem === 'moido' ? ' · moído' : ' · em grão') : ''}`,
      sku: `${prod.slug}-${emb.id}${moagem ? '-' + moagem : ''}`.slice(0, 60),
      quantidade: qtd,
      preco: precoEfetivo(emb),
      peso_g: Number(emb.peso_g) || 300,
      altura: Number(emb.altura) || 0,
      largura: Number(emb.largura) || 0,
      comprimento: Number(emb.comprimento) || 0,
    });
  }
  return itens;
}

export const subtotalDe = (itens) => Math.round(itens.reduce((s, i) => s + i.preco * i.quantidade * 100, 0)) / 100;
