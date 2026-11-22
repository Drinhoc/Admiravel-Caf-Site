// POST /api/importar-fotos { produto_id } — copia as fotos de um produto que ainda estão no Wix para o banco do site.
// O painel chama uma vez por produto (cada chamada é curta, cabe no limite de tempo do Netlify).
import { db } from './_lib/db.mjs';
import { json, erro, lerJson } from './_lib/util.mjs';

const doWix = (u) => /^https:\/\/static\.wixstatic\.com\//.test(u);

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const banco = db();
  const admin = await banco.verificarAdmin((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!admin) return erro('Faça login de novo.', 401);
  const c = await lerJson(req);
  const p = (await banco.produtosPorIds([c?.produto_id]))[0];
  if (!p) return erro('Produto não encontrado.', 404);

  const fotos = [];
  let copiadas = 0;
  for (const [i, u] of (p.fotos || []).entries()) {
    if (!doWix(u)) { fotos.push(u); continue; }
    const r = await fetch(u);
    if (!r.ok) return erro(`O Wix não entregou a foto ${i + 1} de ${p.nome} (${r.status}).`, 502);
    const tipo = r.headers.get('content-type') || 'image/webp';
    if (!/^image\//.test(tipo)) return erro(`O Wix mandou algo que não é foto (${p.nome}, foto ${i + 1}).`, 502);
    fotos.push(await banco.guardarFoto(new Uint8Array(await r.arrayBuffer()), tipo.split(';')[0]));
    copiadas++;
  }
  if (copiadas) await banco.atualizarProduto(p.id, { fotos });
  return json({ ok: true, copiadas, fotos });
};
export const config = { path: '/api/importar-fotos' };
