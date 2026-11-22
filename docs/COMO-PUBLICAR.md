# Admirável Café: o que falta para ligar o site

O site está pronto e testado em modo demonstração. Falta só criar as contas abaixo, colar as chaves na hospedagem (Railway) e fazer um pedido de teste de verdade.

**Regra de ouro:** o site atual no Wix (admiravelcafe.com.br) continua no ar, intocado, até o site novo passar no teste. A NF e o Mercado Envios de lá seguem funcionando. A troca de domínio é o último passo.

---

## O que é preciso (em ordem)

| # | Conta | Para quê | Custo | Quem faz |
|---|---|---|---|---|
| 1 | GitHub (repositório do site) | guardar o código; o Railway publica dele | grátis | Drinho |
| 2 | Railway (site + banco Postgres) | hospedar o site, o painel, o banco de dados e as fotos | plano Hobby, cerca de US$ 5/mês | Drinho |
| 3 | InfinitePay | receber Pix e cartão | Pix 0%; cartão conforme o plano da conta | dono (já tem ou abre no app) |
| 4 | Melhor Envio | frete no carrinho e etiqueta | grátis; paga só as etiquetas (saldo na carteira) | dono |
| 5 | Notaas (opcional) | NF-e automática | grátis até 20 notas/mês | dono + contador |
| 6 | Resend (opcional) | e-mails de pedido (cliente e dono) e "esqueci a senha" | grátis até 3.000/mês | Drinho |
| 7 | Telegram (opcional) | aviso no celular na hora do pedido | grátis | dono |

Sem a Notaas o site já funciona: o pedido vai com **declaração de conteúdo** (permitido para MEI vendendo para pessoa física). Basta deixar `NF_PROVEDOR` vazio.

Tudo fica no Railway: não há outro serviço de banco ou de login para criar.

---

## 1. GitHub

Crie um repositório **privado** e suba esta pasta (sem o arquivo `.env`, que já está no `.gitignore`).

## 2. Railway: site, banco e acesso ao painel

O projeto tem um servidor único (`server.mjs`) que serve as páginas, a API e as fotos, e roda sozinho a cada 15 minutos a rotina que termina pedidos parados.

1. **New Project → Deploy from GitHub repo** → escolha o repositório. Ele detecta Node e roda `npm start` (está no `railway.json`, com checagem de saúde em `/api/config`).
2. **Banco:** no mesmo projeto, **+ New → Database → PostgreSQL**.
3. No serviço do site, aba **Variables** (dá para colar tudo de uma vez em **Raw Editor**):
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (referência ao banco do passo 2).
   - `ADMIN_EMAIL=admiravelcafe@gmail.com,seu-email@exemplo.com` (quem entra no painel).
   - `ADMIN_SENHA=` uma senha provisória de 8+ caracteres.
   - As demais do `.env.example`, conforme for ligando cada serviço.
4. **Settings → Networking → Generate Domain**: o site fica em `https://<nome>.up.railway.app`. Enquanto não houver domínio próprio, o `SITE_URL` é preenchido sozinho com esse endereço.
5. Na primeira subida o servidor cria as tabelas e o catálogo de hoje (7 produtos, com preços e estoque do Wix). Nos logs aparece **Banco de dados pronto.**
6. Abra `https://<nome>.up.railway.app/painel/`, entre com o e-mail e a `ADMIN_SENHA`, e troque a senha em **Ajustes → Trocar minha senha**.
7. No painel, aba **Produtos**, toque em **Trazer fotos do Wix**: ele copia as fotos para o banco do site (assim nada depende do Wix depois). Só lê do Wix, não muda nada lá.

**Esqueceu a senha?** Com o Resend ligado, o botão "Esqueci a senha" manda um link por e-mail. Sem ele, mude a `ADMIN_SENHA` no Railway: ao reiniciar, todos os e-mails de `ADMIN_EMAIL` passam a entrar com a senha nova.

**Segurança:** o login usa senha com hash (scrypt), trava depois de 8 tentativas erradas em 15 minutos, e trocar a senha derruba os logins antigos. O segredo que assina os logins é gerado sozinho e fica no banco (se quiser fixar um, use `SESSAO_SEGREDO` com 32+ caracteres).

**Backup:** o Railway mostra a aba **Backups** no banco Postgres. Vale ligar os backups automáticos quando o site estiver valendo.

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
2. No endereço `up.railway.app`, compre com seus dados reais e pague com Pix.
3. Confira: a página do pedido muda para "Pagamento aprovado"; chega o e-mail de confirmação; o dono recebe o aviso; no painel aparece o pedido com NF (se ligada) e etiqueta (no sandbox, a etiqueta é de teste).
4. Estorne os R$ 1 no app da InfinitePay. Desligue ou exclua o produto "Teste".
5. Repita com cartão se quiser.

## 8. Trocar o domínio (último passo)

Só depois do teste aprovado e com o dono de acordo:

1. No Railway: **Settings → Networking → Custom Domain** → `admiravelcafe.com.br` (e `www`). Ele mostra o registro CNAME a criar.
2. Mude o DNS onde o domínio está registrado (Wix ou Registro.br). A troca leva de minutos a algumas horas.
3. Coloque `SITE_URL=https://admiravelcafe.com.br` nas variáveis do Railway.
4. Mantenha o Wix pago por mais um mês, por segurança. O plano atual renova em 11/12/2026.

---

## Conferir com o dono (marcado como `[CONFIRMAR]` no código)

- CEP exato e bairro da Rua Presidente Prudente, 232 (origem dos pacotes).
- Razão social do MEI e inscrição estadual, se houver.
- CFOP com o contador: ele compra café cru e paga uma torrefação (industrialização por encomenda, em geral 5101/6101), e se o MEI cobre essa atividade.
- Se ele quer NF automática (Notaas) ou vender com declaração de conteúdo.
- Faixa de CEP e preço da entrega local em Limeira (hoje: R$ 7, 1 a 4 dias úteis).
- Página Quem somos: o texto "Uma paixão antiga por café brasileiro" foi escrito a partir da página Sobre do site atual; o dono revisa, completa (nome, desde quando, como começou) e manda uma foto dele.
- Página Eventos: antecedência para reservar, cidades atendidas, capacidade (convidados por barista) e como cobra.
- Fotos em boa resolução dos produtos e dos eventos (sobem pelo painel, em Produtos).

## Para o Drinho: rodar no computador

```bash
npm run dev     # http://localhost:8888 (modo demonstração sem .env); npm start faz o mesmo
npm test        # 23 testes: checkout, pagamento, NF, etiqueta, avisos, painel, servidor
TEST_DATABASE_URL=postgres://usuario:senha@localhost/admiravel_teste npm test   # +5 testes com Postgres de verdade (o banco de teste é apagado)
```
O painel de demonstração entra com qualquer e-mail e senha. Com `DATABASE_URL` no `.env`, roda igual ao Railway.
