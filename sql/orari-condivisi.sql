-- Gli orari di un reparto, visibili agli altri reparti dello stesso film.
--
-- Finora una settimana di orari era solo di chi l'aveva compilata, e il
-- film era un testo scritto a mano nell'intestazione. Per confrontarsi fra
-- reparti serve sapere di quale film e', con certezza, e se chi l'ha
-- compilata vuole farla vedere.
--
--   project_id  il film vero, quello della troupe
--   condivisa   l'interruttore "Visibili agli altri reparti": uno per
--               film, l'app lo scrive su tutte le settimane di quel film
--
-- Chi e' nel film legge le settimane condivise; scrivere resta di chi le
-- ha compilate, con i permessi di prima.
--
-- Eseguire nel SQL editor di Supabase. E' idempotente.

alter table public.timetable_weeks add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.timetable_weeks add column if not exists condivisa  boolean not null default false;

create index if not exists timetable_weeks_film on public.timetable_weeks (project_id) where project_id is not null;

drop policy if exists "orari condivisi nel film" on public.timetable_weeks;
create policy "orari condivisi nel film" on public.timetable_weeks
  for select using (condivisa and project_id is not null and public.e_membro(project_id));
