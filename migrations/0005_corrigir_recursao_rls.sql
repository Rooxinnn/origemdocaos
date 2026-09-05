-- ==========================================================
-- C.R.I.S. — MIGRATION 0005 — CORREÇÃO: RECURSÃO INFINITA EM RLS
-- ==========================================================
-- BUG REPORTADO: "Falha ao adicionar personagem: infinite
-- recursion detected in policy for relation campaign_characters"
-- ao confirmar em "+ Adicionar Personagem".
--
-- CAUSA (achado na auditoria, não é um erro introduzido pela
-- migration 0004 — já existia desde a Fase A, só nunca tinha sido
-- exercitado antes porque não existia nenhuma tela que desse
-- INSERT em campaign_characters):
--
--   1. A policy de INSERT de campaign_characters (já existia assim
--      na Fase A) confirma que o agente é do próprio usuário assim:
--        EXISTS (select 1 from public.agents a
--                where a.id = agent_id and a.user_id = auth.uid())
--      Isso avalia a RLS da tabela agents.
--
--   2. A policy agents_select_campaign_master (também já existia
--      na Fase A) permite ao Mestre ver um agente vinculado assim:
--        EXISTS (select 1 from public.campaign_characters cc
--                join public.campaigns c on c.id = cc.campaign_id
--                where cc.agent_id = agents.id and c.owner_id = auth.uid())
--      Isso volta a consultar campaign_characters — a MESMA relação
--      cujo INSERT ainda está sendo avaliado no passo 1.
--
-- O Postgres não permite essa "volta" à mesma relação enquanto a
-- RLS dela ainda está em avaliação, e recusa com
-- "infinite recursion detected in policy for relation campaign_characters".
--
-- CORREÇÃO: mover a checagem de agents_select_campaign_master (e a
-- irmã agents_update_campaign_master, que tem a mesma condição)
-- para dentro de uma função SECURITY DEFINER. Como a função roda
-- com o dono da função (o papel que aplicou as migrations no
-- Supabase, que não tem RLS aplicada sobre si mesmo), a consulta a
-- campaign_characters feita DENTRO da função não reabre a RLS da
-- própria campaign_characters — quebra o ciclo.
--
-- Nada mais muda: nenhuma tabela nova, nenhuma policy de
-- campaign_characters é tocada, o comportamento de quem pode ver/
-- editar o quê continua exatamente o mesmo de antes — só a forma
-- como a checagem é feita internamente.
-- ==========================================================

create or replace function public.is_agent_linked_to_own_campaign(p_agent_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.campaign_characters cc
    join public.campaigns c on c.id = cc.campaign_id
    where cc.agent_id = p_agent_id
      and c.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_agent_linked_to_own_campaign(uuid) from public;
grant execute on function public.is_agent_linked_to_own_campaign(uuid) to authenticated;

alter policy agents_select_campaign_master on public.agents
  using ( public.is_agent_linked_to_own_campaign(agents.id) );

alter policy agents_update_campaign_master on public.agents
  using ( public.is_agent_linked_to_own_campaign(agents.id) )
  with check ( public.is_agent_linked_to_own_campaign(agents.id) );
