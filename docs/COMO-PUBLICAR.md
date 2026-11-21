# Admirável Café: o que falta para ligar o site

O site está pronto e testado em modo demonstração. Falta só criar as contas abaixo, colar as chaves no Netlify e fazer um pedido de teste de verdade.

**Regra de ouro:** o site atual no Wix (admiravelcafe.com.br) continua no ar, intocado, até o site novo passar no teste. A NF e o Mercado Envios de lá seguem funcionando. A troca de domínio é o último passo.

---

## O que é preciso (em ordem)

| # | Conta | Para quê | Custo | Quem faz |
|---|---|---|---|---|
| 1 | GitHub (repositório do site) | guardar o código; o Netlify publica dele | grátis | Drinho |
| 2 | Netlify | hospedar o site e o servidor | grátis (plano Free permite loja) | Drinho |
| 3 | Supabase | banco de dados, login do painel e fotos | grátis | Drinho |
| 4 | InfinitePay | receber Pix e cartão | Pix 0%; cartão conforme o plano da conta | dono (já tem ou abre no app) |
| 5 | Melhor Envio | frete no carrinho e etiqueta | grátis; paga só as etiquetas (saldo na carteira) | dono |
| 6 | Notaas (opcional) | NF-e automática | grátis até 20 notas/mês | dono + contador |
| 7 | Resend | e-mails de pedido (cliente e dono) | grátis até 3.000/mês | Drinho |
| 8 | Telegram (opcional) | aviso no celular na hora do pedido | grátis | dono |

Sem a Notaas o site já funciona: o pedido vai com **declaração de conteúdo** (permitido para MEI vendendo para pessoa física). Basta deixar `NF_PROVEDOR` vazio.

---

## 1. Supabase (banco, login e fotos)

1. Crie um projeto em supabase.com (região São Paulo).
2. **SQL Editor** → cole e rode `supabase/schema.sql`. Depois rode `supabase/seed.sql` (os 7 produtos de hoje, com preços e estoque do Wix).
3. **Authentication → Users → Add user**: crie o usuário do dono (e o seu), com e-mail e senha.
4. No SQL Editor, libere o painel para esses e-mails:
   ```sql
   insert into admins (email) values ('admiravelcafe@gmail.com'), ('seu-email@exemplo.com');
   ```
5. **Authentication → Sign In / Providers**: desligue "Allow new users to sign up" (ninguém de fora cria conta).
6. **Authentication → URL Configuration**: em Site URL coloque o endereço do site; em Redirect URLs adicione `https://SEU-SITE/painel/` (é para o "Esqueci a senha").
7. **Project Settings → API**: copie `URL`, `anon public` e `service_role` para as variáveis do passo 2.

## 2. Netlify (site no ar, ainda sem domínio)

1. Suba esta pasta para um repositório no GitHub (privado).
2. No Netlify: **Add new site → Import from Git** → escolha o repositório. Ele lê o `netlify.toml` sozinho (pasta `site`, funções em `netlify/functions`).
3. **Site configuration → Environment variables**: cadastre as variáveis do arquivo `.env.example`. A primeira é `SITE_URL=https://<nome>.netlify.app`.
4. Faça um novo deploy. Abra `https://<nome>.netlify.app/painel/` e entre com o usuário do passo 1.3.
5. No painel, aba **Produtos**, toque em **Trazer fotos do Wix**: ele copia as fotos para o Supabase (assim nada depende do Wix depois).

## 3. InfinitePay (pagamento)

1. No app InfinitePay, ative o **Checkout/Link de pagamento** e anote a sua **InfiniteTag** (o `$nome`).
2. Variáveis: `PAGAMENTO_PROVEDOR=infinitepay` e `INFINITEPAY_HANDLE=nome` (sem o `$`).
3. Não precisa cadastrar webhook: o site informa o endereço a cada pedido. Mesmo assim, o site sempre confere o pagamento direto na InfinitePay antes de liberar o pedido (um aviso falso não libera nada).
4. Parcelamento e taxas do cartão são configurados no app da InfinitePay.

A InfinitePay não tem ambiente de teste. O teste é um pedido real de R$ 1 (ver passo 7).

## 4. Melhor Envio (frete e etiqueta)

1. Comece pelo **sandbox** (teste): crie conta em sandbox.melhorenvio.com.br. Em **Integrações → Permissões de acesso → Gerar token**, marque: `cart-read`, `cart-write`, `shipping-calculate`, `shipping-checkout`, `shipping-generate`, `shipping-print`, `shipping-tracking`, `orders-read`.
2. Variáveis: `ME_TOKEN=<token>` e `ME_SANDBOX=true`.
3. Para vender de verdade: gere o token na conta real (melhorenvio.com.br), troque `ME_TOKEN` e coloque `ME_SANDBOX=false`. Deixe **saldo na carteira**: a etiqueta é comprada automaticamente com ele. Sem saldo, o pedido fica com "etiqueta com erro" e o dono recebe um aviso; é só pôr saldo e tocar em **Tentar de novo** no painel.
4. O CEP de origem e o endereço do remetente estão em `netlify/functions/_lib/loja.mjs` (ver "Conferir com o dono").

