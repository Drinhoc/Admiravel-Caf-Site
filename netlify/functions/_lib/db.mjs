// Acesso ao banco (Supabase via REST, com a chave de serviço — só no servidor).
// Sem SUPABASE_URL configurado, usa um banco em memória com o catálogo de demonstração
// (bom para rodar local e para os testes automáticos).
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { env, chamar, agoraIso } from './util.mjs';

function supabase() {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_KEY');
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const rest = (path, opts = {}) => chamar(`${url}/rest/v1/${path}`, { ...opts, headers: { ...h, ...(opts.headers || {}) } }, 'Banco de dados');
  const ret = { Prefer: 'return=representation' };
  return {
    tipo: 'supabase',
    async listarProdutos({ ativos = true } = {}) {
      return rest(`produtos?select=*${ativos ? '&ativo=eq.true' : ''}&order=ordem.asc,nome.asc`);
    },
    async produtosPorIds(ids) {
      if (!ids.length) return [];
      const lista = ids.map((i) => `"${String(i).replace(/"/g, '')}"`).join(',');
      return rest(`produtos?select=*&id=in.(${encodeURIComponent(lista)})`);
    },
    async ajustes() {
      const r = await rest('ajustes?select=*&id=eq.1');
      return r?.[0] || {};
    },
    async criarPedido(p) {
      const r = await rest('pedidos', { method: 'POST', headers: ret, body: JSON.stringify(p) });
      return r[0];
    },
    async obterPedido(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      const r = await rest(`pedidos?select=*&id=eq.${id}`);
      return r?.[0] || null;
    },
    // Atualiza só se o status atual for um dos esperados (trava contra processar duas vezes).
    async atualizarPedido(id, patch, { seStatus } = {}) {
      let q = `pedidos?id=eq.${id}`;
      if (seStatus) q += `&status=in.(${[].concat(seStatus).join(',')})`;
      const r = await rest(q, { method: 'PATCH', headers: ret, body: JSON.stringify({ ...patch, atualizado_em: agoraIso() }) });
      return r?.[0] || null;
    },
    async registrar(id, msg) {
      await rest('rpc/pedido_log', { method: 'POST', body: JSON.stringify({ p_id: id, p_msg: msg }) });
    },
    async baixarEstoque(itens) {
      await rest('rpc/baixar_estoque', { method: 'POST', body: JSON.stringify({ p_itens: itens }) });
    },
    async pedidosEmAndamento() {
      // pagos com NF ou etiqueta ainda pendentes, dos últimos 15 dias
      const desde = new Date(Date.now() - 15 * 864e5).toISOString();
      return rest(`pedidos?select=*&status=eq.pago&criado_em=gte.${desde}&or=(nf_status.in.(pendente,processando,erro),envio_status.in.(pendente,aguardando_nf,erro),avisos->>pronto.is.null)&order=criado_em.asc&limit=20`);
    },
    async salvarContatoEvento(c) {
      await rest('contatos_eventos', { method: 'POST', body: JSON.stringify(c) });
    },
    // Confere o login do painel: token do Supabase Auth + e-mail na tabela admins.
    async atualizarProduto(id, patch) {
      const r = await rest(`produtos?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: ret, body: JSON.stringify({ ...patch, atualizado_em: agoraIso() }) });
      return r?.[0] || null;
    },
    // guarda um arquivo no bucket público "fotos" e devolve o endereço público
    async guardarFoto(caminho, bytes, tipo) {
      await chamar(`${url}/storage/v1/object/fotos/${caminho}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': tipo, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' }, body: bytes, timeout: 15000 }, 'Armazenamento de fotos');
      return `${url}/storage/v1/object/public/fotos/${caminho}`;
    },
    async verificarAdmin(token) {
      if (!token) return null;
      try {
        const u = await chamar(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } }, 'Login');
        const email = String(u?.email || '').toLowerCase();
        if (!email) return null;
        const a = await rest(`admins?select=email&email=eq.${encodeURIComponent(email)}`);
        return a?.length ? email : null;
      } catch { return null; }
    },
  };
}

// ---------- banco em memória (demonstração / testes) ----------
let memoria = null;
function carregarDemo() {
  const caminhos = ['site/data/produtos-demo.json', '../site/data/produtos-demo.json', new URL('../../../site/data/produtos-demo.json', import.meta.url)];
  for (const c of caminhos) {
    try { return JSON.parse(readFileSync(c, 'utf8')); } catch {}
  }
  return { produtos: [], ajustes: {} };
}
export function bancoMemoria(seed) {
  const dados = seed || carregarDemo();
  const produtos = structuredClone(dados.produtos || []);
  const ajustes = structuredClone(dados.ajustes || {});
  const pedidos = new Map();
  const contatos = [];
  let numero = 1000;
  return {
    tipo: 'memoria', produtos, pedidos, contatos,
    async listarProdutos({ ativos = true } = {}) {
      return structuredClone(produtos.filter((p) => !ativos || p.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    },
    async produtosPorIds(ids) { return structuredClone(produtos.filter((p) => ids.map(String).includes(String(p.id)))); },
    async ajustes() { return structuredClone(ajustes); },
    async criarPedido(p) {
      const novo = { id: randomUUID(), token: randomUUID(), numero: ++numero, criado_em: agoraIso(), historico: [], avisos: {}, tentativas: 0, ...structuredClone(p) };
      pedidos.set(novo.id, novo);
      return structuredClone(novo);
    },
    async obterPedido(id) { return pedidos.has(id) ? structuredClone(pedidos.get(id)) : null; },
    async atualizarPedido(id, patch, { seStatus } = {}) {
      const p = pedidos.get(id);
      if (!p) return null;
      if (seStatus && ![].concat(seStatus).includes(p.status)) return null;
      Object.assign(p, structuredClone(patch), { atualizado_em: agoraIso() });
      return structuredClone(p);
    },
    async registrar(id, msg) { pedidos.get(id)?.historico.push({ em: agoraIso(), msg }); },
    async baixarEstoque(itens) {
      for (const i of itens) {
        const emb = produtos.find((p) => p.id === i.produto_id)?.embalagens?.find((e) => e.id === i.embalagem_id);
        if (!emb) continue;
        const campo = i.moagem === 'moido' ? 'estoque_moido' : 'estoque_grao';
        emb[campo] = Math.max(0, Number(emb[campo] || 0) - i.quantidade);
      }
    },
    async pedidosEmAndamento() {
      return [...pedidos.values()].filter((p) => p.status === 'pago' && (
        ['pendente', 'processando', 'erro'].includes(p.nf_status) || ['pendente', 'aguardando_nf', 'erro'].includes(p.envio_status) || !p.avisos?.pronto
      )).map((p) => structuredClone(p));
    },
    async salvarContatoEvento(c) { contatos.push({ ...c, criado_em: agoraIso() }); },
    async verificarAdmin(token) { return token === 'demo' ? 'demo@admiravel' : null; },
  };
}

let instancia = null;
export function db() {
  if (instancia) return instancia;
  if (env('SUPABASE_URL') && env('SUPABASE_SERVICE_KEY')) instancia = supabase();
  else { memoria = memoria || bancoMemoria(); instancia = memoria; }
  return instancia;
}
// usado nos testes
export function usarBanco(b) { instancia = b; }
