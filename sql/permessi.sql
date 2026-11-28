-- Chi puo' aprire un film da zero, senza sceneggiatura.
--
-- Finora un film nasceva solo caricando una sceneggiatura. Chi vuole
-- usare Campobase con la sua troupe, senza passare da Simone, deve poter
-- aprire un film vuoto: titolo, codice d'invito, casella della posta. Ma
-- non chiunque: lo decide l'amministrazione, persona per persona.
--
-- Il permesso sta in una tabella sua e non in `profiles`, perche' il
-- profilo ognuno se lo scrive da solo: li' basterebbe una riga per darselo.
-- Qui dall'app si puo' solo leggere il proprio; scrive soltanto il server.
--
-- Eseguire nel SQL editor di Supabase. E' idempotente.

create table if not exists public.permessi (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  crea_film boolean not null default false,
  dal       timestamptz not null default now()
);
alter table public.permessi enable row level security;

drop policy if exists "permessi: leggo i miei" on public.permessi;
create policy "permessi: leggo i miei" on public.permessi
  for select using (user_id = auth.uid());
-- Nessuna policy di scrittura: le righe le mette il Worker.

-- Aprire il film. Lo fa una funzione, e non un insert dall'app, perche'
-- e' qui che si controlla il permesso: un tasto nascosto non e' un divieto.
-- Chi lo apre ne diventa il capo. Codice e casella nascono con lui.
create or replace function public.nuovo_film(p_titolo text)
returns table (id uuid, titolo text)
language plpgsql
security definer
set search_path = public
as $$
declare t text := trim(regexp_replace(coalesce(p_titolo, ''), '\s+', ' ', 'g'));
        f uuid;
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  if not exists (select 1 from public.permessi where user_id = auth.uid() and crea_film) then
    raise exception 'non puoi aprire un film';
  end if;
  if length(t) < 2 or length(t) > 80 then raise exception 'titolo non valido'; end if;
  if exists (select 1 from public.projects p where p.user_id = auth.uid() and lower(p.titolo) = lower(t)) then
    raise exception 'hai gia'' un film con questo titolo';
  end if;
  insert into public.projects (titolo, user_id, codice, casella)
    values (t, auth.uid(), upper(substr(md5(gen_random_uuid()::text), 1, 8)), substr(md5(gen_random_uuid()::text), 1, 16))
    returning projects.id into f;
  insert into public.film_membri (project_id, user_id, ruolo) values (f, auth.uid(), 'capo')
    on conflict (project_id, user_id) do update set ruolo = 'capo';
  return query select f, t;
end;
$$;

revoke all on function public.nuovo_film(text) from public;
grant execute on function public.nuovo_film(text) to authenticated;
