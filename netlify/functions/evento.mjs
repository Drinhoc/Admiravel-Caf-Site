// POST /api/evento — formulário "Solicitar proposta" da página de eventos.
import { db } from './_lib/db.mjs';
import { avisarDono } from './_lib/avisos.mjs';
import { json, erro, lerJson, limparTexto, soDigitos } from './_lib/util.mjs';

export default async (req) => {
  if (req.method !== 'POST') return erro('Use POST', 405);
  const c = await lerJson(req);
  if (!c || c.site) return json({ ok: true }); // armadilha anti-robô: finge que deu certo
  const lead = {
    nome: limparTexto(c.nome, 120), whatsapp: soDigitos(c.whatsapp).slice(0, 13), email: limparTexto(c.email, 160),
    tipo: limparTexto(c.tipo, 40), data: limparTexto(c.data, 20), cidade: limparTexto(c.cidade, 80),
    convidados: limparTexto(c.convidados, 10), mensagem: limparTexto(c.mensagem, 1200),
  };
  if (!lead.nome || lead.whatsapp.length < 10) return erro('Informe seu nome e WhatsApp com DDD.', 422);
  try {
    await db().salvarContatoEvento(lead);
    await avisarDono('evento', lead).catch((e) => console.error('aviso evento', e));
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return erro('Não conseguimos enviar agora. Chame a gente no WhatsApp.', 502);
  }
};
export const config = { path: '/api/evento' };
