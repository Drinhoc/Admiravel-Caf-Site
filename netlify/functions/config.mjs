// GET /api/config — dados PÚBLICOS para o painel se conectar ao Supabase (a chave "anon" é pública por definição;
// quem protege os dados são as regras de segurança (RLS) do banco).
import { json, env } from './_lib/util.mjs';
import { provedorPagamento } from './_lib/pagamento.mjs';
import { provedorNF } from './_lib/nf.mjs';
import { meAtivo } from './_lib/melhorenvio.mjs';

export default async () => json({
  supabaseUrl: env('SUPABASE_URL') || null,
  supabaseAnonKey: env('SUPABASE_ANON_KEY') || null,
  pagamento: provedorPagamento() || 'demo', nf: provedorNF() || 'sem NF automática', frete: meAtivo() ? 'Melhor Envio' : 'tabela de demonstração',
});
export const config = { path: '/api/config' };
