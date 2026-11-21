// "Trazer fotos do Wix": o servidor baixa a foto do Wix e guarda no Supabase (simulados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usarBanco, db } from '../netlify/functions/_lib/db.mjs';
import importar from '../netlify/functions/importar-fotos.mjs';

const SB = 'https://proj.supabase.co';
const WIX = 'https://static.wixstatic.com/media/59f850_x~mv2.png/v1/fit/w_800,h_800,q_85/a.webp';
const produto = { id: 'p1', nome: 'Floral e Mel', fotos: [WIX, 'https://outro.cdn/b.webp'] };
const chamadas = [];

globalThis.fetch = async (url, opts = {}) => {
  url = String(url); chamadas.push({ url, opts });
  const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  if (url === WIX) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
  if (url.endsWith('/auth/v1/user')) return opts.headers.Authorization === 'Bearer bom' ? j({ email: 'Dono@Admiravel.com' }) : j({}, 401);
  if (url.includes('/rest/v1/admins')) return j(url.includes('dono%40admiravel.com') ? [{ email: 'dono@admiravel.com' }] : []);
  if (url.includes('/rest/v1/produtos') && (opts.method || 'GET') === 'GET') return j([produto]);
  if (url.includes('/rest/v1/produtos') && opts.method === 'PATCH') return j([{ ...produto, ...JSON.parse(opts.body) }]);
  if (url.includes('/storage/v1/object/fotos/')) return j({ Key: 'ok' });
  throw new Error('não simulado: ' + url);
};

test('copia só as fotos do Wix e atualiza o produto', async () => {
  Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_SERVICE_KEY: 'svc' });
  usarBanco(null); db();
  const req = (token) => new Request('https://loja/api/importar-fotos', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ produto_id: 'p1' }) });

  assert.equal((await importar(req('ruim'))).status, 401);

  const r = await importar(req('bom'));
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.copiadas, 1);
  assert.match(d.fotos[0], /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/fotos\/floral-e-mel\/wix-1-\d+\.webp$/);
  assert.equal(d.fotos[1], 'https://outro.cdn/b.webp');
  const up = chamadas.find((c) => c.url.includes('/storage/v1/object/fotos/'));
  assert.equal(up.opts.headers.Authorization, 'Bearer svc');
  const patch = chamadas.find((c) => c.opts.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch.opts.body).fotos, d.fotos);
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
});
