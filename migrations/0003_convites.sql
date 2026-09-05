-- ==========================================================
-- C.R.I.S. — MIGRATION 0003 — CONVITES DE CAMPANHA (Fase C)
-- ==========================================================
-- O QUE ESTA MIGRATION FAZ (e só isso):
--   1) Cria um índice único em campaign_members(campaign_id, user_id)
--      — necessário para o INSERT ... ON CONFLICT DO NOTHING abaixo
--      não duplicar membership se o convite for aceito duas vezes
--      (ex.: usuário clica no link, dá F5, clica de novo).
--   2) Cria a função public.get_campaign_invite_info(p_token text)
--      — SOMENTE LEITURA. Recebe um invite_token e devolve apenas
--      o nome da campanha e um nome de exibição do Mestre, SEM
--      expor mais nada de campaigns nem de auth.users.
--   3) Cria a função public.accept_campaign_invite(p_token text)
--      — Único ponto que efetivamente insere em campaign_members
--      a partir de um invite_token. Valida tudo internamente
--      (token existe, campanha ativa) e nunca aceita um campaign_id
--      arbitrário vindo do cliente.
--
-- O QUE ESTA MIGRATION *NÃO* FAZ:
--   - Não altera nenhuma policy existente (campaigns_*, campaign_
--     members_*, campaign_characters_*) — elas continuam exatamente
--     como estão hoje.
--   - Não desativa RLS em nenhuma tabela.
--   - Não torna "campaigns" pública nem dá SELECT amplo nela.
--   - Não cria tabela nova, nem coluna agent_id em campaign_members.
--
-- POR QUE FUNCIONA SEM MEXER NAS POLICIES:
--   Estas funções são SECURITY DEFINER, ou seja, executam com o
--   dono da função (normalmente "postgres", o mesmo dono das
--   tabelas no Supabase). Um dono de tabela, por padrão, não é
--   afetado pela RLS dela (a não ser que a tabela tenha
--   FORCE ROW LEVEL SECURITY, o que não é o caso aqui). Por isso a
--   função consegue ler campaigns/inserir em campaign_members sem
--   passar pelas policies normais — e é por isso que TODA a
--   validação de segurança precisa estar escrita à mão, dentro da
--   própria função, com bastante cuidado.
-- ==========================================================


-- ----------------------------------------------------------
-- 1) Índice único — evita membership duplicada e permite
--    ON CONFLICT DO NOTHING no accept_campaign_invite.
--    Idempotente: pode rodar essa migration mais de uma vez.
-- ----------------------------------------------------------
create unique index if not exists campaign_members_campaign_user_unique
  on public.campaign_members (campaign_id, user_id);


-- ----------------------------------------------------------
-- 2) Preview do convite (somente leitura)
-- ----------------------------------------------------------
-- Devolve NO MÁXIMO 1 linha com:
--   campaign_id   -> só para o front reusar ao chamar accept_campaign_invite
--   campaign_name -> nome da campanha
--   master_name   -> nome de exibição do Mestre (ver observação abaixo)
--
-- Se o token não existir OU a campanha não estiver 'active', devolve
-- ZERO linhas — o mesmo comportamento para "token inválido" e para
-- "campanha inexistente" (Testes 5 e 6: não revelar qual dos dois
-- casos ocorreu).
--
-- OBSERVAÇÃO DE DESIGN (me avise se quiser mudar):
-- Para mostrar "quem é o Mestre" sem expor e-mail, uso só o
-- user_metadata (full_name/name/nome) que o próprio usuário
-- preencheu no cadastro; se não houver nome cadastrado, cai para o
-- texto genérico 'Mestre' — nunca expõe o e-mail do Mestre. Isso
-- exige que a função enxergue auth.users (só as colunas id e
-- raw_user_meta_data, nada além disso, e só por causa do
-- SECURITY DEFINER). Se preferir não tocar em auth.users de jeito
-- nenhum, dá pra trocar por um texto fixo "Mestre" — é só me avisar.
create or replace function public.get_campaign_invite_info(p_token text)
returns table (
  campaign_id uuid,
  campaign_name text,
  master_name text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.name,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'nome'), ''),
      'Mestre'
    ) as master_name
  from public.campaigns c
  join auth.users u on u.id = c.owner_id
  where p_token is not null
    and length(p_token) > 0
    and c.invite_token = p_token
    and c.status = 'active';
$$;

-- Privilégio mínimo: ninguém pode chamar por padrão (funções são
-- PUBLIC por padrão no Postgres); só usuários autenticados podem.
-- Não concedemos a "anon" de propósito — no fluxo aprovado, a tela
-- de convite só é mostrada DEPOIS do login (ver Fase C, item 5).
revoke all on function public.get_campaign_invite_info(text) from public;
grant execute on function public.get_campaign_invite_info(text) to authenticated;


-- ----------------------------------------------------------
-- 3) Aceitar convite (único ponto que insere em campaign_members
--    a partir de um invite_token)
-- ----------------------------------------------------------
-- Regras aplicadas dentro da função (equivalentes às exigidas):
--   - precisa haver usuário autenticado (auth.uid() não nulo);
--   - o token precisa corresponder a uma campanha com status='active';
--   - se quem está aceitando já É o Mestre (owner_id = auth.uid()),
--     não cria membership duplicada — só devolve os dados da
--     campanha (evita um caso estranho de o próprio Mestre "entrar"
--     na própria campanha como se fosse jogador);
--   - caso contrário, insere (campaign_id, user_id) em
--     campaign_members; se já existir (ON CONFLICT), não faz nada
--     — idempotente, sem erro em clique duplicado;
--   - NUNCA recebe campaign_id do cliente — só o token.
-- Se o token for inválido/expirado, lança uma exceção genérica
-- 'invalid_invite' (sem detalhar o motivo) para o front tratar.
create or replace function public.accept_campaign_invite(p_token text)
returns table (
  campaign_id uuid,
  campaign_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign record;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_token is null or length(p_token) = 0 then
    raise exception 'invalid_invite';
  end if;

  select c.id, c.name, c.owner_id
    into v_campaign
    from public.campaigns c
    where c.invite_token = p_token
      and c.status = 'active';

  if v_campaign.id is null then
    raise exception 'invalid_invite';
  end if;

  if v_campaign.owner_id = v_uid then
    -- O próprio Mestre abriu o link do próprio convite: não é
    -- inserido em campaign_members (ele já tem acesso via owner_id).
    return query select v_campaign.id, v_campaign.name;
    return;
  end if;

  insert into public.campaign_members (campaign_id, user_id)
  values (v_campaign.id, v_uid)
  on conflict (campaign_id, user_id) do nothing;

  return query select v_campaign.id, v_campaign.name;
end;
$$;

revoke all on function public.accept_campaign_invite(text) from public;
grant execute on function public.accept_campaign_invite(text) to authenticated;
