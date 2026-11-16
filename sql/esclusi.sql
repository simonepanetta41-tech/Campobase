-- Escludere qualcuno dal film.
--
-- Da lanciare dopo troupe.sql e troupe-nomi.sql. Si puo' rilanciare.
--
-- Il QR lo vedono tutti i membri, quindi chiunque sia dentro puo' far
-- entrare altri. Serve allora il verso opposto: chi ha aperto il film
-- toglie una persona, e quella persona col codice non rientra piu'.
-- Solo chi ha aperto il film puo' escludere e riammettere.
--
-- Da quel momento l'escluso non legge piu' niente del film: tutte le
-- regole passano da e_membro, e lui membro non e' piu'. Quello che aveva
-- gia' scaricato sul telefono l'app lo chiude alla prima apertura.

create table if not exists public.film_esclusi (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id)      on delete cascade,
  quando     timestamptz not null default now(),
  primary key (project_id, user_id)
);
-- Nessuna regola, di proposito: ci si passa solo dalle funzioni qui sotto.
alter table public.film_esclusi enable row level security;

create or replace function public.e_capo(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.projects x where x.id = p and x.user_id = auth.uid())
      or exists (select 1 from public.film_membri m
                  where m.project_id = p and m.user_id = auth.uid() and m.ruolo = 'capo');
$$;
revoke all on function public.e_capo(uuid) from public;
grant execute on function public.e_capo(uuid) to authenticated;

create or replace function public.escludi_dal_film(p_film uuid, p_utente uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.e_capo(p_film) then
    raise exception 'solo chi ha aperto il film puo'' escludere';
  end if;
  if p_utente = auth.uid()
     or exists (select 1 from public.projects x where x.id = p_film and x.user_id = p_utente)
     or exists (select 1 from public.film_membri m
                 where m.project_id = p_film and m.user_id = p_utente and m.ruolo = 'capo') then
    raise exception 'chi ha aperto il film non si esclude';
  end if;
  insert into public.film_esclusi (project_id, user_id) values (p_film, p_utente)
    on conflict do nothing;
  delete from public.film_membri where project_id = p_film and user_id = p_utente;
  return true;
end;
$$;
revoke all on function public.escludi_dal_film(uuid, uuid) from public;
grant execute on function public.escludi_dal_film(uuid, uuid) to authenticated;

-- Riammettere: torna subito nella troupe, senza ripassare dal codice.
create or replace function public.riammetti_nel_film(p_film uuid, p_utente uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.e_capo(p_film) then
    raise exception 'solo chi ha aperto il film puo'' riammettere';
  end if;
  delete from public.film_esclusi where project_id = p_film and user_id = p_utente;
  if not found then return false; end if;
  insert into public.film_membri (project_id, user_id) values (p_film, p_utente)
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.riammetti_nel_film(uuid, uuid) from public;
grant execute on function public.riammetti_nel_film(uuid, uuid) to authenticated;

-- Gli esclusi, per chi ha aperto il film. Agli altri torna vuota.
create or replace function public.esclusi_del_film(p_film uuid)
returns table (user_id uuid, nome text, cognome text, reparto text)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id, p.nome, p.cognome, p.reparto
    from public.film_esclusi e
    left join public.profiles p on p.id = e.user_id
   where e.project_id = p_film and public.e_capo(p_film)
   order by e.quando;
$$;
revoke all on function public.esclusi_del_film(uuid) from public;
grant execute on function public.esclusi_del_film(uuid) to authenticated;

-- Ci sono ancora dentro? Lo chiede il telefono di chi non ha aperto il
-- film, per chiuderlo se nel frattempo e' stato escluso.
create or replace function public.sono_nel_film(p_film uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.e_membro(p_film);
$$;
revoke all on function public.sono_nel_film(uuid) from public;
grant execute on function public.sono_nel_film(uuid) to authenticated;

-- La porta d'ingresso, com'era, con un controllo in piu': un escluso col
-- codice non rientra.
create or replace function public.entra_nel_film(codice_invito text)
returns table (id uuid, titolo text)
language plpgsql
security definer
set search_path = public
as $$
declare f record;
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  select p.id, p.titolo into f from public.projects p
   where upper(p.codice) = upper(trim(codice_invito));
  if not found then raise exception 'codice non valido'; end if;
  if exists (select 1 from public.film_esclusi e
              where e.project_id = f.id and e.user_id = auth.uid()) then
    raise exception 'escluso dal film';
  end if;
  insert into public.film_membri (project_id, user_id) values (f.id, auth.uid())
    on conflict do nothing;
  return query select f.id, f.titolo;
end;
$$;
grant execute on function public.entra_nel_film(text) to authenticated;
