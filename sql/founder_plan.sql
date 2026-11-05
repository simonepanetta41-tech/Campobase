-- Sblocca la quota giornaliera per il proprietario dell'app.
--
-- consume_analysis_quota() controlla permanent_plan prima del limite:
-- con 'founder' l'analisi passa sempre e il contatore serve solo da statistica.
-- Cosi' il meccanismo di quota resta intatto per quando arrivera' Stripe,
-- senza toccare il codice delle funzioni.
--
-- Eseguire nel SQL editor di Supabase.

-- 1. La colonna, se non c'e' ancora.
alter table public.usage_limits
  add column if not exists permanent_plan text;

-- 2. Assegna 'founder' all'utente, per ogni riga sua gia' esistente.
--    Sostituisci TUA-EMAIL-QUI con l'indirizzo dell'account dell'app.
--    Questi file finiscono pubblicati come file statici, quindi qui non ci
--    va nessun dato personale.
update public.usage_limits
   set permanent_plan = 'founder'
 where user_id = (
   select id from auth.users where email = 'TUA-EMAIL-QUI'
 );

-- 3. Se non esiste ancora nessuna riga per l'utente, creane una:
--    la funzione cerca permanent_plan su qualsiasi riga sua, non solo quella di oggi.
insert into public.usage_limits (user_id, date, analyses_count, plan, permanent_plan)
select u.id, current_date, 0, 'free', 'founder'
  from auth.users u
 where u.email = 'TUA-EMAIL-QUI'
   and not exists (
     select 1 from public.usage_limits ul
      where ul.user_id = u.id and ul.permanent_plan = 'founder'
   )
on conflict (user_id, date)
do update set permanent_plan = 'founder';

-- 4. Verifica: deve comparire una riga con permanent_plan = 'founder'.
select u.email, ul.date, ul.analyses_count, ul.plan, ul.permanent_plan
  from public.usage_limits ul
  join auth.users u on u.id = ul.user_id
 where ul.permanent_plan = 'founder';
