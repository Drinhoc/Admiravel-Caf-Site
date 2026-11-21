// Utilidades compartilhadas pelas funções.
export const env = (k, d = '') => (globalThis.process?.env?.[k] ?? d);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
export const erro = (msg, status = 400, extra = {}) => json({ erro: msg, ...extra }, status);

export async function lerJson(req) {
  try { return await req.json(); } catch { return null; }
}

export const soDigitos = (s) => String(s ?? '').replace(/\D+/g, '');
export const centavos = (v) => Math.round(Number(v) * 100);
export const reais = (c) => Math.round(c) / 100;
export const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function cpfValido(cpf) {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    const d = ((s * 10) % 11) % 10;
    if (d !== Number(c[t])) return false;
  }
  return true;
}

export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e ?? '').trim());

export function limparTexto(s, max = 200) {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// fetch com timeout e erro legível
export async function chamar(url, opts = {}, nome = 'serviço') {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 8000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const txt = await r.text();
    let body; try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
    if (!r.ok) {
      const det = typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)?.slice(0, 500);
      const e = new Error(`${nome} respondeu ${r.status}: ${det}`);
      e.status = r.status; e.body = body;
      throw e;
    }
    return body;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${nome} não respondeu a tempo`);
    throw e;
  } finally { clearTimeout(t); }
}

export function siteUrl(req) {
  const fixo = env('SITE_URL') || env('URL');
  if (fixo) return fixo.replace(/\/$/, '');
  try { return new URL(req.url).origin; } catch { return 'http://localhost:8888'; }
}

export const agoraIso = () => new Date().toISOString();
