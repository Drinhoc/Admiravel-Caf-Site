// Servidor local para testar o site + funções sem instalar nada: `npm run dev` → http://localhost:8888
// Lê variáveis de um arquivo .env (se existir). Sem chaves, tudo roda em modo demonstração.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(new URL('..', import.meta.url).pathname);
const SITE = join(RAIZ, 'site');
const FUNCS = join(RAIZ, 'netlify/functions');
const PORTA = Number(process.env.PORT || 8888);

if (existsSync(join(RAIZ, '.env'))) {
  for (const linha of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.SITE_URL ||= `http://localhost:${PORTA}`;

const rotas = new Map();
for (const f of await readdir(FUNCS)) {
  if (!f.endsWith('.mjs')) continue;
  const mod = await import(pathToFileURL(join(FUNCS, f)).href);
  if (mod.config?.path) rotas.set(mod.config.path, mod.default);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const fn = rotas.get(url.pathname);
  if (fn) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const corpo = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await fn(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let caminho = decodeURIComponent(url.pathname);
  if (caminho === '/eventos') caminho = '/eventos.html';
  if (caminho.endsWith('/')) caminho += 'index.html';
  const arq = join(SITE, caminho);
  if (!arq.startsWith(SITE)) { res.writeHead(403).end(); return; }
  try {
    const dados = await readFile(arq);
    res.writeHead(200, { 'content-type': TIPOS[extname(arq)] || 'application/octet-stream' });
    res.end(dados);
  } catch {
    if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }).end('{"erro":"não encontrado"}'); return; }
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>Página não encontrada</h1><a href="/">Voltar</a>');
  }
}).listen(PORTA, () => console.log(`Admirável Café rodando em http://localhost:${PORTA}  (funções: ${[...rotas.keys()].join(', ')})`));
