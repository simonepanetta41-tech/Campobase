-- Le notifiche.
--
-- Da lanciare DOPO posta.sql. Dura un istante.
--
-- Tre notifiche, un meccanismo solo.
--
-- Quelle a orario — il pick-up dieci minuti prima, il catering quindici
-- minuti prima — le registra l'app, perche' e' l'app che legge i giri auto
-- e sa a che ora passa il furgone di chi la tiene in mano. Quella della
-- posta la registra il Worker, con l'ora di adesso, appena ha messo da
-- parte un allegato. Il cron del Worker passa ogni minuto e manda quelle
-- scadute: non gli interessa chi le ha scritte.
--
-- Il testo sta qui dentro, non nella notifica che viaggia. Una notifica
-- con il contenuto dentro va cifrata per ogni destinatario, e sbagliare
-- quella cifratura vuol dire notifiche che non arrivano senza che nessuno
-- sappia perche'. Qui la notifica e' vuota: serve solo a svegliare l'app,
-- che poi chiede al Worker cosa deve dire.

-- ── 1. I dispositivi iscritti ───────────────────────────────────────────────

create table if not exists public.push_iscrizioni (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,

  -- L'indirizzo che Apple o Google danno a quel telefono per quell'app.
  -- E' un segreto: chi lo conosce puo' mandare notifiche a quel telefono,
  -- e per questo basta a identificarlo senza bisogno di altre chiavi.
  endpoint   text not null unique,
  p256dh     text,
  auth       text,

  creata     timestamptz not null default now(),
  -- Quando quel telefono ha chiesto l'ultima volta cosa dire: serve per
  -- accorgersi delle iscrizioni morte.
  vista      timestamptz
);

create index if not exists push_iscrizioni_utente on public.push_iscrizioni (user_id);

-- ── 2. Gli appuntamenti ─────────────────────────────────────────────────────

create table if not exists public.push_appuntamenti (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,

  quando     timestamptz not null,
  genere     text not null,          -- pickup | catering | posta
  testo      text not null,

  /* Una chiave sola per persona, genere e giorno.
     L'app registra gli appuntamenti ogni volta che apre l'ordine del
     giorno — a ogni avvio, piu' volte al giorno. Senza questa chiave il
     telefono si riempirebbe di dieci notifiche identiche per lo stesso
     pick-up. Riscrivendo la stessa chiave l'ora si aggiorna, che e'
     esattamente quello che serve quando la produzione cambia il giro. */
  chiave     text not null unique,

  -- Quando il cron l'ha spedito, e quando il telefono l'ha mostrato. Sono
  -- due momenti diversi: la notifica che viaggia e' vuota, e il telefono
  -- torna a chiedere il testo. Senza "mostrato", due notifiche spedite
  -- nello stesso minuto si leggerebbero entrambe come l'ultima.
  mandato    timestamptz,
  mostrato   timestamptz,
  creato     timestamptz not null default now()
);

-- Per chi avesse gia' lanciato una versione precedente di questo file.
alter table public.push_appuntamenti add column if not exists mostrato timestamptz;

-- Quello che il cron cerca ogni minuto: gli appuntamenti scaduti e non
-- ancora mandati.
create index if not exists push_appuntamenti_da_mandare
  on public.push_appuntamenti (quando)
  where mandato is null;

-- ── 3. Le regole ────────────────────────────────────────────────────────────

alter table public.push_iscrizioni   enable row level security;
alter table public.push_appuntamenti enable row level security;

-- Ognuno vede e scrive soltanto i propri. Il Worker ha la chiave
-- service_role e passa sopra a queste regole: e' lui che manda.
drop policy if exists "le mie iscrizioni" on public.push_iscrizioni;
create policy "le mie iscrizioni" on public.push_iscrizioni
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "i miei appuntamenti" on public.push_appuntamenti;
create policy "i miei appuntamenti" on public.push_appuntamenti
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 4. La pulizia ───────────────────────────────────────────────────────────

/* Gli appuntamenti vecchi non servono a nessuno: senza una potatura la
   tabella cresce di tre righe al giorno per persona per sempre. */
create or replace function public.pota_appuntamenti()
returns integer
language sql
security definer
set search_path = public
as $$
  with via as (
    delete from public.push_appuntamenti
     where quando < now() - interval '7 days'
    returning 1)
  select count(*)::integer from via;
$$;

revoke all on function public.pota_appuntamenti() from public;
