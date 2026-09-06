-- ==========================================================
-- C.R.I.S. — Migration 0006: habilitar Realtime em public.agents
-- ==========================================================
-- Necessária para a correção do "Problema 1" (Mestre edita a ficha,
-- jogador não recebe automaticamente): o código (js/agents-realtime.js)
-- assina eventos postgres_changes na tabela public.agents, mas o
-- Postgres só publica esses eventos pelo protocolo de replicação lógica
-- para tabelas explicitamente adicionadas à publicação usada pelo
-- Supabase Realtime (supabase_realtime).
--
-- NÃO altera nenhuma policy de RLS existente. NÃO cria tabela, coluna,
-- trigger ou função nova. É equivalente a ligar o toggle "Enable
-- Realtime" ao lado da tabela "agents" em
-- Database → Replication → supabase_realtime, no painel do Supabase —
-- este script só faz a mesma coisa via SQL, para ficar versionado
-- junto das outras migrations do projeto.
--
-- SEGURANÇA: com RLS habilitado em public.agents (já é o caso — ver
-- "Users can view own agents" e "agents_select_campaign_master" no
-- schema atual), o Supabase Realtime avalia essas mesmas policies de
-- SELECT para decidir, por conexão, quais linhas de UPDATE repassar.
-- Adicionar a tabela à publicação NÃO expõe nenhuma linha a um usuário
-- que já não pudesse lê-la via RLS.
--
-- Idempotente: se a tabela já estiver na publicação (por já ter sido
-- ativada manualmente no painel), o bloco abaixo não faz nada e não
-- lança erro.
-- ==========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
  END IF;
END $$;

-- Opcional, mas recomendado pela documentação do Supabase Realtime: com
-- REPLICA IDENTITY FULL, o payload de UPDATE inclui a linha ANTERIOR
-- completa (não só a chave primária) em "payload.old". O código atual
-- (js/agents-realtime.js) só usa "payload.new", então isto não é
-- estritamente necessário para a correção — está aqui apenas para
-- deixar a tabela pronta caso uma necessidade futura precise comparar
-- o valor antigo de um campo (ex.: diffs mais finos). Não afeta RLS,
-- não afeta o SELECT/UPDATE normais, e é igualmente idempotente.
ALTER TABLE public.agents REPLICA IDENTITY FULL;
