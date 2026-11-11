-- Lo spoglio e il piano per tutta la troupe.
--
-- Da lanciare dopo troupe.sql. Dura un istante.
--
-- Il problema: chi entra in un film col codice vede l'ordine del giorno e
-- la troupe, ma spoglio e piano di lavorazione no — restano vuoti. Non e'
-- la schermata: sono i dati. Lo spoglio sta in analyses, il piano in
-- pdl_versions, e tutte e due quelle tabelle sono legate a chi le ha
-- create. Un membro del film non le puo' leggere, e nemmeno sa che ci
-- sono.
--
-- Eppure e' esattamente il motivo per cui esiste l'app: uno spoglio unico
-- che vale per tutti i reparti. Se lo vede solo chi ha caricato la
-- sceneggiatura, non serve a niente.
--
-- La soluzione non e' aprire quelle tabelle alla lettura: dentro ci sono
-- anche le analisi di altri film, di altre produzioni, di altri anni. Si
-- passa da due funzioni che restituiscono SOLO l'analisi e il piano del
-- film richiesto, e solo a chi di quel film fa parte.

-- ── 1. Lo spoglio ───────────────────────────────────────────────────────────

create or replace function public.analisi_del_film(p_film uuid)
returns table (id uuid, data jsonb, notes text, creata timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.data, a.notes, a.created_at
    from public.analyses a
   where a.project_id = p_film
     -- Solo se chi chiede e' nel film: senza questa riga, conoscere l'id
     -- di un film darebbe lo spoglio a chiunque.
     and public.e_membro(p_film)
   -- La piu' recente: di un film ce n'e' una sola, ma se qualcuno
   -- ricarica la sceneggiatura vale l'ultima.
   order by a.created_at desc
   limit 1;
$$;

revoke all on function public.analisi_del_film(uuid) from public;
grant execute on function public.analisi_del_film(uuid) to authenticated;

-- ── 2. Il piano di lavorazione ──────────────────────────────────────────────

/* Il piano sta appeso all'analisi, non al film, e la tabella non ha una
   colonna per il film: si passa da analyses per sapere di che film e'. */
create or replace function public.pdl_del_film(p_film uuid)
returns table (analysis_id uuid, data jsonb, shooting_data jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.analysis_id, p.data, p.shooting_data
    from public.pdl_versions p
    join public.analyses a on a.id = p.analysis_id
   where a.project_id = p_film
     and public.e_membro(p_film)
   order by a.created_at desc
   limit 1;
$$;

revoke all on function public.pdl_del_film(uuid) from public;
grant execute on function public.pdl_del_film(uuid) to authenticated;

-- ── 3. Il cast ──────────────────────────────────────────────────────────────

/* Gli attori con le loro scene: stessa storia, stessa regola.
   Qui escono i nomi dei personaggi e degli interpreti, che sono quelli
   gia' scritti sull'ordine del giorno che tutta la troupe ha in mano. */
create or replace function public.cast_del_film(p_film uuid)
returns setof public.cast_list
language sql
stable
security definer
set search_path = public
as $$
  select c.*
    from public.cast_list c
    join public.analyses a on a.id = c.analysis_id
   where a.project_id = p_film
     and public.e_membro(p_film)
   order by c.character_id;
$$;

revoke all on function public.cast_del_film(uuid) from public;
grant execute on function public.cast_del_film(uuid) to authenticated;
