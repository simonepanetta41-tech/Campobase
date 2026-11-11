# La batteria

Quaranta file, uno per guasto. Si lanciano uno per volta o tutti insieme:

```
cd test && node prova.js            # tutti
cd test && node dove.test.js        # uno
```

Serve Playwright con Chromium (`npm i -D playwright && npx playwright install chromium`).
Quasi tutti i controlli aprono `index.html` in un browser vero e chiamano
le funzioni dell'app: non sono controlli su finte copie del codice, sono
controlli sull'app.

## Perché esistono

Ognuno di questi file è nato da un guasto visto sul set, e il nome del
controllo dice il guasto, non la funzione. "Il posto non si chiama Pausa",
"un ordine del giorno vecchio non scalza quello di oggi", "alle sette del
mattino mancava il numero dell'autista". Chi li rilancia dopo una
modifica non legge cosa fa il codice: legge cosa non deve tornare a
rompersi.

## I nomi e i numeri

I dati della troupe sono finti. Gli ordini del giorno veri da cui questi
controlli sono nati portavano nomi e numeri di telefono di persone che
lavorano, e quelli non stanno in un repository. Sono stati sostituiti con
nomi inventati **della stessa forma**: le particelle ("De Marchi"), le
iniziali col punto ("S. Panetta"), i numeri a dieci cifre spezzati in tre
pezzi. La forma è esattamente quello che i controlli verificano, quindi la
forma non si tocca.

## La batteria di PDF

`test/odg-corpus/` è esclusa da git. Dentro ci vanno ordini del giorno
veri — e dentro quelli ci sono i numeri della troupe. `corpus.js` e
`coord.js` misurano l'estrazione su tutti i PDF di quella cartella: senza
la cartella si fermano dicendo cosa manca, invece di fallire con un
elenco vuoto che sembra un risultato.

```
node corpus.js              # tutti i campi di tutti i documenti
node corpus.js --testo MSG  # il testo come lo vede l'app
node corpus.js --json       # scrive script.json, per confrontare due versioni
```

Il confronto fra due versioni è il modo in cui si è scoperto che una
correzione al nome dei posti ne sistemava undici su quattro produzioni e
non ne peggiorava nessuno. Una misura su un documento solo non lo diceva.

## Quello che la batteria non può provare

Tre cose, e vale la pena saperlo prima di fidarsi:

- **La consegna delle notifiche.** `vapid.test.mjs` firma e poi ricontrolla
  la firma con la chiave pubblica; `cifra.test.mjs` fa la parte
  dell'iPhone, si fabbrica le chiavi come fa iOS e decifra quello che il
  Worker ha cifrato. Se passano, fra noi e il telefono resta solo la rete
  — ma la rete non la provano.
- **Google Maps.** `mappa.test.mjs` prova il lettore di coordinate su tutte
  le forme in cui Google le scrive, pagina del consenso compresa. Che
  Google risponda come ci aspettiamo, no.
- **Supabase.** `regole.test.js` gira contro un Postgres vero in locale;
  `worker-push.test.mjs` contro un finto PostgREST in memoria. Le regole
  di accesso vere stanno nei file di `sql/`.

Un finto che non mente come l'originale non prova niente: il finto
`readJson` di `worker-push.test.mjs` restituiva il corpo invece di
`{ body }`, e un errore vero — il Worker che rispondeva "scritti: 0" e il
telefono che non riceveva niente — passava tutti i controlli.
