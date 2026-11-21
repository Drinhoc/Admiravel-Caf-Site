// POST /api/frete  { cep, itens:[{produto_id, embalagem_id, moagem, quantidade}] }
import { db } from './_lib/db.mjs';
import { json, erro, lerJson } from './_lib/util.mjs';
import { montarItens } from './_lib/precos.mjs';
import { opcoesFrete } from './_lib/frete.mjs';

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const corpo = await lerJson(req);
  if (!corpo) return erro('Pedido inválido');
  try {
    const ids = [...new Set((corpo.itens || []).map((i) => i.produto_id))];
    const itens = montarItens(corpo.itens, await db().produtosPorIds(ids));
    const opcoes = await opcoesFrete(corpo.cep, itens, await db().ajustes());
    if (!opcoes.length) return erro('Não encontramos frete para esse CEP. Fale com a gente no WhatsApp.', 422);
    return json({ opcoes: opcoes.map(({ volumes, ...o }) => o) });
  } catch (e) {
    return erro(e.message || 'Não foi possível calcular o frete.', e.status ? 502 : 422);
  }
};
export const config = { path: '/api/frete' };
