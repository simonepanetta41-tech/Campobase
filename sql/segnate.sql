-- Le scene segnate a mano: girata, o da girare.
--
-- I documenti dicono quasi tutto, ma non tutto: un recupero, una scena
-- saltata, i giorni girati prima di usare l'app. Dalla scheda di una scena
-- la si segna, e il segno vale per tutta la troupe del film: una riga per
-- film e per scena.
--   girata     la scena e' fatta, anche se nessun foglio lo dice
--   da_girare  la scena NON e' fatta, anche se i fogli la danno per fatta
-- Nessuna riga: vale quello che dicono i documenti.
--
-- Tutti i membri del film lo vedono. Lo mette solo chi ha aperto il film
-- e le persone a cui lui da' il permesso (film_membri.segna): un
-- avanzamento che chiunque puo' cambiare e' un avanzamento di cui nessuno
-- si fida. Il permesso lo da' e lo toglie solo chi ha aperto il film,
-- dalla lista della troupe.
--
-- Si puo' rilanciare: non cancella niente.

create table if not exists public.scene_segnate (
  project_id uuid not null references public.projects(id) on delete cascade,
  scena      text not null,
  stato      text not null check (stato in ('girata', 'da_girare')),
  user_id    uuid references auth.users(id) on delete set null,
  aggiornato timestamptz not null default now(),
  primary key (project_id, scena)
);
alter table public.scene_segnate enable row level security;

alter table public.film_membri add column if not exists segna boolean not null default false;

-- Posso segnare le scene di questo film?
create or replace function public.puo_segnare(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.film_membri m
                  where m.project_id = p and m.user_id = auth.uid()
                    and (m.ruolo = 'capo' or m.segna));
$$;
revoke all on function public.puo_segnare(uuid) from public;
grant execute on function public.puo_segnare(uuid) to authenticated;

drop policy if exists segnate_membri   on public.scene_segnate;
drop policy if exists segnate_leggono  on public.scene_segnate;
drop policy if exists segnate_mettono  on public.scene_segnate;
drop policy if exists segnate_cambiano on public.scene_segnate;
drop policy if exists segnate_tolgono  on public.scene_segnate;
create policy segnate_leggono  on public.scene_segnate for select to authenticated using (public.e_membro(project_id));
create policy segnate_mettono  on public.scene_segnate for insert to authenticated with check (public.puo_segnare(project_id));
create policy segnate_cambiano on public.scene_segnate for update to authenticated
  using (public.puo_segnare(project_id)) with check (public.puo_segnare(project_id));
create policy segnate_tolgono  on public.scene_segnate for delete to authenticated using (public.puo_segnare(project_id));

-- Chi puo' segnare, per la lista della troupe. La vedono i membri.
create or replace function public.troupe_segna(p_film uuid)
returns table (user_id uuid, segna boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, (m.ruolo = 'capo' or m.segna)
    from public.film_membri m
   where m.project_id = p_film and public.e_membro(p_film);
$$;
revoke all on function public.troupe_segna(uuid) from public;
grant execute on function public.troupe_segna(uuid) to authenticated;

-- Dare o togliere il permesso: solo chi ha aperto il film.
create or replace function public.permesso_segna(p_film uuid, p_utente uuid, p_vale boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.film_membri m
                  where m.project_id = p_film and m.user_id = auth.uid() and m.ruolo = 'capo') then
    raise exception 'solo chi ha aperto il film puo'' dare questo permesso';
  end if;
  update public.film_membri set segna = coalesce(p_vale, false)
   where project_id = p_film and user_id = p_utente and ruolo <> 'capo';
  return found;
end;
$$;
revoke all on function public.permesso_segna(uuid, uuid, boolean) from public;
grant execute on function public.permesso_segna(uuid, uuid, boolean) to authenticated;
