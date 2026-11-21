// Formulário "Solicitar proposta": envia para o servidor (que avisa o dono) ou, na prévia, guarda no navegador.
import { modo, api, toast } from './loja.js';
import * as demo from './demo-db.js';

const form = document.getElementById('quote');
const ok = document.getElementById('quote-ok');
const erro = document.getElementById('quote-erro');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erro.textContent = '';
  const d = Object.fromEntries(new FormData(form));
  if (!d.nome?.trim() || String(d.whatsapp || '').replace(/\D/g, '').length < 10) {
    erro.textContent = 'Informe seu nome e um WhatsApp com DDD.';
    return;
  }
  const b = form.querySelector('button[type=submit]');
  b.disabled = true; b.textContent = 'Enviando…';
  try {
    if ((await modo()) === 'api') await api('evento', d);
    else await demo.alterar((db) => { db.contatos.unshift({ ...d, criado_em: new Date().toISOString() }); });
    form.reset();
    ok.hidden = false;
    toast('Pedido de proposta enviado!');
  } catch (err) {
    erro.textContent = err.message;
  } finally {
    b.disabled = false; b.textContent = 'Solicitar proposta';
  }
});
