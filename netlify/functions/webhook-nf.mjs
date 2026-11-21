// POST /api/webhook-nf — aviso do Focus NFe ou do Notaas de que a NF foi autorizada/recusada.
// A situação da nota é reconsultada no provedor dentro do processarPedido.
import { db } from './_lib/db.mjs';
import { processarPedido } from './_lib/fluxo.mjs';
import { assinaturaNotaasValida } from './_lib/nf.mjs';
import { json, env } from './_lib/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const bruto = await req.text();
  let corpo = {};
  try { corpo = JSON.parse(bruto); } catch {}
  const prov = env('NF_PROVEDOR').toLowerCase();
  if (prov === 'focus' && env('FOCUS_WEBHOOK_SECRET') && req.headers.get('authorization') !== env('FOCUS_WEBHOOK_SECRET')) return json({ ok: false }, 401);
  if (prov === 'notaas' && !assinaturaNotaasValida(bruto, req.headers.get('x-notaas-signature'))) return json({ ok: false }, 401);

  // Focus manda "ref" (pedido-<numero>); Notaas manda o id da nota (invoiceId) e a "referencia"
  const ref = String(corpo.ref || corpo.referencia || corpo.data?.referencia || '');
  const ids = [corpo.invoiceId, corpo.data?.invoiceId, corpo.data?.id, corpo.id].filter(Boolean).map(String);
  const pedidoId = new URL(req.url).searchParams.get('pedido');
  try {
    if (pedidoId) await processarPedido(pedidoId);
    else {
      for (const p of await db().pedidosEmAndamento()) {
        const bate = (p.nf_ref && (p.nf_ref === ref || ids.includes(String(p.nf_ref)))) || ref === `pedido-${p.numero}`;
        if (bate) await processarPedido(p.id);
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error('webhook-nf', e);
    return json({ ok: false }, 500);
  }
};
export const config = { path: '/api/webhook-nf' };
