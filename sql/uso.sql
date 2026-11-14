-- Il tempo d'uso dell'app, per persona, giorno e sezione.
--
-- Serve in fase di prova, per capire chi usa l'app e quali sezioni: lo
-- manda l'app, un totale al minuto (index.html, "IL TEMPO D'USO"). E' un
-- dato personale: prima di andare sugli store questa parte va riguardata
-- (informativa, consenso) o spenta.
--
-- La tabella non si legge e non si scrive dall'app: non ha nessuna
-- policy. Si scrive solo dalla funzione segna_uso, che mette l'utente da
-- sola, e si legge solo dal pannello di Supabase.

create table if not exists public.uso (
  user_id  uuid not null references auth.users(id) on delete cascade,
  giorno   date not null,
  sezione  text not null,
  secondi  integer not null default 0,
  ultimo   timestamptz not null default now(),
  primary key (user_id, giorno, sezione)
);
alter table public.uso enable row level security;

create or replace function public.segna_uso(p_righe jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  s int;
  z text;
begin
  if auth.uid() is null or jsonb_typeof(p_righe) <> 'array' then return; end if;
  for r in select * from jsonb_array_elements(p_righe) limit 20 loop
    z := left(lower(coalesce(r->>'sezione', '')), 30);
    s := least(greatest(coalesce((r->>'secondi')::int, 0), 0), 6 * 3600);
    if z = '' or s = 0 then continue; end if;
    insert into public.uso (user_id, giorno, sezione, secondi, ultimo)
    values (auth.uid(), (now() at time zone 'Europe/Rome')::date, z, s, now())
    on conflict (user_id, giorno, sezione)
    do update set secondi = least(public.uso.secondi + excluded.secondi, 86400), ultimo = now();
  end loop;
end;
$$;
revoke all on function public.segna_uso(jsonb) from public, anon;
grant execute on function public.segna_uso(jsonb) to authenticated;

-- Chi usa l'app e quanto. security_invoker: la vista non scavalca la
-- tabella, quindi dall'app non si legge; dal pannello si'.
create or replace view public.uso_persone with (security_invoker = on) as
select coalesce(nullif(trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')), ''), u.user_id::text) as persona,
       round(sum(u.secondi) / 60.0)                                                        as minuti_totali,
       round(sum(u.secondi) filter (where u.giorno >= current_date - 6) / 60.0)            as minuti_ultimi_7_giorni,
       round(sum(u.secondi) filter (where u.giorno = (now() at time zone 'Europe/Rome')::date) / 60.0) as minuti_oggi,
       count(distinct u.giorno)                                                            as giorni_di_uso,
       to_char(max(u.ultimo) at time zone 'Europe/Rome', 'DD/MM HH24:MI')                  as ultima_volta
  from public.uso u
  left join public.profiles p on p.id = u.user_id
 group by u.user_id, p.nome, p.cognome
 order by sum(u.secondi) desc;

-- Quali sezioni si usano, in tutto e per persona.
create or replace view public.uso_sezioni with (security_invoker = on) as
select u.sezione,
       round(sum(u.secondi) / 60.0)   as minuti_totali,
       count(distinct u.user_id)      as persone,
       round(sum(u.secondi) filter (where u.giorno >= current_date - 6) / 60.0) as minuti_ultimi_7_giorni
  from public.uso u
 group by u.sezione
 order by sum(u.secondi) desc;

create or replace view public.uso_persone_sezioni with (security_invoker = on) as
select coalesce(nullif(trim(coalesce(p.nome, '') || ' ' || coalesce(p.cognome, '')), ''), u.user_id::text) as persona,
       u.sezione,
       round(sum(u.secondi) / 60.0) as minuti
  from public.uso u
  left join public.profiles p on p.id = u.user_id
 group by u.user_id, p.nome, p.cognome, u.sezione
 order by 1, 3 desc;

revoke all on public.uso_persone, public.uso_sezioni, public.uso_persone_sezioni from anon, authenticated;
