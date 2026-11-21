// Emissão de NF-e (nota de produto, modelo 55). Dois provedores possíveis:
//   NF_PROVEDOR=focus   → Focus NFe   (R$ 94,90/mês, 100 notas)        https://focusnfe.com.br/doc/
//   NF_PROVEDOR=notaas  → Notaas      (grátis até 20 notas/mês)         https://docs.notaas.com.br/
// Sem provedor configurado, a NF fica "manual": o dono emite onde já emite hoje e cola a chave no painel.
// [CONTADOR] As regras fiscais (CFOP, CSOSN, NCM, PIS/COFINS) estão em loja.mjs → LOJA.fiscal.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, chamar, soDigitos } from './util.mjs';
import { LOJA } from './loja.mjs';

export function provedorNF() {
  const p = env('NF_PROVEDOR').toLowerCase();
  if (p === 'focus' && env('FOCUS_TOKEN')) return 'focus';
  if (p === 'notaas' && env('NOTAAS_API_KEY')) return 'notaas';
  return null;
}

// Rateia o frete entre os itens (a soma tem que bater centavo a centavo).
export function ratearFrete(itens, frete) {
  const totalC = itens.reduce((s, i) => s + Math.round(i.preco * 100) * i.quantidade, 0);
  const freteC = Math.round(Number(frete || 0) * 100);
  let usado = 0;
  return itens.map((i, n) => {
    const base = Math.round(i.preco * 100) * i.quantidade;
    const parte = n === itens.length - 1 ? freteC - usado : Math.floor((freteC * base) / (totalC || 1));
    usado += parte;
    return parte / 100;
  });
}

const cfop = (uf) => (String(uf).toUpperCase() === LOJA.remetente.uf ? LOJA.fiscal.cfop_dentro_estado : LOJA.fiscal.cfop_fora_estado);

