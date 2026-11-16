-- Le scene segnate a mano: girata, o da girare.
--
-- I documenti dicono quasi tutto, ma non tutto: un recupero, una scena
-- saltata, i giorni girati prima di usare l'app. Dalla scheda di una scena
-- (spoglio o piano) la si segna, e il segno vale per tutta la troupe del
-- film: una riga per film e per scena.
--   girata     la scena e' fatta, anche se nessun foglio lo dice
--   da_girare  la scena NON e' fatta, anche se i fogli la danno per fatta
-- Nessuna riga: vale quello che dicono i documenti.

create table if not exists public.scene_segnate (
  project_id uuid not null references public.projects(id) on delete cascade,
  scena      text not null,
  stato      text not null check (stato in ('girata', 'da_girare')),
  user_id    uuid references auth.users(id) on delete set null,
  aggiornato timestamptz not null default now(),
  primary key (project_id, scena)
);
alter table public.scene_segnate enable row level security;

-- La leggono e la scrivono i membri del film, e solo loro.
drop policy if exists segnate_membri on public.scene_segnate;
create policy segnate_membri on public.scene_segnate
  for all to authenticated
  using (public.e_membro(project_id))
  with check (public.e_membro(project_id));
