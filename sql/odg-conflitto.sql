-- Correzione: l'ordine del giorno non si salvava sul cloud.
--
-- Da lanciare dopo troupe.sql. Dura un istante e non perde niente.
--
-- Cosa era successo. L'indice unico su (project_id, data) era parziale:
--
--   create unique index ... on public.odg (project_id, data)
--     where project_id is not null;
--
-- sembra piu' preciso, e invece rompe l'upsert. Postgres, davanti a
-- "on conflict (project_id, data)", deve riconoscere a quale indice ci si
-- riferisce; un indice parziale lo riconosce solo se anche il comando porta
-- la stessa condizione, e un insert non ne ha nessuna. Quindi rispondeva
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- e ogni salvataggio con un film aperto falliva. Senza rumore, perche'
-- l'app si limitava a scriverlo nella consolle: sul telefono l'ordine del
-- giorno c'era, sul cloud non e' mai arrivato niente, e la troupe avrebbe
-- condiviso il nulla.
--
-- L'indice intero va bene lo stesso. Le righe vecchie, quelle senza film,
-- hanno project_id nullo, e per Postgres due nulli sono diversi fra loro:
-- restano tutte, e nessuna si scontra con le altre.

drop index if exists public.odg_film_data_key;

create unique index if not exists odg_film_data_key
  on public.odg (project_id, data);
