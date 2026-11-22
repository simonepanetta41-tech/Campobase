-- La versione dell'app che ognuno ha aperto per ultima, e quando.
-- La scrive il telefono all'apertura (index.html, dopo l'accesso) e la
-- legge solo la pagina di amministrazione: serve a sapere chi e' rimasto
-- indietro quando segnala un problema. Senza queste colonne non si rompe
-- niente: l'app non riesce a scriverla e l'amministrazione non la mostra.
alter table public.profiles add column if not exists app_versione text;
alter table public.profiles add column if not exists app_vista timestamptz;
