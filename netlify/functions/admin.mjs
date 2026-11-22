// POST /api/admin { acao, ... } — login do painel e leitura/edição de produtos, pedidos, eventos e ajustes.
// Ações públicas: entrar, esqueci, redefinir. As outras exigem "Authorization: Bearer <passe>".
import { db } from './_lib/db.mjs';
import { criarPasse, conferirSenha, hashSenha, senhaFraca, novoCodigo, hashCodigo } from './_lib/auth.mjs';
import { email as enviarEmail } from './_lib/avisos.mjs';
import { json, erro, lerJson, siteUrl, escaparHtml, limparTexto, env } from './_lib/util.mjs';

const TIPOS_FOTO = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_FOTO = 4 * 1024 * 1024;
const MIN = 60 * 1000;

// trava contra chutar senha: 8 erros em 15 min por e-mail ou por IP
const erros = new Map();
const chaveIp = (req) => String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
function bloqueado(...chaves) {
  const agora = Date.now();
  return chaves.some((k) => (erros.get(k) || []).filter((t) => agora - t < 15 * MIN).length >= 8);
}
function errou(...chaves) {
  const agora = Date.now();
  for (const k of chaves) erros.set(k, [...(erros.get(k) || []).filter((t) => agora - t < 15 * MIN), agora]);
  if (erros.size > 5000) erros.clear();
}

async function sessao(banco, email, senhaEm) { return { passe: criarPasse(email, senhaEm), email }; }

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const banco = db();
  try { if (banco.pronto) await banco.pronto(); } catch (e) { console.error(e.message); return erro('O banco de dados não respondeu. Tente de novo em 1 minuto.', 503); }
  const c = (await lerJson(req)) || {};
  const emailDigitado = String(c.email || '').trim().toLowerCase();

  // ---------- públicas ----------
  if (c.acao === 'entrar') {
    const ip = chaveIp(req);
    if (bloqueado(emailDigitado, ip)) return erro('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
    if (banco.tipo === 'memoria') return json(await sessao(banco, emailDigitado || 'demo@admiravel', new Date(0)));
    const a = await banco.obterAdmin(emailDigitado);
    if (!a?.senha_hash || !(await conferirSenha(String(c.senha || ''), a.senha_hash))) {
      errou(emailDigitado, ip);
      return erro('E-mail ou senha incorretos.', 401);
    }
    return json(await sessao(banco, a.email, a.senha_em));
  }
  if (c.acao === 'esqueci') {
    if (banco.tipo !== 'memoria' && !env('RESEND_API_KEY')) return erro('O envio de e-mail ainda não está ligado. Peça ao Drinho para trocar a ADMIN_SENHA no Railway.', 503);
    const a = await banco.obterAdmin(emailDigitado);
    if (a && banco.tipo !== 'memoria') {
      const codigo = novoCodigo();
      await banco.criarReset(hashCodigo(codigo), a.email, new Date(Date.now() + 60 * MIN));
      const link = `${siteUrl(req)}/painel/?redefinir=${codigo}`;
      const foi = await enviarEmail(a.email, 'Admirável Café: criar nova senha do painel',
        `<p>Para criar uma nova senha do painel, abra o link abaixo (vale por 1 hora):</p><p><a href="${escaparHtml(link)}">${escaparHtml(link)}</a></p><p>Se não foi você que pediu, ignore este e-mail.</p>`).catch(() => false);
      if (!foi) return erro('O envio de e-mail ainda não está ligado. Peça ao Drinho para trocar a ADMIN_SENHA no Railway.', 503);
    }
    // mesma resposta exista ou não o e-mail
    return json({ ok: true });
  }
  if (c.acao === 'redefinir') {
    const problema = senhaFraca(c.senha); if (problema) return erro(problema, 422);
    const email = await banco.usarReset(hashCodigo(String(c.codigo || '')));
    if (!email) return erro('Esse link expirou ou já foi usado. Peça outro em "Esqueci a senha".', 410);
    const em = await banco.definirSenha(email, await hashSenha(c.senha));
    return json(await sessao(banco, email, em));
  }

  // ---------- só com login ----------
  const passe = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = await banco.verificarAdmin(passe);
  if (!admin) return erro('Faça login de novo.', 401);

  try {
    switch (c.acao) {
      case 'sessao': return json({ email: admin });
      case 'trocar_senha': {
        const problema = senhaFraca(c.nova); if (problema) return erro(problema, 422);
        if (banco.tipo !== 'memoria') {
          const a = await banco.obterAdmin(admin);
          if (!a?.senha_hash || !(await conferirSenha(String(c.atual || ''), a.senha_hash))) return erro('A senha atual não confere.', 401);
        }
        const em = await banco.definirSenha(admin, await hashSenha(c.nova));
        return json(await sessao(banco, admin, em));
      }
      case 'pedidos': return json(await banco.listarPedidos(String(c.filtro || 'todos')));
      case 'contar': return json({ n: await banco.contarParaEnviar() });
      case 'produtos': return json(await banco.listarProdutos({ ativos: false }));
      case 'salvar_produto': {
        const p = c.produto || {};
        if (!limparTexto(p.nome, 120)) return erro('Dê um nome ao produto.', 422);
        if (!Array.isArray(p.embalagens)) p.embalagens = [];
        return json(await banco.salvarProduto(p));
      }
      case 'excluir_produto': await banco.excluirProduto(c.id); return json({ ok: true });
      case 'ajustes': return json(await banco.ajustes());
      case 'salvar_ajustes': return json(await banco.salvarAjustes(c.ajustes || {}));
      case 'contatos': return json(await banco.listarContatos());
      case 'marcar_contato': await banco.marcarContato(c.id, c.respondido); return json({ ok: true });
      case 'enviar_foto': {
        const tipo = String(c.tipo || '');
        if (!TIPOS_FOTO.includes(tipo)) return erro('Envie a foto em JPG, PNG ou WebP.', 415);
        const bytes = Buffer.from(String(c.base64 || ''), 'base64');
        if (!bytes.length) return erro('A foto chegou vazia.', 422);
        if (bytes.length > MAX_FOTO) return erro('Foto grande demais (máximo 4 MB).', 413);
        return json({ url: await banco.guardarFoto(bytes, tipo) });
      }
      default: return erro('Ação desconhecida.', 400);
    }
  } catch (e) {
    if (e.status) return erro(e.message, e.status);
    console.error('admin', c.acao, e);
    return erro('Não deu certo. Tente de novo.', 500);
  }
};
export const config = { path: '/api/admin' };
