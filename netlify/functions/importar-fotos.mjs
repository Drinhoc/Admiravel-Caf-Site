// POST /api/importar-fotos { produto_id } — copia as fotos de um produto que ainda estão no Wix para o Supabase.
// O painel chama uma vez por produto (cada chamada é curta, cabe no limite de tempo do Netlify).
import { db } from './_lib/db.mjs';
import { json, erro, lerJson } from './_lib/util.mjs';

const doWix = (u) => /^https:\/\/static\.wixstatic\.com\//.test(u);
const nomeArquivo = (s) => String(s || 'produto').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'produto';

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const banco = db();
  const admin = await banco.verificarAdmin((req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''));
  if (!admin) return erro('Faça login de novo.', 401);
  if (!banco.guardarFoto) return erro('Só funciona com o Supabase conectado.', 400);
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
    const ext = tipo.includes('png') ? 'png' : tipo.includes('jpeg') ? 'jpg' : 'webp';
    fotos.push(await banco.guardarFoto(`${nomeArquivo(p.nome)}/wix-${i + 1}-${Date.now()}.${ext}`, new Uint8Array(await r.arrayBuffer()), tipo));
    copiadas++;
  }
  if (copiadas) await banco.atualizarProduto(p.id, { fotos });
  return json({ ok: true, copiadas, fotos });
};
export const config = { path: '/api/importar-fotos' };
