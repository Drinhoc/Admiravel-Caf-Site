// "Trazer fotos do Wix": o servidor baixa a foto do Wix e guarda no banco do site (Wix simulado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usarBanco, bancoMemoria } from '../netlify/functions/_lib/db.mjs';
import importar from '../netlify/functions/importar-fotos.mjs';
import foto from '../netlify/functions/foto.mjs';

const WIX = 'https://static.wixstatic.com/media/59f850_x~mv2.png/v1/fit/w_800,h_800,q_85/a.webp';
const ID = '11111111-1111-4111-8111-000000000009';
const banco = bancoMemoria({ produtos: [{ id: ID, nome: 'Floral e Mel', slug: 'floral', ativo: true, fotos: [WIX, 'https://outro.cdn/b.webp'], embalagens: [] }], ajustes: {} });
usarBanco(banco);

globalThis.fetch = async (url) => {
  if (String(url) === WIX) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
  throw new Error('não simulado: ' + url);
};

test('copia só as fotos do Wix, guarda no banco e serve em /api/foto', async () => {
  const req = (token) => new Request('https://loja/api/importar-fotos', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ produto_id: ID }) });
  assert.equal((await importar(req('ruim'))).status, 401);

  const r = await importar(req('demo'));
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  assert.equal(d.copiadas, 1);
  assert.match(d.fotos[0], /^api\/foto\?id=[0-9a-f-]{36}$/);
  assert.equal(d.fotos[1], 'https://outro.cdn/b.webp');
  assert.deepEqual((await banco.produtosPorIds([ID]))[0].fotos, d.fotos);

  const f = await foto(new Request('https://loja/' + d.fotos[0]));
  assert.equal(f.status, 200);
  assert.equal(f.headers.get('content-type'), 'image/webp');
  assert.deepEqual([...new Uint8Array(await f.arrayBuffer())], [1, 2, 3]);
  assert.equal((await foto(new Request('https://loja/api/foto?id=nada'))).status, 404);
});
