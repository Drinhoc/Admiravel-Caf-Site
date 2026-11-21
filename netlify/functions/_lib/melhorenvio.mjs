// Melhor Envio — cotação de frete e etiqueta (Correios e outras).
// Docs: https://docs.melhorenvio.com.br/  ·  Sandbox: https://sandbox.melhorenvio.com.br
import { env, chamar, soDigitos } from './util.mjs';
import { LOJA } from './loja.mjs';

export const meAtivo = () => !!env('ME_TOKEN');
const base = () => (env('ME_SANDBOX') === 'false' ? 'https://melhorenvio.com.br' : 'https://sandbox.melhorenvio.com.br');
const headers = () => ({
  Accept: 'application/json', 'Content-Type': 'application/json',
  Authorization: `Bearer ${env('ME_TOKEN')}`,
  'User-Agent': `Admiravel Cafe (${env('ME_EMAIL', LOJA.email)})`,
});
const me = (path, opts = {}) => chamar(`${base()}/api/v2/me/${path}`, { ...opts, headers: headers() }, 'Melhor Envio');

export function pacotesDosItens(itens) {
  const cx = LOJA.caixaPadrao;
  return itens.map((i, n) => ({
    id: String(n + 1),
    width: i.largura || cx.largura, height: i.altura || cx.altura, length: i.comprimento || cx.comprimento,
    weight: Math.max(0.05, (i.peso_g || 300) / 1000), insurance_value: Number(i.preco), quantity: i.quantidade,
  }));
}

export async function cotar(cepDestino, itens) {
  const r = await me('shipment/calculate', {
    method: 'POST',
    body: JSON.stringify({
      from: { postal_code: soDigitos(LOJA.remetente.cep) }, to: { postal_code: soDigitos(cepDestino) },
      products: pacotesDosItens(itens), options: { receipt: false, own_hand: false }, services: LOJA.servicosFrete,
    }),
  });
  return (Array.isArray(r) ? r : []).filter((s) => !s.error && s.price).map((s) => ({
    id: `me-${s.id}`, servico: s.id, nome: s.name, empresa: s.company?.name || '',
    preco: Number(s.custom_price ?? s.price), prazo: Number(s.custom_delivery_time ?? s.delivery_time),
    volumes: (s.packages || []).map((p) => ({
      height: Number(p.dimensions?.height), width: Number(p.dimensions?.width), length: Number(p.dimensions?.length), weight: Number(p.weight),
    })),
  }));
}

// Cria o envio no carrinho do Melhor Envio, compra com o saldo, gera e devolve o link da etiqueta.
export async function gerarEtiqueta(pedido, chaveNF) {
  const r = LOJA.remetente, c = pedido.cliente, e = pedido.endereco;
  const doc = soDigitos(r.cnpj);
  const corpo = {
    service: pedido.frete.servico,
    from: {
      name: r.nome, phone: soDigitos(r.telefone), email: r.email,
      ...(doc.length === 14 ? { company_document: doc, state_register: soDigitos(r.inscricao_estadual) } : { document: doc }),
      address: r.rua, number: r.numero, complement: r.complemento, district: r.bairro, city: r.cidade, state_abbr: r.uf,
      country_id: 'BR', postal_code: soDigitos(r.cep),
    },
    to: {
      name: c.nome, phone: soDigitos(c.telefone), email: c.email, document: soDigitos(c.cpf),
      address: e.rua, number: e.numero, complement: e.complemento || '', district: e.bairro, city: e.cidade, state_abbr: e.uf,
      country_id: 'BR', postal_code: soDigitos(e.cep),
    },
    products: pedido.itens.map((i) => ({ name: i.nome, quantity: i.quantidade, unitary_value: Number(i.preco) })),
    volumes: pedido.frete.volumes?.length ? pedido.frete.volumes : pacotesDosItens(pedido.itens).map(({ width, height, length, weight }) => ({ width, height, length, weight })),
    options: {
      insurance_value: pedido.subtotal, receipt: false, own_hand: false, reverse: false,
      non_commercial: !chaveNF,
      ...(chaveNF ? { invoice: { key: soDigitos(chaveNF) } } : {}),
      platform: 'Admirável Café', tags: [{ tag: `Pedido ${pedido.numero}`, url: null }],
    },
  };
  const envioId = pedido.envio_me_id || (await me('cart', { method: 'POST', body: JSON.stringify(corpo) })).id;
  if (!LOJA.comprarEtiquetaAuto) return { envioId, etiquetaUrl: null, comprada: false };
  await me('shipment/checkout', { method: 'POST', body: JSON.stringify({ orders: [envioId] }) });
  await me('shipment/generate', { method: 'POST', body: JSON.stringify({ orders: [envioId] }) });
  const p = await me('shipment/print', { method: 'POST', body: JSON.stringify({ mode: 'public', orders: [envioId] }) });
  return { envioId, etiquetaUrl: p?.url || null, comprada: true };
}

export async function rastreio(envioId) {
  const r = await me(`orders/${envioId}`);
  return { codigo: r?.tracking || r?.self_tracking || null, status: r?.status || null };
}
