// Servidor único do site (Railway, Render, VPS ou o seu computador): `npm start`.
// Serve as páginas de /site, responde a API (/api/...) com as mesmas funções de netlify/functions
// e roda a "faxina" a cada 15 minutos (continua pedidos pagos que ficaram pela metade).
// Sem nenhuma variável de ambiente, tudo roda em modo demonstração.
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)));
const SITE = join(RAIZ, 'site');
const FUNCS = join(RAIZ, 'netlify/functions');
const PORTA = Number(process.env.PORT || 8888);
const LIMITE_CORPO = 6 * 1024 * 1024; // 6 MB (cabe uma foto enviada pelo painel)

// .env local (no Railway as variáveis vêm do painel dele)
if (existsSync(join(RAIZ, '.env'))) {
  for (const linha of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    // ignora referências do Railway (${{...}}) copiadas do .env.example
    if (m && !process.env[m[1]] && !m[2].includes('${{')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!process.env.SITE_URL && process.env.RAILWAY_PUBLIC_DOMAIN) process.env.SITE_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
if (!process.env.SITE_URL && !process.env.RAILWAY_ENVIRONMENT) process.env.SITE_URL = `http://localhost:${PORTA}`;

const rotas = new Map();
let faxina = null;
for (const f of await readdir(FUNCS)) {
  if (!f.endsWith('.mjs')) continue;
  const mod = await import(pathToFileURL(join(FUNCS, f)).href);
  if (mod.config?.path) rotas.set(mod.config.path, mod.default);
  if (mod.config?.schedule) faxina = mod.default;
}

// prepara o banco já na subida (cria/atualiza as tabelas), para o primeiro cliente não esperar
const { db } = await import(pathToFileURL(join(FUNCS, '_lib/db.mjs')).href);
db().pronto?.().then(() => console.log('Banco de dados pronto.'), (e) => console.error(e.message));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
// endereços curtos: /eventos → eventos.html
const CURTOS = { '/eventos': '/eventos.html', '/quem-somos': '/quem-somos.html', '/politicas': '/politicas.html', '/checkout': '/checkout.html', '/pedido': '/pedido.html' };
const SEGURANCA = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'SAMEORIGIN',
};

function urlDe(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORTA}`;
  return new URL(req.url, `${proto}://${host}`);
}

async function lerCorpo(req) {
  const partes = []; let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > LIMITE_CORPO) throw Object.assign(new Error('grande demais'), { status: 413 });
    partes.push(c);
  }
  return partes.length ? Buffer.concat(partes) : undefined;
}

createServer(async (req, res) => {
  try {
    const url = urlDe(req);
    const fn = rotas.get(url.pathname);
    if (fn) {
      const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await lerCorpo(req);
      const r = await fn(new Request(url, { method: req.method, headers: req.headers, body: corpo }));
      res.writeHead(r.status, { ...SEGURANCA, ...Object.fromEntries(r.headers) });
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }).end('{"erro":"não encontrado"}'); return; }
    if (url.pathname === '/painel') { res.writeHead(301, { location: '/painel/' }).end(); return; }

    let caminho = CURTOS[url.pathname] || decodeURIComponent(url.pathname);
    if (caminho.endsWith('/')) caminho += 'index.html';
    const arq = resolve(SITE, '.' + caminho);
    if (arq !== SITE && !arq.startsWith(SITE + sep)) { res.writeHead(403).end(); return; }
    const info = await stat(arq).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, { ...SEGURANCA, 'content-type': 'text/html; charset=utf-8' })
        .end('<!doctype html><meta charset="utf-8"><title>Página não encontrada</title><body style="font-family:sans-serif;padding:40px"><h1>Página não encontrada</h1><p><a href="/">Voltar para a loja</a></p>');
      return;
    }
    const cab = { ...SEGURANCA, 'content-type': TIPOS[extname(arq).toLowerCase()] || 'application/octet-stream' };
    if (caminho.startsWith('/painel/')) Object.assign(cab, { 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' });
    else if (caminho.startsWith('/assets/fonts/')) cab['cache-control'] = 'public, max-age=31536000, immutable';
    else if (caminho.startsWith('/assets/')) cab['cache-control'] = 'public, max-age=3600';
    else cab['cache-control'] = 'public, max-age=0, must-revalidate';
    res.writeHead(200, cab);
    res.end(req.method === 'HEAD' ? undefined : await readFile(arq));
  } catch (e) {
    if (!res.headersSent) res.writeHead(e.status || 500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(e.status === 413 ? 'Arquivo grande demais.' : 'Erro no servidor.');
    if (!e.status) console.error(e);
  }
}).listen(PORTA, () => {
  console.log(`Admirável Café no ar em ${process.env.SITE_URL || 'porta ' + PORTA} · API: ${[...rotas.keys()].join(', ')}`);
});

// Faxina a cada 15 minutos (desligue com FAXINA=off, por exemplo se o Netlify já roda a dele)
if (faxina && process.env.FAXINA !== 'off') {
  const rodar = () => faxina().catch((e) => console.error('faxina', e.message));
  setInterval(rodar, 15 * 60 * 1000).unref();
  setTimeout(rodar, 30 * 1000).unref();
}
