-- Compêndio público. As fichas completas em public.creatures continuam privadas.
-- Execute uma vez no SQL Editor do mesmo projeto Supabase usado pelo site.
create table if not exists public.creature_compendium (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint creature_compendium_payload_shape check (
    jsonb_typeof(payload) = 'object' and coalesce(payload->>'id','') = id
    and coalesce(jsonb_typeof(payload->'ficha'),'') = 'object'
    and id like 'minha:%' and octet_length(payload::text) <= 2097152
  )
);
create index if not exists creature_compendium_owner_idx on public.creature_compendium(owner_id);
alter table public.creature_compendium enable row level security;
revoke all on public.creature_compendium from anon, authenticated;
grant select on public.creature_compendium to anon, authenticated;
grant insert, update, delete on public.creature_compendium to authenticated;
drop policy if exists creature_compendium_read on public.creature_compendium;
create policy creature_compendium_read on public.creature_compendium
  for select to anon, authenticated using (true);
drop policy if exists creature_compendium_insert on public.creature_compendium;
create policy creature_compendium_insert on public.creature_compendium
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.creatures c where c.id = substr(creature_compendium.id, 7)
      and c.user_id = (select auth.uid()) and c.data->>'cr_catalogado' = '1'
    )
  );
drop policy if exists creature_compendium_update on public.creature_compendium;
create policy creature_compendium_update on public.creature_compendium
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.creatures c where c.id = substr(creature_compendium.id, 7)
      and c.user_id = (select auth.uid()) and c.data->>'cr_catalogado' = '1'
    )
  );
drop policy if exists creature_compendium_delete on public.creature_compendium;
create policy creature_compendium_delete on public.creature_compendium
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Remove da lista pública quando a ficha original é despublicada ou excluída,
-- inclusive se a alteração veio da fila de sincronização offline.
create or replace function public.remove_unpublished_creature_compendium()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.creature_compendium
      where id = 'minha:' || old.id::text and owner_id = old.user_id;
    return old;
  end if;
  if coalesce(new.data->>'cr_catalogado', '') <> '1' then
    delete from public.creature_compendium
      where id = 'minha:' || new.id::text and owner_id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists creature_compendium_source_cleanup on public.creatures;
create trigger creature_compendium_source_cleanup
  after update of data or delete on public.creatures
  for each row execute function public.remove_unpublished_creature_compendium();
