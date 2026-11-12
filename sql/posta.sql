-- La posta che arriva dalla produzione.
--
-- Da lanciare DOPO troupe.sql: si appoggia a film_membri e a e_membro().
--
-- Cosa fa:
--   1. la tabella posta, una riga per messaggio ricevuto
--   2. il secchio di Storage dove finiscono gli allegati
--   3. le regole di accesso: la posta di un film la vede la sua troupe
--   4. prendi_posta(), il gettone che evita che due telefoni analizzino
--      lo stesso pacchetto nello stesso momento
--
-- Chi scrive qui dentro e' solo il Worker, con la chiave service_role, che
-- passa sopra alle policy. Dai client non si inserisce niente: una riga di
-- posta deve poter dire "questo e' arrivato davvero per mail".

-- ── 1. La tabella ───────────────────────────────────────────────────────────

create table if not exists public.posta (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,

  casella        text,          -- la parte prima della chiocciola
  mittente       text,          -- chi l'ha consegnata (envelope)
  mittente_vero  text,          -- l'intestazione From:, che e' un'altra cosa
  oggetto        text,
  testo          text,

  data_invio     timestamptz,   -- quella scritta nella mail
  ricevuta       timestamptz not null default now(),

  -- Un inoltro automatico puo' arrivare due volte: stesso messaggio, due
  -- consegne. Il Message-ID e' quello che permette di accorgersene.
  message_id     text,

  -- [{nome, tipo, byte, tenuto, percorso}]
  allegati       jsonb not null default '[]'::jsonb,

  -- nuova | in analisi | fatta | senza allegati | errore | scartata
  --   | da verificare  <- arrivata da un mittente diverso da quello
  --     atteso per il film (projects.mittente). Il Worker la salva con
  --     tutti gli allegati ma non avvisa la troupe e l'app non la
  --     prende: prendi_posta guarda solo nuova, errore e in analisi. Per
  --     farla analizzare: update posta set stato='nuova' where id=...
  stato          text not null default 'nuova',
  nota           text,

  preso_da       uuid references auth.users(id) on delete set null,
  preso_il       timestamptz
);

-- Due consegne dello stesso messaggio nello stesso film sono una sola.
-- Parziale perche' il Message-ID puo' mancare, e due mail senza id non
-- sono per forza la stessa mail.
create unique index if not exists posta_una_volta
  on public.posta (project_id, message_id)
  where message_id is not null;

create index if not exists posta_da_fare
  on public.posta (project_id, ricevuta desc);

-- ── 2. Il secchio degli allegati ────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('posta', 'posta', false)
on conflict (id) do nothing;

-- ── 3. Chi vede cosa ────────────────────────────────────────────────────────

alter table public.posta enable row level security;

drop policy if exists "posta: la legge la troupe"      on public.posta;
drop policy if exists "posta: la sistema la troupe"    on public.posta;
drop policy if exists "posta: la butta via la troupe"  on public.posta;

create policy "posta: la legge la troupe" on public.posta
  for select using (public.e_membro(project_id));

-- Serve per prendere in carico un pacchetto e per segnarlo fatto.
create policy "posta: la sistema la troupe" on public.posta
  for update using (public.e_membro(project_id))
         with check (public.e_membro(project_id));

create policy "posta: la butta via la troupe" on public.posta
  for delete using (public.e_membro(project_id));

-- Niente policy di insert: le righe le scrive il Worker.

-- Gli allegati stanno in <project_id>/<id posta>/<nome file>. La cartella
-- dice di chi sono.
create or replace function public.e_membro_cartella(cartella text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare f uuid;
begin
  -- Un nome di cartella che non e' un uuid non appartiene a nessuno.
  begin f := cartella::uuid; exception when others then return false; end;
  return exists (
    select 1 from public.film_membri
    where project_id = f and user_id = auth.uid()
  );
end;
$$;

drop policy if exists "allegati: li legge la troupe"     on storage.objects;
drop policy if exists "allegati: li butta via la troupe" on storage.objects;

create policy "allegati: li legge la troupe" on storage.objects
  for select using (
    bucket_id = 'posta'
    and public.e_membro_cartella((storage.foldername(name))[1])
  );

create policy "allegati: li butta via la troupe" on storage.objects
  for delete using (
    bucket_id = 'posta'
    and public.e_membro_cartella((storage.foldername(name))[1])
  );

-- ── 4. Il gettone ───────────────────────────────────────────────────────────

-- Lo stesso pacchetto arriva contemporaneamente sul telefono di tre persone
-- della troupe. Senza gettone lo analizzano in tre, pagando tre volte e
-- scrivendosi addosso a vicenda. Chi arriva primo prende, gli altri hanno
-- indietro niente e lasciano stare.
--
-- Il gettone scade dopo dieci minuti: se un telefono si spegne a meta'
-- analisi, il pacchetto non resta bloccato per sempre.
create or replace function public.prendi_posta(p_posta uuid)
returns public.posta
language plpgsql
security definer
set search_path = public
as $$
declare riga public.posta;
begin
  update public.posta p
     set preso_da = auth.uid(),
         preso_il = now(),
         stato    = 'in analisi'
   where p.id = p_posta
     and public.e_membro(p.project_id)
     -- 'in analisi' e' qui apposta: se chi l'aveva preso si e' spento a
     -- meta', dopo dieci minuti il pacchetto torna disponibile. Senza
     -- questa riga il gettone scaduto non serviva a niente, perche' lo
     -- stato era gia' cambiato e la riga non veniva piu' presa da nessuno.
     and p.stato in ('nuova', 'errore', 'in analisi')
     and (p.preso_il is null or p.preso_il < now() - interval '10 minutes')
  returning p.* into riga;

  return riga;   -- niente riga = l'ha preso qualcun altro
end;
$$;

revoke all on function public.prendi_posta(uuid) from public;
grant execute on function public.prendi_posta(uuid) to authenticated;

-- ── 5. L'indirizzo del film ─────────────────────────────────────────────────

-- La casella e' una chiave, non un nome: chi la conosce puo' infilare
-- documenti nel film. Si genera qui perche' i film aperti prima di oggi non
-- ce l'hanno.
update public.projects
   set casella = encode(gen_random_bytes(8), 'hex')
 where casella is null;

-- E i film aperti da domani se la trovano gia' addosso, senza che debba
-- pensarci l'app: una chiave generata dal database e' una chiave in meno
-- che puo' nascere sbagliata.
alter table public.projects
  alter column casella set default encode(gen_random_bytes(8), 'hex');

create unique index if not exists projects_casella_unica
  on public.projects (casella)
  where casella is not null;
