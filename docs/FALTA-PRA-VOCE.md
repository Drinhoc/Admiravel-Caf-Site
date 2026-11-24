# O que falta (só o que precisa das suas mãos)

O código está pronto e testado (29 testes, incluindo com Postgres de verdade). O site do Wix continua no ar e **não é tocado** em nenhum passo abaixo.

Tempo total do essencial: **cerca de 20 minutos**. O resto é opcional para hoje.

---

## Essencial para o site novo estar no ar hoje

### 1. Repositório no GitHub · feito
O código já está em github.com/Drinhoc/Admiravel-Caf-Site (branch `main`).

### 2. Criar o projeto no Railway · 3 min
1. Entre em railway.com com a sua conta do GitHub.
2. **New Project → Deploy from GitHub repo → Admiravel-Caf-Site**. Se ele pedir, autorize o Railway a ver esse repositório.
3. Se pedir plano: o Hobby custa cerca de US$ 5/mês (o teste grátis também serve para hoje).

### 3. Adicionar o banco · 1 min
No mesmo projeto: **+ New → Database → Add PostgreSQL**. Não precisa configurar nada dentro dele.

### 4. Colar as variáveis · 3 min
Clique no serviço do site (não no Postgres) → aba **Variables** → **Raw Editor** → cole e ajuste as duas linhas marcadas:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_EMAIL=admiravelcafe@gmail.com,SEU-EMAIL-AQUI
ADMIN_SENHA=INVENTE-UMA-SENHA-PROVISORIA
```

- `ADMIN_SENHA`: 8 caracteres ou mais. É provisória; cada um troca a sua no painel.
- Clique em **Update Variables** e depois em **Deploy** se ele pedir.

### 5. Gerar o endereço e entrar no painel · 3 min
1. No serviço do site: **Settings → Networking → Generate Domain**. Sai algo como `https://admiravel-site-production.up.railway.app`.
2. Em **Deployments → View logs** deve aparecer **Banco de dados pronto.**
3. Abra `https://SEU-ENDERECO/painel/`, entre com o seu e-mail e a `ADMIN_SENHA`.
4. **Ajustes → Trocar minha senha.**

### 6. Trazer as fotos do Wix · 2 min
Painel → **Produtos** → botão **Trazer fotos do Wix**. Ele só copia as fotos de lá; não muda nada no Wix.

Pronto: a loja, o painel e os eventos estão no ar num endereço de teste. O Google não indexa esse endereço (fica escondido até trocar o domínio).

> **Importante:** enquanto a InfinitePay não estiver ligada (passo 7), a loja mostra "ainda não está recebendo pagamentos" no checkout. Isso é de propósito, para ninguém fazer pedido de mentira no site publicado.
> Se quiser clicar pela compra inteira antes disso, adicione `PAGAMENTO_DEMO=sim` nas variáveis, teste, e **apague essa linha** depois.

---

## Para vender de verdade (depende do dono)

### 7. Ligar a InfinitePay · 2 min (precisa da InfiniteTag do dono)
O dono abre o app InfinitePay, confere que o **Link de pagamento** está ativo e te passa a InfiniteTag (o `$nome`). Nas variáveis:
```
PAGAMENTO_PROVEDOR=infinitepay
INFINITEPAY_HANDLE=nome-sem-o-cifrao
```

### 8. Teste de verdade com R$ 1 · 15 min (você + dono)
1. Painel → Produtos → **+ Novo produto**: "Teste", preço 1,00, estoque 1.
2. No endereço de teste, compre o "Teste" com Pix, com seus dados reais.
3. A página do pedido vira **Pagamento aprovado** em até 1 minuto. O pedido aparece no painel.
4. O dono estorna os R$ 1 no app da InfinitePay e você desliga o produto "Teste".

---

## Opcionais (podem ficar para depois)

| O quê | Tempo | Sem isso, o que acontece |
|---|---|---|
| **Melhor Envio sandbox**: conta em sandbox.melhorenvio.com.br → Integrações → Permissões de acesso → Gerar token (marque cart-read, cart-write, shipping-calculate, shipping-checkout, shipping-generate, shipping-print, shipping-tracking, orders-read). Variáveis `ME_TOKEN=...` e `ME_SANDBOX=true` | 15 min | O frete usa uma tabela aproximada e o dono gera a etiqueta como faz hoje |
| **Telegram** (aviso no celular): @BotFather → /newbot → `TELEGRAM_BOT_TOKEN`. O dono manda "oi" pro bot; abra `https://api.telegram.org/bot<TOKEN>/getUpdates` e copie o `chat.id` para `TELEGRAM_CHAT_ID` | 10 min | Os avisos ficam só no painel |
| **Resend** (e-mail para o cliente e "esqueci a senha") | 20 min | Cliente não recebe e-mail; senha esquecida se resolve mudando `ADMIN_SENHA` no Railway |
| **Dados do dono**: CEP exato e bairro da R. Presidente Prudente 232, razão social, IE, fotos em alta, história para o Quem somos, regras de eventos | mensagem | O site usa CEP genérico de Limeira para o frete e os textos atuais |

## Não fazer agora
- Não mexer no Wix nem no domínio. NF e Mercado Envios de lá seguem como estão.
- Trocar o domínio só depois do teste aprovado e com o dono de acordo (passo 8 do `COMO-PUBLICAR.md`). O Wix renova em 11/12/2026.

Se algo der erro, me mande um print ou o texto dos logs do Railway.
