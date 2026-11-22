-- Il contatore dei consumi: una riga per ogni chiamata al modello.
--
-- Chi, per quale film, a che scopo, quanti token. La scrive solo il
-- server; nessun utente la legge (nessuna regola, di proposito): la
-- leggera' la pagina di amministrazione, passando dal server.
--
-- Si salvano i token e non i dollari: i prezzi cambiano, i token no.
-- Si puo' rilanciare: non cancella niente e non duplica lo storico.

create table if not exists public.consumi (
  id          bigint generated always as identity primary key,
  quando      timestamptz not null default now(),
  origine     text not null,              -- 'server' (letture della posta) | 'telefono'
  scopo       text not null,              -- odg, piano, smistamento, stralci, spoglio, assistente, confronto, cast...
  user_id     uuid references auth.users(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  posta_id    uuid,
  modello     text,
  token_entrata        integer,
  token_uscita         integer,
  token_cache_letti    integer,
  token_cache_scritti  integer,
  ms          integer,
  esito       text
);
alter table public.consumi enable row level security;
create index if not exists consumi_quando  on public.consumi (quando desc);
create index if not exists consumi_film    on public.consumi (project_id, quando desc);
create index if not exists consumi_persona on public.consumi (user_id, quando desc);

-- Lo storico delle letture del server, che stava dentro le righe della
-- posta: ordini del giorno e piani. Smistamento, indice degli stralci e
-- tutto quello che parte dai telefoni non era stato salvato: parte da oggi.
insert into public.consumi (quando, origine, scopo, project_id, posta_id, modello, token_entrata, token_uscita, ms, esito)
select coalesce(p.ombra_il, p.ricevuta), 'server', 'odg', p.project_id, p.id,
       p.ombra->'info'->>'modello',
       (p.ombra->'info'->>'token_entrata')::int, (p.ombra->'info'->>'token_uscita')::int,
       (p.ombra->'info'->>'ms')::int, p.ombra->'info'->>'stop'
  from public.posta p
 where p.ombra->'info'->>'token_entrata' is not null
   and not exists (select 1 from public.consumi c where c.posta_id = p.id and c.scopo = 'odg');

insert into public.consumi (quando, origine, scopo, project_id, posta_id, modello, token_entrata, token_uscita, ms, esito)
select coalesce(p.piano_il, p.ricevuta), 'server', 'piano', p.project_id, p.id,
       p.piano->'info'->>'modello',
       (p.piano->'info'->>'token_entrata')::int, (p.piano->'info'->>'token_uscita')::int,
       (p.piano->'info'->>'ms')::int, p.piano->'info'->>'stop'
  from public.posta p
 where p.piano->'info'->>'token_entrata' is not null
   and not exists (select 1 from public.consumi c where c.posta_id = p.id and c.scopo = 'piano');
