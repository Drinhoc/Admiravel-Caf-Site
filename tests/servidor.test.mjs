// O servidor único (Railway / npm start) sobe, serve as páginas e responde a API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORTA = 18000 + Math.floor(Math.random() * 1000);
const B = `http://127.0.0.1:${PORTA}`;
let proc;

before(async () => {
  const env = { PATH: process.env.PATH, PORT: String(PORTA), FAXINA: 'off' };
  proc = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(B + '/api/config')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não subiu');
});
after(() => proc?.kill());

test('páginas, endereços curtos e painel', async () => {
  for (const [c, s] of [['/', 200], ['/quem-somos', 200], ['/eventos', 200], ['/painel/', 200], ['/nao-existe', 404]]) {
    assert.equal((await fetch(B + c)).status, s, c);
  }
  const r = await fetch(B + '/painel', { redirect: 'manual' });
  assert.equal(r.status, 301);
  const p = await fetch(B + '/painel/');
  assert.equal(p.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(p.headers.get('x-content-type-options'), 'nosniff');
});

test('API do catálogo traz o café em destaque', async () => {
  const d = await (await fetch(B + '/api/produtos')).json();
  assert.ok(d.produtos.length >= 3);
  assert.ok(d.produtos.some((p) => p.id === d.ajustes.destaque_id));
});

test('não deixa sair da pasta do site', async () => {
  const r = await fetch(B + '/%2e%2e/package.json');
  assert.notEqual(r.status, 200);
});

test('painel em modo demonstração: entra, lista e protege', async () => {
  const api = (acao, dados = {}, passe) => fetch(B + '/api/admin', { method: 'POST', headers: { 'content-type': 'application/json', ...(passe ? { authorization: `Bearer ${passe}` } : {}) }, body: JSON.stringify({ acao, ...dados }) });
  assert.equal((await api('produtos')).status, 401);
  const { passe } = await (await api('entrar', { email: 'dono@teste.com', senha: 'qualquer' })).json();
  const ps = await (await api('produtos', {}, passe)).json();
  assert.ok(ps.length >= 3);
  assert.equal((await (await fetch(B + '/api/config')).json()).banco, 'memoria');
  assert.equal((await fetch(B + '/api/foto?id=nada')).status, 404);
});
