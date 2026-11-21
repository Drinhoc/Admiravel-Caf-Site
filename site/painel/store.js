// Camada de dados do painel. Com Supabase configurado usa o banco de verdade; sem ele, uma demonstração no navegador.
import * as demo from '../assets/js/demo-db.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function criarStore() {
  let cfg = null;
  try {
    const r = await fetch('../api/config');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) cfg = await r.json();
  } catch {}
  if (cfg?.supabaseUrl && cfg?.supabaseAnonKey) return lojaReal(cfg);
  return lojaDemo(cfg);
}

// Reduz a foto no próprio navegador antes de enviar (fica leve e rápida no site).
export async function reduzirFoto(arquivo, max = 1600, qualidade = 0.85) {
  const bm = await createImageBitmap(arquivo);
  const s = Math.min(1, max / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/webp', qualidade));
}
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'produto';

// ---------------- Supabase ----------------
async function lojaReal(cfg) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const token = async () => (await sb.auth.getSession()).data.session?.access_token;

  return {
    demo: false, cfg,
    async sessao() { return (await sb.auth.getSession()).data.session; },
    async entrar(email, senha) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
      const adm = await sb.from('admins').select('email').eq('email', email.toLowerCase());
      if (!adm.data?.length) { await sb.auth.signOut(); throw new Error('Este e-mail não tem acesso ao painel.'); }
      return data.session;
    },
    sair: () => sb.auth.signOut(),
    async esqueci(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })); },
    aoRecuperarSenha(fn) { sb.auth.onAuthStateChange((ev) => ev === 'PASSWORD_RECOVERY' && fn()); },
    async novaSenha(senha) { ok(await sb.auth.updateUser({ password: senha })); },

    async pedidos(filtro) {
      let q = sb.from('pedidos').select('*').order('criado_em', { ascending: false }).limit(150);
      if (filtro === 'enviar') q = q.eq('status', 'pago');
      if (filtro === 'enviado') q = q.in('status', ['enviado', 'entregue']);
      if (filtro === 'aguardando') q = q.eq('status', 'aguardando_pagamento');
      return ok(await q);
    },
    async contarParaEnviar() { const { count } = await sb.from('pedidos').select('id', { count: 'exact', head: true }).eq('status', 'pago'); return count || 0; },
    async acao(acao, pedido_id, extra = {}) {
      const r = await fetch('../api/painel', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ acao, pedido_id, ...extra }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não deu certo. Tente de novo.');
      return d.pedido;
    },

    async produtos() { return ok(await sb.from('produtos').select('*').order('ordem').order('nome')); },
    async importarFotos(produto_id) {
      const r = await fetch('../api/importar-fotos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ produto_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não consegui copiar as fotos.');
      return d;
    },
    async salvarProduto(p) {
      const dados = { ...p, slug: p.slug || slugify(p.nome), atualizado_em: new Date().toISOString() };
      if (!dados.id) delete dados.id;
      return ok(await sb.from('produtos').upsert(dados).select().single());
    },
    async excluirProduto(id) { ok(await sb.from('produtos').delete().eq('id', id)); },
    async enviarFoto(arquivo, nome) {
      const blob = arquivo.type === 'image/webp' && arquivo.size < 400e3 ? arquivo : await reduzirFoto(arquivo);
      const caminho = `${slugify(nome)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.webp`;
      ok(await sb.storage.from('fotos').upload(caminho, blob, { contentType: 'image/webp', cacheControl: '31536000' }));
      return sb.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
    },
    async ajustes() { return ok(await sb.from('ajustes').select('*').eq('id', 1).single()); },
    async salvarAjustes(a) { ok(await sb.from('ajustes').update(a).eq('id', 1)); },
    async contatos() { return ok(await sb.from('contatos_eventos').select('*').order('criado_em', { ascending: false }).limit(100)); },
    async marcarContato(id, respondido) { ok(await sb.from('contatos_eventos').update({ respondido }).eq('id', id)); },
  };
}

// ---------------- Demonstração (localStorage) ----------------
function lojaDemo(cfg) {
  const agora = () => new Date().toISOString();
  let logado = sessionStorage.getItem('adm_demo_login');
  return {
    demo: true, cfg,
    async sessao() { return logado ? { user: { email: logado } } : null; },
    async entrar(email) { logado = email || 'dono@admiravel'; sessionStorage.setItem('adm_demo_login', logado); return { user: { email: logado } }; },
    async sair() { logado = null; sessionStorage.removeItem('adm_demo_login'); },
    async esqueci() {}, aoRecuperarSenha() {}, async novaSenha() {},

    async pedidos(filtro) {
      const d = await demo.carregar();
      return d.pedidos.filter((p) => filtro === 'todos' || (filtro === 'enviar' && p.status === 'pago') || (filtro === 'enviado' && ['enviado', 'entregue'].includes(p.status)) || (filtro === 'aguardando' && p.status === 'aguardando_pagamento'));
    },
    async contarParaEnviar() { return (await demo.carregar()).pedidos.filter((p) => p.status === 'pago').length; },
    async acao(acao, id, extra = {}) {
      return demo.alterar((d) => {
        const p = d.pedidos.find((x) => x.id === id);
        const log = (m) => p.historico.push({ em: agora(), msg: m });
        if (acao === 'marcar_enviado') { p.status = 'enviado'; p.rastreio = extra.rastreio || 'AA123456789BR'; log(`Marcou como enviado · rastreio ${p.rastreio}. E-mail de "saiu para entrega" enviado ao cliente.`); }
        if (acao === 'marcar_entregue') { p.status = 'entregue'; log('Marcou como entregue'); }
        if (acao === 'cancelar') { p.status = 'cancelado'; log('Cancelou o pedido'); }
        if (acao === 'informar_nf') { p.nf_chave = String(extra.chave).replace(/\D/g, ''); log('Informou a chave da NF'); if (p.envio_status === 'aguardando_nf') { p.envio_status = 'gerada'; log('Etiqueta gerada.'); } }
        if (acao === 'tentar_de_novo') { if (p.nf_status === 'erro') p.nf_status = 'autorizada'; if (p.envio_status === 'erro') p.envio_status = 'gerada'; log('Tentou de novo: tudo certo.'); }
        return p;
      });
    },
    async produtos() { return (await demo.carregar()).produtos.slice().sort((a, b) => a.ordem - b.ordem); },
    async salvarProduto(p) {
      return demo.alterar((d) => {
        const novo = { ...p, slug: p.slug || slugify(p.nome) };
        if (!novo.id) { novo.id = crypto.randomUUID(); d.produtos.push(novo); }
        else d.produtos[d.produtos.findIndex((x) => x.id === novo.id)] = novo;
        return novo;
      });
    },
    async excluirProduto(id) { await demo.alterar((d) => { d.produtos = d.produtos.filter((p) => p.id !== id); }); },
    async enviarFoto(arquivo) {
      const blob = await reduzirFoto(arquivo, 700, 0.75);
      return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
    },
    async ajustes() { return (await demo.carregar()).ajustes; },
    async salvarAjustes(a) { await demo.alterar((d) => { d.ajustes = { ...d.ajustes, ...a }; }); },
    async contatos() { return (await demo.carregar()).contatos.map((c, i) => ({ id: i, ...c })); },
    async marcarContato(id, respondido) { await demo.alterar((d) => { if (d.contatos[id]) d.contatos[id].respondido = respondido; }); },
    zerar: demo.zerar,
  };
}
