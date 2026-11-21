-- =====================================================================
-- Admirável Café — banco de dados (Supabase / Postgres)
-- Como usar: no Supabase, abra "SQL Editor" → "New query", cole TUDO e clique em "Run".
-- Depois rode o seed.sql (catálogo) e cadastre o e-mail do dono na tabela admins (fim deste arquivo).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Quem pode usar o painel ----------
create table if not exists admins (
  email text primary key check (email = lower(email))  -- sempre em minúsculas
);
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

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
language sql security definer set search_path = public as $$
  update pedidos set historico = historico || jsonb_build_array(jsonb_build_object('em', now(), 'msg', p_msg)) where id = p_id;
$$;

-- Baixa o estoque dos itens pagos (nunca fica negativo)
create or replace function baixar_estoque(p_itens jsonb) returns void
language plpgsql security definer set search_path = public as $$
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

-- Somente o servidor (chave de serviço) chama estas funções
revoke execute on function pedido_log(uuid, text) from public, anon, authenticated;
revoke execute on function baixar_estoque(jsonb) from public, anon, authenticated;

-- ---------- Segurança (RLS) ----------
alter table admins enable row level security;
alter table produtos enable row level security;
alter table ajustes enable row level security;
alter table pedidos enable row level security;
alter table contatos_eventos enable row level security;

drop policy if exists "admin lê admins" on admins;
create policy "admin lê admins" on admins for select using (is_admin());

drop policy if exists "todos veem produtos ativos" on produtos;
create policy "todos veem produtos ativos" on produtos for select using (ativo or is_admin());
drop policy if exists "admin edita produtos" on produtos;
create policy "admin edita produtos" on produtos for all using (is_admin()) with check (is_admin());

drop policy if exists "todos leem ajustes" on ajustes;
create policy "todos leem ajustes" on ajustes for select using (true);
drop policy if exists "admin edita ajustes" on ajustes;
create policy "admin edita ajustes" on ajustes for update using (is_admin()) with check (is_admin());

-- Pedidos: só o dono vê pelo painel; o site usa a chave de serviço (que ignora RLS) no servidor.
drop policy if exists "admin vê pedidos" on pedidos;
create policy "admin vê pedidos" on pedidos for select using (is_admin());

drop policy if exists "admin vê contatos" on contatos_eventos;
create policy "admin vê contatos" on contatos_eventos for select using (is_admin());
drop policy if exists "admin marca contatos" on contatos_eventos;
create policy "admin marca contatos" on contatos_eventos for update using (is_admin()) with check (is_admin());

-- ---------- Fotos (Storage) ----------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
drop policy if exists "fotos públicas" on storage.objects;
create policy "fotos públicas" on storage.objects for select using (bucket_id = 'fotos');
drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos" on storage.objects for insert with check (bucket_id = 'fotos' and is_admin());
drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos" on storage.objects for delete using (bucket_id = 'fotos' and is_admin());

-- ---------- Cadastre aqui o e-mail de quem usa o painel ----------
-- insert into admins (email) values ('email-do-dono@exemplo.com');
