// Roda sozinho a cada 15 minutos: continua pedidos pagos que ficaram pela metade
// (NF em processamento, etiqueta aguardando, erro temporário, aviso não enviado).
import { db } from './_lib/db.mjs';
import { processarPedido } from './_lib/fluxo.mjs';

export default async () => {
  const pendentes = await db().pedidosEmAndamento();
  for (const p of pendentes) {
    try { await processarPedido(p.id); } catch (e) { console.error('faxina', p.numero, e.message); }
  }
  console.log(`faxina: ${pendentes.length} pedido(s) verificados`);
};
export const config = { schedule: '*/15 * * * *' };