// ---------------- Focus NFe ----------------
const focusBase = () => (env('FOCUS_AMBIENTE') === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br');
const focusHeaders = () => ({ Authorization: 'Basic ' + Buffer.from(`${env('FOCUS_TOKEN')}:`).toString('base64'), 'Content-Type': 'application/json' });

export function montarNotaFocus(pedido) {
  const e = pedido.endereco, c = pedido.cliente, f = LOJA.fiscal;
  const fretes = ratearFrete(pedido.itens, pedido.frete?.preco);
  const fora = String(e.uf).toUpperCase() !== LOJA.remetente.uf;
  return {
    natureza_operacao: f.natureza_operacao,
    data_emissao: new Date().toISOString(),
    tipo_documento: 1, finalidade_emissao: 1,
    local_destino: fora ? 2 : 1, consumidor_final: 1, presenca_comprador: 2,
    cnpj_emitente: soDigitos(LOJA.remetente.cnpj),
    nome_destinatario: c.nome, cpf_destinatario: soDigitos(c.cpf), telefone_destinatario: soDigitos(c.telefone),
    email_destinatario: c.email, indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: e.rua, numero_destinatario: e.numero, complemento_destinatario: e.complemento || undefined,
    bairro_destinatario: e.bairro, municipio_destinatario: e.cidade, uf_destinatario: e.uf, cep_destinatario: soDigitos(e.cep),
    pais_destinatario: 'Brasil',
    modalidade_frete: Number(pedido.frete?.preco) > 0 ? 0 : 9,
    valor_frete: Number(pedido.frete?.preco || 0),
    valor_produtos: pedido.subtotal, valor_total: pedido.total,
    items: pedido.itens.map((i, n) => ({
      numero_item: n + 1, codigo_produto: i.sku, descricao: i.nome,
      cfop: cfop(e.uf), codigo_ncm: f.ncm,
      unidade_comercial: f.unidade, quantidade_comercial: i.quantidade, valor_unitario_comercial: i.preco,
      unidade_tributavel: f.unidade, quantidade_tributavel: i.quantidade, valor_unitario_tributavel: i.preco,
      valor_bruto: Math.round(i.preco * i.quantidade * 100) / 100,
      valor_frete: fretes[n] || undefined,
      icms_origem: f.icms_origem, icms_situacao_tributaria: f.icms_situacao_tributaria,
      pis_situacao_tributaria: f.pis_situacao_tributaria, cofins_situacao_tributaria: f.cofins_situacao_tributaria,
    })),
    formas_pagamento: [{ forma_pagamento: pedido.pagamento_forma || '99', valor_pagamento: pedido.total }],
  };
}

function lerFocus(r) {
  const s = r?.status;
  const url = (p) => (p ? (p.startsWith('http') ? p : focusBase() + p) : null);
  if (s === 'autorizado') return { status: 'autorizada', chave: r.chave_nfe?.replace(/^NFe/, ''), numero: r.numero, danfe: url(r.caminho_danfe), xml: url(r.caminho_xml_nota_fiscal) };
  if (s === 'processando_autorizacao') return { status: 'processando' };
  if (s === 'cancelado') return { status: 'cancelada' };
  return { status: 'erro', erro: r?.mensagem_sefaz || r?.mensagem || `status ${s}` };
}

// ---------------- Notaas ----------------
const NOTAAS = 'https://platform.notaas.com.br/api/v1';
const notaasHeaders = () => ({ 'x-api-key': env('NOTAAS_API_KEY'), 'Content-Type': 'application/json' });

export function montarNotaNotaas(pedido) {
  const e = pedido.endereco, c = pedido.cliente, f = LOJA.fiscal;
  const fretes = ratearFrete(pedido.itens, pedido.frete?.preco);
  return {
    modelo: 55, naturezaOperacao: f.natureza_operacao, tipoOperacao: 1, consumidorFinal: 1, indicadorIntermediador: 0,
    referencia: `pedido-${pedido.numero}`,
    dest: {
      cpf: soDigitos(c.cpf), nome: c.nome, indicadorIE: 9, email: c.email,
      endereco: { logradouro: e.rua, numero: e.numero, complemento: e.complemento || undefined, bairro: e.bairro, codigoMunicipio: String(e.ibge || ''), municipio: e.cidade, uf: e.uf, cep: soDigitos(e.cep) },
    },
    items: pedido.itens.map((i, n) => ({
      codigo: i.sku, descricao: i.nome, ncm: f.ncm, cfop: cfop(e.uf), unidade: f.unidade,
      quantidade: i.quantidade, valorUnitario: i.preco, valorTotal: Math.round(i.preco * i.quantidade * 100) / 100,
      valorFrete: fretes[n] || undefined, csosn: f.icms_situacao_tributaria, origem: Number(f.icms_origem),
      pis: { cst: f.pis_situacao_tributaria }, cofins: { cst: f.cofins_situacao_tributaria },
    })),
    valorFrete: Number(pedido.frete?.preco || 0),
    transporte: { modalidadeFrete: Number(pedido.frete?.preco) > 0 ? 0 : 9 },
    pagamentos: [{ tipoPagamento: pedido.pagamento_forma || '99', valor: pedido.total }],
  };
}

function lerNotaas(r) {
  const s = String(r?.status || '').toLowerCase();
  if (['issued', 'authorized', 'autorizada'].includes(s) || r?.cStat === 100) {
    return { status: 'autorizada', chave: r.chaveAcesso || r.chave || null, numero: r.numeroNfe || r.numero || null, danfe: r.pdfUrl || r.danfeUrl || null, xml: r.xmlUrl || null };
  }
  if (['queued', 'processing', 'validated'].includes(s)) return { status: 'processando' };
  if (['cancelled', 'cancelling'].includes(s)) return { status: 'cancelada' };
  return { status: 'erro', erro: r?.xMotivo || r?.message || r?.erro || `status ${s}` };
}

export function assinaturaNotaasValida(corpoBruto, header) {
  const segredo = env('NOTAAS_WEBHOOK_SECRET');
  if (!segredo) return true;
  const esperado = 'sha256=' + createHmac('sha256', segredo).update(corpoBruto).digest('hex');
  try { return timingSafeEqual(Buffer.from(esperado), Buffer.from(String(header || ''))); } catch { return false; }
}

// ---------------- interface usada pelo fluxo do pedido ----------------
// Retorna { status: 'processando'|'autorizada'|'erro', ref, chave?, numero?, danfe?, xml?, erro? }
export async function emitirNF(pedido) {
  const prov = provedorNF();
  if (prov === 'focus') {
    const ref = pedido.nf_ref || `pedido-${pedido.numero}`;
    try {
      const r = await chamar(`${focusBase()}/v2/nfe?ref=${encodeURIComponent(ref)}`, { method: 'POST', headers: focusHeaders(), body: JSON.stringify(montarNotaFocus(pedido)), timeout: 9000 }, 'Focus NFe');
      return { ref, ...lerFocus(r) };
    } catch (e) {
      // ref já usada (reenvio): consulta em vez de duplicar
      if (e.status === 422 && /já|ja foi|exist/i.test(JSON.stringify(e.body || ''))) return { ref, ...(await consultarNF({ ...pedido, nf_ref: ref })) };
      throw e;
    }
  }
  if (prov === 'notaas') {
    // Notaas não deduplica: só emite se ainda não houver nota criada para este pedido.
    if (pedido.nf_ref) return { ref: pedido.nf_ref, ...(await consultarNF(pedido)) };
    const r = await chamar(`${NOTAAS}/nfe/emitir`, { method: 'POST', headers: notaasHeaders(), body: JSON.stringify(montarNotaNotaas(pedido)), timeout: 9000 }, 'Notaas');
    return { ref: r.invoiceId, status: 'processando' };
  }
  return { status: 'manual' };
}

export async function consultarNF(pedido) {
  const prov = provedorNF();
  if (prov === 'focus') {
    const r = await chamar(`${focusBase()}/v2/nfe/${encodeURIComponent(pedido.nf_ref)}?completa=0`, { headers: focusHeaders() }, 'Focus NFe');
    return lerFocus(r);
  }
  if (prov === 'notaas') {
    const r = await chamar(`${NOTAAS}/invoices/${encodeURIComponent(pedido.nf_ref)}/status`, { headers: notaasHeaders() }, 'Notaas');
    return lerNotaas(r);
  }
  return { status: 'manual' };
}

export { lerFocus, lerNotaas };
