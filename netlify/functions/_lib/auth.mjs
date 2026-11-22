// Login do painel: senha guardada com scrypt; o navegador recebe um "passe" assinado (HMAC) que vale 30 dias.
// Trocar a senha invalida os passes antigos (a data da troca entra na assinatura).
import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './util.mjs';

const scryptP = promisify(scrypt);
const DIAS = 30;

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const h = await scryptP(String(senha).normalize('NFC'), sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
}
export async function conferirSenha(senha, guardado) {
  const [alg, sal, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const esperado = Buffer.from(h, 'base64');
  const calc = await scryptP(String(senha).normalize('NFC'), Buffer.from(sal, 'base64'), esperado.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(calc, esperado);
}
export function senhaFraca(senha) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (/^(\d)\1+$/.test(s) || /^(12345678|87654321|senha123|admiravel)/i.test(s)) return 'Essa senha é fácil demais de adivinhar.';
  return '';
}

// Segredo que assina os passes: SESSAO_SEGREDO, se definido; senão o banco gera um e guarda (definirSegredo).
let guardado = '';
export function definirSegredo(s) { guardado = String(s || ''); }
function segredo() {
  const s = env('SESSAO_SEGREDO');
  if (s && s.length >= 32) return s;
  if (guardado.length >= 32) return guardado;
  if (env('DATABASE_URL')) throw new Error('O banco ainda não terminou de iniciar.');
  return 'segredo-de-demonstracao-nao-use-em-producao';
}
const b64 = (s) => Buffer.from(s).toString('base64url');
const assinar = (txt) => createHmac('sha256', segredo()).update(txt).digest('base64url');

// passe = base64(email|expira|senha_em).assinatura
export function criarPasse(email, senhaEm) {
  const corpo = b64(`${email}|${Date.now() + DIAS * 864e5}|${new Date(senhaEm || 0).getTime()}`);
  return `${corpo}.${assinar(corpo)}`;
}
export function lerPasse(passe) {
  const [corpo, ass] = String(passe || '').split('.');
  if (!corpo || !ass) return null;
  const esperado = assinar(corpo);
  if (ass.length !== esperado.length || !timingSafeEqual(Buffer.from(ass), Buffer.from(esperado))) return null;
  const [email, expira, senhaEm] = Buffer.from(corpo, 'base64url').toString().split('|');
  if (!email || Number(expira) < Date.now()) return null;
  return { email, senhaEm: Number(senhaEm) };
}

export const novoCodigo = () => randomBytes(24).toString('base64url');
export const hashCodigo = (c) => createHash('sha256').update(String(c)).digest('hex');

// Confere o "Authorization: Bearer <passe>" de uma chamada do painel e devolve o e-mail do admin (ou null).
export async function adminDaRequisicao(req, banco) {
  const passe = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (banco.pronto) await banco.pronto().catch(() => {});
  return banco.verificarAdmin(passe);
}
