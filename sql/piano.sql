-- Il piano di lavorazione letto dal server (worker/piano.js).
--
-- Tre colonne accanto alla mail, come per l'ordine del giorno
-- (sql/ombra.sql): com'e' andata la lettura, quando, e cosa ha letto.
-- Finche' non ci sono il Worker salta il piano e fa tutto il resto.

alter table public.posta add column if not exists piano_stato text;
alter table public.posta add column if not exists piano_il    timestamptz;
alter table public.posta add column if not exists piano       jsonb;

-- Il cron cerca ogni minuto le mail ancora da guardare.
create index if not exists posta_piano_idx on public.posta (ricevuta desc) where piano_stato is null;

-- ── Le prove ────────────────────────────────────────────────────────────────
-- Per far leggere al Worker dei piani gia' passati senza aspettare che la
-- produzione ne mandi uno: si caricano i PDF nel secchio "posta", nella
-- cartella prova/pdl/, e si crea una riga 'prova' per ciascuno. Il Worker
-- ne legge uno al minuto e non scrive niente da nessuna parte: mette solo
-- la lettura in posta.piano.
--
-- insert into public.posta (project_id, oggetto, stato, ombra_stato, allegati)
-- select (select p.id from public.projects p join public.film_membri m on m.project_id = p.id
--          where p.titolo ilike '%gennaro%' group by p.id order by count(*) desc limit 1),
--        'prova pdl ' || split_part(o.name, '/', 3), 'prova', 'saltata',
--        jsonb_build_array(jsonb_build_object('nome', split_part(o.name, '/', 3), 'tipo', 'application/pdf',
--          'byte', (o.metadata->>'size')::int, 'tenuto', true, 'percorso', o.name))
--   from storage.objects o
--  where o.bucket_id = 'posta' and o.name like 'prova/pdl/%.pdf';
--
-- Com'e' andata:
-- select oggetto, piano_stato, piano->'info'->>'ms' as ms, piano->'info'->>'token_uscita' as token,
--        piano->'info'->>'stop' as stop, piano->>'errore' as errore
--   from public.posta where stato = 'prova' and oggetto like 'prova pdl%' order by oggetto;
--
-- Le letture, da scaricare in CSV:
-- select oggetto, piano->'letto' as letto from public.posta
--  where stato = 'prova' and oggetto like 'prova pdl%' and piano_stato = 'fatta' order by oggetto;