## 5. Notaas (NF automática), opcional

1. Crie a conta em notaas.com.br com o CNPJ do MEI, envie o **certificado digital A1** (arquivo .pfx) e configure a série da NF-e.
2. Copie a **API key**. Variáveis: `NF_PROVEDOR=notaas` e `NOTAAS_API_KEY=<chave>`.
3. Cadastre o webhook `https://SEU-SITE/api/webhook-nf` e coloque o segredo em `NOTAAS_WEBHOOK_SECRET`.
4. Se o painel da Notaas tiver ambiente de homologação (teste), emita a primeira nota nele.
5. **Antes de emitir de verdade, o contador confere** os campos fiscais em `loja.mjs` (NCM 0901.21.00, CFOP 5101/6101, CSOSN 102, PIS/COFINS 49).

Como funciona: pago → o site pede a NF → quando autoriza, a etiqueta sai já com a chave da nota → o dono recebe "pronto para despachar". Se a nota for recusada, o site tenta de novo 3 vezes (a cada 15 min) e avisa o dono uma vez, com o motivo.

Se o dono preferir emitir a nota por fora (por exemplo, no app gratuito da SEFAZ-SP), mude `envioSemNF` para `'manual'` em `loja.mjs`: o painel mostra um campo para colar a chave da NF, e a etiqueta sai depois disso.

## 6. Avisos (e-mail e Telegram)

- **Resend:** crie a conta, adicione o domínio `admiravelcafe.com.br` e copie os registros DNS que ele pede para onde o domínio é administrado hoje (só adiciona registros, não muda o site). Variáveis: `RESEND_API_KEY`, `AVISO_EMAIL_PARA` (quem recebe o aviso de pedido novo) e `AVISO_EMAIL_DE`. Enquanto o domínio não for verificado, o Resend só envia para o e-mail da própria conta.
- **Telegram (opcional):** no Telegram, fale com `@BotFather` → `/newbot` → copie o token (`TELEGRAM_BOT_TOKEN`). Mande um "oi" para o bot novo e abra `https://api.telegram.org/bot<TOKEN>/getUpdates`: o número em `chat.id` é o `TELEGRAM_CHAT_ID`.

## 7. Teste de verdade (antes de trocar o domínio)

1. No painel, crie um produto "Teste" de R$ 1,00 com estoque 1.
2. No site `netlify.app`, compre com seus dados reais e pague com Pix.
3. Confira: a página do pedido muda para "Pagamento aprovado"; chega o e-mail de confirmação; o dono recebe o aviso; no painel aparece o pedido com NF (se ligada) e etiqueta (no sandbox, a etiqueta é de teste).
4. Estorne os R$ 1 no app da InfinitePay. Desligue ou exclua o produto "Teste".
5. Repita com cartão se quiser.

## 8. Trocar o domínio (último passo)

Só depois do teste aprovado e com o dono de acordo:

1. No Netlify: **Domain management → Add domain** → `admiravelcafe.com.br`. Ele mostra o que mudar no DNS.
2. Mude o DNS onde o domínio está registrado (Wix ou Registro.br). A troca leva de minutos a algumas horas.
3. Atualize `SITE_URL` e o Site URL do Supabase para `https://admiravelcafe.com.br`.
4. Mantenha o Wix pago por mais um mês, por segurança. O plano atual renova em 11/12/2026.

---

## Conferir com o dono (marcado como `[CONFIRMAR]` no código)

- CEP exato e bairro da Rua Presidente Prudente, 232 (origem dos pacotes).
- Razão social do MEI e inscrição estadual, se houver.
- Se a venda é de produção própria (torra própria, CFOP 5101) ou revenda (5102).
- Se ele quer NF automática (Notaas) ou vender com declaração de conteúdo.
- Faixa de CEP e preço da entrega local em Limeira (hoje: R$ 7, 1 a 4 dias úteis).
- Itens marcados como "[capacidade a confirmar]" na página de eventos.

## Para o Drinho: rodar no computador

```bash
npm run dev     # http://localhost:8888 (modo demonstração sem .env)
npm test        # 19 testes: checkout, pagamento, NF, etiqueta, avisos, painel
```
O painel de demonstração entra com qualquer e-mail e senha.
