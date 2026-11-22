// Camada de dados do painel. Com o servidor no ar (Railway ou `npm start`) usa a API /api/admin;
// aberto como arquivo estático (prévia), cai numa demonstração que guarda tudo no navegador.
import * as demo from '../assets/js/demo-db.js';

export async function criarStore() {
  let cfg = null;
  try {
    const r = await fetch('../api/config');
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) cfg = await r.json();
  } catch {}
  return cfg?.banco ? lojaServidor(cfg) : lojaDemo(cfg);
}

// Reduz a foto no próprio navegador antes de enviar (fica leve e rápida no site).
export async function reduzirFoto(arquivo, max = 1600, qualidade = 0.85) {
  const bm = await createImageBitmap(arquivo);
  const s = Math.min(1, max / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  const gerar = (tipo) => new Promise((ok) => c.toBlob(ok, tipo, qualidade));
  const b = await gerar('image/webp');
  return b?.type === 'image/webp' ? b : gerar('image/jpeg'); // Safari antigo não gera WebP
}
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'produto';

// ---------------- Servidor (Postgres no Railway) ----------------
function lojaServidor(cfg) {
  const CHAVE = 'adm_passe_v1';
  let passe = ''; try { passe = localStorage.getItem(CHAVE) || ''; } catch {}
  const guardar = (p) => { passe = p || ''; try { p ? localStorage.setItem(CHAVE, p) : localStorage.removeItem(CHAVE); } catch {} };
  const codigoReset = new URLSearchParams(location.search).get('redefinir');

  async function api(acao, dados = {}, url = '../api/admin') {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(passe ? { Authorization: `Bearer ${passe}` } : {}) }, body: JSON.stringify({ acao, ...dados }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && passe && !['entrar', 'trocar_senha'].includes(acao)) { guardar(''); location.reload(); }
    if (!r.ok) throw new Error(d.erro || 'Não deu certo. Tente de novo.');
    return d;
  }
  const comSessao = (d) => { guardar(d.passe); return { user: { email: d.email } }; };

  return {
    demo: false, cfg,
    async sessao() {
      if (!passe) return null;
      try { return { user: { email: (await api('sessao')).email } }; } catch { return null; }
    },
    async entrar(email, senha) { return comSessao(await api('entrar', { email, senha })); },
    async sair() { guardar(''); },
    async esqueci(email) { await api('esqueci', { email }); },
    aoRecuperarSenha(fn) { if (codigoReset) fn(); },
    async novaSenha(senha) {
      const s = comSessao(await api('redefinir', { codigo: codigoReset, senha }));
      history.replaceState(null, '', location.pathname);
      return s;
    },
    async trocarSenha(atual, nova) { return comSessao(await api('trocar_senha', { atual, nova })); },

    pedidos: (filtro) => api('pedidos', { filtro }),
    async contarParaEnviar() { return (await api('contar')).n; },
    async acao(acao, pedido_id, extra = {}) { return (await api(acao, { pedido_id, ...extra }, '../api/painel')).pedido; },

    produtos: () => api('produtos'),
    importarFotos: (produto_id) => api('importar', { produto_id }, '../api/importar-fotos'),
    salvarProduto: (p) => api('salvar_produto', { produto: { ...p, slug: p.slug || slugify(p.nome) } }),
    async excluirProduto(id) { await api('excluir_produto', { id }); },
    async enviarFoto(arquivo) {
      const blob = ['image/webp', 'image/jpeg'].includes(arquivo.type) && arquivo.size < 500e3 ? arquivo : await reduzirFoto(arquivo);
      const base64 = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = falha; r.readAsDataURL(blob); });
      return (await api('enviar_foto', { tipo: blob.type, base64 })).url;
    },
    ajustes: () => api('ajustes'),
    salvarAjustes: (ajustes) => api('salvar_ajustes', { ajustes }),
    contatos: () => api('contatos'),
    async marcarContato(id, respondido) { await api('marcar_contato', { id, respondido }); },
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
    async esqueci() {}, aoRecuperarSenha() {}, async novaSenha() {}, async trocarSenha() { return { user: { email: logado } }; },

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
