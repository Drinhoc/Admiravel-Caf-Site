// Avisos para o dono (e-mail e/ou Telegram) e para o cliente (e-mail).
// E-mail via Resend (grátis até 3.000/mês). Telegram via bot (grátis, chega no celular na hora).
// Sem nada configurado, os avisos só ficam registrados no histórico do pedido.
import { env, chamar, brl, escaparHtml as h } from './util.mjs';
import { LOJA } from './loja.mjs';

const painel = () => `${(env('SITE_URL') || env('URL') || '').replace(/\/$/, '')}/painel/`;

async function email(para, assunto, html) {
  if (!env('RESEND_API_KEY') || !para) return false;
  await chamar('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('AVISO_EMAIL_DE', `Admirável Café <pedidos@${(env('SITE_URL') || 'admiravelcafe.com.br').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '')}>`), to: [para], subject: assunto, html }),
  }, 'E-mail');
  return true;
}

async function telegram(texto) {
  if (!env('TELEGRAM_BOT_TOKEN') || !env('TELEGRAM_CHAT_ID')) return false;
  await chamar(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
  }, 'Telegram');
  return true;
}

const listaItens = (p) => p.itens.map((i) => `${i.quantidade}× ${i.nome}`).join('\n');
const destino = (p) => (p.frete?.local ? 'Entrega local em Limeira' : `${p.endereco.cidade}/${p.endereco.uf} · ${p.frete?.nome || ''}`);

export function textoDono(tipo, p) {
  const cab = `Pedido #${p.numero} · ${brl(p.total)}`;
  if (tipo === 'novo') {
    const nf = p.nf_status === 'manual' ? '\n⚠️ NF: emita a nota e cole a chave no painel para liberar a etiqueta.'
      : p.nf_status === 'dispensada' ? (p.frete?.local ? '' : '\nEtiqueta: sendo gerada (com declaração de conteúdo).')
      : '\nNF e etiqueta: sendo geradas automaticamente.';
    return `☕ <b>Novo pedido pago!</b>\n${cab}\n${h(p.cliente.nome)} — ${h(destino(p))}\n\n${h(listaItens(p))}${nf}\n\n${painel()}`;
  }
  if (tipo === 'pronto') {
    const linhas = [`✅ <b>Pronto para despachar</b>`, cab, h(p.cliente.nome) + ' — ' + h(destino(p))];
    if (p.nf_danfe_url) linhas.push(`NF: ${p.nf_danfe_url}`);
    if (p.etiqueta_url) linhas.push(`Etiqueta: ${p.etiqueta_url}`);
    if (p.frete?.local) linhas.push('Entrega local: combine com o cliente pelo WhatsApp ' + (p.cliente.telefone || ''));
    linhas.push('', painel());
    return linhas.join('\n');
  }
  if (tipo === 'problema') {
    const erros = [p.nf_status === 'erro' && `NF: ${p.nf_erro}`, p.envio_status === 'erro' && `Etiqueta: ${p.envio_erro}`, p.pagamento_alerta].filter(Boolean);
    return `⚠️ <b>Pedido #${p.numero} precisa de você</b>\n${h(erros.join('\n'))}\n\nAbra o painel e toque em "Tentar de novo" ou resolva à mão:\n${painel()}`;
  }
  if (tipo === 'evento') {
    return `🎉 <b>Pedido de orçamento de evento</b>\n${h(p.nome)} · ${h(p.whatsapp)}\n${h(p.tipo)} · ${h(p.data || 'data a definir')} · ${h(p.cidade || '')} · ${h(p.convidados || '?')} convidados\n${h(p.mensagem || '')}\nhttps://wa.me/55${String(p.whatsapp).replace(/\D/g, '')}`;
  }
  return cab;
}

// Envia para o dono por todos os canais configurados. Devolve a lista de canais usados.
export async function avisarDono(tipo, dados) {
  const texto = textoDono(tipo, dados);
  const usados = [];
  const tarefas = [
    telegram(texto).then((ok) => ok && usados.push('telegram')),
    email(env('AVISO_EMAIL_PARA'), texto.split('\n')[0].replace(/<[^>]+>/g, '').replace(/[☕✅⚠️🎉]\s?/u, '') + (dados.numero ? ` · #${dados.numero}` : ''),
      `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;white-space:pre-line">${texto.replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</div>`)
      .then((ok) => ok && usados.push('email')),
  ];
  const r = await Promise.allSettled(tarefas);
  const falhas = r.filter((x) => x.status === 'rejected').map((x) => x.reason?.message);
  return { usados, falhas };
}

function moldura(conteudo) {
  return `<div style="background:#F5F3EE;padding:32px 16px;font-family:Arial,sans-serif;color:#1F1B18">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden">
    <div style="background:#1F1B18;color:#EAB54A;padding:22px 28px;font-size:22px;letter-spacing:1px;text-transform:uppercase;font-weight:bold">Admirável Café</div>
    <div style="padding:28px;font-size:15px;line-height:1.6">${conteudo}</div>
    <div style="padding:16px 28px;background:#EAE6DD;font-size:12px;color:#6B635B">Dúvidas? Responda este e-mail ou chame no WhatsApp: <a href="https://wa.me/${LOJA.whatsapp}">(19) 98220-7977</a></div>
  </div></div>`;
}

export async function avisarCliente(tipo, p, base) {
  const link = `${base}/pedido.html?id=${p.id}&t=${p.token}`;
  const itens = p.itens.map((i) => `<tr><td style="padding:6px 0">${i.quantidade}× ${h(i.nome)}</td><td style="text-align:right">${brl(i.preco * i.quantidade)}</td></tr>`).join('');
  const tabela = `<table style="width:100%;border-collapse:collapse;margin:16px 0">${itens}<tr><td style="padding:6px 0">Frete</td><td style="text-align:right">${brl(p.frete?.preco || 0)}</td></tr><tr><td style="padding:8px 0;border-top:1px solid #ddd"><b>Total</b></td><td style="text-align:right;border-top:1px solid #ddd"><b>${brl(p.total)}</b></td></tr></table>`;
  const primeiro = h(String(p.cliente.nome).split(' ')[0]);
  if (tipo === 'confirmado') {
    return email(p.cliente.email, `Pedido #${p.numero} confirmado ☕`, moldura(
      `<p>Oi, ${primeiro}! Recebemos o seu pagamento e já estamos separando o seu café.</p>${tabela}<p>Você recebe outro e-mail com o código de rastreio quando ele sair daqui.</p><p><a href="${link}" style="display:inline-block;background:#EAB54A;color:#1F1B18;padding:12px 22px;text-decoration:none;font-weight:bold;letter-spacing:1px;text-transform:uppercase;font-size:12px">Acompanhar pedido</a></p>`));
  }
  if (tipo === 'enviado') {
    const rast = p.rastreio ? `<p>Código de rastreio: <b>${h(p.rastreio)}</b><br><a href="https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(p.rastreio)}">Rastrear entrega</a></p>` : '';
    const nf = p.nf_danfe_url ? `<p><a href="${p.nf_danfe_url}">Baixar a nota fiscal</a></p>` : '';
    return email(p.cliente.email, `Seu café saiu para entrega · pedido #${p.numero}`, moldura(
      `<p>${primeiro}, o seu pedido saiu daqui! 🚚</p>${rast}${nf}<p><a href="${link}">Ver o pedido</a></p>`));
  }
  return false;
}
