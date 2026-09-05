-- ==========================================================
-- C.R.I.S. — MIGRATION 0004 — PERSONAGENS + JOGADORES (Fase D+E+G)
-- ==========================================================
-- Auditoria prévia (ver relatório da Etapa 1): as tabelas
-- campaigns, campaign_members, campaign_characters e agents, e
-- todas as policies relevantes, JÁ EXISTEM (Fase A) e foram
-- confirmadas via consulta a pg_policies/information_schema.
-- Esta migration NÃO recria nada disso. Ela só resolve três
-- lacunas reais, encontradas na auditoria, necessárias para o
-- fluxo de Personagens/Jogadores funcionar com segurança:
--
--   1) campaign_characters não tinha um índice único em
--      (campaign_id, agent_id) — nada impedia o mesmo agente de
--      ser vinculado duas vezes à mesma campanha (Teste 18 do
--      seu prompt exige "não criar duplicata").
--
--   2) A policy campaign_characters_insert exige que quem insere
--      seja membro em campaign_members. Mas o Mestre (owner_id de
--      campaigns) NUNCA é inserido em campaign_members
--      (accept_campaign_invite pula esse insert de propósito para
--      o próprio Mestre — ver migration 0003). Resultado: hoje o
--      Mestre não consegue adicionar os próprios personagens à
--      própria campanha. Ajusto a policy para também aceitar o
--      dono da campanha.
--
--   3) Não existe nenhuma forma de listar, do lado do cliente, o
--      nome dos jogadores de uma campanha (não há tabela
--      "profiles" e o cliente não enxerga auth.users). Crio uma
--      função SECURITY DEFINER só de leitura, no mesmo padrão já
--      usado por get_campaign_invite_info (migration 0003), que
--      devolve o Mestre + os membros com nome de exibição e
--      contagem de personagens — usada pela aba JOGADORES.
--
-- O QUE ESTA MIGRATION *NÃO* FAZ:
--   - Não mexe nas policies de campaigns nem de campaign_members.
--   - Não mexe nas policies agents_select_campaign_master /
--     agents_update_campaign_master (já existem e já permitem ao
--     Mestre ver/editar a ficha de um personagem vinculado à sua
--     campanha — é exatamente o que a Etapa 6/Teste 11 precisam).
--   - Não cria nenhuma tabela nova.
-- ==========================================================


-- ----------------------------------------------------------
-- 1) Índice único — impede duplicar o vínculo do mesmo agente
--    na mesma campanha (Teste 18). Idempotente.
-- ----------------------------------------------------------
create unique index if not exists campaign_characters_campaign_agent_unique
  on public.campaign_characters (campaign_id, agent_id);


-- ----------------------------------------------------------
-- 2) Corrige campaign_characters_insert: o Mestre (owner_id da
--    campanha) também pode inserir vínculos usando seus próprios
--    agentes, mesmo sem linha em campaign_members.
--    Mantém as duas exigências que já existiam:
--      - quem insere só pode ser o dono do próprio vínculo
--        (user_id = auth.uid());
--      - o agente usado tem que ser um agente do próprio usuário
--        (nunca de outra pessoa).
--    Só adiciona uma 3ª forma de "pertencer à campanha": ser o
--    owner dela, além de ser campaign_member.
-- ----------------------------------------------------------
alter policy campaign_characters_insert on public.campaign_characters
  with check (
    (user_id = auth.uid())
    and exists (
      select 1 from public.agents a
      where a.id = campaign_characters.agent_id
        and a.user_id = auth.uid()
    )
    and (
      exists (
        select 1 from public.campaign_members m
        where m.campaign_id = campaign_characters.campaign_id
          and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.campaigns c
        where c.id = campaign_characters.campaign_id
          and c.owner_id = auth.uid()
      )
    )
  );


-- ----------------------------------------------------------
-- 3) Roster da campanha (Mestre + Jogadores + nº de personagens)
--    — somente leitura, para a aba JOGADORES.
--    Mesmo princípio de segurança de get_campaign_invite_info:
--    SECURITY DEFINER só para poder ler nome em auth.users
--    (raw_user_meta_data), nunca e-mail; toda validação de acesso
--    é feita à mão dentro da função — só devolve algo se quem
--    chama for o Mestre ou um campaign_member daquela campanha.
-- ----------------------------------------------------------
create or replace function public.get_campaign_roster(p_campaign_id uuid)
returns table (
  user_id uuid,
  display_name text,
  is_master boolean,
  character_count bigint
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id
      and (
        c.owner_id = v_uid
        or exists (
          select 1 from public.campaign_members m
          where m.campaign_id = p_campaign_id and m.user_id = v_uid
        )
      )
  ) into v_allowed;

  if not v_allowed then
    raise exception 'not_a_member';
  end if;

  return query
  select
    u.id as user_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'nome'), ''),
      'Mestre'
    ) as display_name,
    true as is_master,
    (
      select count(*) from public.campaign_characters cc
      where cc.campaign_id = p_campaign_id and cc.user_id = u.id
    ) as character_count
  from public.campaigns c
  join auth.users u on u.id = c.owner_id
  where c.id = p_campaign_id

  union all

  select
    u.id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'nome'), ''),
      'Jogador'
    ),
    false,
    (
      select count(*) from public.campaign_characters cc
      where cc.campaign_id = p_campaign_id and cc.user_id = u.id
    )
  from public.campaign_members m
  join auth.users u on u.id = m.user_id
  where m.campaign_id = p_campaign_id;
end;
$$;

revoke all on function public.get_campaign_roster(uuid) from public;
grant execute on function public.get_campaign_roster(uuid) to authenticated;
