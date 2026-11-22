// Acesso ao banco: Postgres do Railway (DATABASE_URL). O servidor cria as tabelas sozinho na primeira vez.
// Sem DATABASE_URL, usa um banco em memória com o catálogo de demonstração
// (bom para rodar local e para os testes automáticos).
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { env, agoraIso } from './util.mjs';
import { definirSegredo, lerPasse, hashSenha, conferirSenha, senhaFraca } from './auth.mjs';

// ---------- Postgres (Railway) ----------
const ehUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ''));
export const urlDaFoto = (id) => `api/foto?id=${id}`;

function postgres() {
  let pool = null, preparo = null;
  const colunas = {}; // tabela → { coluna: tipo }

  async function preparar() {
    const { default: pg } = await import('pg');
    pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric → número
    pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint (nº do pedido) → número
    const url = env('DATABASE_URL');
    const local = /railway\.internal|localhost|127\.0\.0\.1|@\/|host=\//.test(url) || env('PGSSL') === 'off';
    pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000, ssl: local ? false : { rejectUnauthorized: false } });
    pool.on('error', (e) => console.error('banco:', e.message));

    const c = await pool.connect();
    try {
      await c.query('select pg_advisory_lock(714001)');
      await c.query(readFileSync(new URL('../../../db/schema.sql', import.meta.url), 'utf8'));
      const r = await c.query(`select table_name, column_name, data_type from information_schema.columns where table_schema = current_schema()`);
      for (const { table_name: t, column_name: col, data_type: tipo } of r.rows) (colunas[t] ||= {})[col] = tipo;
      // catálogo inicial (os produtos de hoje do Wix), só se o banco estiver vazio
      if (Number((await c.query('select count(*) from produtos')).rows[0].count) === 0) {
        const seed = carregarDemo();
        for (const p of seed.produtos || []) await inserir(c, 'produtos', p);
        const a = seed.ajustes || {};
        await c.query('update ajustes set aviso_topo = $1, frete_gratis_acima = $2, destaque_id = $3 where id = 1', [a.aviso_topo || '', a.frete_gratis_acima || 0, ehUuid(a.destaque_id) ? a.destaque_id : null]);
        console.log(`banco: catálogo inicial criado (${(seed.produtos || []).length} produtos)`);
      }
      // segredo dos logins: gerado uma vez e guardado no banco (ou SESSAO_SEGREDO, se definido)
      let seg = (await c.query(`select valor from config where chave = 'sessao_segredo'`)).rows[0]?.valor;
      if (!seg) { seg = randomBytes(48).toString('base64url'); await c.query(`insert into config values ('sessao_segredo', $1) on conflict do nothing`, [seg]); seg = (await c.query(`select valor from config where chave = 'sessao_segredo'`)).rows[0].valor; }
      definirSegredo(seg);
      await acessoInicial(c);
    } finally {
      await c.query('select pg_advisory_unlock(714001)').catch(() => {});
      c.release();
    }
  }
  const pronto = () => (preparo ||= preparar().catch((e) => { preparo = null; throw new Error('Banco de dados indisponível: ' + e.message); }));
  const q = async (sql, params) => { await pronto(); return (await pool.query(sql, params)).rows; };

  // monta os valores só com colunas que existem na tabela (o resto é ignorado)
  function valores(tabela, obj) {
    const cols = colunas[tabela] || {};
    const nomes = [], vals = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (!(k in cols) || v === undefined) continue;
      nomes.push(k);
      vals.push(cols[k] === 'jsonb' && v !== null ? JSON.stringify(v) : v);
    }
    return { nomes, vals };
  }
  async function inserir(cli, tabela, obj) {
    const { nomes, vals } = valores(tabela, obj);
    const r = await cli.query(`insert into ${tabela} (${nomes.join(',')}) values (${nomes.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, vals);
    return r.rows[0];
  }

  // ADMIN_EMAIL + ADMIN_SENHA (variáveis do Railway) criam o acesso ao painel.
  // Trocar ADMIN_SENHA no Railway redefine a senha de todos esses e-mails (é o "esqueci a senha" de emergência).
  async function acessoInicial(c) {
    const emails = env('ADMIN_EMAIL').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    const senha = env('ADMIN_SENHA');
    if (!emails.length || !senha) return;
    if (senhaFraca(senha)) { console.error('ADMIN_SENHA ignorada:', senhaFraca(senha)); return; }
    const guardada = (await c.query(`select valor from config where chave = 'admin_senha_env'`)).rows[0]?.valor;
    const mudou = !guardada || !(await conferirSenha(senha, guardada));
    const hash = await hashSenha(senha);
    for (const email of emails) {
      if (mudou) await c.query(`insert into admins (email, senha_hash, senha_em) values ($1, $2, now()) on conflict (email) do update set senha_hash = excluded.senha_hash, senha_em = now()`, [email, hash]);
      else await c.query(`insert into admins (email, senha_hash) values ($1, $2) on conflict do nothing`, [email, hash]);
    }
    if (mudou) await c.query(`insert into config values ('admin_senha_env', $1) on conflict (chave) do update set valor = excluded.valor`, [hash]);
  }

  return {
    tipo: 'postgres', pronto,
    async listarProdutos({ ativos = true } = {}) {
      return q(`select * from produtos ${ativos ? 'where ativo' : ''} order by ordem, nome`);
    },
    async produtosPorIds(ids) {
      const v = ids.filter(ehUuid);
      return v.length ? q('select * from produtos where id = any($1::uuid[])', [v]) : [];
    },
    async ajustes() { return (await q('select * from ajustes where id = 1'))[0] || {}; },
    async criarPedido(p) { await pronto(); return inserir(pool, 'pedidos', p); },
    async obterPedido(id) { return ehUuid(id) ? (await q('select * from pedidos where id = $1', [id]))[0] || null : null; },
    // atualiza só se o status atual for um dos esperados (trava contra processar duas vezes)
    async atualizarPedido(id, patch, { seStatus } = {}) {
      if (!ehUuid(id)) return null;
      await pronto();
      const { nomes, vals } = valores('pedidos', { ...patch, atualizado_em: agoraIso() });
      const params = [...vals, id];
      let sql = `update pedidos set ${nomes.map((n, i) => `${n} = $${i + 1}`).join(', ')} where id = $${params.length}`;
      if (seStatus) { params.push([].concat(seStatus)); sql += ` and status = any($${params.length}::text[])`; }
      return (await pool.query(sql + ' returning *', params)).rows[0] || null;
    },
    async registrar(id, msg) { if (ehUuid(id)) await q('select pedido_log($1, $2)', [id, msg]); },
    async baixarEstoque(itens) { await q('select baixar_estoque($1::jsonb)', [JSON.stringify(itens)]); },
    async pedidosEmAndamento() {
      return q(`select * from pedidos where status = 'pago' and criado_em >= now() - interval '15 days'
        and (nf_status in ('pendente','processando','erro') or envio_status in ('pendente','aguardando_nf','erro') or avisos->>'pronto' is null)
        order by criado_em limit 20`);
    },
    async salvarContatoEvento(ct) { await pronto(); await inserir(pool, 'contatos_eventos', ct); },

    // ----- painel -----
    async listarPedidos(filtro) {
      const onde = { enviar: `where status = 'pago'`, enviado: `where status in ('enviado','entregue')`, aguardando: `where status = 'aguardando_pagamento'` }[filtro] || '';
      return q(`select * from pedidos ${onde} order by criado_em desc limit 150`);
    },
    async contarParaEnviar() { return Number((await q(`select count(*) from pedidos where status = 'pago'`))[0].count); },
    async atualizarProduto(id, patch) {
      if (!ehUuid(id)) return null;
      await pronto();
      const { nomes, vals } = valores('produtos', { ...patch, atualizado_em: agoraIso() });
      return (await pool.query(`update produtos set ${nomes.map((n, i) => `${n} = $${i + 1}`).join(', ')} where id = $${nomes.length + 1} returning *`, [...vals, id])).rows[0] || null;
    },
    async salvarProduto(p) {
      await pronto();
      const { id, criado_em, ...resto } = p;
      try {
        if (ehUuid(id) && (await pool.query('select 1 from produtos where id = $1', [id])).rowCount) return this.atualizarProduto(id, resto);
        return await inserir(pool, 'produtos', ehUuid(id) ? { id, ...resto } : resto);
      } catch (e) {
        if (e.code === '23505') throw Object.assign(new Error('Já existe um produto com esse nome. Mude um pouco o nome.'), { status: 409 });
        throw e;
      }
    },
    async excluirProduto(id) { if (ehUuid(id)) await q('delete from produtos where id = $1', [id]); },
    async salvarAjustes(a) {
      await pronto();
      const limpo = { ...a }; delete limpo.id;
      if ('destaque_id' in limpo && !ehUuid(limpo.destaque_id)) limpo.destaque_id = null;
      const { nomes, vals } = valores('ajustes', limpo);
      if (!nomes.length) return this.ajustes();
      return (await pool.query(`update ajustes set ${nomes.map((n, i) => `${n} = $${i + 1}`).join(', ')} where id = 1 returning *`, vals)).rows[0];
    },
    async listarContatos() { return q('select * from contatos_eventos order by criado_em desc limit 100'); },
    async marcarContato(id, respondido) { await q('update contatos_eventos set respondido = $1 where id = $2', [!!respondido, Number(id)]); },
    async guardarFoto(bytes, tipo) {
      const r = await q('insert into fotos (tipo, dados, tamanho) values ($1, $2, $3) returning id', [tipo, Buffer.from(bytes), bytes.length]);
      return urlDaFoto(r[0].id);
    },
    async obterFoto(id) { return ehUuid(id) ? (await q('select tipo, dados from fotos where id = $1', [id]))[0] || null : null; },

    // ----- login -----
    async obterAdmin(email) { return (await q('select email, senha_hash, senha_em from admins where email = $1', [String(email || '').toLowerCase()]))[0] || null; },
    async definirSenha(email, hash) { return (await q('update admins set senha_hash = $2, senha_em = now() where email = $1 returning senha_em', [email, hash]))[0]?.senha_em || null; },
    async criarReset(codigoHash, email, expiraEm) {
      await q('delete from senha_reset where expira_em < now() or usado');
      await q('insert into senha_reset (codigo_hash, email, expira_em) values ($1, $2, $3)', [codigoHash, email, expiraEm]);
    },
    async usarReset(codigoHash) {
      return (await q('update senha_reset set usado = true where codigo_hash = $1 and not usado and expira_em > now() returning email', [codigoHash]))[0]?.email || null;
    },
    async verificarAdmin(passe) {
      if (!passe) return null;
      await pronto();
      const d = lerPasse(passe); if (!d) return null;
      const a = await this.obterAdmin(d.email).catch(() => null);
      return a && new Date(a.senha_em).getTime() === d.senhaEm ? a.email : null;
    },
    async encerrar() { await pool?.end(); pool = null; preparo = null; },
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
  const fotos = new Map();
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
    // ----- painel (demonstração: qualquer e-mail e senha entram) -----
    async listarPedidos(filtro) {
      const ok = { enviar: (p) => p.status === 'pago', enviado: (p) => ['enviado', 'entregue'].includes(p.status), aguardando: (p) => p.status === 'aguardando_pagamento' }[filtro] || (() => true);
      return structuredClone([...pedidos.values()].filter(ok).sort((a, b) => b.criado_em.localeCompare(a.criado_em)));
    },
    async contarParaEnviar() { return [...pedidos.values()].filter((p) => p.status === 'pago').length; },
    async atualizarProduto(id, patch) {
      const p = produtos.find((x) => x.id === id); if (!p) return null;
      Object.assign(p, structuredClone(patch)); return structuredClone(p);
    },
    async salvarProduto(p) {
      const i = produtos.findIndex((x) => x.id === p.id);
      if (i >= 0) { produtos[i] = { ...produtos[i], ...structuredClone(p) }; return structuredClone(produtos[i]); }
      if (produtos.some((x) => x.slug === p.slug)) throw Object.assign(new Error('Já existe um produto com esse nome. Mude um pouco o nome.'), { status: 409 });
      const novo = { ...structuredClone(p), id: p.id || randomUUID() }; produtos.push(novo); return structuredClone(novo);
    },
    async excluirProduto(id) { const i = produtos.findIndex((x) => x.id === id); if (i >= 0) produtos.splice(i, 1); if (ajustes.destaque_id === id) ajustes.destaque_id = null; },
    async salvarAjustes(a) { const { id, ...resto } = a || {}; Object.assign(ajustes, structuredClone(resto)); return structuredClone(ajustes); },
    async listarContatos() { return structuredClone(contatos.map((c, i) => ({ id: i + 1, ...c })).reverse()); },
    async marcarContato(id, respondido) { if (contatos[Number(id) - 1]) contatos[Number(id) - 1].respondido = !!respondido; },
    async guardarFoto(bytes, tipo) { const id = randomUUID(); fotos.set(id, { tipo, dados: Buffer.from(bytes) }); return urlDaFoto(id); },
    async obterFoto(id) { return fotos.get(String(id)) || null; },
    async obterAdmin(email) { return email ? { email: String(email).toLowerCase(), senha_hash: null, senha_em: new Date(0) } : null; },
    async definirSenha() { return new Date(0); },
    async criarReset() {}, async usarReset() { return null; },
    async verificarAdmin(token) {
      if (token === 'demo') return 'demo@admiravel';
      return lerPasse(token)?.email || null;
    },
  };
}

let instancia = null;
export function db() {
  if (instancia) return instancia;
  if (env('DATABASE_URL')) instancia = postgres();
  else { memoria = memoria || bancoMemoria(); instancia = memoria; }
  return instancia;
}
// usado nos testes
export function usarBanco(b) { instancia = b; }
