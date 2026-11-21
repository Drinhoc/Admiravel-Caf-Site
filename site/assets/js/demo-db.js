// Banco de DEMONSTRAÇÃO no navegador (localStorage). Usado quando o site está sem servidor
// (prévia) — o painel e a loja compartilham estes dados, então dá para mudar um preço no painel e ver na loja.
const CHAVE = 'adm_demo_v1';
const URL_SEED = new URL('../../data/produtos-demo.json', import.meta.url);

function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; } }
function gravar(d) { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch {} }

export async function carregar() {
  let d = ler();
  if (!d) {
    const seed = await fetch(URL_SEED).then((r) => r.json());
    d = { produtos: seed.produtos, ajustes: seed.ajustes, pedidos: [], contatos: [], numero: 1000 };
    gravar(d);
  }
  return d;
}
export async function alterar(fn) { const d = await carregar(); const r = await fn(d); gravar(d); return r; }
export function zerar() { try { localStorage.removeItem(CHAVE); } catch {} }
