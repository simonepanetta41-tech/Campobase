-- ═══ LA LETTURA IN OMBRA ═══════════════════════════════════════════════
--
-- Il Worker legge l'ordine del giorno e i giri auto appena arriva la mail
-- e scrive qui quello che ha capito. NON LO USA NESSUNO: le notifiche e
-- l'analisi sul telefono restano quelle di sempre. Serve a confrontare,
-- sera per sera, la lettura del Worker con quella del telefono, prima di
-- fidarsi (worker/ombra.js).
--
-- Si lancia una volta. Rilanciarlo non fa danni.

alter table public.posta add column if not exists ombra       jsonb;
alter table public.posta add column if not exists ombra_stato text;
alter table public.posta add column if not exists ombra_il    timestamptz;

-- ombra_stato:
--   (vuoto)    non ancora guardata
--   in corso   il Worker la sta leggendo
--   fatta      letta: il risultato e' in ombra->'letto'
--   tronca     letta ma la risposta si e' fermata a meta'
--   saltata    fra gli allegati non c'era un ordine del giorno
--   errore     non letta: il motivo e' in ombra->>'errore'

-- Il cron cerca ogni minuto le righe ancora da guardare.
create index if not exists posta_ombra_da_fare
  on public.posta (ricevuta desc) where ombra_stato is null;


-- ═══ IL CONFRONTO DELLA SERA ════════════════════════════════════════════
--
-- Le tre query qui sotto non cambiano niente: leggono soltanto.

-- 1. Com'e' andata: una riga per mail, la piu' recente in alto.
--
-- select ricevuta, ombra_stato, oggetto,
--        ombra->'info'->>'modello'      as modello,
--        (ombra->'info'->>'ms')::int/1000 as secondi,
--        ombra->'info'->>'token_uscita' as token,
--        ombra->>'errore'               as errore
--   from posta
--  where ombra_stato is not null
--  order by ricevuta desc
--  limit 10;

-- 2. Campo per campo: cosa ha letto il telefono, cosa ha letto il Worker.
--    Le righe con "uguale = false" sono quelle da guardare.
--
-- with s as (
--   select p.project_id, p.ombra->'letto' as l
--     from posta p
--    where p.ombra_stato in ('fatta','tronca')
--    order by p.ricevuta desc
--    limit 1
-- ), t as (
--   select o.dati as d, s.l
--     from s join odg o
--       on o.project_id = s.project_id and o.data::text = s.l->>'data'
-- )
-- select campo,
--        t.d->>campo as telefono,
--        t.l->>campo as worker,
--        coalesce(t.d->>campo,'') = coalesce(t.l->>campo,'') as uguale
--   from t, unnest(array['numero','data','convocazione','prontiAGirare','pausa',
--                        'catering','cestini','fineRiprese','fineLavorazione']) as campo
-- union all
-- select 'scene (numeri)',
--        (select string_agg(x->>'n', ' ') from jsonb_array_elements(t.d->'scene') x where x->>'n' <> ''),
--        (select string_agg(x->>'n', ' ') from jsonb_array_elements(t.l->'scene') x where x->>'n' <> ''),
--        null from t
-- union all
-- select 'cast (quanti)',   jsonb_array_length(t.d->'cast')::text,   jsonb_array_length(t.l->'cast')::text,
--        jsonb_array_length(t.d->'cast') = jsonb_array_length(t.l->'cast') from t
-- union all
-- select 'troupe (quanti)', jsonb_array_length(t.d->'troupe')::text, jsonb_array_length(t.l->'troupe')::text,
--        jsonb_array_length(t.d->'troupe') = jsonb_array_length(t.l->'troupe') from t;

-- 3. I pick-up letti dai giri auto: una riga per viaggio.
--    Per vedere solo il proprio:  ... where passeggeri ilike '%cognome%'
--
-- select x->>'partenza' as partenza, x->>'luogo' as da, x->>'arrivo' as arrivo,
--        x->>'destinazione' as a, x->>'autista' as autista,
--        (select string_agg(n, ', ') from jsonb_array_elements_text(x->'passeggeri') n) as passeggeri
--   from (select ombra->'letto' as l from posta
--          where ombra_stato in ('fatta','tronca') order by ricevuta desc limit 1) s,
--        jsonb_array_elements(s.l->'tratte') x
--  order by 1;
