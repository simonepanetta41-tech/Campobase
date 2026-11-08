-- Ordini del giorno.
--
-- Un OdG per giornata di lavorazione. La chiave e' (utente, film, data):
-- l'OdG esce il giorno prima per il giorno dopo e puo' uscire in piu'
-- versioni, quindi ricaricarlo sovrascrive quello della stessa data invece
-- di accumulare doppioni. `numero` e' il numero dell'OdG stampato sul
-- documento, che segue le giornate di lavorazione e non le date.
--
-- `dati` tiene tutto il resto in JSON: orari, luce, scene, cast, troupe,
-- contatti, domani. Sta in un campo solo perche' la forma di un OdG cambia
-- da produzione a produzione, e irrigidirla in colonne significherebbe
-- perdere quello che non abbiamo previsto.
--
-- Eseguire nel SQL editor di Supabase.

create table if not exists public.odg (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  film        text not null default '',
  data        date not null,
  numero      int,
  dati        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, film, data)
);

create index if not exists odg_user_data_idx on public.odg (user_id, data desc);

alter table public.odg enable row level security;

-- Ogni utente vede e scrive solo i propri. Il giorno in cui un OdG servira'
-- a piu' persone dello stesso film, la condivisione passera' da una tabella
-- di appartenenza al film, non dall'allargare questa.
drop policy if exists "odg propri" on public.odg;
create policy "odg propri" on public.odg
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
