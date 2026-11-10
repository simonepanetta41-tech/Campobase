-- I nomi della troupe.
--
-- Da lanciare dopo troupe.sql. Dura un istante.
--
-- Il problema: nella pagina Troupe comparivano i membri ma senza nome.
-- I profili stanno in public.profiles, e le regole di quella tabella
-- lasciano leggere soltanto il proprio — giustamente, perche' li' dentro
-- c'e' anche l'indirizzo email di tutti.
--
-- La soluzione non e' aprire profiles alla troupe: sarebbe dare a ogni
-- film l'elenco delle mail dei suoi membri, che non serve a niente e non
-- si puo' piu' togliere. Si passa invece da questa funzione, che restituisce
-- solo nome, cognome e reparto delle persone che stanno nello stesso film
-- di chi la chiama. L'email non esce.

create or replace function public.troupe_del_film(p_film uuid)
returns table (user_id uuid, ruolo text, entrato timestamptz,
               nome text, cognome text, reparto text)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, m.ruolo, m.created_at, p.nome, p.cognome, p.reparto
    from public.film_membri m
    left join public.profiles p on p.id = m.user_id
   where m.project_id = p_film
     -- Solo se chi chiede e' nel film: senza questa riga, conoscere l'id
     -- di un film darebbe l'elenco della sua troupe a chiunque.
     and public.e_membro(p_film)
   order by m.created_at;
$$;

revoke all on function public.troupe_del_film(uuid) from public;
grant execute on function public.troupe_del_film(uuid) to authenticated;
