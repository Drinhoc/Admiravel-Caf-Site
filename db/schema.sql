-- =====================================================================
-- Admirável Café — banco de dados (Postgres do Railway, ou qualquer Postgres 13+)
-- O servidor roda este arquivo sozinho ao iniciar (é seguro rodar várias vezes).
-- =====================================================================

-- gen_random_uuid() já vem no Postgres 13+

-- ---------- Configurações internas (segredo do login etc.) ----------
create table if not exists config (chave text primary key, valor text not null);

-- ---------- Quem pode usar o painel ----------
create table if not exists admins (
  email text primary key check (email = lower(email)),  -- sempre em minúsculas
  senha_hash text,                                      -- scrypt; vazio = ainda sem senha
  senha_em timestamptz default now(),                   -- trocar a senha derruba os logins antigos
  criado_em timestamptz default now()
);
alter table admins add column if not exists senha_hash text;
alter table admins add column if not exists senha_em timestamptz default now();
alter table admins add column if not exists criado_em timestamptz default now();

-- links de "esqueci a senha" (guardamos só o hash do código)
create table if not exists senha_reset (
  codigo_hash text primary key,
  email text not null references admins(email) on delete cascade,
  expira_em timestamptz not null,
  usado boolean not null default false
);

-- ---------- Fotos enviadas pelo painel (ficam no próprio banco) ----------
create table if not exists fotos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'image/webp',
  dados bytea not null,
  tamanho int,
  criado_em timestamptz default now()
);

-- ---------- Produtos ----------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  tipo text not null default 'cafe' check (tipo in ('cafe','combo','edicao','outro')),
  ativo boolean not null default true,
  ordem int not null default 0,
  selo text default '',
  frase text default '',
  descricao text default '',
  notas text[] default '{}',
  ficha jsonb,            -- {variedade, processo, origem, produtor, altitude, torra}
  perfil jsonb,           -- {docura, acidez, corpo, intensidade} de 1 a 5
  cor text default '#72765B',
  fotos text[] default '{}',
  fotos_local text[] default '{}',
  tem_moagem boolean not null default true,
  -- [{id, nome, preco, preco_promo, promo_ate, estoque_grao, estoque_moido, peso_g, altura, largura, comprimento}]
  embalagens jsonb not null default '[]',
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- ---------- Ajustes gerais (uma linha só) ----------
create table if not exists ajustes (
  id int primary key default 1 check (id = 1),
  aviso_topo text default '',
  frete_gratis_acima numeric default 0
);
insert into ajustes (id) values (1) on conflict do nothing;
-- café em destaque na página inicial (escolhido no painel)
alter table ajustes add column if not exists destaque_id uuid references produtos(id) on delete set null;

-- ---------- Pedidos ----------
create sequence if not exists pedidos_numero_seq start 1001;
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint unique not null default nextval('pedidos_numero_seq'),
  token uuid not null default gen_random_uuid(),     -- segredo do link "acompanhar pedido"
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz default now(),
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento','pago','enviado','entregue','cancelado','expirado')),
  cliente jsonb not null,      -- {nome, email, telefone, cpf}
  endereco jsonb not null,     -- {cep, rua, numero, complemento, bairro, cidade, uf, ibge}
  itens jsonb not null,
  subtotal numeric not null,
  frete jsonb not null,
  total numeric not null,
  observacao text,
  -- pagamento
  pagamento_provedor text, pagamento_url text, pagamento_ref text, pagamento_id text,
  pagamento_forma text, pago_em timestamptz, pagamento_alerta text,
  -- nota fiscal
  nf_status text default 'pendente', nf_ref text, nf_chave text, nf_numero text,
  nf_danfe_url text, nf_xml_url text, nf_erro text, tentativas_nf int default 0,
  -- envio
  envio_status text default 'pendente', envio_me_id text, etiqueta_url text, envio_erro text,
  tentativas_envio int default 0, rastreio text, enviado_em timestamptz,
  motivo_cancelamento text,
  avisos jsonb not null default '{}',
  historico jsonb not null default '[]'
);
create index if not exists pedidos_status_idx on pedidos (status, criado_em desc);

-- ---------- Pedidos de orçamento de eventos ----------
create table if not exists contatos_eventos (
  id bigserial primary key,
  criado_em timestamptz default now(),
  nome text, whatsapp text, email text, tipo text, data text, cidade text, convidados text, mensagem text,
  respondido boolean default false
);

-- ---------- Funções usadas pelo site ----------
-- Acrescenta uma linha no histórico do pedido
create or replace function pedido_log(p_id uuid, p_msg text) returns void
language sql as $$
  update pedidos set historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'msg', p_msg)) where id = p_id;
$$;

-- Baixa o estoque dos itens pagos (nunca fica negativo)
create or replace function baixar_estoque(p_itens jsonb) returns void
language plpgsql as $$
declare it jsonb; campo text;
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    campo := case when it->>'moagem' = 'moido' then 'estoque_moido' else 'estoque_grao' end;
    update produtos p set embalagens = (
      select jsonb_agg(case when e->>'id' = it->>'embalagem_id'
        then jsonb_set(e, array[campo], to_jsonb(greatest(0, coalesce((e->>campo)::int, 0) - (it->>'quantidade')::int)))
        else e end order by ord)
      from jsonb_array_elements(p.embalagens) with ordinality as x(e, ord)
    ), atualizado_em = now()
    where p.id = (it->>'produto_id')::uuid;
  end loop;
end $$;
