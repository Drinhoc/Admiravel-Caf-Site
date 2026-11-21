// GET /api/produtos — catálogo público (só produtos ativos), com cache curto na CDN.
import { db } from './_lib/db.mjs';
import { json, erro } from './_lib/util.mjs';

export default async () => {
  try {
    const [produtos, ajustes] = await Promise.all([db().listarProdutos({ ativos: true }), db().ajustes()]);
    const publico = produtos.map(({ criado_em, atualizado_em, ...p }) => p);
    return json({ produtos: publico, ajustes: { aviso_topo: ajustes.aviso_topo || '', frete_gratis_acima: Number(ajustes.frete_gratis_acima || 0) } }, 200,
      { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' });
  } catch (e) {
    console.error(e);
    return erro('Não foi possível carregar os produtos agora.', 503);
  }
};
export const config = { path: '/api/produtos' };
