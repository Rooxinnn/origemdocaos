-- ==========================================================
-- C.R.I.S. — MIGRATION 0007 — CAPA DA CAMPANHA
-- ==========================================================
-- O QUE ESTA MIGRATION FAZ (e só isso):
--   1) Adiciona public.campaigns.image_url (text, nullable) — a
--      MENOR alteração possível de schema para guardar a capa.
--      Nunca guarda a imagem em si (Base64) na linha da campanha:
--      guarda só a URL pública do arquivo no Supabase Storage.
--   2) Cria o bucket de Storage "campaign-covers" (público para
--      leitura, já que a capa aparece em card/página/popup de
--      convite — nenhum desses contextos exige usuário logado
--      para VER a imagem, só para trocá-la).
--   3) Cria as Storage Policies do bucket:
--        - leitura: pública (SELECT para todos, "bucket_id =
--          'campaign-covers'");
--        - escrita/atualização/remoção: só o dono (owner_id) da
--          campanha correspondente, verificado contra
--          public.campaigns. O nome do arquivo é sempre
--          "<campaign_id>/<algo>", então a policy confere que
--          o primeiro segmento do path (storage.foldername)
--          é o id de uma campanha cujo owner_id = auth.uid().
--   4) Substitui public.get_campaign_invite_info(p_token) para
--      devolver também campaign_image_url e a descrição da
--      campanha (campaign_description) — o popup de convite
--      (instrução 11) precisa da capa e da "frase" da campanha
--      sem expor mais nada de campaigns.
--
-- O QUE ESTA MIGRATION *NÃO* FAZ:
--   - Não cria tabela nova só para imagens (instrução 4/24).
--   - Não altera invite_token nem accept_campaign_invite.
--   - Não mexe nas policies de campaigns/campaign_members já
--     existentes.
--   - Não abre acesso amplo às linhas de campaigns — só adiciona
--     uma coluna a mais no que a RPC de preview já devolvia.
-- ==========================================================


-- ----------------------------------------------------------
-- 1) Coluna da capa
-- ----------------------------------------------------------
alter table public.campaigns
  add column if not exists image_url text;


-- ----------------------------------------------------------
-- 2) Bucket de Storage (idempotente)
-- ----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('campaign-covers', 'campaign-covers', true)
on conflict (id) do nothing;


-- ----------------------------------------------------------
-- 3) Storage Policies do bucket campaign-covers
-- ----------------------------------------------------------
-- Convenção de path usada pelo front (js/campanhas.js):
--   <campaign_id>/capa.<ext>
-- (storage.foldername(name))[1] é sempre o campaign_id.

drop policy if exists "campaign_covers_public_read" on storage.objects;
create policy "campaign_covers_public_read"
  on storage.objects for select
  using (bucket_id = 'campaign-covers');

drop policy if exists "campaign_covers_owner_insert" on storage.objects;
create policy "campaign_covers_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'campaign-covers'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "campaign_covers_owner_update" on storage.objects;
create policy "campaign_covers_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'campaign-covers'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists "campaign_covers_owner_delete" on storage.objects;
create policy "campaign_covers_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'campaign-covers'
    and exists (
      select 1 from public.campaigns c
      where c.id::text = (storage.foldername(name))[1]
        and c.owner_id = auth.uid()
    )
  );


-- ----------------------------------------------------------
-- 4) Preview do convite — agora inclui capa + descrição
-- ----------------------------------------------------------
-- Mesmo comportamento da 0003 (zero linhas se token inválido ou
-- campanha não 'active'; nunca expõe e-mail do Mestre); só
-- acrescenta duas colunas de saída.
create or replace function public.get_campaign_invite_info(p_token text)
returns table (
  campaign_id uuid,
  campaign_name text,
  master_name text,
  campaign_description text,
  campaign_image_url text
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
    ) as master_name,
    c.description,
    c.image_url
  from public.campaigns c
  join auth.users u on u.id = c.owner_id
  where p_token is not null
    and length(p_token) > 0
    and c.invite_token = p_token
    and c.status = 'active';
$$;

revoke all on function public.get_campaign_invite_info(text) from public;
grant execute on function public.get_campaign_invite_info(text) to authenticated;
