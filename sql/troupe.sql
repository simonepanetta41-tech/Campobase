-- Il film, e chi ci lavora.
--
-- Finora tutto era legato alla persona: l'ordine del giorno di Simone era
-- di Simone, e il microfonista accanto a lui doveva caricarsi gli stessi
-- tre PDF per conto suo. Ma l'ordine del giorno non e' di nessuno: e' del
-- film, esce una volta e vale per sessanta persone. Da qui in poi il
-- titolare dei documenti e' il film, e le persone ci stanno dentro.
--
-- Il film esiste gia' come `projects`, creato quando si analizza una
-- sceneggiatura. Gli si aggiungono tre cose: un codice d'invito da mettere
-- in un QR, una casella di posta a cui la produzione inoltra, e il
-- mittente da cui ci si aspetta che arrivi.
--
-- Eseguire nel SQL editor di Supabase. E' idempotente: rieseguirlo non
-- rompe niente.

-- ── Il film ──────────────────────────────────────────────────────────
alter table public.projects add column if not exists codice     text;
alter table public.projects add column if not exists casella    text;
alter table public.projects add column if not exists produzione text;
alter table public.projects add column if not exists mittente   text;

-- Il codice sta in un QR e qualcuno lo digitera' a mano: otto cifre
-- esadecimali si leggono ad alta voce senza sbagliare. La casella invece
-- nessuno la digita e chi la indovina ci infila dentro un falso ordine
-- del giorno, quindi e' lunga.
create unique index if not exists projects_codice_key  on public.projects (codice)  where codice  is not null;
create unique index if not exists projects_casella_key on public.projects (casella) where casella is not null;

update public.projects
   set codice  = upper(substr(md5(gen_random_uuid()::text), 1, 8)),
       casella = substr(md5(gen_random_uuid()::text), 1, 16)
 where codice is null;

-- ── Chi ci lavora ────────────────────────────────────────────────────
create table if not exists public.film_membri (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id)      on delete cascade,
  ruolo      text not null default 'membro',   -- 'capo' chi l'ha aperto
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists film_membri_user_idx on public.film_membri (user_id);

-- Chi ha gia' un film ne e' il capo: senza questa riga il proprietario
-- sparirebbe dalla sua stessa troupe.
insert into public.film_membri (project_id, user_id, ruolo)
select p.id, p.user_id, 'capo' from public.projects p
on conflict do nothing;

-- ── Appartenenza ─────────────────────────────────────────────────────
--
-- Una policy su film_membri che interroga film_membri si chiama da sola
-- all'infinito. Questa funzione gira con i diritti di chi l'ha definita e
-- spezza il giro; resta sicura perche' legge solo se l'utente che chiede
-- e' quello della riga.
create or replace function public.e_membro(p uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.film_membri m
                  where m.project_id = p and m.user_id = auth.uid())
      or exists (select 1 from public.projects x
                  where x.id = p and x.user_id = auth.uid());
$$;

alter table public.film_membri enable row level security;

drop policy if exists "membri del mio film" on public.film_membri;
create policy "membri del mio film" on public.film_membri
  for select using (public.e_membro(project_id));

-- Nessuna policy di inserimento, di proposito: nella troupe si entra solo
-- da entra_nel_film, che il codice lo chiede. Una regola del tipo "posso
-- aggiungere me stesso" sembra innocua e non lo e': chi viene a sapere
-- l'id di un film — da un link vecchio, da uno schermo altrui — ci
-- entrerebbe senza passare dal QR.
drop policy if exists "entro io" on public.film_membri;

drop policy if exists "esco io" on public.film_membri;
create policy "esco io" on public.film_membri
  for delete using (user_id = auth.uid());

-- Il film si vede se ci si lavora, non solo se lo si e' aperto.
drop policy if exists "film della troupe" on public.projects;
create policy "film della troupe" on public.projects
  for select using (auth.uid() = user_id or public.e_membro(id));

-- ── Entrare con il codice ────────────────────────────────────────────
--
-- Chi arriva dal QR non puo' leggere il film per trovarne l'id: non ne e'
-- ancora membro. Il codice lo scambia questa funzione, che e' l'unico
-- punto in cui un film si vede senza farne parte, e restituisce solo
-- titolo e id.
create or replace function public.entra_nel_film(codice_invito text)
returns table (id uuid, titolo text)
language plpgsql
security definer
set search_path = public
as $$
declare f record;
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  select p.id, p.titolo into f from public.projects p
   where upper(p.codice) = upper(trim(codice_invito));
  if not found then raise exception 'codice non valido'; end if;
  insert into public.film_membri (project_id, user_id) values (f.id, auth.uid())
    on conflict do nothing;
  return query select f.id, f.titolo;
end;
$$;

grant execute on function public.entra_nel_film(text) to authenticated;

-- ── L'ordine del giorno diventa del film ─────────────────────────────
alter table public.odg add column if not exists project_id uuid references public.projects(id) on delete cascade;

-- Un OdG per giornata e per film. Le righe vecchie, senza film, restano
-- governate dalla chiave di prima.
create unique index if not exists odg_film_data_key on public.odg (project_id, data) where project_id is not null;
create index if not exists odg_film_idx on public.odg (project_id, data desc);

-- Un OdG legato a un film si vede se si e' della troupe, e basta: anche a
-- chi l'ha caricato lui. Chi esce dal film smette di vedere i suoi
-- documenti, compresi quelli che aveva messo dentro — non erano suoi,
-- erano del film. Gli OdG vecchi, caricati prima che i film esistessero,
-- restano governati da chi li ha caricati.
drop policy if exists "odg propri" on public.odg;
drop policy if exists "odg del film" on public.odg;
create policy "odg del film" on public.odg
  for all
  using      (case when project_id is null then auth.uid() = user_id
                   else public.e_membro(project_id) end)
  with check (case when project_id is null then auth.uid() = user_id
                   else public.e_membro(project_id) end);
