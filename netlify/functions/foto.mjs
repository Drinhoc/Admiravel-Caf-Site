// GET /api/foto?id=<uuid> — entrega uma foto guardada no banco (enviada pelo painel ou copiada do Wix).
import { db } from './_lib/db.mjs';

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id');
  const f = await db().obterFoto(id).catch(() => null);
  if (!f) return new Response('Foto não encontrada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(f.dados, { headers: { 'content-type': f.tipo, 'cache-control': 'public, max-age=31536000, immutable' } });
};
export const config = { path: '/api/foto' };
