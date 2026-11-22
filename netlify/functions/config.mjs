// GET /api/config — situação PÚBLICA das conexões (sem nenhuma chave): o painel mostra em Ajustes.
import { json } from './_lib/util.mjs';
import { db } from './_lib/db.mjs';
import { provedorPagamento } from './_lib/pagamento.mjs';
import { provedorNF } from './_lib/nf.mjs';
import { meAtivo } from './_lib/melhorenvio.mjs';

export default async () => json({
  banco: db().tipo,
  pagamento: provedorPagamento() || 'demo', nf: provedorNF() || 'sem NF automática', frete: meAtivo() ? 'Melhor Envio' : 'tabela de demonstração',
});
export const config = { path: '/api/config' };
